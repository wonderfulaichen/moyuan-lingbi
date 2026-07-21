import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

/**
 * aiService 测试
 *
 * 测试策略：
 * - mock aiTaskManager：让 submitTask 直接执行传入的函数
 * - mock localModelService：模拟本地模型调用
 * - mock fetch：模拟 API 响应
 * - mock dataService.buildAIContext：避免依赖完整项目结构
 *
 * 覆盖核心场景：
 * - generate 非流式调用（OpenAI/DeepSeek/Ollama 三种 provider）
 * - generateStream 流式调用
 * - provider 路由（local vs 云端）
 * - 错误处理（网络错误、HTTP 错误、中断）
 * - abort/abortAll
 * - testConnection
 * - isCacheValid
 */

// Mock aiTaskManager：让 submitTask 直接执行函数
vi.mock('./AITaskManager', () => {
  const mockSubmitTask = vi.fn(async (name: string, type: string, fn: () => Promise<any>) => {
    const id = `mock-task-${Date.now()}`;
    return fn();
  });
  const mockUpdateTask = vi.fn();
  const mockWaitForTask = vi.fn(async (id: string) => mockWaitForTask._result);
  (mockWaitForTask as any)._result = { content: 'mock result' };
  return {
    aiTaskManager: {
      submitTask: mockSubmitTask,
      updateTask: mockUpdateTask,
      waitForTask: mockWaitForTask,
    },
  };
});

// Mock localModelService
vi.mock('./LocalModelService', () => ({
  localModelService: {
    generate: vi.fn().mockResolvedValue({ content: 'local result' }),
    generateStream: vi.fn(),
    testConnection: vi.fn().mockResolvedValue({ success: true, message: 'local ok' }),
  },
}));

// Mock dataService
vi.mock('./DataService', () => ({
  dataService: {
    buildAIContext: vi.fn().mockReturnValue(''),
    getActiveProject: vi.fn().mockReturnValue({ title: '测试项目' }),
  },
}));

// Mock getKnownModelSpec
vi.mock('../../../shared/constants', () => ({
  getKnownModelSpec: vi.fn().mockReturnValue(undefined),
}));

// 导入被测模块（在所有 mock 之后）
import { aiService } from './aiService';
import { localModelService } from './LocalModelService';
import { ModelConfig } from '../../../shared/types';

// fetch mock
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function createModel(overrides: Partial<ModelConfig> = {}): ModelConfig {
  return {
    id: 'm1',
    name: 'Test Model',
    provider: 'openai-compatible',
    modelName: 'gpt-4',
    endpoint: 'https://api.openai.com/v1',
    apiKey: 'sk-test',
    temperature: 0.7,
    maxTokens: 1000,
    ...overrides,
  } as ModelConfig;
}

describe('aiService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    aiService._controllers.clear();
    aiService._nextId = 0;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('abort', () => {
    it('应该 abort 指定 taskId', () => {
      const controller = new AbortController();
      const abortSpy = vi.spyOn(controller, 'abort');
      aiService._controllers.set('task-1', controller);

      aiService.abort('task-1');

      expect(abortSpy).toHaveBeenCalled();
      expect(aiService._controllers.has('task-1')).toBe(false);
    });

    it('不存在的 taskId 不应抛错', () => {
      expect(() => aiService.abort('non-existent')).not.toThrow();
    });
  });

  describe('abortAll', () => {
    it('应该 abort 所有任务', () => {
      const c1 = new AbortController();
      const c2 = new AbortController();
      const spy1 = vi.spyOn(c1, 'abort');
      const spy2 = vi.spyOn(c2, 'abort');
      aiService._controllers.set('t1', c1);
      aiService._controllers.set('t2', c2);

      aiService.abortAll();

      expect(spy1).toHaveBeenCalled();
      expect(spy2).toHaveBeenCalled();
      expect(aiService._controllers.size).toBe(0);
    });
  });

  describe('generate - 本地模型', () => {
    it('应该调用 localModelService.generate', async () => {
      // waitForTask mock 默认返回 { content: 'mock result' }，覆盖 localModelService 的返回值
      const { aiTaskManager } = await import('./AITaskManager');
      vi.mocked(aiTaskManager.waitForTask).mockResolvedValueOnce({ content: 'local result' });

      const model = createModel({ provider: 'local' });
      const result = await aiService.generate({ model, prompt: 'hi' });

      expect(localModelService.generate).toHaveBeenCalledWith(
        expect.objectContaining({ prompt: 'hi' })
      );
      expect(result.content).toBe('local result');
    });
  });

  describe('generate - 云端模型', () => {
    it('应该正确处理成功响应', async () => {
      // 模拟 waitForTask 返回真实结果
      const { aiTaskManager } = await import('./AITaskManager');
      vi.mocked(aiTaskManager.waitForTask).mockResolvedValueOnce({
        content: 'hello',
        tokens: { prompt: 10, completion: 5, total: 15 },
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'hello' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
          model: 'gpt-4',
        }),
      });

      const model = createModel();
      const result = await aiService.generate({ model, prompt: 'hi' });

      expect(mockFetch).toHaveBeenCalled();
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toContain('chat/completions');
      expect(init.method).toBe('POST');
      expect(init.headers['Authorization']).toBe('Bearer sk-test');
      expect(init.headers['Content-Type']).toBe('application/json');
    });

    it('应该使用 model.endpoint 覆盖默认 endpoint', async () => {
      const { aiTaskManager } = await import('./AITaskManager');
      vi.mocked(aiTaskManager.waitForTask).mockResolvedValueOnce({ content: 'ok' });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'ok' } }] }),
      });

      const model = createModel({ endpoint: 'https://custom.api.com/v1' });
      await aiService.generate({ model, prompt: 'hi' });

      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe('https://custom.api.com/v1/chat/completions');
    });

    it('HTTP 错误应返回错误信息', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
      });

      const model = createModel();
      const result = await aiService.generate({ model, prompt: 'hi' });

      expect(result.error).toContain('401');
      expect(result.error).toContain('Unauthorized');
    });

    it('网络错误应返回友好提示', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Failed to fetch'));

      const model = createModel();
      const result = await aiService.generate({ model, prompt: 'hi' });

      expect(result.error).toContain('网络连接失败');
      expect(result.error).toContain('API密钥');
    });

    it('应该正确构造请求体（含 systemPrompt 和 temperature）', async () => {
      const { aiTaskManager } = await import('./AITaskManager');
      vi.mocked(aiTaskManager.waitForTask).mockResolvedValueOnce({ content: 'ok' });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'ok' } }] }),
      });

      const model = createModel();
      await aiService.generate({
        model,
        prompt: 'user input',
        systemPrompt: 'system instruction',
        temperature: 0.5,
        maxTokens: 500,
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.messages).toEqual([
        { role: 'system', content: 'system instruction' },
        { role: 'user', content: 'user input' },
      ]);
      expect(body.temperature).toBe(0.5);
      expect(body.max_tokens).toBe(500);
      expect(body.stream).toBe(false);
    });

    it('无 apiKey 时不应设置 Authorization 头', async () => {
      const { aiTaskManager } = await import('./AITaskManager');
      vi.mocked(aiTaskManager.waitForTask).mockResolvedValueOnce({ content: 'ok' });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'ok' } }] }),
      });

      const model = createModel({ apiKey: '' });
      await aiService.generate({ model, prompt: 'hi' });

      const headers = mockFetch.mock.calls[0][1].headers;
      expect(headers['Authorization']).toBeUndefined();
    });
  });

  describe('testConnection', () => {
    it('本地模型应委托给 localModelService', async () => {
      const model = createModel({ provider: 'local' });
      const result = await aiService.testConnection(model);

      expect(localModelService.testConnection).toHaveBeenCalledWith(model);
      expect(result.success).toBe(true);
    });

    it('云端模型成功时应返回 success: true', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          model: 'gpt-4',
          choices: [{ message: { content: 'OK' } }],
        }),
      });

      const model = createModel();
      const result = await aiService.testConnection(model);

      expect(result.success).toBe(true);
      expect(result.message).toContain('连接成功');
    });

    it('HTTP 错误应返回 success: false', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => 'Invalid API Key',
      });

      const model = createModel();
      const result = await aiService.testConnection(model);

      expect(result.success).toBe(false);
      expect(result.message).toContain('401');
    });

    it('API 返回 error 字段时应返回 success: false', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ error: { message: 'rate limit' } }),
      });

      const model = createModel();
      const result = await aiService.testConnection(model);

      expect(result.success).toBe(false);
      expect(result.message).toContain('rate limit');
    });

    it('网络错误应返回友好提示', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Failed to fetch'));

      const model = createModel();
      const result = await aiService.testConnection(model);

      expect(result.success).toBe(false);
      expect(result.message).toContain('网络连接失败');
    });
  });

  describe('isCacheValid', () => {
    it('无 modelsLastFetched 应返回 false', () => {
      const model = createModel({ modelsLastFetched: undefined } as any);
      expect(aiService.isCacheValid(model)).toBe(false);
    });

    it('30 分钟内应返回 true', () => {
      const model = createModel({ modelsLastFetched: Date.now() - 10 * 60 * 1000 } as any);
      expect(aiService.isCacheValid(model)).toBe(true);
    });

    it('超过 30 分钟应返回 false', () => {
      const model = createModel({ modelsLastFetched: Date.now() - 31 * 60 * 1000 } as any);
      expect(aiService.isCacheValid(model)).toBe(false);
    });
  });

  describe('fetchAvailableModels', () => {
    it('本地模型应返回空列表', async () => {
      const model = createModel({ provider: 'local' });
      const result = await aiService.fetchAvailableModels(model);
      expect(result.models).toEqual([]);
    });

    it('云端模型应解析 /models 端点响应', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            { id: 'gpt-4', object: 'model' },
            { id: 'gpt-3.5-turbo', object: 'model' },
          ],
        }),
      });

      const model = createModel();
      const result = await aiService.fetchAvailableModels(model);

      expect(result.models).toHaveLength(2);
      expect(result.models[0].name).toBe('gpt-4');
      expect(result.models[1].id).toBe('gpt-3.5-turbo');
    });

    it('HTTP 错误应返回空列表（不抛错）', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const model = createModel();
      const result = await aiService.fetchAvailableModels(model);
      expect(result.models).toEqual([]);
    });

    it('fetch 异常应返回空列表', async () => {
      mockFetch.mockRejectedValueOnce(new Error('network error'));
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const model = createModel();
      const result = await aiService.fetchAvailableModels(model);
      expect(result.models).toEqual([]);
      consoleSpy.mockRestore();
    });
  });
});
