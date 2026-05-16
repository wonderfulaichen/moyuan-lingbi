import { ModelConfig, AIResponse, StreamingCallback } from '../../../shared/types';

let LLM: any = null;
let loadedModels: Map<string, any> = new Map();

async function getLLM(): Promise<any> {
  if (!LLM) {
    try {
      const module = await import('node-llama-cpp');
      LLM = module.LLM || module.default?.LLM;
    } catch (e) {
      throw new Error(`无法加载 node-llama-cpp 模块: ${e instanceof Error ? e.message : String(e)}\n请运行 npm install node-llama-cpp`);
    }
  }
  return LLM;
}

export interface LocalModelInfo {
  name: string;
  path: string;
  size?: number;
  contextSize?: number;
}

interface LocalModelInstance {
  llm: any;
  modelPath: string;
  contextSize: number;
  gpuLayers: number;
}

async function getModelInstance(model: ModelConfig): Promise<LocalModelInstance> {
  const cacheKey = `${model.modelPath}-${model.contextSize || 4096}`;
  
  if (loadedModels.has(cacheKey)) {
    return loadedModels.get(cacheKey)!;
  }

  if (!model.modelPath) {
    throw new Error('本地模型未配置路径');
  }

  const LLMClass = await getLLM();
  
  try {
    const instance = await new LLMClass({
      modelPath: model.modelPath,
      contextSize: model.contextSize || 4096,
      gpuLayers: model.gpuAcceleration ? (model.gpuLayers || 0) : 0,
    });

    const localModel: LocalModelInstance = {
      llm: instance,
      modelPath: model.modelPath,
      contextSize: model.contextSize || 4096,
      gpuLayers: model.gpuAcceleration ? (model.gpuLayers || 0) : 0,
    };

    loadedModels.set(cacheKey, localModel);
    
    const path = await import('path').catch(() => ({ basename: (p: string) => p.split('/').pop()?.split('\\').pop() || p }));
    console.log(`[LocalModel] 加载成功: ${path.basename(model.modelPath)} | context=${localModel.contextSize} | GPU layers=${localModel.gpuLayers}`);
    
    return localModel;
  } catch (error) {
    loadedModels.delete(cacheKey);
    throw new Error(`加载模型失败: ${error instanceof Error ? error.message : String(error)}\n文件路径: ${model.modelPath}`);
  }
}

export const localModelService = {

  async detectModels(modelsDir: string): Promise<LocalModelInfo[]> {
    const results: LocalModelInfo[] = [];
    
    try {
      const fs = await import('fs');
      const path = await import('path');
      
      if (!fs.existsSync(modelsDir)) return results;

      const files = fs.readdirSync(modelsDir);
      
      for (const file of files) {
        const filePath = path.join(modelsDir, file);
        const stat = fs.statSync(filePath);
        
        if (stat.isFile() && file.endsWith('.gguf')) {
          results.push({
            name: file.replace('.gguf', ''),
            path: filePath,
            size: stat.size,
          });
        }
        
        if (stat.isDirectory()) {
          const subFiles = fs.readdirSync(filePath).filter(f => f.endsWith('.gguf'));
          for (const subFile of subFiles) {
            const subPath = path.join(filePath, subFile);
            const subStat = fs.statSync(subPath);
            results.push({
              name: subFile.replace('.gguf', ''),
              path: subPath,
              size: subStat.size,
            });
          }
        }
      }
    } catch (error) {
      console.error('[LocalModel] 检测模型失败:', error);
    }

    return results.sort((a, b) => (a.name || '').localeCompare(b.name));
  },

  async generate(config: { model: ModelConfig; prompt: string; systemPrompt?: string; temperature?: number; maxTokens?: number }): Promise<AIResponse> {
    const { model, prompt, systemPrompt, temperature, maxTokens } = config;
    
    try {
      const localModel = await getModelInstance(model);

      let fullPrompt = prompt;
      if (systemPrompt) {
        fullPrompt = `<<SYS>>\n${systemPrompt}\n<</SYS>>\n\n${prompt}`;
      }

      const response = await localModel.llm.generate(fullPrompt, {
        maxTokens: maxTokens || model.maxTokens || 2048,
        temperature: temperature ?? model.temperature ?? 0.7,
        topP: 0.9,
        topK: 40,
        repeatPenalty: 1.1,
      });

      const content = typeof response === 'string' 
        ? response 
        : response.text || response.content || '';

      return {
        content,
        model: model.modelName,
      };
    } catch (error) {
      if (error instanceof Error && error.message.includes('abort')) {
        return { content: '', error: '已中断生成' };
      }
      return { content: '', error: error instanceof Error ? error.message : '未知错误' };
    }
  },

  async generateStream(
    config: { model: ModelConfig; prompt: string; systemPrompt?: string; temperature?: number; maxTokens?: number },
    callback: StreamingCallback
  ): Promise<AIResponse> {
    const { model, prompt, systemPrompt, temperature, maxTokens } = config;
    
    try {
      const localModel = await getModelInstance(model);

      let fullPrompt = prompt;
      if (systemPrompt) {
        fullPrompt = `<<SYS>>\n${systemPrompt}\n<</SYS>>\n\n${prompt}`;
      }

      let fullContent = '';
      let isAborted = false;

      const chunks: string[] = [];

      for await (const chunk of localModel.llm.generate(fullPrompt, {
        maxTokens: maxTokens || model.maxTokens || 2048,
        temperature: temperature ?? model.temperature ?? 0.7,
        topP: 0.9,
        topK: 40,
        repeatPenalty: 1.1,
      })) {
        const text = typeof chunk === 'string' ? chunk : (chunk.token || chunk.text || '');
        if (!text) continue;

        fullContent += text;
        chunks.push(text);

        callback({
          content: fullContent,
          isComplete: false,
          isStreaming: true,
        });
      }

      const finalResponse: AIResponse = {
        content: fullContent,
        model: model.modelName,
      };

      callback({
        ...finalResponse,
        isComplete: true,
        isStreaming: false,
      });

      return finalResponse;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : '未知错误';
      const isAborted = errorMsg.includes('abort') || errorMsg.includes('cancel');

      const errorResponse: AIResponse = {
        content: '',
        error: isAborted ? '已中断生成' : errorMsg,
      };

      callback({ ...errorResponse, isComplete: true, isStreaming: false });
      return errorResponse;
    }
  },

  async testConnection(model: ModelConfig): Promise<{ success: boolean; message: string; contextWindow?: number }> {
    if (!model.modelPath) {
      return { success: false, message: '未配置模型文件路径' };
    }

    try {
      const fs = await import('fs');
      
      if (!fs.existsSync(model.modelPath)) {
        return { success: false, message: `模型文件不存在: ${model.modelPath}` };
      }

      const stats = fs.statSync(model.modelPath);
      const sizeMB = Math.round(stats.size / (1024 * 1024));

      const localModel = await getModelInstance(model);

      const testResult = await localModel.llm.generate('你好，请回复"连接成功"。仅回复这四个字即可。', {
        maxTokens: 50,
        temperature: 0.7,
      });

      const responseText = typeof testResult === 'string'
        ? testResult
        : (testResult.text || testResult.content || '');

      if (responseText.length > 0) {
        const preview = responseText.slice(0, 80).replace(/[\r\n]/g, ' ');
        return {
          success: true,
          message: `✅ 连接成功！模型: ${model.modelName} | 大小: ${sizeMB}MB | 响应: "${preview}"`,
          contextWindow: localModel.contextSize,
        };
      }

      return {
        success: false,
        message: `模型返回为空。文件大小: ${sizeMB}MB\n提示：\n1. 确认模型文件是否完整（未损坏）\n2. 尝试增加上下文窗口大小\n3. 尝试减少 GPU 层数（某些显卡可能不支持）`,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, message: `连接失败: ${msg}` };
    }
  },

  unloadModel(modelPath: string): void {
    for (const [key, instance] of loadedModels.entries()) {
      if (instance.modelPath === modelPath) {
        try {
          instance.llm.close();
        } catch {}
        loadedModels.delete(key);
        const path = { basename: (p: string) => p.split('/').pop()?.split('\\').pop() || p };
        console.log(`[LocalModel] 已卸载: ${path.basename(modelPath)}`);
      }
    }
  },

  unloadAllModels(): void {
    for (const [key, instance] of loadedModels.entries()) {
      try {
        instance.llm.close();
      } catch {}
      loadedModels.delete(key);
    }
    console.log('[LocalModel] 已卸载所有模型');
  },

  getLoadedModelsCount(): number {
    return loadedModels.size;
  },
};
