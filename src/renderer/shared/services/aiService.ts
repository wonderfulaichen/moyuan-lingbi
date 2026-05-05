import { ModelConfig, AIResponse, StreamingAIResponse, StreamingCallback } from '../../../shared/types';
import { dataService } from './DataService';
import { getKnownModelSpec } from '../../../shared/constants';

/**
 * AI服务 - 统一调用层
 * 支持 OpenAI Compatible / Ollama / DeepSeek 三种提供商
 * 
 * 所有提供商均使用 OpenAI 兼容的 chat/completions 接口格式：
 * - OpenAI Compatible: 默认 https://api.openai.com/v1
 * - Ollama: 默认 http://127.0.0.1:11434/v1 (OpenAI兼容模式)
 * - DeepSeek: 默认 https://api.deepseek.com/v1
 */

// ========== 请求构建 ==========

interface AIRequestConfig {
  model: ModelConfig;
  prompt: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  /** AbortSignal 用于中断请求 */
  signal?: AbortSignal;
}

/**
 * 获取提供商的默认端点
 */
function getDefaultEndpoint(provider: ModelConfig['provider']): string {
  switch (provider) {
    case 'openai-compatible':
      return 'https://api.openai.com/v1';
    case 'ollama':
      return 'http://127.0.0.1:11434/v1';
    case 'deepseek':
      return 'https://api.deepseek.com/v1';
    default:
      return 'https://api.openai.com/v1';
  }
}

/**
 * 构建OpenAI兼容格式的请求（适用于所有提供商）
 */
function buildChatCompletionsRequest(config: AIRequestConfig): RequestInit {
  const { model, prompt, systemPrompt, temperature, maxTokens, stream } = config;

  // 使用配置中的完整模型名，Ollama 的 /v1/chat/completions 端点需要完整的模型名称（含 :tag 后缀）
  const modelName = model.modelName;

  const messages: Array<{ role: string; content: string }> = [];
  if (systemPrompt || model.systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt || model.systemPrompt || '' });
  }
  messages.push({ role: 'user', content: prompt });

  const body: Record<string, unknown> = {
    model: modelName,
    messages,
    temperature: temperature ?? model.temperature ?? 0.7,
    stream: stream ?? false,
  };

  if (maxTokens || model.maxTokens) {
    body.max_tokens = maxTokens ?? model.maxTokens;
  }

  // 构建请求头 - Ollama不需要Authorization
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (model.apiKey) {
    headers['Authorization'] = `Bearer ${model.apiKey}`;
  }

  return {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  };
}

function buildRequest(config: AIRequestConfig): { url: string; init: RequestInit } {
  const { model } = config;
  const endpoint = model.endpoint || getDefaultEndpoint(model.provider);

  // 参考项目1的做法：检查是否已包含 /chat/completions
  const baseUrl = endpoint.replace(/\/+$/, '');
  let apiPath = baseUrl.endsWith('/chat/completions') ? baseUrl : `${baseUrl}/chat/completions`;

  // 开发模式下对本地 Ollama 使用 Vite 代理以解决 CORS 预检请求问题
  if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
    const ollamaMatch = apiPath.match(/^https?:\/\/(127\.0\.0\.1|localhost):11434\/(.*)$/);
    if (ollamaMatch) {
      apiPath = `/api/ollama-proxy/${ollamaMatch[2]}`;
    }
  }

  const init = buildChatCompletionsRequest(config);
  if (config.signal) {
    init.signal = config.signal;
  }

  return { url: apiPath, init };
}

// ========== 响应解析 ==========

function parseChatCompletionsResponse(data: Record<string, unknown>): AIResponse {
  // 检查 API 错误响应（部分服务商在 HTTP 200 中返回 error 对象）
  if (data.error) {
    const err = data.error as Record<string, unknown> | string;
    const errorMsg = typeof err === 'string'
      ? err
      : (err?.message as string) || JSON.stringify(data.error);
    console.error('[aiService] API returned error:', errorMsg, data);
    return { content: '', error: errorMsg };
  }

  const choices = data.choices as Array<Record<string, unknown>> | undefined;
  if (!choices || choices.length === 0) {
    console.warn('[aiService] Response has no choices:', JSON.stringify(data).slice(0, 500));
    return { content: '', error: 'API 返回异常：响应中没有 choices 字段' };
  }

  const choice = choices[0];
  const message = choice?.message as Record<string, unknown> | undefined;
  const usage = data.usage as Record<string, number> | undefined;

  let content = (message?.content as string) || '';
  // 某些 Ollama 思考模型（如 Qwen3.5-uncensored）将内容放在 reasoning 字段而非 content 字段
  if (!content && message?.reasoning) {
    content = message.reasoning as string;
  }
  if (!content) {
    console.warn('[aiService] Choice message content is empty:', JSON.stringify(choice).slice(0, 300));
  }

  return {
    content,
    tokens: usage ? {
      prompt: usage.prompt_tokens || 0,
      completion: usage.completion_tokens || 0,
      total: usage.total_tokens || 0,
    } : undefined,
    model: data.model as string | undefined,
    finishReason: (choice?.finish_reason as string) || undefined,
  };
}

// ========== 流式解析 ==========

async function parseChatCompletionsStream(
  response: Response,
  callback: StreamingCallback
): Promise<AIResponse> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let fullContent = '';
  let fullReasoning = '';
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n').filter(line => line.startsWith('data: '));

      for (const line of lines) {
        const data = line.slice(6).trim();
        if (data === '[DONE]') continue;

        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta;
          let hasNewContent = false;

          if (delta?.content) {
            fullContent += delta.content;
            hasNewContent = true;
          }

          if (delta?.reasoning_content) {
            fullReasoning += delta.reasoning_content;
          }

          if (delta?.reasoning) {
            fullReasoning += delta.reasoning;
          }

          if (hasNewContent) {
            callback({
              content: fullContent,
              reasoningContent: fullReasoning || undefined,
              isComplete: false,
              isStreaming: true,
              tokens: totalPromptTokens > 0 ? {
                prompt: totalPromptTokens,
                completion: totalCompletionTokens,
                total: totalPromptTokens + totalCompletionTokens,
              } : undefined,
            });
          } else if (parsed.usage) {
            callback({
              content: fullContent || undefined,
              isComplete: false,
              isStreaming: true,
              tokens: {
                prompt: totalPromptTokens,
                completion: totalCompletionTokens,
                total: totalPromptTokens + totalCompletionTokens,
              },
            });
          }

          if (parsed.usage) {
            totalPromptTokens = parsed.usage.prompt_tokens || 0;
            totalCompletionTokens = parsed.usage.completion_tokens || 0;
          }
        } catch {
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  const finalResponse: AIResponse = {
    content: fullContent,
    tokens: totalPromptTokens > 0 ? {
      prompt: totalPromptTokens,
      completion: totalCompletionTokens,
      total: totalPromptTokens + totalCompletionTokens,
    } : undefined,
  };

  callback({
    ...finalResponse,
    reasoningContent: fullReasoning || undefined,
    isComplete: true,
    isStreaming: false,
  });

  return finalResponse;
}

// ========== 公共API ==========

export interface ModelInfo {
  name: string;
  contextLength?: number;
}

export const aiService = {
  /** 多任务 AbortController 映射（支持多任务精确中断） */
  _controllers: new Map<string, AbortController>(),
  /** 自增任务 ID 计数器 */
  _nextId: 0,

  /**
   * 中断指定任务或全部任务
   * @param taskId - 可选，指定任务 ID；不传则中断所有任务
   */
  abort(taskId?: string): void {
    if (taskId) {
      const controller = this._controllers.get(taskId);
      if (controller) {
        controller.abort();
        this._controllers.delete(taskId);
      }
    } else {
      this._controllers.forEach(c => c.abort());
      this._controllers.clear();
    }
  },

  /**
   * 中断所有正在进行的 AI 请求
   */
  abortAll(): void {
    this.abort();
  },

  /**
   * 非流式调用 AI
   * @param config - 请求配置
   * @param taskId - 可选，任务标识符；不传则自动生成
   */
  async generate(config: AIRequestConfig, taskId?: string): Promise<AIResponse> {
    const id = taskId || `task-${++this._nextId}`;
    const controller = new AbortController();
    this._controllers.set(id, controller);

    // 如果调用方传入了外部 signal，监听其 abort 事件同步中断
    if (config.signal) {
      const externalSignal = config.signal;
      if (externalSignal.aborted) {
        controller.abort();
      } else {
        externalSignal.addEventListener('abort', () => controller.abort(), { once: true });
      }
    }

    const { url, init } = buildRequest({ ...config, stream: false, signal: controller.signal });

    try {
      const response = await fetch(url, init);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API请求失败 (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      return parseChatCompletionsResponse(data);
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          return { content: '', error: '已中断生成' };
        }
        return { content: '', error: error.message };
      }
      return { content: '', error: '未知错误' };
    } finally {
      this._controllers.delete(id);
    }
  },

  /**
   * 流式调用 AI（支持中断）
   * @param config - 请求配置
   * @param callback - 流式回调
   * @param taskId - 可选，任务标识符；不传则自动生成
   */
  async generateStream(
    config: AIRequestConfig,
    callback: StreamingCallback,
    taskId?: string
  ): Promise<AIResponse> {
    const id = taskId || `task-${++this._nextId}`;
    const controller = new AbortController();
    this._controllers.set(id, controller);

    // 如果调用方传入了外部 signal，监听其 abort 事件同步中断
    if (config.signal) {
      const externalSignal = config.signal;
      if (externalSignal.aborted) {
        controller.abort();
      } else {
        externalSignal.addEventListener('abort', () => controller.abort(), { once: true });
      }
    }

    const { url, init } = buildRequest({ ...config, stream: true, signal: controller.signal });

    try {
      const response = await fetch(url, init);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API请求失败 (${response.status}): ${errorText}`);
      }

      return await parseChatCompletionsStream(response, callback);
    } catch (error) {
      if (error instanceof Error) {
        const isAborted = error.name === 'AbortError';
        const errorResponse: AIResponse = {
          content: '',
          error: isAborted ? '已中断生成' : error.message,
        };
        callback({ ...errorResponse, isComplete: true, isStreaming: false });
        return errorResponse;
      }
      const errorResponse: AIResponse = { content: '', error: '未知错误' };
      callback({ ...errorResponse, isComplete: true, isStreaming: false });
      return errorResponse;
    } finally {
      this._controllers.delete(id);
    }
  },

  /**
   * 测试模型连接
   */
  async testConnection(model: ModelConfig): Promise<{ success: boolean; message: string; contextWindow?: number; modelContextMap?: Record<string, number> }> {
    // 先尝试获取模型列表来验证终结点可达性
    const modelCheck = await this.fetchAvailableModels(model);
    const endpointInfo = model.endpoint || getDefaultEndpoint(model.provider);

    if (modelCheck.error) {
      return {
        success: false,
        message: `终结点不可达: ${modelCheck.error}\n当前终结点: ${endpointInfo}`,
      };
    }

    // 检查模型名称是否在可用列表中
    if (modelCheck.models.length > 0 && model.modelName) {
      const modelExists = modelCheck.models.some(
        (m) => m.name.toLowerCase() === model.modelName.toLowerCase()
      );
      if (!modelExists) {
        const nameWithoutTag = model.modelName.replace(/:.*$/, '');
        if (nameWithoutTag !== model.modelName) {
          const modelExistsWithoutTag = modelCheck.models.some(
            (m) => m.name.toLowerCase() === nameWithoutTag.toLowerCase()
          );
          if (!modelExistsWithoutTag) {
            return {
              success: false,
              message: `模型 "${model.modelName}"（及不带标签的 "${nameWithoutTag}"）不在可用列表中。可用模型: ${modelCheck.models.map(m => m.name).join(', ')}`,
            };
          }
        } else {
          return {
            success: false,
            message: `模型 "${model.modelName}" 不在可用列表中。可用模型: ${modelCheck.models.map(m => m.name).join(', ')}`,
          };
        }
      }
    }

    try {
      // 使用稍高的 maxTokens 避免短响应被截断
      const result = await this.generate({
        model,
        prompt: '你好，请回复"连接成功"。仅回复这四个字即可。',
        maxTokens: 100,
      });
      if (result.error) {
        // Ollama 终结点可达但 chat completions 调用失败，给出更具体的提示
        if (model.provider === 'ollama') {
          return {
            success: false,
            message: `${result.error}\n\n⚠ 终结点可达（已成功获取模型列表），但 chat completions 接口调用失败。\n可能的原因：\n1. 模型 "${model.modelName}" 未完全加载到内存中，请先在 Ollama 中运行一次\n2. Ollama 版本过低（需 ≥ 0.1.32 才能支持 OpenAI 兼容接口）\n3. 模型名称格式问题`,
          };
        }
        return { success: false, message: result.error };
      }
      if (result.content.length > 0) {
        const preview = result.content.slice(0, 80).replace(/[\r\n]/g, ' ');
        const apiCtx = modelCheck.modelContextMap[model.modelName];
        return {
          success: true,
          message: `✅ 连接成功！模型: ${result.model || model.modelName} | 响应: "${preview}"${result.tokens ? ` | Token: ${result.tokens.total}(${result.tokens.prompt}+${result.tokens.completion})` : ''}`,
          contextWindow: apiCtx || undefined,
          modelContextMap: Object.keys(modelCheck.modelContextMap).length > 0 ? modelCheck.modelContextMap : undefined,
        };
      }
      // 如果 content 为空但有 finishReason，说明模型返回了空内容
      const finishInfo = result.finishReason ? ` | finish_reason: ${result.finishReason}` : '';
      return {
        success: false,
        message: `模型返回为空。${finishInfo}\n终结点: ${endpointInfo}\n模型: ${model.modelName}\n提示：\n1. 请确认终结点格式是否正确（Ollama需要 /v1 后缀，如 http://127.0.0.1:11434/v1）\n2. 确认模型名称是否正确且在可用列表中\n3. 检查模型是否支持 chat completions 接口`,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : '未知错误';
      // Ollama 终结点可达但请求抛出异常，给出诊断提示
      if (model.provider === 'ollama') {
        return {
          success: false,
          message: `连接异常: ${msg}\n\n⚠ 终结点可达（已成功获取模型列表），但 chat completions 接口调用异常。\n可能的原因：\n1. 模型 "${model.modelName}" 未完全加载\n2. Ollama 版本过低（需 ≥ 0.1.32）\n3. 可尝试在终端执行: curl ${endpointInfo.replace(/\/+$/, '')}/chat/completions -d '{"model":"${model.modelName}","messages":[{"role":"user","content":"hi"}]}'`,
        };
      }
      return { success: false, message: `连接异常: ${msg}` };
    }
  },

  /**
   * 缓存时间：1小时（与参考项目1的 ModelListService 一致）
   */
  CACHE_DURATION: 60 * 60 * 1000,

  /**
   * 获取可用模型列表
   * 根据提供商类型使用不同的 API 端点：
   * - Ollama: 使用 /api/tags 原生接口（不传 API Key），提取 context_length
   * - 其他: 使用 /v1/models OpenAI 兼容接口
   * 返回 { models: ModelInfo[], modelContextMap: Record<string, number>, error?: string } 结构
   *
   * 如果缓存有效（1小时内获取过），直接返回缓存结果
   */
  async fetchAvailableModels(model: ModelConfig): Promise<{ models: ModelInfo[]; modelContextMap: Record<string, number>; error?: string }> {
    // 检查缓存是否有效
    if (this.isCacheValid(model)) {
      return { models: (model.availableModels || []).map(n => ({ name: n })), modelContextMap: model.modelContextMap || {} };
    }

    const endpoint = model.endpoint || getDefaultEndpoint(model.provider);
    if (model.provider === 'ollama') {
      return this.fetchOllamaModels(endpoint);
    }
    return this.fetchOpenAIModels(endpoint, model);
  },

  /**
   * 检查模型列表缓存是否有效（1小时内）
   */
  isCacheValid(model: ModelConfig): boolean {
    if (!model.modelsLastFetched || !model.availableModels || model.availableModels.length === 0) {
      return false;
    }
    const now = Date.now();
    return (now - model.modelsLastFetched) < this.CACHE_DURATION;
  },

  /**
   * 清除指定模型的缓存
   */
  clearModelCache(model: ModelConfig): void {
    model.availableModels = undefined;
    model.modelsLastFetched = undefined;
    model.modelsFetchError = undefined;
  },

  /**
   * 通过 Ollama 原生 API /api/tags 获取本地模型列表
   * Ollama 的 /api/tags 接口返回格式：{ models: [{ name: "qwen2.5:7b" }, ...] }
   *
   * 关键修复：遵循参考项目1的 ModelListService 实现方式
   * - 如果 endpoint 包含 /v1 后缀（OpenAI 兼容模式），先移除后调用 /api/tags
   * - 如果 endpoint 不包含 /v1，直接使用（用户可能已配置为根路径）
   * - 如果所有尝试都失败，回退到 http://localhost:11434
   */
  async fetchOllamaModels(endpoint: string): Promise<{ models: ModelInfo[]; modelContextMap: Record<string, number>; error?: string }> {
    // 参考项目1：endpoint?.replace(/\/+$/, '') || 'http://localhost:11434'
    // 先尝试移除 /v1 后缀（如果存在），然后尝试直接调用
    const cleanEndpoint = endpoint.replace(/\/v1\/?$/, '').replace(/\/+$/, '');
    const urlsToTry: string[] = [
      `${cleanEndpoint}/api/tags`,
    ];

    // 开发模式下使用 Vite 代理路径解决 CORS 问题
    if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
      // 如果 endpoint 是 127.0.0.1 或 localhost，添加代理路径
      const proxyUrl = `/api/ollama-proxy/api/tags`;
      urlsToTry.push(proxyUrl);
    }

    // 参考项目1的 fallback：如果 endpoint 为空或解析失败，使用 http://localhost:11434
    if (cleanEndpoint === '' || cleanEndpoint === endpoint.replace(/\/+$/, '')) {
      // 也尝试 localhost 作为备选（处理用户使用 127.0.0.1 但 Ollama 绑定在 localhost 的情况）
      urlsToTry.push('http://localhost:11434/api/tags');
    } else {
      // 如果 endpoint 是 127.0.0.1，也尝试 localhost
      if (cleanEndpoint.includes('127.0.0.1')) {
        urlsToTry.push(cleanEndpoint.replace('127.0.0.1', 'localhost') + '/api/tags');
      } else if (cleanEndpoint.includes('localhost')) {
        urlsToTry.push(cleanEndpoint.replace('localhost', '127.0.0.1') + '/api/tags');
      }
    }

    // 去重
    const uniqueUrls = [...new Set(urlsToTry)];

    // 逐个尝试
    for (const url of uniqueUrls) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);

        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (!response.ok) {
          continue; // 尝试下一个 URL
        }

        const data = await response.json();
        const models = data.models as Array<{ name: string; details?: { context_length?: number } }> | undefined;
        if (models && Array.isArray(models)) {
          const modelInfos: ModelInfo[] = [];
          const ctxMap: Record<string, number> = {};
          for (const m of models) {
            modelInfos.push({ name: m.name, contextLength: m.details?.context_length });
            if (m.details?.context_length) { ctxMap[m.name] = m.details.context_length; }
          }
          return { models: modelInfos.sort((a, b) => a.name.localeCompare(b.name)), modelContextMap: ctxMap };
        }
        return { models: [], modelContextMap: {}, error: 'Ollama 响应格式异常：未找到模型列表数据' };
      } catch {
        continue; // 网络错误，尝试下一个 URL
      }
    }

    // 所有 URL 都失败
    return {
      models: [],
      modelContextMap: {},
      error: `无法连接到 Ollama 服务。\n已尝试以下地址：\n${uniqueUrls.map(u => `• ${u}`).join('\n')}\n请确认：\n• Ollama 是否已启动 (ollama serve)\n• 端点地址是否正确\n• 端口 11434 是否被占用`,
    };
  },

  /**
   * 通过 OpenAI 兼容接口 /v1/models 获取提供商模型列表
   */
  async fetchOpenAIModels(endpoint: string, model: ModelConfig): Promise<{ models: ModelInfo[]; modelContextMap: Record<string, number>; error?: string }> {
    const url = `${endpoint.replace(/\/+$/, '')}/models`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (model.apiKey) {
      headers['Authorization'] = `Bearer ${model.apiKey}`;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(url, { headers, signal: controller.signal });
      clearTimeout(timeoutId);

      if (response.status === 401) {
        return {
          models: [],
          modelContextMap: {},
          error: `认证失败 (401)：请检查 API Key 是否正确。当前模型: ${model.name}`,
        };
      }
      if (response.status === 403) {
        return {
          models: [],
          modelContextMap: {},
          error: `权限不足 (403)：API Key 可能没有访问模型列表的权限。`,
        };
      }
      if (!response.ok) {
        return {
          models: [],
          modelContextMap: {},
          error: `请求失败 (${response.status})：${response.statusText || '未知错误'}`,
        };
      }

      const data = await response.json();
      const models = data.data as Array<{ id: string }> | undefined;
      if (models && Array.isArray(models)) {
        const modelInfos: ModelInfo[] = models.map(m => ({ name: m.id }));
        const ctxMap: Record<string, number> = {};
        for (const m of models) {
          const spec = getKnownModelSpec(m.id);
          if (spec) { ctxMap[m.id] = spec.contextWindow; }
        }
        return { models: modelInfos.sort((a, b) => a.name.localeCompare(b.name)), modelContextMap: ctxMap };
      }
      return { models: [], modelContextMap: {}, error: '响应格式异常：未找到模型列表数据' };
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return { models: [], modelContextMap: {}, error: `请求超时：无法连接到 ${url}，请检查端点地址是否正确` };
      }
      const msg = error instanceof Error ? error.message : '未知错误';
      if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('net::ERR_')) {
        return {
          models: [],
          modelContextMap: {},
          error: `无法连接到服务器：${url}\n请确认：\n• 端点地址是否正确\n• 本地服务是否已启动\n• 网络连接是否正常`,
        };
      }
      return { models: [], modelContextMap: {}, error: `获取失败：${msg}` };
    }
  },

  /**
   * 带项目上下文的 AI 生成（统一入口）
   * 自动注入正典文件内容，确保 AI 了解项目全貌
   */
  async generateWithContext(
    config: Omit<AIRequestConfig, 'systemPrompt'> & {
      systemPrompt?: string;
      contextMaxChars?: number;
    },
    callback?: StreamingCallback,
    taskId?: string
  ): Promise<AIResponse> {
    const context = dataService.buildAIContext(config.contextMaxChars || 12000);
    const project = dataService.getActiveProject();

    const contextBlock = context
      ? `\n## 📚 项目正典内容（⭐ 收藏文件，唯一事实来源）\n${context}`
      : '\n（暂无正典内容，请先在设置中收藏文件）';

    const fullSystemPrompt = [
      '你是"墨渊灵笔"的 AI 创作助手。',
      '',
      '## ⭐ 正典系统',
      '以下「项目正典内容」中的文件是已定稿的正典，是项目的唯一事实来源。',
      '- 正典中的设定绝对不可违背',
      '- 生成任何内容前，必须先对照正典',
      '- 非正典文件（无 ⭐）是临时草稿，不可参考',
      '',
      `当前项目：${project?.title || '未命名'}`,
      config.systemPrompt ? `\n## 任务角色\n${config.systemPrompt}` : '',
      contextBlock,
    ].join('\n');

    if (callback) {
      return this.generateStream(
        { ...config, systemPrompt: fullSystemPrompt },
        callback,
        taskId
      );
    }
    return this.generate(
      { ...config, systemPrompt: fullSystemPrompt },
      taskId
    );
  },
};
