import { describe, it, expect, beforeEach, vi } from 'vitest';
import { compressHistoryIfNeeded, CompressResult } from './contextCompress';
import { ModelConfig } from '../../../../shared/types';
import { AIChatMessage } from '../../../../shared/types/fileSystem';

/**
 * contextCompress 测试
 *
 * 覆盖对话历史压缩逻辑：
 * - 消息数 < 6 不压缩
 * - token 总量 < 80% 预算 不压缩
 * - 已压缩消息 > 60% 时走 fallbackTruncate
 * - AI 摘要成功路径
 * - AI 摘要失败回退到 fallbackTruncate
 *
 * mock aiService.generate：避免真实 API 调用
 * mock DataService：避免单例初始化失败（依赖 PromptLibrary 等）
 * estimateTokenCount 是纯函数，不 mock，让测试更真实
 */

vi.mock('../aiService', () => ({
  aiService: {
    generate: vi.fn(),
  },
}));

vi.mock('../DataService', () => ({
  dataService: {},
}));

// PromptComposer 可能是类，mock 为静态方法
vi.mock('../../../../shared/prompts', () => ({
  PromptComposer: {
    getCompressPrompt: vi.fn().mockReturnValue('compress prompt'),
  },
}));

import { aiService } from '../aiService';

function createMessage(content: string, role: 'user' | 'assistant' | 'system' = 'user'): AIChatMessage {
  return {
    id: `msg-${Math.random().toString(36).slice(2, 8)}`,
    role,
    content,
    timestamp: Date.now(),
    actions: [],
  } as AIChatMessage;
}

function createModel(): ModelConfig {
  return {
    id: 'm1',
    name: 'Test',
    provider: 'openai-compatible',
    modelName: 'gpt-4',
    maxTokens: 2048,
  } as ModelConfig;
}

describe('contextCompress', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('compressHistoryIfNeeded - 不压缩场景', () => {
    it('消息数 < 6 不压缩', async () => {
      const messages = [
        createMessage('a'),
        createMessage('b'),
        createMessage('c'),
      ];

      const result = await compressHistoryIfNeeded(messages, 10000, createModel());

      expect(result.compressed).toBe(false);
      expect(result.messages).toBe(messages); // 同一引用
    });

    it('消息数 = 5 不压缩（< MIN_MESSAGES_TO_COMPRESS=6）', async () => {
      const messages = Array.from({ length: 5 }, (_, i) => createMessage(`msg${i}`));

      const result = await compressHistoryIfNeeded(messages, 100, createModel());

      expect(result.compressed).toBe(false);
    });

    it('消息数 >= 6 但 token 总量 < 80% 预算 不压缩', async () => {
      // 6 条短消息，token 总量远低于预算
      const messages = Array.from({ length: 6 }, (_, i) => createMessage(`hi${i}`));

      const result = await compressHistoryIfNeeded(messages, 10000, createModel());

      expect(result.compressed).toBe(false);
    });
  });

  describe('compressHistoryIfNeeded - fallbackTruncate 路径', () => {
    it('已压缩消息 > 60% 时走 fallbackTruncate', async () => {
      // 构造 10 条消息，其中 7 条已压缩（>60%）
      const messages: AIChatMessage[] = [];
      for (let i = 0; i < 7; i++) {
        messages.push({
          ...createMessage(`summary${i}`),
          compressedSummary: `summary${i}`,
        });
      }
      for (let i = 0; i < 3; i++) {
        messages.push(createMessage(`recent${i}`.repeat(100))); // 长内容触发 token 超限
      }

      const result = await compressHistoryIfNeeded(messages, 10, createModel());

      expect(result.compressed).toBe(true);
      expect(result.tokensSaved).toBeGreaterThan(0);
      // fallbackTruncate 保留最后 4 条 + 1 个 summary
      expect(result.messages.length).toBeLessThanOrEqual(messages.length);
    });
  });

  describe('compressHistoryIfNeeded - AI 摘要成功路径', () => {
    it('应该调用 aiService.generate 并返回压缩结果', async () => {
      // 10 条消息，token 总量超过预算
      const messages: AIChatMessage[] = [];
      for (let i = 0; i < 10; i++) {
        messages.push(createMessage(`消息内容${i}`.repeat(50)));
      }

      vi.mocked(aiService.generate).mockResolvedValueOnce({
        content: '这是压缩后的摘要',
      });

      const result = await compressHistoryIfNeeded(messages, 100, createModel());

      expect(result.compressed).toBe(true);
      expect(result.summary).toBe('这是压缩后的摘要');
      expect(aiService.generate).toHaveBeenCalledOnce();

      // 验证调用参数
      const callArgs = vi.mocked(aiService.generate).mock.calls[0][0];
      expect(callArgs.temperature).toBe(0.3);
      expect(callArgs.maxTokens).toBe(2048);
      expect(callArgs.systemPrompt).toBe('compress prompt');
    });

    it('压缩后应保留最后 4 条消息 + 1 个 summary', async () => {
      const messages: AIChatMessage[] = [];
      for (let i = 0; i < 10; i++) {
        messages.push(createMessage(`msg${i}`.repeat(50)));
      }

      vi.mocked(aiService.generate).mockResolvedValueOnce({ content: 'summary' });

      const result = await compressHistoryIfNeeded(messages, 100, createModel());

      // KEEP_RECENT_COUNT = 4，所以结果应是 1（summary）+ 4 = 5 条
      expect(result.messages).toHaveLength(5);
      expect(result.messages[0].role).toBe('system');
      expect(result.messages[0].content).toContain('对话已压缩');
      expect(result.messages[0].compressedSummary).toBe('summary');
    });

    it('tokensSaved 应为正数（压缩后 token 减少）', async () => {
      const messages: AIChatMessage[] = [];
      for (let i = 0; i < 10; i++) {
        messages.push(createMessage(`长消息内容${i}`.repeat(100)));
      }

      vi.mocked(aiService.generate).mockResolvedValueOnce({ content: '短摘要' });

      const result = await compressHistoryIfNeeded(messages, 100, createModel());

      expect(result.tokensSaved).toBeGreaterThan(0);
    });
  });

  describe('compressHistoryIfNeeded - AI 摘要失败回退', () => {
    it('AI 返回 error 应回退到 fallbackTruncate', async () => {
      const messages: AIChatMessage[] = [];
      for (let i = 0; i < 10; i++) {
        messages.push(createMessage(`msg${i}`.repeat(50)));
      }

      vi.mocked(aiService.generate).mockResolvedValueOnce({
        content: '',
        error: 'API错误',
      });
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await compressHistoryIfNeeded(messages, 100, createModel());

      expect(result.compressed).toBe(true);
      expect(result.summary).toBeUndefined(); // fallback 路径无 summary
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[contextCompress]'),
        expect.anything()
      );
      consoleSpy.mockRestore();
    });

    it('AI 返回空 content 应回退到 fallbackTruncate', async () => {
      const messages: AIChatMessage[] = [];
      for (let i = 0; i < 10; i++) {
        messages.push(createMessage(`msg${i}`.repeat(50)));
      }

      vi.mocked(aiService.generate).mockResolvedValueOnce({ content: '' });
      vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await compressHistoryIfNeeded(messages, 100, createModel());

      expect(result.compressed).toBe(true);
      expect(result.summary).toBeUndefined();
    });

    it('AI generate 抛异常应回退到 fallbackTruncate', async () => {
      const messages: AIChatMessage[] = [];
      for (let i = 0; i < 10; i++) {
        messages.push(createMessage(`msg${i}`.repeat(50)));
      }

      vi.mocked(aiService.generate).mockRejectedValueOnce(new Error('网络错误'));
      vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await compressHistoryIfNeeded(messages, 100, createModel());

      expect(result.compressed).toBe(true);
      expect(result.summary).toBeUndefined();
    });
  });

  describe('fallbackTruncate 边界', () => {
    it('消息数 <= KEEP_RECENT_COUNT 时应原样返回', async () => {
      // 通过让已压缩消息 > 60% 触发 fallback，但消息总数 <= 4
      const messages: AIChatMessage[] = [];
      for (let i = 0; i < 4; i++) {
        messages.push({
          ...createMessage(`s${i}`.repeat(100)),
          compressedSummary: `s${i}`,
        });
      }

      const result = await compressHistoryIfNeeded(messages, 10, createModel());

      // 消息数 4 < MIN_MESSAGES_TO_COMPRESS(6)，不进入压缩逻辑
      expect(result.compressed).toBe(false);
    });
  });

  describe('CompressResult 类型完整性', () => {
    it('不压缩时返回 {messages, compressed: false}', async () => {
      const messages = [createMessage('a'), createMessage('b')];
      const result = await compressHistoryIfNeeded(messages, 10000, createModel());

      expect(result).toEqual({
        messages,
        compressed: false,
      });
    });

    it('压缩成功时返回完整字段', async () => {
      const messages: AIChatMessage[] = [];
      for (let i = 0; i < 10; i++) {
        messages.push(createMessage(`msg${i}`.repeat(50)));
      }

      vi.mocked(aiService.generate).mockResolvedValueOnce({ content: 'summary' });

      const result: CompressResult = await compressHistoryIfNeeded(messages, 100, createModel());

      expect(result).toHaveProperty('messages');
      expect(result).toHaveProperty('compressed', true);
      expect(result).toHaveProperty('summary', 'summary');
      expect(result).toHaveProperty('tokensSaved');
    });
  });
});
