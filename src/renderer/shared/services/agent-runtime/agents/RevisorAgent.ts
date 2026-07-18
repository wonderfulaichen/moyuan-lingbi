/**
 * RevisorAgent — 章节改写（复用 Writer Agent）
 *
 * 根据审校报告对章节进行改写。底层复用 Writer Agent（agent-sub-writer），
 * 不增加新的 Agent 类型，只在 prompt 层面注入审校反馈作为修订指令。
 *
 * ## 设计原则
 *
 * 1. **复用 Writer**：不新建 Agent 类型，仅通过 prompt 上下文区分"创作"和"改写"
 * 2. **审校反馈驱动**：将审校报告的"必须修复"和"优化建议"注入写作指令
 * 3. **纯函数**：接收原文 + 审校反馈，返回修订版
 *
 * ## 使用方式
 *
 * ```typescript
 * const revised = await executeRevisorAgent({
 *   chapterDraft: '## 第5章 ...',
 *   auditReport: '## 审校报告\n\n...',
 *   chapterOutline: '...',
 * });
 * ```
 *
 * ## 流水线位置
 *
 * Writer → Auditor → Revisor → (最终章节)
 *                       ↑
 *                复用此 Agent
 */

import { executeWriterAgent } from './WriterAgent';
import type { WriterInput } from './WriterAgent';
import type { AgentOutput } from '../types';
import { CancellationToken } from '../internal/CancellationToken';

// ============================================================
// 类型定义
// ============================================================

/**
 * RevisorAgent 的输入参数
 */
export interface RevisorInput {
  /** 原始章节草稿（必选） */
  chapterDraft: string;
  /** 审校报告（必选，来自 AuditorAgent 的输出） */
  auditReport: string;
  /** 章节大纲（用于确保修订不偏离方向） */
  chapterOutline?: string;
  /** 项目正典 */
  projectContext?: string;
  /** 角色上下文 */
  characterContext?: string;
  /** 风格指引 */
  styleGuide?: string;
}

// ============================================================
// 主执行函数
// ============================================================

/**
 * 根据审校报告对章节进行改写
 *
 * 底层调用 executeWriterAgent()，但 prompt 中注入审校反馈，
 * 让 LLM 以"修订模式"而非"创作模式"工作。
 *
 * @param input - 修订输入
 * @param token - 可选的取消令牌
 * @param retryBaseDelayMs - 重试退避基础时间
 * @returns Agent 执行输出
 * @throws 如果章节草稿或审校报告为空
 */
export async function executeRevisorAgent(
  input: RevisorInput,
  token?: CancellationToken,
  retryBaseDelayMs: number = 1000,
): Promise<AgentOutput> {
  // --------------------------------------------------
  // 1. 校验输入
  // --------------------------------------------------
  if (!input.chapterDraft || input.chapterDraft.trim().length === 0) {
    throw new Error('[RevisorAgent] 章节草稿不能为空');
  }
  if (!input.auditReport || input.auditReport.trim().length === 0) {
    throw new Error('[RevisorAgent] 审校报告不能为空');
  }

  // --------------------------------------------------
  // 2. 组装改写指令
  // --------------------------------------------------
  const revisionRequest = buildRevisionRequest(input);

  // --------------------------------------------------
  // 3. 委托给 Writer Agent
  // --------------------------------------------------
  const writerInput: WriterInput = {
    userRequest: revisionRequest,
    chapterOutline: input.chapterOutline || '（修订已有章节）',
    projectContext: input.projectContext,
    characterContext: input.characterContext,
    styleGuide: [
      input.styleGuide || '',
      '注意：这是修订任务，请在保留原文精华的基础上修改。不要完全重写，只针对审校指出的问题进行针对性修改。',
    ]
      .filter(Boolean)
      .join('\n'),
    targetWords: 0, // 不限制字数，保留原文篇幅
  };

  return executeWriterAgent(writerInput, token, retryBaseDelayMs);
}

// ============================================================
// Prompt 组装
// ============================================================

/**
 * 构建修订指令
 *
 * 将原文 + 审校反馈整合为一个清晰的修订请求。
 */
function buildRevisionRequest(input: RevisorInput): string {
  const blocks: string[] = [];

  blocks.push('请根据以下审校报告对章节进行修订。你的任务是：');

  blocks.push('\n【修订原则】');
  blocks.push('- 保留原文的优秀部分，不为了修改而修改');
  blocks.push('- 针对审校报告的"必须修复"项逐一修正');
  blocks.push('- 酌情采纳"优化建议"中的合理意见');
  blocks.push('- 保持章节的整体风格和叙事连续性');
  blocks.push('- 输出修订后的完整章节全文，不要只输出修改片段');

  blocks.push('\n## 原文章节');
  blocks.push(input.chapterDraft.trim());

  blocks.push('\n## 审校报告');
  blocks.push(input.auditReport.trim());

  if (input.chapterOutline) {
    blocks.push('\n## 章节大纲（对照参考）');
    blocks.push(input.chapterOutline.trim());
  }

  return blocks.join('\n');
}
