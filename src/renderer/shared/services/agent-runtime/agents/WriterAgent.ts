/**
 * WriterAgent — 章节写手
 *
 * 墨渊灵笔的小说章节生成 Agent。纯函数设计，无状态，可测试。
 *
 * ## 设计原则
 *
 * 1. **纯函数**：相同的输入 → 相同的输出（LLM 调用除外），不依赖外部状态
 * 2. **可组合**：可作为 AgentRuntime.execute() 的一步，也可独立调用
 * 3. **自包含**：prompt 组装、输入校验、输出解析都在本模块内完成
 *
 * ## 使用方式
 *
 * ```typescript
 * // 方式一：独立调用
 * const output = await executeWriterAgent({
 *   chapterOutline: '第5章：主角穿越迷雾森林...',
 *   projectContext: '世界背景：魔法纪元 1375 年...',
 * });
 *
 * // 方式二：通过 AgentRuntime 编排
 * const runtime = new AgentRuntime({ projectId: 'proj-1' });
 * const result = await runtime.execute({
 *   chainId: 'writing-chain',
 *   steps: [{ agentId: 'agent-sub-writer', input: {...}, dependsOn: [] }],
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
 * WriterAgent 的输入参数
 *
 * 这些字段来自 UI 的章节写作面板，而非直接来自 LLM 调用。
 * @see AgentInput — 那是给底层 LLM 调用的通用接口
 */
export interface WriterInput {
  /** 用户自定义指令（可选，为空时从 chapterOutline 自动生成） */
  userRequest?: string;
  /** 章节大纲（必选） */
  chapterOutline: string;
  /** 项目正典上下文（世界观、设定等） */
  projectContext?: string;
  /** 本角色上下文（当前章节涉及的角色状态） */
  characterContext?: string;
  /** 前一章摘要（保证情节连贯） */
  previousChapterSummary?: string;
  /** 写作风格指引 */
  styleGuide?: string;
  /** 要求字数（默认 3000） */
  targetWords?: number;
}

// ============================================================
// 全局约定常量
// ============================================================

const DEFAULT_TARGET_WORDS = 3000;
const MIN_WORDS = 800;
const MAX_WORDS = 8000;

// ============================================================
// 主执行函数
// ============================================================

/**
 * 执行 Writer Agent，生成小说章节
 *
 * 完整流程：
 * 1. 校验输入（章节大纲不能为空）
 * 2. 组装用户请求 prompt（包含大纲、角色、风格等）
 * 3. 构建 AgentInput（上下文注入）
 * 4. 通过 StepRunner 调用 AI 服务（含重试）
 * 5. 返回 AgentOutput
 *
 * @param input - 结构化写作输入
 * @param token - 可选的取消令牌（用于 UI 取消）
 * @param retryBaseDelayMs - 重试退避基础时间（毫秒）
 * @returns Agent 执行输出
 * @throws 如果章节大纲为空
 */
export async function executeWriterAgent(
  input: WriterInput,
  token?: CancellationToken,
  retryBaseDelayMs: number = 1000,
): Promise<AgentOutput> {
  // --------------------------------------------------
  // 1. 校验输入
  // --------------------------------------------------
  if (!input.chapterOutline || input.chapterOutline.trim().length === 0) {
    throw new Error('[WriterAgent] 章节大纲不能为空');
  }

  // --------------------------------------------------
  // 2. 组装用户请求 prompt
  // --------------------------------------------------
  const words = clamp(input.targetWords ?? DEFAULT_TARGET_WORDS, MIN_WORDS, MAX_WORDS);
  const userRequest = buildUserRequest(input, words);

  // --------------------------------------------------
  // 3. 构建 AgentInput（给 LLM 的通用调用接口）
  // --------------------------------------------------
  const contextParts: string[] = [];
  if (input.projectContext) contextParts.push(input.projectContext);
  if (input.characterContext) contextParts.push(input.characterContext);
  if (input.previousChapterSummary) contextParts.push(`【前情摘要】\n${input.previousChapterSummary}`);

  const agentInput: AgentInput = {
    stepId: `writer-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
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
      targetWords: words,
      styleGuide: input.styleGuide,
    },
  };

  // --------------------------------------------------
  // 4. 通过 StepRunner 调用 AI 服务
  // --------------------------------------------------
  const ct = token ?? new CancellationToken();
  return executeStep('agent-sub-writer', agentInput, ct, retryBaseDelayMs);
}

// ============================================================
// Prompt 组装
// ============================================================

/**
 * 将结构化输入组装为 LLM 可理解的用户请求文本
 */
function buildUserRequest(input: WriterInput, targetWords: number): string {
  const blocks: string[] = [];

  // 用户自定义指令优先
  if (input.userRequest) {
    blocks.push(input.userRequest);
  }

  // 章节大纲
  blocks.push(`请根据以下大纲创作章节正文（目标字数 ${targetWords} 字）：\n`);
  blocks.push(input.chapterOutline.trim());

  // 前一章摘要
  if (input.previousChapterSummary) {
    blocks.push('\n\n【前情提要】\n' + input.previousChapterSummary.trim());
  }

  // 风格指引
  if (input.styleGuide) {
    blocks.push('\n\n【风格要求】\n' + input.styleGuide.trim());
  }

  return blocks.join('\n\n');
}

// ============================================================
// 工具函数
// ============================================================

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
