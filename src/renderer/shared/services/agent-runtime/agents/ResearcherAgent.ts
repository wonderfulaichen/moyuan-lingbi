/**
 * Researcher Agent — 资料研究员
 *
 * 纯函数式 Agent，查询已有设定资料、角色档案、世界观知识。
 * 用于为创作提供参考、检测设定矛盾。
 */
import type { AgentInput, AgentOutput } from '../types';
import { executeStep } from '../internal/StepRunner';
import { CancellationToken } from '../internal/CancellationToken';

/** Researcher 输入 */
export interface ResearcherInput {
  /** 查询内容/问题 */
  query: string;
  /** 已有设定资料（可选） */
  existingMaterials?: string[];
  /** 搜索范围（可选） */
  scope?: 'all' | 'world' | 'character' | 'plot';
}

function isValidResearcherInput(input: unknown): input is ResearcherInput {
  if (!input || typeof input !== 'object') return false;
  const i = input as Record<string, unknown>;
  return typeof i.query === 'string' && i.query.trim().length > 0;
}

/**
 * 执行 Researcher Agent，检索创作参考资料
 */
export async function executeResearcherAgent(
  input: ResearcherInput,
  token?: CancellationToken,
  retryBaseDelayMs: number = 1000,
): Promise<AgentOutput> {
  if (!isValidResearcherInput(input)) {
    return {
      success: false,
      error: '资料查询失败：请提供查询内容（query 不能为空）',
      content: '',
    };
  }

  const promptParts: string[] = [
    `## 查询内容\n${input.query}`,
    `## 搜索范围\n${input.scope || 'all'}`,
  ];

  if (input.existingMaterials && input.existingMaterials.length > 0) {
    promptParts.push(`\n## 已有资料参考\n${input.existingMaterials.map((m, i) => `[资料 ${i + 1}] ${m}`).join('\n')}`);
  }

  promptParts.push(`\n## 行为准则
- 引用必须注明来源
- 不确定时说明"这属于推测"
- 保持客观，不编造事实`);

  const agentInput: AgentInput = {
    stepId: `researcher-${Date.now()}`,
    userRequest: promptParts.join('\n'),
    task: 'general',
    messages: [],
    context: {
      relevantMemory: [
        { type: 'context', content: promptParts.join('\n'), id: 'researcher-memory', timestamp: Date.now() },
      ],
      stepHistory: [],
      currentStep: 'researcher',
    },
  };

  const ct = token ?? new CancellationToken();
  return executeStep('agent-sub-researcher', agentInput, ct, retryBaseDelayMs);
}
