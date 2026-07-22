/**
 * Planner Agent — 大纲规划师
 *
 * 纯函数式 Agent，根据故事大纲生成可执行的章节大纲。
 * 复用 WriterAgent 的 executeStep 进行 LLM 调用。
 */
import type { AgentInput, AgentOutput } from '../types';
import { executeStep } from '../internal/StepRunner';
import { CancellationToken } from '../internal/CancellationToken';

/** Planner 输入 */
export interface PlannerInput {
  /** 故事大纲/总体情节走向 */
  outline: string;
  /** 世界观设定（可选） */
  worldSettings?: string;
  /** 角色档案（可选） */
  characterProfiles?: string;
  /** 目标字数（可选，默认 2000-5000） */
  targetWordCount?: number;
  /** 章节数量（可选，默认 5） */
  chapterCount?: number;
}

/** 检查输入是否有效 */
function isValidPlannerInput(input: unknown): input is PlannerInput {
  if (!input || typeof input !== 'object') return false;
  const i = input as Record<string, unknown>;
  return typeof i.outline === 'string' && i.outline.trim().length > 0;
}

/**
 * 执行 Planner Agent，生成章节大纲规划
 */
export async function executePlannerAgent(
  input: PlannerInput,
  token?: CancellationToken,
  retryBaseDelayMs: number = 1000,
): Promise<AgentOutput> {
  // 1. 校验
  if (!isValidPlannerInput(input)) {
    return {
      success: false,
      error: '大纲规划失败：请提供故事大纲（outline 不能为空）',
      content: '',
    };
  }

  // 2. 组装 prompt
  const promptParts: string[] = [
    `## 故事大纲\n${input.outline}`,
  ];

  if (input.worldSettings) {
    promptParts.push(`\n## 世界观设定\n${input.worldSettings}`);
  }
  if (input.characterProfiles) {
    promptParts.push(`\n## 角色档案\n${input.characterProfiles}`);
  }

  promptParts.push(`\n## 规划要求
- 规划 ${input.chapterCount || 5} 个章节
- 每章 2000-5000 字（目标 ${input.targetWordCount || 3000} 字）
- 每章包含：章节标题、场景序列（3-5个场景）、关键冲突、出场角色、核心事件
- 保持情节连贯，伏笔有收有放`);

  const fullPrompt = promptParts.join('\n');

  // 3. 构建 AgentInput
  const agentInput: AgentInput = {
    stepId: `planner-${Date.now()}`,
    userRequest: fullPrompt,
    task: 'outline',
    messages: [],
    context: {
      relevantMemory: [{ type: 'outline', content: fullPrompt, id: 'planner-memory', timestamp: Date.now() }],
      stepHistory: [],
      currentStep: 'planner',
    },
  };

  // 4. 通过 StepRunner 调用 LLM
  const ct = token ?? new CancellationToken();
  return executeStep('agent-sub-planner', agentInput, ct, retryBaseDelayMs);
}
