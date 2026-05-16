import { ModelConfig } from '../../../../shared/types';
import { AIChatMessage, AgentPhase, AIAgent, TodoItem, SYSTEM_STEPS } from '../../../../shared/types/fileSystem';
import { aiService } from '../aiService';
import { dataService } from '../DataService';
import { memoryBankService } from '../MemoryBankService';
import { PromptComposer, BUILT_IN_AGENTS, AgentId } from '../../../../shared/prompts';
import { ToolParser, ParsedTodoItem } from './ToolParser';
import { unifiedExecutor } from './UnifiedExecutor';
import { detectTarget, buildForTarget, buildFileTreeDescription, summarizeTask, detectCreateIntent, estimateTokenCount } from './contextBuilder';
import { compressHistoryIfNeeded } from './contextCompress';

export interface ProcessCallbacks {
  addMessage: (msg: { role: 'user' | 'assistant'; content: string; thinking?: string }) => AIChatMessage;
  setStreamingContent: (content: string | null) => void;
  setStreamingThinking: (thinking: string | null) => void;
  setAgentPhase: (phase: AgentPhase, task: string, progress: number, extra?: Record<string, unknown>) => void;
  showPrompt: (toolCall: Record<string, any>, model: ModelConfig) => void;
  setIsProcessing: (processing: boolean) => void;
  setTokenUsage: (usage: { prompt: number; completion: number; total: number }) => void;
  setTodoList: (todos: TodoItem[]) => void;
  updateSystemStep: (stepId: string, status: TodoItem['status'], details?: string) => void;
  initSystemSteps: () => void;
  getActiveAgent: () => { systemPrompt: string; name: string };
  getMessages: () => AIChatMessage[];
  getCurrentMessageId: () => string | null;
  emit: () => void;
  isCurrentTask: () => boolean;
}

interface TaskPlan {
  id: string;
  description: string;
  operations: PlannedOperation[];
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
}

interface PlannedOperation {
  action: string;
  name?: string;
  fileId?: string;
  parentId?: string;
  content?: string;
  description?: string;
  status?: 'pending' | 'completed';
}

interface AIState {
  projectStatus: string;
  completedWork: string[];
  pendingWork: string[];
  suggestions: string[];
}

interface AIDecision {
  thought: string;
  action: 'create_file' | 'update_file' | 'read_file' | 'read_folder' | 'complete' | 'ask_user';
  target?: {
    folder?: string;
    name?: string;
    content?: string;
    fileId?: string;
    parentId?: string;
  };
  reason: string;
  confidence: number;
}

export async function processWithAI(text: string, model: ModelConfig, cb: ProcessCallbacks): Promise<{ waitingForUser: boolean }> {
  const MAX_ITERATIONS = 20;
  const MAX_NO_TOOL_RETRIES = 3;
  let iteration = 0;
  let selfCorrectionAttempts = 0;
  let consecutiveNoToolCount = 0;
  let waitingForUser = false;

  let taskPlan: TaskPlan | null = null;
  let completedOps = 0;
  let toolResults: string[] = [];
  const originalUserText = text;
  let currentPrompt = text;
  let accumulatedContext = '';
  let lastAction: string | null = null;
  let accumulatedThinking = '';

  cb.initSystemSteps();

  try {
    // 在开始处理前，先从文件系统同步数据到记忆体图书馆
    const project = dataService.getActiveProject();
    if (project) {
      console.log('[AI] 正在同步记忆体图书馆...');
      try {
        await memoryBankService.syncFromFileSystem(project.id);
        console.log('[AI] 记忆体图书馆同步完成!');
      } catch (e) {
        console.warn('[AI] 记忆体同步失败，不影响使用:', e);
      }
    }

    while (iteration < MAX_ITERATIONS && cb.getActiveAgent() !== null) {
      iteration++;

      cb.updateSystemStep(SYSTEM_STEPS.BUILD_CONTEXT.id, 'completed', `目标: ${detectTarget(currentPrompt)}`);
      cb.updateSystemStep(SYSTEM_STEPS.COMPOSE_PROMPT.id, 'in_progress');
      const target = detectTarget(currentPrompt);
      const projectContext = buildForTarget(target);
      const context = dataService.buildAIContext(12000);
      const fileTree = buildFileTreeDescription();
      const activeAgent = cb.getActiveAgent();

      const agentMap: Record<string, AgentId> = {
        '通用助手': 'agent-general',
        '世界观架构师': 'agent-worldbuilder',
        '角色设计师': 'agent-character',
        '剧情策划师': 'agent-plotter',
        '文字润色师': 'agent-editor',
      };
      const agentId = agentMap[activeAgent?.name] || 'agent-general';

      const composed = PromptComposer.composeForAssistant({
        agentId,
        projectContext: `${projectContext}\n\n## 已有设定内容（正典）\n${context || '（暂无内容）'}`,
        fileTreeDescription: fileTree,
      });

      let fullSystemPrompt = composed.fullPrompt;

      if (taskPlan && taskPlan.operations.length > 0) {
        fullSystemPrompt += `\n\n## 当前进度\n${formatPlanContext(taskPlan, completedOps)}`;
      }

      const systemTokens = estimateTokenCount(fullSystemPrompt);
      const maxOutputTokens = model.maxTokens || 8192;
      const contextWindow = model.contextWindow || 128000;
      const budgetForHistory = contextWindow - systemTokens - maxOutputTokens - 500;

      const compressResult = await compressHistoryIfNeeded(cb.getMessages(), budgetForHistory, model);

      let historyStr: string;
      if (compressResult.compressed) {
        historyStr = compressResult.messages
          .map(m => {
            const role = m.role === 'user' ? '用户' : m.role === 'assistant' ? '助手' : '系统';
            return `${role}：${m.compressedSummary || m.content}`;
          })
          .join('\n\n');
        if (compressResult.tokensSaved && compressResult.tokensSaved > 0) {
          cb.setAgentPhase(AgentPhase.EXECUTING, `上下文压缩完成（节省 ${compressResult.tokensSaved} token）`, 5, { compressed: true });
        }
      } else {
        historyStr = buildCompressedHistory(cb.getMessages(), budgetForHistory);
      }

      if (toolResults.length > 0) {
        historyStr += '\n\n' + toolResults.join('\n');
        toolResults = [];
      }

      if (accumulatedContext) {
        historyStr += `\n\n[已累积的上下文]\n${accumulatedContext}`;
      }

      const phase = determinePhase(iteration, taskPlan, completedOps, lastAction);
      cb.setAgentPhase(phase, summarizeTask(text), calculateProgress(iteration, taskPlan, completedOps), {
        iteration,
        totalOperations: taskPlan?.operations.length || 0,
        completedOperations: completedOps,
        lastAction,
      });

      cb.updateSystemStep(SYSTEM_STEPS.COMPOSE_PROMPT.id, 'completed', `Agent: ${agentId}`);
      cb.updateSystemStep(SYSTEM_STEPS.CALL_AI.id, 'in_progress', `Token 预算: ${budgetForHistory}`);

      const prompt = `## 用户原始需求\n${originalUserText}\n\n## 当前任务\n${currentPrompt}\n\n## 对话历史\n${historyStr}`;

      cb.setStreamingContent('');
      cb.setStreamingThinking(null);
      accumulatedThinking = '';

      const result = await aiService.generateStream(
        {
          model,
          prompt,
          systemPrompt: fullSystemPrompt,
          temperature: 0.7,
          maxTokens: maxOutputTokens,
        },
        (streamResp) => {
          if (streamResp.isStreaming) {
            cb.setStreamingContent(streamResp.content || '');
            if (streamResp.reasoningContent !== undefined) {
              accumulatedThinking = streamResp.reasoningContent;
              cb.setStreamingThinking(accumulatedThinking);
            }
            if (streamResp.content) {
              cb.setAgentPhase(phase, `${summarizeTask(text)} (${streamResp.content.length} 字符)`, calculateProgress(iteration, taskPlan, completedOps));
            }
          }
        }
      );

      if (result.tokens) {
        cb.setTokenUsage(result.tokens);
      }

      if (result.error) {
        cb.updateSystemStep(SYSTEM_STEPS.CALL_AI.id, 'failed', result.error);
        cb.setStreamingContent(null);
        cb.setStreamingThinking(null);
        cb.setAgentPhase(AgentPhase.ERROR, summarizeTask(text), 0, { error: result.error });
        cb.addMessage({ role: 'assistant', content: `❌ 错误：${result.error}` });
        return { waitingForUser: false };
      }

      cb.updateSystemStep(SYSTEM_STEPS.CALL_AI.id, 'completed', `输出 ${result.content?.length || 0} 字符`);
      cb.updateSystemStep(SYSTEM_STEPS.PARSE_RESPONSE.id, 'in_progress');

      const content = result.content || '';
      const { toolCalls, textParts } = ToolParser.parse(content);

      const toolSummary = toolCalls.length > 0
        ? `工具调用: ${toolCalls.map(tc => tc.action).join(', ')}`
        : '纯文本回复';
      cb.updateSystemStep(SYSTEM_STEPS.PARSE_RESPONSE.id, 'completed', toolSummary);

      const todoCall = toolCalls.find(tc => tc.action === 'update_todo_list');
      if (todoCall) {
        const todosParam = todoCall.todos;
        let todos: ParsedTodoItem[] = [];

        if (typeof todosParam === 'string') {
          todos = ToolParser.parseMarkdownChecklist(todosParam);
        } else if (Array.isArray(todosParam)) {
          todos = todosParam as ParsedTodoItem[];
        }

        if (todos.length > 0) {
          const normalizedTodos: TodoItem[] = todos.map((t, idx) => ({
            id: t.id || `todo-${Date.now()}-${idx}`,
            content: t.content,
            status: t.status || 'pending',
            type: 'task',
          }));

          cb.setTodoList(normalizedTodos);
          console.log('[AI] TodoList updated:', normalizedTodos.length, 'items');
        }
      }

      if (toolCalls.length > 0) {
        consecutiveNoToolCount = 0;
        selfCorrectionAttempts = 0;
        cb.setStreamingContent(null);
        cb.setStreamingThinking(null);

        cb.updateSystemStep(SYSTEM_STEPS.EXECUTE_OPERATIONS.id, 'in_progress', `待执行: ${toolCalls.length} 个操作`);

        const planTool = toolCalls.find(tc => tc.action === 'plan');
        if (planTool && !taskPlan) {
          taskPlan = parsePlanTool(planTool);
          completedOps = 0;

          if (taskPlan && taskPlan.operations.length > 0) {
            cb.addMessage({
              role: 'assistant',
              content: `📋 任务规划完成！共 ${taskPlan.operations.length} 个操作：\n\n${formatPlanForUser(taskPlan)}\n\n开始逐步执行…`,
              thinking: accumulatedThinking || undefined,
            });
            accumulatedThinking = '';

            currentPrompt = buildAutonomousPrompt(taskPlan, completedOps, originalUserText);
            toolResults = [`[系统] 计划已确认，共 ${taskPlan.operations.length} 个操作待执行。请开始逐个执行，每完成一个立即继续下一个，不要停下来询问。`];
            continue;
          }
        }

        const analyzeTool = toolCalls.find(tc => tc.action === 'analyze-state');
        const decideTool = toolCalls.find(tc => tc.action === 'decide-next');
        const hasMetaTool = !!(analyzeTool || decideTool);

        if (analyzeTool) {
          const state = parseAnalyzeTool(analyzeTool);
          if (state) {
            accumulatedContext += `\n[状态分析]\n项目状态：${state.projectStatus}\n已完成：${state.completedWork.join(', ')}\n待完成：${state.pendingWork.join(', ')}\n建议：${state.suggestions.join(', ')}`;
            lastAction = 'analyze-state';
          }
        }

        if (decideTool) {
          const decision = parseDecideTool(decideTool);
          if (decision) {
            lastAction = decision.action;
            if (decision.action === 'complete') {
              if (textParts && textParts.length > 10) {
                cb.addMessage({ role: 'assistant', content: textParts, thinking: accumulatedThinking || undefined });
                accumulatedThinking = '';
              }
              cb.setAgentPhase(AgentPhase.COMPLETED, summarizeTask(text), 100);
              cb.addMessage({ role: 'assistant', content: `✅ ${decision.reason}\n\n思考过程：${decision.thought}` });
              break;
            }
            if (decision.action === 'ask_user') {
              if (textParts && textParts.length > 10) {
                cb.addMessage({ role: 'assistant', content: textParts, thinking: accumulatedThinking || undefined });
                accumulatedThinking = '';
              }
              waitingForUser = true;
              cb.addMessage({ role: 'assistant', content: `🤔 ${decision.reason}\n\n${decision.thought}` });
              return { waitingForUser: true };
            }
          }
        }

        if (hasMetaTool) {
          if (textParts && textParts.length > 10) {
            cb.addMessage({ role: 'assistant', content: textParts, thinking: accumulatedThinking || undefined });
            accumulatedThinking = '';
          }

          const actionableTools = toolCalls.filter(tc =>
            tc.action !== 'plan' && tc.action !== 'analyze-state' && tc.action !== 'decide-next'
          );

          if (actionableTools.length > 0) {
            const loopResult = await handleToolCalls(actionableTools, textParts, text, model, cb, taskPlan, completedOps);
            if (loopResult.accumulatedResults) {
              accumulatedContext += `\n${loopResult.accumulatedResults}`;
            }
            if (taskPlan && loopResult.opsProcessed) {
              completedOps += loopResult.opsProcessed;
            }
          }

          if (analyzeTool && !decideTool) {
            if (actionableTools.length === 0) {
              currentPrompt = '请直接使用 decide-next 工具决定下一步操作。不需要再次分析状态。';
            } else {
              currentPrompt = '基于以上状态分析，请决定下一步操作。使用 decide-next 工具输出你的决策。';
            }
          } else if (decideTool) {
            const decision = parseDecideTool(decideTool);
            if (decision) {
              currentPrompt = buildDecisionPrompt(decision);
            }
          }
          continue;
        }

        if (!taskPlan && textParts && textParts.length > 20) {
          const implicitPlan = extractImplicitPlan(textParts, text);
          if (implicitPlan && implicitPlan.operations.length > 1) {
            taskPlan = implicitPlan;
            completedOps = 0;
          }
        }

        const loopResult = await handleToolCalls(toolCalls, textParts, text, model, cb, taskPlan, completedOps);

        if (loopResult.type === 'wait_user') {
          waitingForUser = true;
          return { waitingForUser: true };
        }

        if (loopResult.type === 'done') {
          cb.updateSystemStep(SYSTEM_STEPS.EXECUTE_OPERATIONS.id, 'completed', '操作执行完成');
          
          if (taskPlan) {
            completedOps += loopResult.opsProcessed || 1;
            if (completedOps < taskPlan.operations.length) {
              toolResults = [loopResult.accumulatedResults || '', buildContinuePrompt(taskPlan, completedOps)];
              currentPrompt = buildAutonomousPrompt(taskPlan, completedOps, originalUserText);
              continue;
            } else {
              cb.setAgentPhase(AgentPhase.COMPLETED, summarizeTask(text), 100);
              cb.addMessage({ role: 'assistant', content: `✅ 全部完成！共执行 ${taskPlan.operations.length} 个操作。` });
              break;
            }
          } else {
            if (textParts && textParts.length > 20) {
              const implicitPlan = extractImplicitPlan(textParts, text);
              if (implicitPlan && implicitPlan.operations.length > 1) {
                taskPlan = implicitPlan;
                completedOps = Math.min(loopResult.opsProcessed || 1, taskPlan.operations.length);
                if (completedOps < taskPlan.operations.length) {
                  toolResults = [loopResult.accumulatedResults || '', buildContinuePrompt(taskPlan, completedOps)];
                  currentPrompt = buildAutonomousPrompt(taskPlan, completedOps, originalUserText);
                  continue;
                }
              }
            }
            if (taskPlan && completedOps < taskPlan.operations.length) {
              toolResults = [loopResult.accumulatedResults || '', buildContinuePrompt(taskPlan, completedOps)];
              currentPrompt = buildAutonomousPrompt(taskPlan, completedOps, originalUserText);
              continue;
            }
            if (loopResult.accumulatedResults && loopResult.accumulatedResults.includes('read_folder')) {
              accumulatedContext += `\n${loopResult.accumulatedResults}`;
              currentPrompt = buildAnalyzeStatePrompt(text, accumulatedContext);
              continue;
            }
            if (loopResult.accumulatedResults && (loopResult.accumulatedResults.includes('create_file') || loopResult.accumulatedResults.includes('update_file'))) {
              accumulatedContext += `\n${loopResult.accumulatedResults}`;
              currentPrompt = buildAnalyzeStatePrompt(text, accumulatedContext);
              continue;
            }
            break;
          }
        }

        if (loopResult.type === 'continue') {
          toolResults = [loopResult.accumulatedResults || '', loopResult.nextPrompt || '请继续完成任务'];
          if (taskPlan) {
            currentPrompt = buildAutonomousPrompt(taskPlan, completedOps, originalUserText);
          } else {
            accumulatedContext += `\n${loopResult.accumulatedResults || ''}`;
            currentPrompt = buildAnalyzeStatePrompt(text, accumulatedContext);
          }
          continue;
        }

        break;
      }

      if (textParts && textParts.length > 50 && detectCreateIntent(textParts)) {
        if (selfCorrectionAttempts < 2) {
          selfCorrectionAttempts++;
          consecutiveNoToolCount = 0;
          cb.setStreamingContent(null);
          cb.setStreamingThinking(null);
          cb.setAgentPhase(AgentPhase.SELF_CORRECTING, summarizeTask(text), 60, { iteration });
          currentPrompt = getSelfCorrectionPrompt(selfCorrectionAttempts);
          toolResults = [`[AI上一轮输出]\n${textParts}\n\n[系统提醒：以上内容未使用 tool 格式创建文件]`];
          cb.addMessage({ role: 'assistant', content: textParts, thinking: accumulatedThinking || undefined });
          accumulatedThinking = '';
          continue;
        } else {
          cb.setStreamingContent(null);
          cb.setStreamingThinking(null);
          await handleSmartExtraction(textParts, text, cb);
          accumulatedContext += '\n已智能提取并创建文件';
          currentPrompt = buildAnalyzeStatePrompt(text, accumulatedContext);
          continue;
        }
      }

      cb.setStreamingContent(null);
      cb.setStreamingThinking(null);

      if (!taskPlan && textParts.length > 20) {
        const implicitPlan = extractImplicitPlan(textParts, text);
        if (implicitPlan && implicitPlan.operations.length > 1) {
          taskPlan = implicitPlan;
          completedOps = 0;
          cb.addMessage({
            role: 'assistant',
            content: `📋 检测到多文件任务，已自动规划 ${taskPlan.operations.length} 个操作。开始执行…`,
            thinking: accumulatedThinking || undefined,
          });
          accumulatedThinking = '';
          currentPrompt = buildAutonomousPrompt(taskPlan, completedOps, originalUserText);
          toolResults = [`[系统] 已自动规划 ${taskPlan.operations.length} 个操作。请开始逐个执行，不要停下来。`];
          continue;
        }
      }

      if (taskPlan && completedOps < taskPlan.operations.length) {
        consecutiveNoToolCount++;
        if (consecutiveNoToolCount >= MAX_NO_TOOL_RETRIES) {
          cb.setAgentPhase(AgentPhase.ERROR, summarizeTask(text), calculateProgress(iteration, taskPlan, completedOps), {
            error: `连续 ${MAX_NO_TOOL_RETRIES} 次未使用工具，已终止`,
          });
          cb.addMessage({
            role: 'assistant',
            content: `⚠️ 连续 ${MAX_NO_TOOL_RETRIES} 次回复未包含工具调用，已终止执行。已完成 ${completedOps}/${taskPlan.operations.length} 个操作。你可以继续发送指令让 AI 继续。`,
          });
          break;
        }

        toolResults = [
          `[系统] 第 ${consecutiveNoToolCount} 次提醒：还有未完成的操作，必须使用 tool 格式执行。`,
          buildContinuePrompt(taskPlan, completedOps),
        ];
        currentPrompt = buildAutonomousPrompt(taskPlan, completedOps, originalUserText);
        continue;
      }

      if (accumulatedContext) {
        currentPrompt = buildAnalyzeStatePrompt(text, accumulatedContext);
        continue;
      }

      cb.setAgentPhase(AgentPhase.COMPLETED, summarizeTask(text), 100);
      cb.addMessage({ 
        role: 'assistant', 
        content: textParts || '(无内容)',
        thinking: accumulatedThinking || undefined,
      });
      cb.updateSystemStep(SYSTEM_STEPS.EXECUTE_OPERATIONS.id, 'completed', '任务完成');
      cb.updateSystemStep(SYSTEM_STEPS.CHECK_COMPLETION.id, 'completed', 'AI 回复完成');
      break;
    }

    if (iteration >= MAX_ITERATIONS) {
      cb.addMessage({
        role: 'assistant',
        content: `⚠️ 已达到最大迭代次数（${MAX_ITERATIONS}），已完成 ${completedOps}/${taskPlan?.operations.length || 0} 个操作。你可以继续发送指令让 AI 继续。`,
      });
    }

    return { waitingForUser };
  } catch (err) {
    if (cb.isCurrentTask()) {
      cb.setIsProcessing(false);
    }
    throw err;
  } finally {
    if (!waitingForUser && cb.isCurrentTask()) {
      cb.setIsProcessing(false);
      cb.setStreamingContent(null);
      cb.setStreamingThinking(null);
      setTimeout(() => {
        if (cb.isCurrentTask()) {
          cb.setAgentPhase(AgentPhase.IDLE, '', 0);
        }
      }, 2000);
    }
  }
}

function buildAnalyzeStatePrompt(originalText: string, accumulatedContext: string): string {
  return `## 用户的原始需求\n${originalText}\n\n## 已执行的操作\n${accumulatedContext}\n\n请分析当前项目状态并决定下一步操作。请使用 analyze-state 工具分析当前状态，然后使用 decide-next 工具决定下一步操作。

**analyze-state 格式**：
\`\`\`tool
{"action": "analyze-state", "content": "分析当前项目状态：已创建/修改了哪些内容，还需要做什么"}
\`\`\`

**decide-next 格式**：
\`\`\`tool
{"action": "decide-next", "thought": "详细思考过程...", "decision": "create_file|update_file|read_file|read_folder|complete|ask_user", "target": {"folder": "characters|world|timeline|outline", "name": "文件名"}, "reason": "为什么选择这个操作", "confidence": 0.85}
\`\`\``;
}

function buildDecisionPrompt(decision: AIDecision): string {
  const actionMap: Record<string, string> = {
    'create_file': '创建文件',
    'update_file': '更新文件',
    'read_file': '读取文件',
    'read_folder': '读取文件夹',
    'complete': '完成任务',
    'ask_user': '询问用户',
  };

  const actionDesc = actionMap[decision.action] || decision.action;
  const targetInfo = decision.target
    ? `目标：${decision.target.folder || ''}/${decision.target.name || ''}`
    : '';

  return `**AI 决策**：${actionDesc}
**原因**：${decision.reason}
**信心度**：${Math.round(decision.confidence * 100)}%

${targetInfo}

请立即执行此决策，使用相应的 tool 格式。`;
}

function parseAnalyzeTool(tool: any): AIState | null {
  try {
    const content = tool.content || tool.analysis || '';
    return {
      projectStatus: content,
      completedWork: [],
      pendingWork: [],
      suggestions: [],
    };
  } catch (e) {
    return null;
  }
}

function parseDecideTool(tool: any): AIDecision | null {
  try {
    return {
      thought: tool.thought || '',
      action: tool.decision || tool.action || 'complete',
      target: tool.target,
      reason: tool.reason || '',
      confidence: tool.confidence || 0.5,
    };
  } catch (e) {
    return null;
  }
}

function buildAutonomousPrompt(plan: TaskPlan, completedOps: number, originalText?: string): string {
  const pendingOps = plan.operations.slice(completedOps);
  if (pendingOps.length === 0) return '所有操作已完成。';

  const userRequest = originalText ? `\n## 用户的原始需求\n${originalText}\n` : '';

  const opList = pendingOps.map((op, i) => {
    const marker = i === 0 ? '🔄 当前' : '⏳';
    const actionLabel = op.action === 'update_file' ? '更新' : op.action === 'create_file' ? '创建' : op.action === 'delete_file' ? '删除' : '执行';
    const namePart = op.name && op.name !== '未命名文件' ? `【文件名必须为：${op.name}】` : '';
    return `${marker} ${actionLabel}：${op.description || op.action}${namePart}`;
  }).join('\n');

  const isOutline = pendingOps.some(op =>
    (op.description || '').includes('大纲') || (op.name || '').includes('大纲') || (op.fileId || '').includes('outline')
  );
  const detailHint = isOutline
    ? `\n4. ⚠️ 这是大纲，每章只写30-80字！只写核心事件+转折+结果，禁止写关键对话、冲突点、角色动态、伏笔等细节`
    : '';

  return `${userRequest}请继续执行任务计划。已完成 ${completedOps}/${plan.operations.length}，剩余 ${pendingOps.length} 个操作：\n${opList}\n\n⚠️ 关键规则：
1. 文件名必须严格使用计划中指定的名称，绝对不能自创新名字
2. 完成当前操作后，立即继续下一个，不要停下来询问
3. 全部完成后告知用户${detailHint}`;
}

function buildContinuePrompt(plan: TaskPlan, completedOps: number): string {
  if (completedOps >= plan.operations.length) return '';

  const nextOp = plan.operations[completedOps];
  const remaining = plan.operations.length - completedOps;
  const actionLabel = nextOp.action === 'update_file' ? '更新' : nextOp.action === 'create_file' ? '创建' : nextOp.action === 'delete_file' ? '删除' : '执行';
  const nameHint = nextOp.name && nextOp.name !== '未命名文件' ? `\n⚠️ 文件名必须是「${nextOp.name}」，不要用其他名字！` : '';

  const isOutline = (nextOp.description || '').includes('大纲') || (nextOp.name || '').includes('大纲') || (nextOp.fileId || '').includes('outline');
  const detailHint = isOutline ? ' ⚠️ 大纲每章只写30-80字，禁止写对话/冲突点/角色动态/伏笔！' : '';

  return `[进度 ${completedOps}/${plan.operations.length}] 下一个操作：${actionLabel}「${nextOp.description || nextOp.action}」（还剩 ${remaining} 个）。${nameHint}${detailHint}\n请直接输出 tool 继续执行，不要停。`;
}

function determinePhase(iteration: number, plan: TaskPlan | null, completedOps: number, lastAction: string | null): AgentPhase {
  if (lastAction === 'analyze-state') {
    return AgentPhase.ANALYZING;
  }
  if (lastAction === 'decide-next') {
    return AgentPhase.PLANNING;
  }
  if (!plan || completedOps === 0) {
    return iteration === 1 ? AgentPhase.ANALYZING : AgentPhase.GENERATING;
  }
  if (completedOps < plan.operations.length) {
    return AgentPhase.EXECUTING;
  }
  return AgentPhase.COMPLETED;
}

function calculateProgress(iteration: number, plan: TaskPlan | null, completedOps: number): number {
  if (!plan) {
    return Math.min(20 + (iteration - 1) * 15, 80);
  }
  if (plan.operations.length === 0) return 100;
  return Math.round((completedOps / plan.operations.length) * 90) + 10;
}

async function handleToolCalls(
  toolCalls: Array<{ action: string; [key: string]: any }>,
  textParts: string,
  originalText: string,
  model: ModelConfig,
  cb: ProcessCallbacks,
  taskPlan: TaskPlan | null,
  completedOps: number,
): Promise<{
  type: 'continue' | 'done' | 'wait_user';
  nextPrompt?: string;
  accumulatedResults?: string;
  lastResult?: string;
  opsProcessed?: number;
}> {
  cb.setAgentPhase(AgentPhase.VALIDATING, summarizeTask(originalText), 75);

  const fileOps = toolCalls.filter(tc => tc.action === 'create_file' || tc.action === 'update_file' || tc.action === 'delete_file');
  const nonFileOps = toolCalls.filter(tc => tc.action !== 'create_file' && tc.action !== 'update_file' && tc.action !== 'delete_file');

  if (textParts) {
    cb.addMessage({ role: 'assistant', content: textParts });
  } else if (toolCalls.length > 0 && fileOps.length === 0) {
    cb.addMessage({ role: 'assistant', content: '正在执行工具操作…' });
  }

  let needsUserInput = false;
  let actionResults = '';

  for (const tc of nonFileOps) {
    if (tc.action === 'ask_input' || tc.action === 'ask_choice') {
      needsUserInput = true;
      cb.showPrompt(tc, model);
    } else if (tc.action === 'plan' || tc.action === 'analyze-state' || tc.action === 'decide-next') {
    } else {
      const actionResult = await unifiedExecutor.executeAction(tc, cb.getCurrentMessageId());
      actionResults += `\n[工具执行结果] ${tc.action}: ${actionResult}\n`;
    }
  }

  if (fileOps.length > 0) {
    cb.setAgentPhase(AgentPhase.EXECUTING, summarizeTask(originalText), 90);

    let processedCount = 0;
    for (const fileOp of fileOps) {
      const actionResult = await unifiedExecutor.executeAction(fileOp, cb.getCurrentMessageId());
      const actionLabel = fileOp.action === 'update_file' ? '更新' : '创建';
      actionResults += `\n[工具执行结果] ${actionLabel}文件: ${actionResult}\n`;
      processedCount++;
    }

    if (taskPlan) {
      const newCompleted = completedOps + processedCount;
      const remainingCount = taskPlan.operations.length - newCompleted;

      if (remainingCount > 0) {
        // 还有剩余操作：不加入对话历史（避免AI误以为已完成），通过toolResults传递进度
        return {
          type: 'done',
          accumulatedResults: actionResults + `\n[进度] ${newCompleted}/${taskPlan.operations.length} 个文件操作完成，剩余 ${remainingCount} 个`,
          lastResult: actionResults,
          opsProcessed: processedCount,
        };
      }

      cb.addMessage({
        role: 'assistant',
        content: `${actionResults.trim()}\n\n✅ 全部完成！共执行 ${taskPlan.operations.length} 个文件操作。`,
      });

      return {
        type: 'done',
        accumulatedResults: actionResults,
        lastResult: actionResults,
        opsProcessed: processedCount,
      };
    }

    const hasReadOps = nonFileOps.some(tc =>
      tc.action === 'read_file' || tc.action === 'read_folder' || tc.action === 'batch_read' || tc.action === 'search'
    );
    if (hasReadOps) {
      cb.addMessage({ role: 'assistant', content: actionResults.trim() });
      return { type: 'continue', nextPrompt: '请根据读取到的信息继续完成任务。如果需要创建或修改文件，请使用 tool 格式。', accumulatedResults: actionResults };
    }

    cb.addMessage({ role: 'assistant', content: actionResults.trim() });
    return { type: 'done', lastResult: actionResults };
  }

  if (needsUserInput) {
    cb.setAgentPhase(AgentPhase.WAITING_CONFIRM, summarizeTask(originalText), 50);
    return { type: 'wait_user' };
  }

  if (nonFileOps.length > 0) {
    return {
      type: 'continue',
      nextPrompt: '请根据工具执行结果继续完成任务。如果需要创建或修改文件，请使用 tool 格式。',
      accumulatedResults: actionResults,
    };
  }

  return { type: 'done' };
}

function parsePlanTool(planTool: any): TaskPlan | null {
  try {
    if (planTool.operations && Array.isArray(planTool.operations)) {
      return {
        id: `plan_${Date.now()}`,
        description: planTool.description || '任务计划',
        operations: planTool.operations.map((op: any, idx: number) => ({
          ...op,
          status: 'pending',
          id: `op_${idx}`,
        })),
        status: 'pending',
      };
    }

    if (typeof planTool.content === 'string') {
      const lines = planTool.content.split('\n').filter((l: string) => l.trim());
      const operations: PlannedOperation[] = [];

      for (const line of lines) {
        const createMatch = line.match(/(?:创建|新建|生成)\s*[：:]\s*(.+)/);
        const updateMatch = line.match(/(?:更新|修改|编辑|完善)\s*[：:]\s*(.+)/);

        if (createMatch) {
          operations.push({
            action: 'create_file',
            name: createMatch[1].trim(),
            description: `创建文件：${createMatch[1].trim()}`,
            status: 'pending',
          });
        } else if (updateMatch) {
          operations.push({
            action: 'update_file',
            name: updateMatch[1].trim(),
            description: `更新文件：${updateMatch[1].trim()}`,
            status: 'pending',
          });
        } else if (line.trim().length > 5) {
          operations.push({
            action: 'general',
            description: line.trim(),
            status: 'pending',
          });
        }
      }

      if (operations.length > 0) {
        return {
          id: `plan_${Date.now()}`,
          description: planTool.title || '任务计划',
          operations,
          status: 'pending',
        };
      }
    }
  } catch (e) {
    console.error('Failed to parse plan:', e);
  }

  return null;
}

function extractImplicitPlan(text: string, originalText: string): TaskPlan | null {
  const patterns: Array<{ regex: RegExp; actionGroup: number; descGroup: number }> = [
    { regex: /(?:我将|我来|我会|计划|准备)[^。\n]*?(创建|生成|新建|完善|补充|更新|修改)[^。\n]*?([^\n,，]+)/g, actionGroup: 1, descGroup: 2 },
    { regex: /(\d+)[、.\s]+(创建|生成|新建|完善|补充|更新|修改)[^。\n]*?([^\n]+)/g, actionGroup: 2, descGroup: 3 },
    { regex: /(?:首先|第一|其次|第二|然后|接下来|最后)[^。\n]*?([^\n]+)/g, actionGroup: 0, descGroup: 1 },
  ];

  const operations: PlannedOperation[] = [];
  const seen = new Set<string>();

  for (const { regex, actionGroup, descGroup } of patterns) {
    let match;
    while ((match = regex.exec(text)) !== null) {
      const desc = match[descGroup].trim();
      if (desc.length > 3 && !seen.has(desc)) {
        seen.add(desc);
        const actionWord = actionGroup > 0 ? match[actionGroup] : '';
        const isCreate = actionWord ? /^(?:创建|生成|新建)$/.test(actionWord) : /(?:创建|生成|新建)/.test(desc);
        const isUpdate = actionWord ? /^(?:完善|补充|更新|修改)$/.test(actionWord) : /(?:完善|补充|更新|修改)/.test(desc);
        operations.push({
          action: isCreate ? 'create_file' : isUpdate ? 'update_file' : 'general',
          description: desc,
          name: extractFileName(desc),
          status: 'pending',
        });
      }
    }
  }

  if (operations.length >= 2) {
    return {
      id: `implicit_plan_${Date.now()}`,
      description: '自动识别的任务计划',
      operations,
      status: 'pending',
    };
  }

  return null;
}

function extractFileName(description: string): string {
  const match = description.match(/[""""「」『』]([^""""「」『』]+)[""""「」『』]|[\w\u4e00-\u9fff]{2,10}/);
  return match ? match[1] || match[0] : '未命名文件';
}

function formatPlanContext(plan: TaskPlan, completedOps: number): string {
  const lines = [`任务计划：${plan.description}`, `总操作数：${plan.operations.length}`, '', '进度：'];

  plan.operations.forEach((op, idx) => {
    const status = idx < completedOps ? '✅' : idx === completedOps ? '🔄' : '⏳';
    const actionLabel = op.action === 'update_file' ? '更新' : op.action === 'create_file' ? '创建' : op.action === 'delete_file' ? '删除' : '执行';
    lines.push(`${status} [${idx + 1}/${plan.operations.length}] ${actionLabel}：${op.description || op.name || op.action}`);
  });

  if (completedOps < plan.operations.length) {
    const nextOp = plan.operations[completedOps];
    const actionLabel = nextOp.action === 'update_file' ? '更新' : nextOp.action === 'create_file' ? '创建' : nextOp.action === 'delete_file' ? '删除' : '执行';
    lines.push('', `当前应执行：[${completedOps + 1}] ${actionLabel}「${nextOp.description || nextOp.name || nextOp.action}」`);
  }

  return lines.join('\n');
}

function formatPlanForUser(plan: TaskPlan): string {
  return plan.operations
    .map((op, idx) => {
      const actionLabel = op.action === 'update_file' ? '📝 更新' : op.action === 'create_file' ? '📄 创建' : op.action === 'delete_file' ? '🗑️ 删除' : '🔧 执行';
      return `${idx + 1}. ${actionLabel}：${op.description || op.name || op.action}`;
    })
    .join('\n');
}

async function handleSmartExtraction(
  textContent: string,
  originalText: string,
  cb: ProcessCallbacks,
): Promise<void> {
  cb.setAgentPhase(AgentPhase.VALIDATING, summarizeTask(originalText), 70);

  const target = detectTarget(originalText);
  const extractedFiles = ToolParser.smartExtract(textContent, target);

  const pendingFiles = extractedFiles.length > 0 ? extractedFiles : [{ name: '新建文件', content: textContent }];

  const fileOps = pendingFiles.map(f => ({
    action: 'create_file' as const,
    name: f.name,
    content: f.content,
  }));

  cb.setAgentPhase(AgentPhase.EXECUTING, summarizeTask(originalText), 90);

  for (const op of fileOps) {
    await unifiedExecutor.executeAction(op, cb.getCurrentMessageId());
  }

  cb.setAgentPhase(AgentPhase.COMPLETED, summarizeTask(originalText), 100);
  cb.addMessage({ role: 'assistant', content: `✅ 已创建 ${fileOps.length} 个文件。` });
}

function getSelfCorrectionPrompt(attempt: number): string {
  const prompts = [
    '你刚才只输出了文字内容，但没有用 tool 格式保存。请把完整内容放在 tool JSON 的 content 字段中，例如：\n```tool\n{"action": "create_file", "parentId": "文件夹ID", "name": "文件名", "content": "完整内容"}\n```\n或更新已有文件：\n```tool\n{"action": "update_file", "fileId": "文件ID", "content": "完整内容"}\n```',
    `⚠️ 这是第 ${attempt} 次提醒！你必须使用 tool 格式，且把完整内容放在 content 字段中。

正确做法：
\`\`\`tool
{"action": "create_file", "parentId": "文件夹ID", "name": "文件名", "content": "完整的文件内容"}
\`\`\`
或：
\`\`\`tool
{"action": "update_file", "fileId": "文件ID", "content": "完整的新内容"}
\`\`\`

错误做法（绝对不要这样做）：
- 只输出文字描述不跟 tool
- 先输出内容再跟一个不含 content 的 tool（内容会丢失！）
- 输出"我将创建..."然后不执行

现在请立即执行！`,
    `🚨 最后一次提醒！之前的 ${attempt - 1} 次你都没有使用 tool 格式。

你的回复必须是一个 \`\`\`tool 代码块，把完整内容放在 content 字段中：
{"action": "create_file", "parentId": "文件夹ID", "name": "文件名", "content": "完整内容"}

不要输出任何其他解释！`,
  ];
  return prompts[Math.min(attempt - 1, prompts.length - 1)];
}

function buildCompressedHistory(messages: AIChatMessage[], tokenBudget: number): string {
  if (messages.length === 0) return '';

  const roleLabel = (m: AIChatMessage) => (m.role === 'user' ? '用户' : '助手');

  const recentMsgs: AIChatMessage[] = [];
  let usedTokens = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    const t = estimateTokenCount(m.compressedSummary || m.content) + 10;
    if (usedTokens + t > tokenBudget && recentMsgs.length >= 2) break;
    recentMsgs.unshift(m);
    usedTokens += t;
  }

  const compressedCount = messages.length - recentMsgs.length;
  if (compressedCount <= 0) {
    return recentMsgs.map(m => `${roleLabel(m)}：${m.compressedSummary || m.content}`).join('\n\n');
  }

  const olderMsgs = messages.slice(0, compressedCount);
  const summaryParts: string[] = [];
  for (const m of olderMsgs) {
    if (m.compressedSummary) {
      summaryParts.push(`${roleLabel(m)}：${m.compressedSummary}`);
    } else {
      const c = m.content;
      if (c.length <= 120) {
        summaryParts.push(`${roleLabel(m)}：${c}`);
      } else {
        summaryParts.push(`${roleLabel(m)}：${c.slice(0, 100)}…`);
      }
    }
  }

  const compressedBlock = `【更早对话摘要】\n${summaryParts.join('\n')}`;
  const recentBlock = recentMsgs.map(m => `${roleLabel(m)}：${m.compressedSummary || m.content}`).join('\n\n');

  return `${compressedBlock}\n\n${recentBlock}`;
}
