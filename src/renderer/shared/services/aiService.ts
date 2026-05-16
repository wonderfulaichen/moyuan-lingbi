import { ModelConfig, AIResponse, StreamingAIResponse, StreamingCallback } from '../../../shared/types';
import { dataService } from './DataService';
import { getKnownModelSpec } from '../../../shared/constants';
import { localModelService } from './LocalModelService';
import { aiTaskManager } from './AITaskManager';

/**
 * AI服务 - 统一调用层
 * 支持 OpenAI Compatible / Ollama / DeepSeek / Local 四种提供商
 */

// ========== 类型定义 ==========

interface AIRequestConfig {
  model: ModelConfig;
  prompt: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  signal?: AbortSignal;
}

// ========== 工具函数 ==========

/**
 * 获取默认 API 端点
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
 * 构建 chat/completions 请求体
 */
function buildChatCompletionsRequest(config: AIRequestConfig): RequestInit {
  const { model, prompt, systemPrompt, temperature, maxTokens, stream, signal } = config;
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
    signal,
  };
}

/**
 * 构建请求配置
 */
function buildRequest(config: AIRequestConfig): { url: string; init: RequestInit } {
  const { model } = config;
  const endpoint = model.endpoint || getDefaultEndpoint(model.provider);
  const baseUrl = endpoint.replace(/\/+$/, '');

  // 构建完整的 API 路径
  let apiPath = baseUrl.endsWith('/chat/completions')
    ? baseUrl
    : `${baseUrl}/chat/completions`;

  // 本地开发环境：Ollama 代理
  if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
    const ollamaMatch = apiPath.match(/^https?:\/\/(127\.0\.0\.1|localhost):11434\/(.*)$/);
    if (ollamaMatch) {
      apiPath = `/api/ollama-proxy/${ollamaMatch[2]}`;
    }
  }

  return {
    url: apiPath,
    init: buildChatCompletionsRequest(config),
  };
}

/**
 * 解析 chat/completions 响应
 */
function parseChatCompletionsResponse(data: any): AIResponse {
  if (data.error) {
    return {
      content: '',
      error: typeof data.error === 'string' ? data.error : data.error.message || 'Unknown error',
    };
  }

  const content = data.choices?.[0]?.message?.content || '';

  return {
    content,
    tokens: data.usage
      ? {
          prompt: data.usage.prompt_tokens || 0,
          completion: data.usage.completion_tokens || 0,
          total: data.usage.total_tokens || 0,
        }
      : undefined,
    model: data.model,
    finishReason: data.choices?.[0]?.finish_reason,
  };
}

/**
 * 解析流式响应
 */
async function parseChatCompletionsStream(
  response: Response,
  callback: StreamingCallback
): Promise<AIResponse> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('无法读取响应流');
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let fullContent = '';
  let reasoningBuffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === 'data: [DONE]' || trimmed === '[DONE]') continue;

        if (trimmed.startsWith('data: ')) {
          const dataStr = trimmed.slice(6);
          try {
            const data = JSON.parse(dataStr);

            // DeepSeek 特殊处理：reasoning_content / thinking 字段
            const reasoningDelta = data.choices?.[0]?.delta?.reasoning_content || data.choices?.[0]?.delta?.thinking;
            if (reasoningDelta) {
              reasoningBuffer += reasoningDelta;
              callback({
                content: '',
                reasoningContent: reasoningBuffer,
                isStreaming: true,
              });
            }

            const delta = data.choices?.[0]?.delta?.content || '';
            if (delta) {
              fullContent += delta;
              callback({
                content: fullContent,
                reasoningContent: reasoningBuffer || undefined,
                isStreaming: true,
              });
            }
          } catch {
            // 忽略解析错误
          }
        }
      }
    }

    callback({ content: '', isComplete: true, isStreaming: false });

    return {
      content: fullContent,
      model: '',
      finishReason: 'stop',
    };
  } finally {
    reader.releaseLock();
  }
}

// ========== AI 服务 ==========

export const aiService = {
  _nextId: 0,
  _controllers: new Map<string, AbortController>(),

  /**
   * 中断指定任务
   */
  abort(taskId: string): void {
    const controller = this._controllers.get(taskId);
    if (controller) {
      controller.abort();
      this._controllers.delete(taskId);
    }
  },

  /**
   * 中断所有任务
   */
  abortAll(): void {
    this._controllers.forEach((controller) => controller.abort());
    this._controllers.clear();
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

    let taskIdForManager: string | null = null;

    const taskPromise = aiTaskManager.submitTask(
      `${config.model.name} - 生成`,
      'generation',
      async () => {
        if (config.signal) {
          const externalSignal = config.signal;
          if (externalSignal.aborted) {
            controller.abort();
          } else {
            externalSignal.addEventListener('abort', () => controller.abort(), { once: true });
          }
        }

        if (taskIdForManager) {
          aiTaskManager.updateTask(taskIdForManager, { progress: 25 });
        }

        if (config.model.provider === 'local') {
          try {
            const result = await localModelService.generate({
              model: config.model,
              prompt: config.prompt,
              systemPrompt: config.systemPrompt,
              temperature: config.temperature,
              maxTokens: config.maxTokens,
            });
            if (taskIdForManager) {
              aiTaskManager.updateTask(taskIdForManager, { progress: 100 });
            }
            return result;
          } catch (error) {
            throw new Error(error instanceof Error ? error.message : '本地模型调用失败');
          } finally {
            this._controllers.delete(id);
          }
        }

        if (taskIdForManager) {
          aiTaskManager.updateTask(taskIdForManager, { progress: 50 });
        }

        const { url, init } = buildRequest({ ...config, stream: false, signal: controller.signal });

        try {
          const response = await fetch(url, init);

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API请求失败 (${response.status}): ${errorText}`);
          }

          if (taskIdForManager) {
            aiTaskManager.updateTask(taskIdForManager, { progress: 75 });
          }

          const data = await response.json();
          if (taskIdForManager) {
            aiTaskManager.updateTask(taskIdForManager, { progress: 100 });
          }
          return parseChatCompletionsResponse(data);
        } catch (error) {
          if (error instanceof Error) {
            if (error.name === 'AbortError') {
              throw new Error('已中断生成');
            }
            const msg = error.message;
            if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('net::ERR_')) {
              throw new Error('网络连接失败，请检查：\n1. API密钥是否已配置\n2. 网络连接是否正常\n3. 代理设置是否正确');
            }
            throw new Error(msg);
          }
          throw new Error('未知错误');
        } finally {
          this._controllers.delete(id);
        }
      }
    );

    try {
      taskIdForManager = await taskPromise;
      const result = await aiTaskManager.waitForTask(taskIdForManager);
      return result;
    } catch (error) {
      return { content: '', error: error instanceof Error ? error.message : '任务执行失败' };
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

    let accumulatedContent = '';
    let taskIdForManager: string | null = null;

    const taskPromise = aiTaskManager.submitTask(
      `${config.model.name} - 流式生成`,
      'generation',
      async () => {
        if (config.signal) {
          const externalSignal = config.signal;
          if (externalSignal.aborted) {
            controller.abort();
          } else {
            externalSignal.addEventListener('abort', () => controller.abort(), { once: true });
          }
        }

        if (taskIdForManager) {
          aiTaskManager.updateTask(taskIdForManager, { progress: 10 });
        }

        if (config.model.provider === 'local') {
          try {
            await localModelService.generateStream({
              model: config.model,
              prompt: config.prompt,
              systemPrompt: config.systemPrompt,
              temperature: config.temperature,
              maxTokens: config.maxTokens,
            }, (response) => {
              if (response.content) {
                accumulatedContent = response.content;
                const progress = Math.min(90, 10 + accumulatedContent.length / 10);
                if (taskIdForManager) {
                  aiTaskManager.updateTask(taskIdForManager, { progress: Math.floor(progress) });
                }
              }
              callback(response);
            });
            if (taskIdForManager) {
              aiTaskManager.updateTask(taskIdForManager, { progress: 100 });
            }
            return { content: accumulatedContent };
          } catch (error) {
            throw new Error(error instanceof Error ? error.message : '本地模型调用失败');
          } finally {
            this._controllers.delete(id);
          }
        }

        if (taskIdForManager) {
          aiTaskManager.updateTask(taskIdForManager, { progress: 25 });
        }

        const { url, init } = buildRequest({ ...config, stream: true, signal: controller.signal });

        try {
          const timeoutId = setTimeout(() => {
            if (!controller.signal.aborted) {
              controller.abort();
            }
          }, 300000);

          const response = await fetch(url, init);
          clearTimeout(timeoutId);

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API请求失败 (${response.status}): ${errorText}`);
          }

          if (taskIdForManager) {
            aiTaskManager.updateTask(taskIdForManager, { progress: 50 });
          }

          await parseChatCompletionsStream(response, (response) => {
            if (response.content) {
              accumulatedContent = response.content;
              const progress = Math.min(90, 50 + accumulatedContent.length / 10);
              if (taskIdForManager) {
                aiTaskManager.updateTask(taskIdForManager, { progress: Math.floor(progress) });
              }
            }
            callback(response);
          });

          if (taskIdForManager) {
            aiTaskManager.updateTask(taskIdForManager, { progress: 100 });
          }
          return { content: accumulatedContent };
        } catch (error) {
          if (error instanceof Error) {
            if (error.name === 'AbortError') {
              throw new Error('已中断生成');
            }
            const msg = error.message;
            const userFriendlyMsg = (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('net::ERR_'))
              ? '网络连接失败，请检查：\n1. API密钥是否已配置\n2. 网络连接是否正常\n3. 代理设置是否正确'
              : msg;
            throw new Error(userFriendlyMsg);
          }
          throw new Error('未知错误');
        } finally {
          this._controllers.delete(id);
        }
      }
    );

    try {
      taskIdForManager = await taskPromise;
      const result = await aiTaskManager.waitForTask(taskIdForManager);
      return { content: (result as { content?: string })?.content || '', model: config.model.modelName };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : '任务执行失败';
      callback({ content: '', error: errorMsg, isComplete: true, isStreaming: false });
      return { content: '', error: errorMsg };
    }
  },

  /**
   * 测试模型连接
   */
  async testConnection(model: ModelConfig): Promise<{ success: boolean; message: string; contextWindow?: number; modelContextMap?: Record<string, number> }> {
    // 本地模型：使用 localModelService 测试
    if (model.provider === 'local') {
      return await localModelService.testConnection(model);
    }

    // 云端模型：发送测试请求
    const testConfig: AIRequestConfig = {
      model,
      prompt: 'Hello, this is a test message. Please respond with "OK".',
      maxTokens: 10,
    };

    const { url, init } = buildRequest(testConfig);

    try {
      const response = await fetch(url, init);

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          message: `连接失败: HTTP ${response.status} - ${errorText}`,
        };
      }

      const data = await response.json();

      if (data.error) {
        return {
          success: false,
          message: `API 错误: ${data.error.message || data.error}`,
        };
      }

      // 获取模型上下文窗口大小
      const spec = getKnownModelSpec(model.modelName);
      const contextWindow = spec?.contextWindow;

      return {
        success: true,
        message: `连接成功！模型: ${data.model || model.modelName}`,
        contextWindow,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : '未知错误';
      if (errorMsg.includes('Failed to fetch') || errorMsg.includes('NetworkError')) {
        return {
          success: false,
          message: '网络连接失败，请检查：\n1. API密钥是否已配置\n2. 网络连接是否正常\n3. 代理设置是否正确',
        };
      }
      return {
        success: false,
        message: `连接失败: ${errorMsg}`,
      };
    }
  },

  /**
   * 获取可用模型列表（用于下拉选择）
   */
  async fetchAvailableModels(model: ModelConfig): Promise<{
    models: Array<{ name: string; id?: string }>;
    modelContextMap: Record<string, number>;
  }> {
    // 本地模型：使用 localModelService
    if (model.provider === 'local') {
      return await localModelService.fetchAvailableModels(model);
    }

    // 云端模型：调用 /models 端点
    const endpoint = model.endpoint || getDefaultEndpoint(model.provider);
    const baseUrl = endpoint.replace(/\/+$/, '');
    const modelsUrl = baseUrl.endsWith('/models') ? baseUrl : `${baseUrl}/models`;

    try {
      const headers: Record<string, string> = {};
      if (model.apiKey) {
        headers['Authorization'] = `Bearer ${model.apiKey}`;
      }

      const response = await fetch(modelsUrl, { headers });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      const models = (data.data || []).map((m: any) => ({
        name: m.id || m.object || 'Unknown',
        id: m.id,
      }));

      // 构建上下文窗口映射
      const modelContextMap: Record<string, number> = {};
      for (const m of data.data || []) {
        if (m.id) {
          const spec = getKnownModelSpec(m.id);
          if (spec?.contextWindow) {
            modelContextMap[m.id] = spec.contextWindow;
          }
        }
      }

      return { models, modelContextMap };
    } catch (error) {
      console.error('获取模型列表失败:', error);
      return { models: [], modelContextMap: {} };
    }
  },

  /**
   * 检查缓存是否有效
   */
  isCacheValid(model: ModelConfig): boolean {
    if (!model.modelsLastFetched) return false;
    const cacheTimeout = 30 * 60 * 1000; // 30分钟
    return Date.now() - model.modelsLastFetched < cacheTimeout;
  },

  /**
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
      '- 所有创作必须基于正典内容',
      '- 如果正典与训练数据冲突，以正典为准',
      contextBlock,
      '',
      '## 📝 当前项目',
      `- 书名: ${project?.title || '未命名'}`,
      `- 类型: ${project?.genre || '未设置'}`,
      `- 风格: ${project?.style || '未设置'}`,
      '',
      config.systemPrompt || '请基于正典内容进行创作，确保与已有设定保持一致。',
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