import { ModelConfig } from '../../../../shared/types';
import { AIChatMessage } from '../../../../shared/types/fileSystem';
import { aiService } from '../aiService';
import { estimateTokenCount } from './contextBuilder';

const COMPRESS_THRESHOLD = 0.8;
const KEEP_RECENT_COUNT = 4;
const MIN_MESSAGES_TO_COMPRESS = 6;

const COMPRESS_SYSTEM_PROMPT = `你是一个对话摘要助手。你的任务是将之前的AI助手对话历史压缩为简洁的中文摘要。

规则：
1. 保留用户的所有关键请求、决策和反馈
2. 保留AI执行的关键操作（创建/修改/删除了哪些文件）
3. 保留重要的技术细节和错误修复过程
4. 省略重复的确认消息和冗余的中间过程
5. 使用结构化格式输出
6. 摘要语言必须与原文一致（中文为主）

输出格式：
## 对话摘要
- **用户请求**：...
- **执行操作**：...
- **关键结果**：...
- **当前状态**：...`;

export interface CompressResult {
  messages: AIChatMessage[];
  compressed: boolean;
  summary?: string;
  tokensSaved?: number;
}

function formatMessagesForSummary(messages: AIChatMessage[]): string {
  return messages.map(m => {
    const role = m.role === 'user' ? '用户' : m.role === 'assistant' ? '助手' : '系统';
    return `${role}：${m.content}`;
  }).join('\n\n');
}

async function callAISummary(messagesToCompress: AIChatMessage[], model: ModelConfig): Promise<string> {
  const content = formatMessagesForSummary(messagesToCompress);
  const result = await aiService.generate({
    model,
    prompt: `请将以下对话压缩为摘要：\n\n${content}`,
    systemPrompt: COMPRESS_SYSTEM_PROMPT,
    maxTokens: Math.min(model.maxTokens || 2048, 2048),
    temperature: 0.3,
  });
  if (result.error || !result.content) throw new Error(result.error || '压缩失败');
  return result.content.trim();
}

function fallbackTruncate(messages: AIChatMessage[]): AIChatMessage[] {
  if (messages.length <= KEEP_RECENT_COUNT) return messages;
  const splitIndex = Math.max(1, messages.length - KEEP_RECENT_COUNT);
  const older = messages.slice(0, splitIndex);
  const recent = messages.slice(splitIndex);
  const truncatedSummary = `【${older.length}条旧消息已折叠】\n` + older.map(m => {
    const role = m.role === 'user' ? '用户' : '助手';
    const preview = m.compressedSummary || (m.content.length > 80 ? m.content.slice(0, 80) + '…' : m.content);
    return `- ${role}：${preview}`;
  }).join('\n');
  const summaryMsg: AIChatMessage = {
    id: `compress-${Date.now()}`,
    role: 'system',
    content: truncatedSummary,
    timestamp: Date.now(),
    actions: [],
    compressedSummary: truncatedSummary,
  };
  return [summaryMsg, ...recent];
}

export async function compressHistoryIfNeeded(
  messages: AIChatMessage[],
  tokenBudget: number,
  model: ModelConfig,
): Promise<CompressResult> {
  if (messages.length < MIN_MESSAGES_TO_COMPRESS) {
    return { messages, compressed: false };
  }

  let totalTokens = 0;
  for (const m of messages) {
    totalTokens += estimateTokenCount(m.compressedSummary || m.content) + 10;
  }
  if (totalTokens <= tokenBudget * COMPRESS_THRESHOLD) {
    return { messages, compressed: false };
  }

  const alreadyCompressed = messages.filter(m => m.compressedSummary && !m.content.startsWith('【'));
  if (alreadyCompressed.length > messages.length * 0.6) {
    const fallback = fallbackTruncate(messages);
    const beforeTokens = totalTokens;
    let afterTokens = 0;
    for (const m of fallback) afterTokens += estimateTokenCount(m.compressedSummary || m.content) + 10;
    return { messages: fallback, compressed: true, tokensSaved: beforeTokens - afterTokens };
  }

  const recentMessages = messages.slice(-KEEP_RECENT_COUNT);
  const messagesToCompress = messages.slice(0, -KEEP_RECENT_COUNT);

  try {
    const summary = await callAISummary(messagesToCompress, model);

    const summaryMsg: AIChatMessage = {
      id: `compress-${Date.now()}`,
      role: 'system',
      content: `【对话已压缩 · ${messagesToCompress.length}条消息 → 摘要】\n${summary}`,
      timestamp: Date.now(),
      actions: [],
      compressedSummary: summary,
    };

    const compressedMessages = [summaryMsg, ...recentMessages];
    let newTotalTokens = 0;
    for (const m of compressedMessages) {
      newTotalTokens += estimateTokenCount(m.compressedSummary || m.content) + 10;
    }

    return {
      messages: compressedMessages,
      compressed: true,
      summary,
      tokensSaved: totalTokens - newTotalTokens,
    };
  } catch (error) {
    console.warn('[contextCompress] AI摘要失败，回退到截断:', error instanceof Error ? error.message : error);
    const fallback = fallbackTruncate(messages);
    let afterTokens = 0;
    for (const m of fallback) afterTokens += estimateTokenCount(m.compressedSummary || m.content) + 10;
    return { messages: fallback, compressed: true, tokensSaved: totalTokens - afterTokens };
  }
}
