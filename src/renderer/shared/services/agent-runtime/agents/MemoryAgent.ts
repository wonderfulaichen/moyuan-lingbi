/**
 * Memory Agent — 记忆整理专家
 *
 * 纯函数式 Agent，管理创作记忆体，维护设定一致性。
 * 负责提取关键设定信息、检测矛盾、维护记忆图谱。
 */
import type { AgentInput, AgentOutput } from '../types';
import { executeStep } from '../internal/StepRunner';
import { CancellationToken } from '../internal/CancellationToken';

/** Memory 输入 */
export interface MemoryInput {
  /** 需要整理的内容 */
  content: string;
  /** 已有记忆摘要（可选） */
  existingMemory?: string;
  /** 操作类型 */
  action: 'extract' | 'check' | 'merge' | 'summarize';
}

function isValidMemoryInput(input: unknown): input is MemoryInput {
  if (!input || typeof input !== 'object') return false;
  const i = input as Record<string, unknown>;
  return typeof i.content === 'string' && i.content.trim().length > 0 && typeof i.action === 'string';
}

/**
 * 执行 Memory Agent，管理创作记忆体
 */
export async function executeMemoryAgent(
  input: MemoryInput,
  token?: CancellationToken,
  retryBaseDelayMs: number = 1000,
): Promise<AgentOutput> {
  if (!isValidMemoryInput(input)) {
    return {
      success: false,
      error: '记忆整理失败：请提供待整理内容和操作类型',
      content: '',
    };
  }

  const actionDescriptions: Record<string, string> = {
    extract: '从内容中提取关键设定信息（角色、地点、事件、规则）',
    check: '检查内容与已有记忆是否存在矛盾',
    merge: '将新内容合并到已有记忆中，去重并补充',
    summarize: '生成内容的记忆摘要',
  };

  const promptParts: string[] = [
    `## 操作类型\n${input.action} — ${actionDescriptions[input.action] || '通用整理'}`,
    `## 待整理内容\n${input.content}`,
  ];

  if (input.existingMemory) {
    promptParts.push(`\n## 已有记忆\n${input.existingMemory}`);
  }

  promptParts.push(`\n## 输出规范
- 每次整理后输出变更摘要
- 检测到矛盾时标记并报告
- 按结构化格式输出（分类：角色/地点/事件/规则）`);

  const agentInput: AgentInput = {
    task: 'memory',
    context: {
      relevantMemory: [
        { type: 'memory', content: promptParts.join('\n'), id: 'memory-agent-memory', timestamp: Date.now() },
      ],
      stepHistory: [],
      currentStep: 'memory-agent',
    },
  };

  const ct = token ?? new CancellationToken();
  return executeStep('agent-sub-memory', agentInput, ct, retryBaseDelayMs);
}
