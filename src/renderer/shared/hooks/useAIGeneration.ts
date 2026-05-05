import { useState, useCallback, useRef } from 'react';
import { ModelConfig } from '../../../../../shared/types';
import { aiService } from '../../shared/services/aiService';
import { useAIStatus } from '../../shared/contexts/AIStatusContext';

interface GenerateOptions {
  model: ModelConfig;
  prompt: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  label?: string;
  source?: string;
  onStream?: (content: string) => void;
}

interface AIGenerationResult {
  content: string | null;
  error: string | null;
  tokens: { prompt: number; completion: number; total: number } | null;
}

export function useAIGeneration() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [lastResult, setLastResult] = useState<AIGenerationResult>({ content: null, error: null, tokens: null });
  const abortRef = useRef<(() => void) | null>(null);
  const { setGenerating, setProgress, setStatusMessage, setTokenUsage, setComplete, setError, resetStatus, status } = useAIStatus();

  const generate = useCallback(async (options: GenerateOptions): Promise<AIGenerationResult> => {
    const { model, prompt, systemPrompt, temperature, maxTokens, label = 'AI 生成中', source = 'feature', onStream } = options;

    setIsGenerating(true);
    setGenerating(model.name, label, source);

    try {
      const result = await aiService.generateWithContext({
        model,
        prompt,
        systemPrompt,
        temperature,
        maxTokens,
      }, onStream ? (update) => {
        if (update.isStreaming && update.content) {
          onStream(update.content);
        }
      } : undefined);

      if (result.error) {
        setError(result.error);
        setLastResult({ content: null, error: result.error, tokens: null });
        return { content: null, error: result.error, tokens: null };
      }

      if (result.tokens) {
        setTokenUsage(result.tokens);
      }

      setComplete();
      const res: AIGenerationResult = {
        content: result.content || null,
        error: null,
        tokens: result.tokens || null,
      };
      setLastResult(res);
      return res;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : '未知错误';
      setError(errMsg);
      setLastResult({ content: null, error: errMsg, tokens: null });
      return { content: null, error: errMsg, tokens: null };
    } finally {
      setIsGenerating(false);
    }
  }, [setGenerating, setProgress, setStatusMessage, setTokenUsage, setComplete, setError]);

  const abort = useCallback(() => {
    aiService.abort();
    setIsGenerating(false);
    resetStatus();
  }, [resetStatus]);

  return {
    generate,
    abort,
    isGenerating,
    lastResult,
    status,
    setGenerating,
    setProgress,
    setStatusMessage,
    setTokenUsage,
    setComplete,
    setError,
    resetStatus,
  };
}
