/**
 * StepRunner
 *
 * 单步执行器：负责执行 Agent 流水线中的单个步骤。
 *
 * 职责：
 * - 调用 AI 服务（LLM）执行单步 Agent 任务
 * - 重试逻辑（指数退避）
 * - 取消支持（AbortSignal）
 * - 错误分类（可重试 vs. 不可重试）
 *
 * 与外部系统的集成：
 * - 使用 AgentRegistry 获取 AgentDefinition（含 systemPrompt）
 * - 使用 stepMemoryService.buildContext() 构建上下文
 * - 使用 aiService.generate() 调用 LLM
 * - 使用 ModelRouter.getModelForTask() 选择模型
 */

import type { AgentDefinition } from '../types';
import type { AgentInput, AgentOutput } from '../types';
import type { CancellationToken } from './CancellationToken';
import { CancelledError } from './CancellationToken';
import { delay } from './CancellationToken';
import { agentIdToDisplayName } from './mapper';
import { agentRegistry } from '../AgentRegistry';
import { modelRouter } from '../../ModelRouter';
import { aiService } from '../../aiService';
import { dataService } from '../../DataService';

// ============================================================
// LLM 错误类型
// ============================================================

/** LLM 超时错误 */
export class LLMTimeoutError extends Error {
  constructor(message = 'LLM 请求超时') {
    super(message);
    this.name = 'LLMTimeoutError';
  }
}

/** LLM 限流错误 */
export class LLMRateLimitError extends Error {
  constructor(message = 'LLM 请求被限流') {
    super(message);
    this.name = 'LLMRateLimitError';
  }
}

/** LLM 临时错误（可重试） */
export class LLMTemporaryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LLMTemporaryError';
  }
}

// ============================================================
// 单步执行
// ============================================================

/**
 * 执行单个 Agent 步骤
 *
 * 完整流程：
 * 1. 检查取消状态
 * 2. 获取 AgentDefinition
 * 3. 构建 LLM 请求上下文
 * 4. 调用 AI 服务（含重试逻辑）
 * 5. 解析输出为 AgentOutput
 *
 * @param agentId - 要执行的 Agent ID
 * @param input - Agent 输入
 * @param token - 取消令牌
 * @param retryBaseDelayMs - 重试退避基础时间（毫秒）
 * @returns Agent 输出
 * @throws CancelledError - 如果已被取消
 * @throws Error - 如果重试耗尽仍然失败
 */
export async function executeStep(
  agentId: string,
  input: AgentInput,
  token: CancellationToken,
  retryBaseDelayMs: number = 1000,
): Promise<AgentOutput> {
  // 1. 检查取消
  token.throwIfCancelled();

  // 2. 查找 Agent 定义
  const agentDef = agentRegistry.get(agentId);
  if (!agentDef) {
    throw new Error(`[StepRunner] Agent "${agentId}" 未注册`);
  }

  // 3. 加上当前 Project 的 context 一起发送
  const context = dataService.buildAIContext(12000);
  const project = dataService.getActiveProject();

  // 4. 执行（含重试）
  const maxRetries = agentDef.maxRetries;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // 每次重试前检查取消
    token.throwIfCancelled();

    try {
      const output = await executeStepOnce(agentDef, input, token, context, project);
      return output;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // 如果是取消错误，直接抛出
      if (lastError instanceof CancelledError) {
        throw lastError;
      }

      // 判断是否可以重试
      if (isRetryable(lastError) && attempt < maxRetries) {
        const waitMs = retryBaseDelayMs * Math.pow(2, attempt);
        // 等待退避（如果取消则提前返回）
        const completed = await delay(waitMs, token.signal);
        if (!completed) {
          throw new CancelledError('重试等待期间被取消');
        }
        continue;
      }

      // 不可重试或已耗尽重试次数
      throw lastError;
    }
  }

  // 不应到达这里
  throw lastError || new Error('[StepRunner] 执行失败：未知错误');
}

// ============================================================
// 单次执行（无重试）
// ============================================================

/**
 * 单次执行 LLM 调用（不含重试逻辑）
 *
 * @param agentDef - Agent 定义
 * @param input - Agent 输入
 * @param token - 取消令牌
 * @param context - 项目上下文
 * @param project - 活跃项目
 * @returns Agent 输出
 */
async function executeStepOnce(
  agentDef: AgentDefinition,
  input: AgentInput,
  token: CancellationToken,
  context: string,
  project: { title?: string; genre?: string; style?: string } | null,
): Promise<AgentOutput> {
  // 选择模型
  const taskType = agentDef.compatibleTasks[0] || 'general';
  const availableModels = dataService.getData().models || [];
  const fallbackModel = availableModels[0];
  const modelConfig = modelRouter.getModelForTask(taskType, availableModels, fallbackModel);

  // 构建 system prompt
  const systemPrompt = buildSystemPrompt(agentDef, context, project, input);

  // 构建用户消息（包含历史消息的上下文）
  const prompt = buildPrompt(input);

  // 调用 AI 服务（含超时保护）
  // 注意：原实现用 Promise.race + 内联 Promise，定时器和 abort 监听器在 generate 先完成时不会被清理，
  // 导致定时器泄漏（120s）和监听器泄漏。改用 finally 统一清理。
  const LLM_TIMEOUT_MS = 120000; // 120 秒
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;

  try {
    const response = await Promise.race([
      aiService.generate(
        {
          model: modelConfig,
          prompt,
          systemPrompt,
          signal: token.signal,
        },
        `agent-${agentDef.id}-${Date.now()}`,
      ),
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new LLMTimeoutError(`[StepRunner] LLM 请求超时 (${LLM_TIMEOUT_MS / 1000}s)`));
        }, LLM_TIMEOUT_MS);
        if (token.signal) {
          onAbort = () => {
            clearTimeout(timeoutId!);
            reject(new CancelledError('已中断生成'));
          };
          token.signal.addEventListener('abort', onAbort, { once: true });
        }
      }),
    ]);

    // 处理错误
    if (response.error) {
      throw new Error(response.error);
    }

    // 解析输出
    return parseLLMResponse(response.content, input);
  } finally {
    // 无论成功/失败/超时/取消，都清理定时器和监听器，避免泄漏
    if (timeoutId) clearTimeout(timeoutId);
    if (onAbort && token.signal) {
      token.signal.removeEventListener('abort', onAbort);
    }
  }
}

// ============================================================
// Prompt 构建
// ============================================================

/**
 * 构建 System Prompt
 *
 * 组合以下内容：
 * - Agent 的 systemPrompt（来自 AgentDefinition）
 * - 项目正典内容
 * - StepMemory 召回的相关记忆（通过 input.context）
 *
 * @param agentDef - Agent 定义
 * @param context - 项目上下文
 * @param project - 活跃项目
 * @param input - Agent 输入
 * @returns 完整的 system prompt 字符串
 */
function buildSystemPrompt(
  agentDef: AgentDefinition,
  context: string,
  project: { title?: string; genre?: string; style?: string } | null,
  input: AgentInput,
): string {
  const parts: string[] = [];

  // Agent 的 systemPrompt
  parts.push(agentDef.systemPrompt);

  // 项目级别上下文
  if (context) {
    parts.push('');
    parts.push('## 📚 项目正典内容');
    parts.push(context);
  }

  // 项目信息
  if (project?.title) {
    parts.push('');
    parts.push('## 📝 当前项目');
    parts.push(`- 书名: ${project.title}`);
    if (project.genre) parts.push(`- 类型: ${project.genre}`);
    if (project.style) parts.push(`- 风格: ${project.style}`);
  }

  // StepMemory 上下文（相关记忆）
  if (input.context?.relevantMemory?.length > 0) {
    parts.push('');
    parts.push('## 🧠 相关记忆');
    for (const mem of input.context.relevantMemory) {
      parts.push(`- [${mem.type}] ${mem.content.slice(0, 200)}`);
    }
  }

  // 活跃的 Step 摘要
  if (input.context?.activeSteps?.length > 0) {
    parts.push('');
    parts.push('## 📋 当前活跃步骤');
    for (const step of input.context.activeSteps) {
      parts.push(`- ${step.name} (${step.executor}): ${step.status}`);
    }
  }

  return parts.join('\n');
}

/**
 * 构建用户消息 Prompt
 *
 * 将 AgentInput 中的用户请求和可选的历史消息组合为 prompt 字符串。
 *
 * @param input - Agent 输入
 * @returns 完整的 prompt 字符串
 */
function buildPrompt(input: AgentInput): string {
  const parts: string[] = [];

  // 如果有历史消息，添加上下文
  if (input.messages && input.messages.length > 0) {
    parts.push('## 💬 对话历史');
    for (const msg of input.messages) {
      const role = msg.role === 'user' ? '用户' : '助手';
      const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
      parts.push(`**${role}**: ${content}`);
    }
    parts.push('');
  }

  // 用户请求
  parts.push(input.userRequest);

  return parts.join('\n');
}

// ============================================================
// LLM 响应解析
// ============================================================

/**
 * 解析 LLM 响应为 AgentOutput
 *
 * @param content - LLM 返回的文本内容
 * @param input - 原始 Agent 输入（用于提取内存更新等）
 * @returns AgentOutput
 */
function parseLLMResponse(content: string, input: AgentInput): AgentOutput {
  // 尝试解析 structured output（如果有 JSON 块）
  let memoryUpdates: AgentOutput['memoryUpdates'] = [];
  let suggestedNextSteps: string[] = [];
  let summary = '';
  let cleanContent = content;

  // 尝试提取 JSON 结构的输出
  const jsonBlockMatch = content.match(/```json\n([\s\S]*?)\n```/);
  if (jsonBlockMatch) {
    try {
      const jsonData = JSON.parse(jsonBlockMatch[1]);
      memoryUpdates = jsonData.memoryUpdates ?? [];
      suggestedNextSteps = jsonData.suggestedNextSteps ?? [];
      summary = jsonData.summary ?? content.slice(0, 200);
      cleanContent = jsonData.content ?? content;
    } catch {
      // JSON 解析失败，使用纯文本
      cleanContent = content;
      summary = content.slice(0, 200);
    }
  } else {
    summary = content.slice(0, 200);
  }

  return {
    content: cleanContent,
    modifiedFileIds: [],
    memoryUpdates,
    suggestedNextSteps,
    status: 'completed',
    summary,
    success: true,
  };
}

// ============================================================
// 重试判断
// ============================================================

/**
 * 判断错误是否可重试
 *
 * 可重试的错误类型：
 * - LLM 超时（timeout）
 * - LLM 限流（rate limit）
 * - 临时网络错误
 *
 * 不可重试的错误：
 * - 语法/校验错误
 * - 权限错误
 * - 模型不存在
 *
 * @param error - 错误对象
 * @returns 是否可以重试
 */
function isRetryable(error: Error): boolean {
  const msg = error.message.toLowerCase();

  // 超时
  if (error instanceof LLMTimeoutError) return true;
  if (msg.includes('timeout') || msg.includes('timed out')) return true;

  // 限流
  if (error instanceof LLMRateLimitError) return true;
  if (msg.includes('rate limit') || msg.includes('too many requests')) return true;
  if (msg.includes('429')) return true;

  // 临时网络错误
  if (error instanceof LLMTemporaryError) return true;
  if (msg.includes('network') || msg.includes('fetch') || msg.includes('econnreset')) return true;
  if (msg.includes('5') && (msg.includes('50') || msg.includes('502') || msg.includes('503'))) return true;

  return false;
}
