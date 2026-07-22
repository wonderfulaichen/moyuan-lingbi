/**
 * StepRunner 单元测试
 *
 * 覆盖范围：
 * - executeStep 基础流程（取消检查/Agent 未注册/成功执行）
 * - executeStep 重试逻辑（指数退避/可重试错误判断/CancelledError 不重试）
 * - executeStepOnce 超时与取消（setTimeout/AbortSignal/监听器清理）
 * - parseLLMResponse（JSON 块解析/纯文本/解析失败）
 * - buildSystemPrompt（项目正典/记忆/活跃步骤拼装）
 * - buildPrompt（对话历史 + userRequest）
 * - isRetryable（错误类型/字符串匹配）
 *
 * 关键设计点：
 * - executeStep 内重试前的 delay 用 token.signal 取消
 * - executeStepOnce 用 Promise.race + setTimeout 实现 120s 超时
 * - finally 块清理 timeoutId 和 onAbort 监听器，避免泄漏
 * - parseLLMResponse 优先解析 ```json``` 代码块
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CancellationToken, CancelledError } from './CancellationToken';
import {
  executeStep,
  LLMTimeoutError,
  LLMRateLimitError,
  LLMTemporaryError,
} from './StepRunner';
import type { AgentDefinition, AgentInput } from '../types';
import type { ModelConfig } from '../../../../../shared/types';

// ============ Mock 依赖 ============

vi.mock('../AgentRegistry', () => ({
  agentRegistry: {
    get: vi.fn(),
  },
}));

vi.mock('../../ModelRouter', () => ({
  modelRouter: {
    getModelForTask: vi.fn(),
  },
}));

vi.mock('../../aiService', () => ({
  aiService: {
    generate: vi.fn(),
  },
}));

vi.mock('../../DataService', () => ({
  dataService: {
    buildAIContext: vi.fn().mockReturnValue(''),
    getActiveProject: vi.fn().mockReturnValue(null),
    getData: vi.fn().mockReturnValue({ models: [] }),
  },
}));

// ============ 导入被 mock 的模块 ============

import { agentRegistry } from '../AgentRegistry';
import { modelRouter } from '../../ModelRouter';
import { aiService } from '../../aiService';
import { dataService } from '../../DataService';

const mockedRegistryGet = vi.mocked(agentRegistry.get);
const mockedGetModel = vi.mocked(modelRouter.getModelForTask);
const mockedGenerate = vi.mocked(aiService.generate);
const mockedBuildAIContext = vi.mocked(dataService.buildAIContext);
const mockedGetActiveProject = vi.mocked(dataService.getActiveProject);
const mockedGetData = vi.mocked(dataService.getData);

// ============ 测试工具 ============

const createModel = (): ModelConfig => ({
  id: 'm1',
  name: '测试模型',
  provider: 'openai-compatible',
  apiKey: '',
  modelName: 'gpt-test',
  contextWindow: 8000,
  maxTokens: 1000,
});

const createAgentDef = (overrides: Partial<AgentDefinition> = {}): AgentDefinition => ({
  id: 'agent-test',
  name: '测试 Agent',
  icon: 'fa-robot',
  color: '#000',
  description: '测试',
  systemPrompt: '你是测试 Agent',
  compatibleTasks: ['general'],
  allowedToolCategories: ['file'],
  maxRetries: 3,
  hiddenOfDefault: false,
  ...overrides,
});

const createInput = (overrides: Partial<AgentInput> = {}): AgentInput => ({
  stepId: 'step-1',
  userRequest: '请写一段',
  context: {} as any,
  messages: [],
  ...overrides,
});

// ============ 测试主体 ============

describe('StepRunner', () => {
  let token: CancellationToken;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    token = new CancellationToken();
    mockedRegistryGet.mockReturnValue(createAgentDef());
    mockedGetModel.mockReturnValue(createModel());
    mockedGenerate.mockResolvedValue({ content: 'LLM 响应' } as any);
    mockedBuildAIContext.mockReturnValue('项目正典');
    mockedGetActiveProject.mockReturnValue({ title: '测试项目' } as any);
    mockedGetData.mockReturnValue({ models: [createModel()] } as any);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ============ 1. executeStep 基础流程 ============

  describe('executeStep 基础流程', () => {
    it('取消的 token 立即抛出 CancelledError', async () => {
      token.cancel();
      await expect(executeStep('agent-test', createInput(), token)).rejects.toThrow(CancelledError);
    });

    it('Agent 未注册抛出 "Agent xxx 未注册"', async () => {
      mockedRegistryGet.mockReturnValue(undefined);
      await expect(executeStep('unknown-agent', createInput(), token)).rejects.toThrow(
        'Agent "unknown-agent" 未注册',
      );
    });

    it('成功执行返回 AgentOutput', async () => {
      const result = await executeStep('agent-test', createInput(), token);
      expect(result.content).toBe('LLM 响应');
      expect(result.success).toBe(true);
      expect(result.status).toBe('completed');
    });

    it('调用 dataService.buildAIContext(12000)', async () => {
      await executeStep('agent-test', createInput(), token);
      expect(mockedBuildAIContext).toHaveBeenCalledWith(12000);
    });

    it('调用 aiService.generate 时传递 model/prompt/systemPrompt/signal', async () => {
      await executeStep('agent-test', createInput(), token);
      const args = mockedGenerate.mock.calls[0];
      expect(args[0].model).toEqual(createModel());
      expect(args[0].prompt).toContain('请写一段');
      expect(args[0].systemPrompt).toContain('你是测试 Agent');
      expect(args[0].signal).toBe(token.signal);
    });
  });

  // ============ 2. executeStep 重试逻辑 ============

  describe('executeStep 重试逻辑', () => {
    it('不可重试错误直接抛出不重试', async () => {
      mockedGenerate.mockRejectedValue(new Error('语法错误'));
      await expect(executeStep('agent-test', createInput(), token)).rejects.toThrow('语法错误');
      expect(mockedGenerate).toHaveBeenCalledTimes(1);
    });

    it('LLMTimeoutError 可重试，重试成功', async () => {
      mockedGenerate
        .mockRejectedValueOnce(new LLMTimeoutError())
        .mockResolvedValueOnce({ content: '重试成功' } as any);

      const promise = executeStep('agent-test', createInput(), token, 100);
      // 跳过指数退避延迟（100 * 2^0 = 100ms）
      await vi.advanceTimersByTimeAsync(100);
      const result = await promise;

      expect(result.content).toBe('重试成功');
      expect(mockedGenerate).toHaveBeenCalledTimes(2);
    });

    it('LLMRateLimitError 可重试', async () => {
      mockedGenerate
        .mockRejectedValueOnce(new LLMRateLimitError())
        .mockResolvedValueOnce({ content: '成功' } as any);

      const promise = executeStep('agent-test', createInput(), token, 100);
      await vi.advanceTimersByTimeAsync(100);
      const result = await promise;

      expect(result.content).toBe('成功');
    });

    it('LLMTemporaryError 可重试', async () => {
      mockedGenerate
        .mockRejectedValueOnce(new LLMTemporaryError('临时错误'))
        .mockResolvedValueOnce({ content: '成功' } as any);

      const promise = executeStep('agent-test', createInput(), token, 100);
      await vi.advanceTimersByTimeAsync(100);
      await promise;

      expect(mockedGenerate).toHaveBeenCalledTimes(2);
    });

    it('字符串 "timeout" 匹配可重试', async () => {
      mockedGenerate
        .mockRejectedValueOnce(new Error('request timeout'))
        .mockResolvedValueOnce({ content: '成功' } as any);

      const promise = executeStep('agent-test', createInput(), token, 100);
      await vi.advanceTimersByTimeAsync(100);
      await promise;

      expect(mockedGenerate).toHaveBeenCalledTimes(2);
    });

    it('字符串 "429" 匹配可重试', async () => {
      mockedGenerate
        .mockRejectedValueOnce(new Error('HTTP 429 Too Many Requests'))
        .mockResolvedValueOnce({ content: '成功' } as any);

      const promise = executeStep('agent-test', createInput(), token, 100);
      await vi.advanceTimersByTimeAsync(100);
      await promise;

      expect(mockedGenerate).toHaveBeenCalledTimes(2);
    });

    it('字符串 "503" 匹配可重试', async () => {
      mockedGenerate
        .mockRejectedValueOnce(new Error('HTTP 503 Service Unavailable'))
        .mockResolvedValueOnce({ content: '成功' } as any);

      const promise = executeStep('agent-test', createInput(), token, 100);
      await vi.advanceTimersByTimeAsync(100);
      await promise;

      expect(mockedGenerate).toHaveBeenCalledTimes(2);
    });

    it('重试耗尽抛出最后错误', async () => {
      const agentDef = createAgentDef({ maxRetries: 1 });
      mockedRegistryGet.mockReturnValue(agentDef);
      mockedGenerate.mockRejectedValue(new LLMTimeoutError());

      const promise = executeStep('agent-test', createInput(), token, 100);
      // 立即附加 catch 防止 unhandled rejection 警告（vitest 在 Promise reject 后若 handler 未同步附加会报错）
      const errorPromise = promise.catch(e => e);

      // 第一次重试（attempt=0 → wait 100ms）
      await vi.advanceTimersByTimeAsync(100);
      // 第二次重试（attempt=1 → wait 200ms，但 attempt=1 已等于 maxRetries=1 不会重试）
      // 实际：attempt=1 时 isRetryable && attempt<maxRetries (1<1=false)，所以不重试
      const error = await errorPromise;
      expect(error).toBeInstanceOf(LLMTimeoutError);
      expect(mockedGenerate).toHaveBeenCalledTimes(2);
    });

    it('CancelledError 不重试直接抛出', async () => {
      mockedGenerate.mockRejectedValue(new CancelledError('执行中取消'));
      await expect(executeStep('agent-test', createInput(), token)).rejects.toThrow(CancelledError);
      expect(mockedGenerate).toHaveBeenCalledTimes(1);
    });

    it('重试等待期间被取消抛出 CancelledError', async () => {
      mockedGenerate.mockRejectedValueOnce(new LLMTimeoutError());

      const promise = executeStep('agent-test', createInput(), token, 1000);
      // 在退避等待期间取消
      token.cancel();
      await expect(promise).rejects.toThrow(CancelledError);
      expect(mockedGenerate).toHaveBeenCalledTimes(1);
    });

    it('指数退避：attempt 0/1/2 对应延迟 100/200/400', async () => {
      const agentDef = createAgentDef({ maxRetries: 3 });
      mockedRegistryGet.mockReturnValue(agentDef);
      mockedGenerate.mockRejectedValue(new LLMTimeoutError());

      const promise = executeStep('agent-test', createInput(), token, 100);
      // 立即附加 catch 防止 unhandled rejection 警告
      const errorPromise = promise.catch(e => e);

      // attempt=0 失败 → wait 100ms
      await vi.advanceTimersByTimeAsync(100);
      // attempt=1 失败 → wait 200ms
      await vi.advanceTimersByTimeAsync(200);
      // attempt=2 失败 → wait 400ms
      await vi.advanceTimersByTimeAsync(400);
      // attempt=3 失败 → 不再重试（attempt<maxRetries=3 为 false）
      const error = await errorPromise;
      expect(error).toBeInstanceOf(LLMTimeoutError);
      expect(mockedGenerate).toHaveBeenCalledTimes(4);
    });
  });

  // ============ 3. executeStepOnce 超时与 response.error ============

  describe('executeStepOnce 超时与取消', () => {
    it('LLM 超时（120s）抛出 LLMTimeoutError', async () => {
      // maxRetries=0：避免超时后进入重试循环导致需要推进多次 120s
      mockedRegistryGet.mockReturnValue(createAgentDef({ maxRetries: 0 }));
      // 让 generate 永远不 resolve
      mockedGenerate.mockReturnValue(new Promise(() => {}) as any);

      const promise = executeStep('agent-test', createInput(), token);
      // 立即附加 catch 防止 unhandled rejection 警告
      const errorPromise = promise.catch(e => e);
      // 先让微任务运行让 Promise.race 启动
      await Promise.resolve();
      // 推进 120s 触发超时
      await vi.advanceTimersByTimeAsync(120000);

      const error = await errorPromise;
      expect(error).toBeInstanceOf(LLMTimeoutError);
    });

    it('LLM 执行中被取消抛出 CancelledError', async () => {
      mockedGenerate.mockReturnValue(new Promise(() => {}) as any);

      const promise = executeStep('agent-test', createInput(), token);
      // 立即附加 catch 防止 unhandled rejection 警告
      const errorPromise = promise.catch(e => e);
      await Promise.resolve();
      // 取消 token
      token.cancel();

      const error = await errorPromise;
      expect(error).toBeInstanceOf(CancelledError);
    });

    it('response.error 不为空抛出 Error', async () => {
      mockedGenerate.mockResolvedValue({ error: 'API 错误', content: '' } as any);

      await expect(executeStep('agent-test', createInput(), token)).rejects.toThrow('API 错误');
    });

    it('超时后清理定时器（不残留 setTimeout 回调）', async () => {
      // maxRetries=0：避免超时后进入重试循环
      mockedRegistryGet.mockReturnValue(createAgentDef({ maxRetries: 0 }));
      mockedGenerate.mockReturnValue(new Promise(() => {}) as any);
      const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');

      const promise = executeStep('agent-test', createInput(), token);
      // 立即附加 catch 防止 unhandled rejection 警告
      const errorPromise = promise.catch(e => e);
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(120000);
      const error = await errorPromise;
      expect(error).toBeInstanceOf(LLMTimeoutError);

      expect(clearTimeoutSpy).toHaveBeenCalled();
    });
  });

  // ============ 4. parseLLMResponse（通过 executeStep 间接测试）============

  describe('parseLLMResponse（间接测试）', () => {
    it('纯文本响应：summary = content.slice(0, 200)', async () => {
      mockedGenerate.mockResolvedValue({ content: '这是纯文本响应' } as any);
      const result = await executeStep('agent-test', createInput(), token);
      expect(result.content).toBe('这是纯文本响应');
      expect(result.summary).toBe('这是纯文本响应');
      expect(result.memoryUpdates).toEqual([]);
      expect(result.suggestedNextSteps).toEqual([]);
    });

    it('含 JSON 块且合法：解析各字段', async () => {
      const json = JSON.stringify({
        memoryUpdates: [{ type: 'character', content: '记忆' }],
        suggestedNextSteps: ['下一步1'],
        summary: '摘要',
        content: '清洁内容',
      });
      mockedGenerate.mockResolvedValue({ content: '```json\n' + json + '\n```' } as any);

      const result = await executeStep('agent-test', createInput(), token);
      expect(result.content).toBe('清洁内容');
      expect(result.summary).toBe('摘要');
      expect(result.memoryUpdates).toEqual([{ type: 'character', content: '记忆' }]);
      expect(result.suggestedNextSteps).toEqual(['下一步1']);
    });

    it('含 JSON 块但解析失败：使用纯文本', async () => {
      mockedGenerate.mockResolvedValue({ content: '```json\n{invalid}\n```' } as any);
      const result = await executeStep('agent-test', createInput(), token);
      expect(result.content).toBe('```json\n{invalid}\n```');
      expect(result.summary).toBe('```json\n{invalid}\n```'.slice(0, 200));
    });

    it('JSON 块缺字段：使用默认值', async () => {
      const json = JSON.stringify({ content: '仅内容' });
      const rawContent = '```json\n' + json + '\n```';
      mockedGenerate.mockResolvedValue({ content: rawContent } as any);

      const result = await executeStep('agent-test', createInput(), token);
      expect(result.content).toBe('仅内容');
      expect(result.memoryUpdates).toEqual([]);
      expect(result.suggestedNextSteps).toEqual([]);
      // 源码 parseLLMResponse：summary = jsonData.summary ?? content.slice(0, 200)
      // 其中 content 是原始 LLM 响应（含 ```json 包装），不是 cleanContent
      expect(result.summary).toBe(rawContent.slice(0, 200));
    });
  });

  // ============ 5. buildSystemPrompt（通过 aiService.generate 参数间接测试）============

  describe('buildSystemPrompt（间接测试）', () => {
    it('含 context + project + relevantMemory + activeSteps 全部拼装', async () => {
      mockedBuildAIContext.mockReturnValue('项目正典内容');
      mockedGetActiveProject.mockReturnValue({ title: '我的书', genre: '玄幻', style: '轻松' } as any);
      const input = createInput({
        context: {
          relevantMemory: [{ type: 'character', content: '记忆内容' }],
          activeSteps: [{ name: '步骤A', executor: 'writer', status: 'pending' }],
        } as any,
      });

      await executeStep('agent-test', input, token);

      const systemPrompt = mockedGenerate.mock.calls[0][0].systemPrompt;
      expect(systemPrompt).toContain('你是测试 Agent');
      expect(systemPrompt).toContain('项目正典内容');
      expect(systemPrompt).toContain('我的书');
      expect(systemPrompt).toContain('玄幻');
      expect(systemPrompt).toContain('轻松');
      expect(systemPrompt).toContain('记忆内容');
      expect(systemPrompt).toContain('步骤A');
    });

    it('无 context/project/memory/steps 只含 agentDef.systemPrompt', async () => {
      mockedBuildAIContext.mockReturnValue('');
      mockedGetActiveProject.mockReturnValue(null);
      const input = createInput({ context: {} as any });

      await executeStep('agent-test', input, token);

      const systemPrompt = mockedGenerate.mock.calls[0][0].systemPrompt;
      expect(systemPrompt).toBe('你是测试 Agent');
    });

    it('relevantMemory 内容被 slice(0, 200)', async () => {
      const longMemory = 'a'.repeat(300);
      const input = createInput({
        context: {
          relevantMemory: [{ type: 'character', content: longMemory }],
        } as any,
      });

      await executeStep('agent-test', input, token);

      const systemPrompt = mockedGenerate.mock.calls[0][0].systemPrompt;
      // 200 个 'a' 应该存在，第 201 个不应该
      expect(systemPrompt).toContain('a'.repeat(200));
      expect(systemPrompt).not.toContain('a'.repeat(201));
    });
  });

  // ============ 6. buildPrompt（通过 aiService.generate 参数间接测试）============

  describe('buildPrompt（间接测试）', () => {
    it('含 messages 拼装对话历史 + userRequest', async () => {
      const input = createInput({
        userRequest: '请继续',
        messages: [
          { id: 'm1', role: 'user', content: '你好', timestamp: 1, actions: [] } as any,
          { id: 'm2', role: 'assistant', content: '你好啊', timestamp: 2, actions: [] } as any,
        ],
      });

      await executeStep('agent-test', input, token);

      const prompt = mockedGenerate.mock.calls[0][0].prompt;
      expect(prompt).toContain('## 💬 对话历史');
      expect(prompt).toContain('**用户**: 你好');
      expect(prompt).toContain('**助手**: 你好啊');
      expect(prompt).toContain('请继续');
    });

    it('无 messages 只含 userRequest', async () => {
      const input = createInput({ userRequest: '单独请求', messages: [] });

      await executeStep('agent-test', input, token);

      const prompt = mockedGenerate.mock.calls[0][0].prompt;
      expect(prompt).toBe('单独请求');
    });
  });

  // ============ 7. isRetryable（通过重试行为间接测试）============

  describe('isRetryable（间接测试）', () => {
    it('LLMTimeoutError 实例可重试', async () => {
      mockedGenerate
        .mockRejectedValueOnce(new LLMTimeoutError())
        .mockResolvedValueOnce({ content: '成功' } as any);
      const promise = executeStep('agent-test', createInput(), token, 100);
      await vi.advanceTimersByTimeAsync(100);
      await promise;
      expect(mockedGenerate).toHaveBeenCalledTimes(2);
    });

    it('LLMRateLimitError 实例可重试', async () => {
      mockedGenerate
        .mockRejectedValueOnce(new LLMRateLimitError())
        .mockResolvedValueOnce({ content: '成功' } as any);
      const promise = executeStep('agent-test', createInput(), token, 100);
      await vi.advanceTimersByTimeAsync(100);
      await promise;
      expect(mockedGenerate).toHaveBeenCalledTimes(2);
    });

    it('字符串 "rate limit" 匹配可重试', async () => {
      mockedGenerate
        .mockRejectedValueOnce(new Error('rate limit exceeded'))
        .mockResolvedValueOnce({ content: '成功' } as any);
      const promise = executeStep('agent-test', createInput(), token, 100);
      await vi.advanceTimersByTimeAsync(100);
      await promise;
      expect(mockedGenerate).toHaveBeenCalledTimes(2);
    });

    it('字符串 "network" 匹配可重试', async () => {
      mockedGenerate
        .mockRejectedValueOnce(new Error('network error'))
        .mockResolvedValueOnce({ content: '成功' } as any);
      const promise = executeStep('agent-test', createInput(), token, 100);
      await vi.advanceTimersByTimeAsync(100);
      await promise;
      expect(mockedGenerate).toHaveBeenCalledTimes(2);
    });

    it('普通错误不可重试', async () => {
      mockedGenerate.mockRejectedValue(new Error('权限错误'));
      await expect(executeStep('agent-test', createInput(), token)).rejects.toThrow('权限错误');
      expect(mockedGenerate).toHaveBeenCalledTimes(1);
    });
  });

  // ============ 8. 错误类导出 ============

  describe('错误类导出', () => {
    it('LLMTimeoutError 含默认消息', () => {
      const err = new LLMTimeoutError();
      expect(err.message).toBe('LLM 请求超时');
      expect(err.name).toBe('LLMTimeoutError');
    });

    it('LLMRateLimitError 含默认消息', () => {
      const err = new LLMRateLimitError();
      expect(err.message).toBe('LLM 请求被限流');
      expect(err.name).toBe('LLMRateLimitError');
    });

    it('LLMTemporaryError 接受自定义消息', () => {
      const err = new LLMTemporaryError('临时错误');
      expect(err.message).toBe('临时错误');
      expect(err.name).toBe('LLMTemporaryError');
    });
  });
});
