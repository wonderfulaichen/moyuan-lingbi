import { AIChatMessage, AITaskItem, AIAssistantState, AIInputPrompt, AIChoicePrompt, AIPlanPrompt, AIPlanStep, Conversation, AIAgent, AgentPhase, AgentStateInfo } from '../../../../shared/types/fileSystem';
import { ModelConfig } from '../../../../shared/types';
import { dataService } from '../DataService';
import { aiService } from '../aiService';
import { BUILT_IN_AGENTS } from './systemPrompt';
import { tryHandleCommand } from './commandHandler';
import { processWithAI, ProcessCallbacks } from './processWithAI';
import { setPlanSteps, clearPlanState, toggleStep, executePlan } from './PlanExecutor';
import { unifiedExecutor } from './UnifiedExecutor';
import { summarizeTask } from './contextBuilder';

type AssistantListener = (state: AIAssistantState) => void;

function nanoid(): string {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

class AIAssistantService {
  private state: AIAssistantState;
  private listeners: Set<AssistantListener> = new Set();
  private static instance: AIAssistantService | null = null;
  private currentMessageId: string | null = null;
  private currentTaskId: string | null = null;
  private onTokenUsageCallback: ((tokens: { prompt: number; completion: number; total: number }) => void) | null = null;

  setOnTokenUsage(cb: (tokens: { prompt: number; completion: number; total: number }) => void): void {
    this.onTokenUsageCallback = cb;
  }

  private constructor() {
    this.state = {
      messages: [],
      tasks: [],
      isProcessing: false,
      streamingContent: null,
      pendingPrompt: null,
      conversations: [],
      activeConversationId: null,
      agents: [...BUILT_IN_AGENTS],
      activeAgentId: 'agent-general',
      tokenUsage: null,
      agentState: {
        phase: AgentPhase.IDLE,
        currentTask: '',
        progress: 0,
        requiredAction: 'none',
        error: null,
        pendingFiles: [],
        iteration: 0,
        maxIterations: 3,
      },
    };
    this.loadConversations();
    this.loadCustomAgents();
    if (this.state.conversations.length === 0) this.newConversation();
    else this.switchToConversation(this.state.conversations[0].id);
  }

  static getInstance(): AIAssistantService {
    if (!AIAssistantService.instance) {
      AIAssistantService.instance = new AIAssistantService();
    }
    return AIAssistantService.instance;
  }

  subscribe(listener: AssistantListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getState(): AIAssistantState {
    return this.state;
  }

  private emit(): void {
    for (const fn of this.listeners) fn({ ...this.state });
    this.saveCurrentConversation();
    this.persistConversations();
  }

  private addMessage(msg: Omit<AIChatMessage, 'id' | 'timestamp' | 'actions'>): AIChatMessage {
    const full: AIChatMessage = {
      id: nanoid(),
      role: msg.role,
      content: msg.content,
      timestamp: Date.now(),
      actions: [],
    };
    this.state.messages = [...this.state.messages, full];
    if (this.state.messages.length > 200) {
      this.state.messages = this.state.messages.slice(-150);
    }
    this.currentMessageId = full.id;
    this.emit();
    return full;
  }

  async sendMessage(text: string, model: ModelConfig): Promise<void> {
    if (this.state.isProcessing) {
      this.abort();
    }

    const taskId = nanoid();
    this.currentTaskId = taskId;

    this.addMessage({ role: 'user', content: text });
    this.state.isProcessing = true;
    this.state.tokenUsage = null;
    this.updateAgentState({
      phase: AgentPhase.ANALYZING,
      currentTask: summarizeTask(text),
      progress: 10,
      requiredAction: 'none',
      error: null,
      pendingFiles: [],
      iteration: 0,
    });
    this.emit();

    try {
      const cmdInfo = tryHandleCommand(text);
      if (cmdInfo) {
        this.addTask({ title: `创建${cmdInfo.label}内容`, description: text });
        const result = await processWithAI(cmdInfo.instruction, model, this.createCallbacks(text));
        if (result.waitingForUser) return;
        return;
      }
      const result = await processWithAI(text, model, this.createCallbacks(text));
      if (result.waitingForUser) return;
    } catch (err) {
      this.updateAgentState({
        phase: AgentPhase.ERROR,
        currentTask: '',
        progress: 0,
        requiredAction: 'retry',
        error: err instanceof Error ? err.message : '未知错误',
      });
      this.addMessage({ role: 'assistant', content: `❌ 请求失败：${err instanceof Error ? err.message : '未知错误'}` });
    } finally {
      if (!this.state.pendingPrompt) {
        this.currentTaskId = null;
        this.state.isProcessing = false;
      }
      this.saveCurrentConversation();
      this.persistConversations();
      this.emit();
    }
  }

  async sendCommand(command: string, model: ModelConfig, options?: { silent?: boolean; label?: string }): Promise<void> {
    if (this.state.isProcessing) {
      this.abort();
    }

    const taskId = nanoid();
    this.currentTaskId = taskId;

    if (!options?.silent) {
      this.addMessage({ role: 'user', content: command });
    }

    this.state.isProcessing = true;
    this.state.tokenUsage = null;
    this.updateAgentState({
      phase: AgentPhase.ANALYZING,
      currentTask: options?.label || summarizeTask(command),
      progress: 10,
      requiredAction: 'none',
      error: null,
      pendingFiles: [],
      iteration: 0,
    });
    this.emit();

    try {
      const result = await processWithAI(command, model, this.createCallbacks(command));
      if (result.waitingForUser) return;
    } catch (err) {
      this.updateAgentState({
        phase: AgentPhase.ERROR,
        currentTask: '',
        progress: 0,
        requiredAction: 'retry',
        error: err instanceof Error ? err.message : '未知错误',
      });
      this.addMessage({ role: 'assistant', content: `❌ 执行出错：${err instanceof Error ? err.message : '未知错误'}` });
    } finally {
      if (!this.state.pendingPrompt) {
        this.currentTaskId = null;
        this.state.isProcessing = false;
      }
      this.saveCurrentConversation();
      this.persistConversations();
      this.emit();
    }
  }

  private createCallbacks(text: string): ProcessCallbacks {
    return {
      addMessage: (msg) => this.addMessage(msg),
      setStreamingContent: (content) => {
        this.state.streamingContent = content;
        this.emit();
      },
      setAgentPhase: (phase, task, progress, extra) => {
        this.updateAgentState({
          phase,
          currentTask: task,
          progress,
          requiredAction: 'none',
          ...extra,
        });
      },
      showPrompt: (toolCall, model) => this.showPrompt(toolCall, model),
      setIsProcessing: (processing) => {
        this.state.isProcessing = processing;
        this.emit();
      },
      setTokenUsage: (usage) => {
        const prev = this.state.tokenUsage || { prompt: 0, completion: 0, total: 0 };
        const accumulated = {
          prompt: prev.prompt + (usage.prompt || 0),
          completion: prev.completion + (usage.completion || 0),
          total: prev.total + (usage.prompt || 0) + (usage.completion || 0),
        };
        this.state.tokenUsage = accumulated;
        this.onTokenUsageCallback?.(accumulated);
        this.emit();
      },
      getActiveAgent: () => this.getActiveAgent(),
      getMessages: () => this.state.messages,
      getCurrentMessageId: () => this.currentMessageId,
      emit: () => this.emit(),
      isCurrentTask: () => this.currentTaskId !== null,
    };
  }

  private updateAgentState(partial: Partial<AgentStateInfo>): void {
    this.state.agentState = { ...this.state.agentState, ...partial };
    this.emit();
  }

  private showPrompt(toolCall: Record<string, any>, model: ModelConfig): void {
    switch (toolCall.action) {
      case 'ask_input': {
        const prompt: AIInputPrompt = {
          type: 'input',
          question: toolCall.question || '请输入：',
          placeholder: toolCall.placeholder || '',
          onAnswer: (answer: string) => {
            this.state.pendingPrompt = null;
            this.addMessage({ role: 'user', content: answer });
            this.state.isProcessing = true;
            this.emit();
            processWithAI(answer, model, this.createCallbacks(answer)).then(result => {
              if (result.waitingForUser) return;
            }).catch(err => {
              console.error('[AI] onAnswer error:', err);
            }).finally(() => {
              if (!this.state.pendingPrompt) {
                this.currentTaskId = null;
                this.state.isProcessing = false;
                this.emit();
              }
            });
          },
        };
        this.state.pendingPrompt = prompt;
        break;
      }
      case 'ask_choice': {
        const prompt: AIChoicePrompt = {
          type: 'choice',
          question: toolCall.question || '请选择：',
          options: toolCall.options || [],
          multiSelect: toolCall.multiSelect === true,
          onAnswer: (answer: string | string[]) => {
            this.state.pendingPrompt = null;
            const answerText = Array.isArray(answer) ? answer.join('、') : answer;
            this.addMessage({ role: 'user', content: answerText });
            this.state.isProcessing = true;
            this.emit();
            processWithAI(answerText, model, this.createCallbacks(answerText)).then(result => {
              if (result.waitingForUser) return;
            }).catch(err => {
              console.error('[AI] onChoice error:', err);
            }).finally(() => {
              if (!this.state.pendingPrompt) {
                this.currentTaskId = null;
                this.state.isProcessing = false;
                this.emit();
              }
            });
          },
        };
        this.state.pendingPrompt = prompt;
        break;
      }
      case 'plan': {
        const steps: AIPlanStep[] = (toolCall.steps || []).map((s: any) => ({
          title: s.title || '未命名步骤',
          description: s.description || '',
          enabled: true,
          status: 'pending' as const,
        }));
        setPlanSteps(steps, model);
        const prompt: AIPlanPrompt = {
          type: 'plan',
          title: toolCall.title || '执行计划',
          steps: [...steps],
          onConfirm: () => this.executePlan(),
          onCancel: () => {
            this.state.pendingPrompt = null;
            clearPlanState();
            this.addMessage({ role: 'assistant', content: '已取消计划执行。' });
            this.emit();
          },
          onStepToggle: (index: number, enabled: boolean) => {
            toggleStep(index, enabled);
            const currentPrompt = this.state.pendingPrompt;
            if (currentPrompt && currentPrompt.type === 'plan') {
              const updatedPrompt: AIPlanPrompt = {
                ...currentPrompt,
                steps: [...getPlanState().steps],
                onStepToggle: currentPrompt.onStepToggle,
              };
              this.state.pendingPrompt = updatedPrompt;
              this.emit();
            }
          },
        };
        this.state.pendingPrompt = prompt;
        break;
      }
    }
    this.emit();
  }

  private async executePlan(): Promise<void> {
    this.state.pendingPrompt = null;
    this.currentTaskId = nanoid();
    this.emit();

    this.state.isProcessing = true;
    this.emit();

    try {
      await executePlan(
        (msg) => this.addMessage(msg),
        (index, status) => {
          const planState = getPlanState();
          if (planState.steps[index]) {
            planState.steps[index].status = status;
          }
        },
      );
    } finally {
      this.currentTaskId = null;
      this.state.isProcessing = false;
      this.emit();
    }
  }

  answerInput(answer: string): void {
    const prompt = this.state.pendingPrompt;
    if (prompt && prompt.type === 'input') {
      prompt.onAnswer(answer);
    }
  }

  answerChoice(answer: string | string[]): void {
    const prompt = this.state.pendingPrompt;
    if (prompt && prompt.type === 'choice') {
      prompt.onAnswer(answer);
    }
  }

  confirmPlan(): void {
    const prompt = this.state.pendingPrompt;
    if (prompt && prompt.type === 'plan') {
      prompt.onConfirm();
    }
  }

  cancelPlan(): void {
    const prompt = this.state.pendingPrompt;
    if (prompt && prompt.type === 'plan') {
      prompt.onCancel();
    }
  }

  togglePlanStep(index: number, enabled: boolean): void {
    toggleStep(index, enabled);
    const currentPrompt = this.state.pendingPrompt;
    if (currentPrompt && currentPrompt.type === 'plan') {
      const updatedPrompt: AIPlanPrompt = {
        ...currentPrompt,
        steps: [...getPlanState().steps],
        onStepToggle: currentPrompt.onStepToggle,
      };
      this.state.pendingPrompt = updatedPrompt;
      this.emit();
    }
  }

  dismissPrompt(): void {
    this.state.pendingPrompt = null;
    this.emit();
  }

  addTask(params: { title: string; description: string; fileId?: string | null }): AITaskItem {
    const task: AITaskItem = {
      id: nanoid(),
      title: params.title,
      description: params.description,
      status: 'completed',
      result: '',
      createdAt: Date.now(),
      completedAt: Date.now(),
      fileId: params.fileId || null,
    };
    this.state.tasks = [task, ...this.state.tasks].slice(0, 100);
    this.emit();
    return task;
  }

  removeTask(taskId: string): void {
    this.state.tasks = this.state.tasks.filter(t => t.id !== taskId);
    this.emit();
  }

  clearTasks(): void {
    this.state.tasks = [];
    this.emit();
  }

  newConversation(): void {
    if (this.state.isProcessing) {
      aiService.abort();
      this.state.streamingContent = null;
      this.state.pendingPrompt = null;
      this.state.isProcessing = false;
    }
    this.saveCurrentConversation();
    const now = Date.now();
    const suffix = Math.random().toString(36).slice(2, 6);
    const conv: Conversation = {
      id: `conv-${now}-${suffix}`,
      title: '新对话',
      messages: [],
      createdAt: now,
      updatedAt: now,
    };
    this.state.conversations.unshift(conv);
    this.state.activeConversationId = conv.id;
    this.state.messages = [];
    this.state.pendingPrompt = null;
    this.emit();
    this.persistConversations();
  }

  switchToConversation(id: string): void {
    this.saveCurrentConversation();
    const target = this.state.conversations.find(c => c.id === id);
    if (!target) { this.emit(); return; }
    this.state.activeConversationId = id;
    this.state.messages = [...target.messages];
    this.state.pendingPrompt = null;
    this.emit();
  }

  recallMessage(messageId: string): void {
    let idx = this.state.messages.findIndex(m => m.id === messageId);
    if (idx === -1) return;

    const targetRole = this.state.messages[idx].role;
    let removeStart = idx;
    let removeEnd = idx + 1;

    if (targetRole === 'assistant') {
      if (idx > 0 && this.state.messages[idx - 1].role === 'user') {
        removeStart = idx - 1;
      }
    } else if (targetRole === 'user' && idx < this.state.messages.length - 1 && this.state.messages[idx + 1].role === 'assistant') {
      removeEnd = idx + 2;
    }

    const targetMsgIds = new Set(this.state.messages.slice(removeStart, removeEnd).map(m => m.id));
    const opsToRevert = unifiedExecutor.filterFileOperationsByMessageIds(targetMsgIds);
    const revertedFiles = unifiedExecutor.revertOperations(opsToRevert);
    unifiedExecutor.removeFileOperationsByMessageIds(targetMsgIds);
    this.state.messages = [...this.state.messages.slice(0, removeStart), ...this.state.messages.slice(removeEnd)];
    if (revertedFiles.length > 0) {
      this.addMessage({ role: 'assistant', content: `🔄 已撤回操作（${revertedFiles.length}项）：\n${revertedFiles.join('\n')}` });
    }
    this.saveCurrentConversation();
    this.emit();
  }

  deleteConversation(id: string): void {
    if (this.state.activeConversationId === id) {
      const idx = this.state.conversations.findIndex(c => c.id === id);
      const remaining = this.state.conversations.filter(c => c.id !== id);
      if (remaining.length === 0) {
        this.state.conversations = [];
        this.state.messages = [];
        this.state.activeConversationId = null;
        this.newConversation();
        return;
      }
      const nextIdx = Math.min(idx, remaining.length - 1);
      this.state.conversations = remaining;
      this.switchToConversation(remaining[nextIdx].id);
    } else {
      this.state.conversations = this.state.conversations.filter(c => c.id !== id);
    }
    this.persistConversations();
    this.emit();
  }

  renameConversation(id: string, title: string): void {
    const conv = this.state.conversations.find(c => c.id === id);
    if (conv) { conv.title = title; this.persistConversations(); this.emit(); }
  }

  getActiveAgent(): AIAgent {
    return this.state.agents.find(a => a.id === this.state.activeAgentId) || BUILT_IN_AGENTS[0];
  }

  switchAgent(agentId: string): void {
    if (!this.state.agents.find(a => a.id === agentId)) return;
    this.state.activeAgentId = agentId;
    this.persistCustomAgents();
    this.emit();
  }

  createAgent(params: { name: string; icon: string; color: string; description: string; systemPrompt: string }): AIAgent {
    const agent: AIAgent = {
      id: `agent-custom-${Date.now()}`,
      name: params.name,
      icon: params.icon || 'fa-wand-magic-sparkles',
      color: params.color || '',
      description: params.description || '',
      systemPrompt: params.systemPrompt || '',
      isBuiltIn: false,
      createdAt: Date.now(),
    };
    this.state.agents.push(agent);
    this.persistCustomAgents();
    this.emit();
    return agent;
  }

  updateAgent(id: string, params: Partial<Pick<AIAgent, 'name' | 'icon' | 'color' | 'description' | 'systemPrompt'>>): void {
    const agent = this.state.agents.find(a => a.id === id);
    if (!agent || agent.isBuiltIn) return;
    Object.assign(agent, params);
    this.persistCustomAgents();
    this.emit();
  }

  deleteAgent(id: string): void {
    const agent = this.state.agents.find(a => a.id === id);
    if (!agent || agent.isBuiltIn) return;
    this.state.agents = this.state.agents.filter(a => a.id !== id);
    if (this.state.activeAgentId === id) this.switchAgent('agent-general');
    this.persistCustomAgents();
    this.emit();
  }

  clearChat(): void {
    this.newConversation();
  }

  abort(): void {
    this.currentTaskId = null;
    aiService.abort();
    if (this.state.streamingContent) {
      this.addMessage({ role: 'assistant', content: this.state.streamingContent + '\n\n(已中断)' });
      this.state.streamingContent = null;
    }
    if (this.state.pendingPrompt) {
      this.state.pendingPrompt = null;
    }
    this.state.isProcessing = false;
    this.updateAgentState({
      phase: AgentPhase.IDLE,
      currentTask: '',
      progress: 0,
      requiredAction: 'none',
      error: null,
      pendingFiles: [],
      iteration: 0,
    });
    this.emit();
  }

  regenerateLast(model: ModelConfig): void {
    const lastAssistantIdx = [...this.state.messages].reverse().findIndex(m => m.role === 'assistant');
    if (lastAssistantIdx === -1) return;
    const actualIdx = this.state.messages.length - 1 - lastAssistantIdx;
    const lastUserMsg = [...this.state.messages].slice(0, actualIdx).reverse().find(m => m.role === 'user');
    if (!lastUserMsg) return;
    this.state.messages = this.state.messages.slice(0, actualIdx);
    this.currentTaskId = nanoid();
    this.state.isProcessing = true;
    this.emit();
    processWithAI(lastUserMsg.content, model, this.createCallbacks(lastUserMsg.content)).then(result => {
      if (result.waitingForUser) return;
    }).catch(err => {
      console.error('[AI] regenerateLast error:', err);
    }).finally(() => {
      if (!this.state.pendingPrompt) {
        this.currentTaskId = null;
        this.state.isProcessing = false;
        this.emit();
      }
    });
  }

  editAndResend(messageId: string, newContent: string, model: ModelConfig): void {
    const idx = this.state.messages.findIndex(m => m.id === messageId);
    if (idx === -1) return;
    this.state.messages[idx].content = newContent;
    this.state.messages = this.state.messages.slice(0, idx + 1);
    this.currentMessageId = this.state.messages[idx].id;
    this.currentTaskId = nanoid();
    this.state.isProcessing = true;
    this.emit();
    processWithAI(newContent, model, this.createCallbacks(newContent)).then(result => {
      if (result.waitingForUser) return;
    }).catch(err => {
      console.error('[AI] editAndResend error:', err);
    }).finally(() => {
      if (!this.state.pendingPrompt) {
        this.currentTaskId = null;
        this.state.isProcessing = false;
        this.emit();
      }
    });
  }

  private saveCurrentConversation(): void {
    const id = this.state.activeConversationId;
    if (!id) return;
    const conv = this.state.conversations.find(c => c.id === id);
    if (!conv) return;
    conv.messages = [...this.state.messages];
    conv.updatedAt = Date.now();
    if (conv.messages.length > 0 && (conv.title === '新对话' || !conv.title)) {
      const firstUserMsg = conv.messages.find(m => m.role === 'user');
      if (firstUserMsg) conv.title = firstUserMsg.content.slice(0, 30).replace(/\n/g, ' ');
    }
  }

  private persistConversations(): void {
    try {
      const MAX_CONVERSATIONS = 20;
      const KEEP_FULL = 40;
      const KEEP_COMPRESSED = 150;

      const conversations = this.state.conversations.slice(0, MAX_CONVERSATIONS);

      const data = conversations.map(c => {
        const allMsgs = c.messages || [];
        const recent = allMsgs.slice(-KEEP_FULL);
        const older = allMsgs.slice(0, Math.max(0, allMsgs.length - KEEP_FULL)).slice(-(KEEP_COMPRESSED - KEEP_FULL));

        const compressedOlder = older.map(m => ({
          ...m,
          compressedSummary: m.compressedSummary || (m.content.length > 150 ? m.content.slice(0, 150) + '…' : m.content),
        }));

        const messages = [...compressedOlder, ...recent];

        return {
          id: c.id,
          title: c.title || '新对话',
          messages,
          agentId: c.agentId || undefined,
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
        };
      });

      const json = JSON.stringify(data);
      if (json.length > 4 * 1024 * 1024) {
        console.warn('[AI] 存储数据接近上限，仅保留最近对话');
        const trimmed = data.slice(0, 5);
        localStorage.setItem('moyuan-ai-conversations', JSON.stringify(trimmed));
      } else {
        localStorage.setItem('moyuan-ai-conversations', json);
      }
    } catch (e) {
      console.warn('[AI] 保存对话历史失败:', e);
    }
  }

  private loadConversations(): void {
    try {
      const raw = localStorage.getItem('moyuan-ai-conversations');
      if (raw) {
        const data: Conversation[] = JSON.parse(raw);
        this.state.conversations = data
          .filter(c => c.id && c.messages && Array.isArray(c.messages))
          .map(c => ({
            ...c,
            title: c.title || '新对话',
            messages: (c.messages || []).filter(m => m && m.id && m.role).map(m => ({ ...m })),
            createdAt: c.createdAt || Date.now(),
            updatedAt: c.updatedAt || Date.now(),
          }));
      }
    } catch (e) {
      console.warn('[AI] 加载对话历史失败:', e);
      this.state.conversations = [];
    }
  }

  private loadCustomAgents(): void {
    try {
      const raw = localStorage.getItem('moyuan-ai-custom-agents');
      if (raw) {
        const data: AIAgent[] = JSON.parse(raw);
        this.state.agents = [...BUILT_IN_AGENTS, ...data];
      }
      const activeId = localStorage.getItem('moyuan-ai-active-agent');
      if (activeId && this.state.agents.find(a => a.id === activeId)) {
        this.state.activeAgentId = activeId;
      }
    } catch {}
  }

  private persistCustomAgents(): void {
    try {
      const customs = this.state.agents.filter(a => !a.isBuiltIn);
      localStorage.setItem('moyuan-ai-custom-agents', JSON.stringify(customs));
      localStorage.setItem('moyuan-ai-active-agent', this.state.activeAgentId);
    } catch {}
  }
}

function getPlanState() {
  const { getPlanState } = require('./PlanExecutor');
  return getPlanState();
}

export const aiAssistant = AIAssistantService.getInstance();
