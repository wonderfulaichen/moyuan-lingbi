/**
 * AuditorAgent — 章节审校员
 *
 * 对小说章节进行结构化质量评估，输出可执行的修改建议。
 * 纯函数设计，无状态，可测试。
 *
 * ## 设计原则
 *
 * 1. **纯函数**：相同的输入 → 相同的评估逻辑（LLM 输出除外）
 * 2. **独立 Agent**：使用 agent-sub-reviewer 的 systemPrompt 驱动
 * 3. **结构化输出**：审校报告包含分项评分、严重问题、优化建议
 *
 * ## 使用方式
 *
 * ```typescript
 * const report = await executeAuditorAgent({
 *   chapterDraft: '## 第5章 -- 迷雾之森\n\n...',
 *   chapterOutline: '主角穿越森林，觉醒能力...',
 * });
 * ```
 */

import type { AgentInput, AgentOutput } from '../types';
import { executeStep } from '../internal/StepRunner';
import { CancellationToken } from '../internal/CancellationToken';

// ============================================================
// 类型定义
// ============================================================

/**
 * AuditorAgent 的输入参数
 */
export interface AuditorInput {
  /** 章节正文（必选） */
  chapterDraft: string;
  /** 章节大纲（用于情节一致性检查） */
  chapterOutline?: string;
  /** 项目正典（世界观设定等） */
  projectContext?: string;
  /** 角色上下文 */
  characterContext?: string;
  /** 审校严格程度（默认 normal） */
  strictness?: 'lenient' | 'normal' | 'strict';
}

// ============================================================
// 主执行函数
// ============================================================

/**
 * 执行 Auditor Agent，对章节进行质量审校
 *
 * 完整流程：
 * 1. 校验输入（章节正文不能为空）
 * 2. 组装用户请求 prompt
 * 3. 构建 AgentInput
 * 4. 通过 StepRunner 调用 AI 服务
 * 5. 返回 AgentOutput（content 为结构化审校报告）
 *
 * @param input - 审校输入
 * @param token - 可选的取消令牌
 * @param retryBaseDelayMs - 重试退避基础时间
 * @returns Agent 执行输出
 * @throws 如果章节正文为空
 */
export async function executeAuditorAgent(
  input: AuditorInput,
  token?: CancellationToken,
  retryBaseDelayMs: number = 1000,
): Promise<AgentOutput> {
  // --------------------------------------------------
  // 1. 校验输入
  // --------------------------------------------------
  if (!input.chapterDraft || input.chapterDraft.trim().length === 0) {
    throw new Error('[AuditorAgent] 章节正文不能为空');
  }

  // --------------------------------------------------
  // 2. 组装用户请求 prompt
  // --------------------------------------------------
  const userRequest = buildUserRequest(input);

  // --------------------------------------------------
  // 3. 构建 AgentInput
  // --------------------------------------------------
  const contextParts: string[] = [];
  if (input.projectContext) contextParts.push(input.projectContext);
  if (input.characterContext) contextParts.push(input.characterContext);
  if (input.chapterOutline) contextParts.push(`【章节大纲对照】\n${input.chapterOutline}`);

  const agentInput: AgentInput = {
    stepId: `auditor-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    userRequest,
    context: {
      relevantMemory: contextParts.length > 0
        ? contextParts.map((content, i) => ({
            type: (['context', 'character', 'plot'] as const)[Math.min(i, 2)],
            content,
          }))
        : [],
    },
    messages: [],
    options: {
      strictness: input.strictness ?? 'normal',
    },
  };

  // --------------------------------------------------
  // 4. 通过 StepRunner 调用 AI 服务
  // --------------------------------------------------
  const ct = token ?? new CancellationToken();
  return executeStep('agent-sub-reviewer', agentInput, ct, retryBaseDelayMs);
}

// ============================================================
// Prompt 组装
// ============================================================

/**
 * 将结构化审校输入组装为 LLM 用户请求
 */
function buildUserRequest(input: AuditorInput): string {
  const blocks: string[] = [];

  // 严格程度指引
  const strictnessMap: Record<string, string> = {
    lenient: '请以鼓励为主的温和态度审校，重点指出明显问题即可',
    normal: '请客观、平衡地审校，既要指出问题也肯定优点',
    strict: '请严格审校，不放过任何小问题，以最高标准要求',
  };
  blocks.push(strictnessMap[input.strictness ?? 'normal']);

  // 章节正文
  blocks.push('\n\n## 审校章节\n');
  blocks.push(input.chapterDraft.trim());

  return blocks.join('\n');
}
