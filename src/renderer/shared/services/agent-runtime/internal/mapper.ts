/**
 * mapper
 *
 * 类型映射工具：在 AgentRuntime 的接口类型和 StepMemory 的接口类型之间转换。
 *
 * 映射关系：
 * - AgentInput ↔ CreateStepInput（给 StepMemoryService.createStep 用）
 * - AgentOutput ↔ StepOutput（给 StepMemoryService.completeStep 用）
 * - AnyAgentId ↔ StepExecutor（Agent ID 到 Step 执行器类型的映射）
 *
 * 为什么需要映射？
 * - AgentRuntime 的接口类型（AgentInput/Output）是高层编排层的抽象，
 *   不与任何存储系统耦合。
 * - StepMemory 的接口类型（StepInput/StepOutput）是存储层的具体实现，
 *   包含持久化所需的字段。
 * - 映射层负责在两者之间转换，保持各层的接口纯净。
 */

import type { AgentInput, AgentOutput, AnyAgentId } from '../types';
import type { StepInput, StepOutput, StepExecutor } from '../../step-memory/types';
import type { CreateStepInput } from '../../step-memory/StepMemoryService';

// ============================================================
// AgentId ↔ StepExecutor 映射表
// ============================================================

/**
 * AgentId 到 StepExecutor 的映射
 *
 * 每个 Agent 类型在 StepMemory 中对应一个执行者类型。
 * StepMemory 使用 StepExecutor 来过滤相关记忆片段和记录执行者。
 */
const AGENT_TO_EXECUTOR_MAP: Record<string, StepExecutor> = {
  'agent-general': 'system',
  'agent-worldbuilder': 'worldbuilder',
  'agent-character': 'character',
  'agent-plotter': 'plotter',
  'agent-editor': 'editor',
  'agent-sub-writer': 'writer',
  'agent-sub-planner': 'planner',
  'agent-sub-memory': 'memory',
  'agent-sub-researcher': 'researcher',
  'agent-sub-reviewer': 'auditor',
};

// ============================================================
// AgentId → StepExecutor 转换
// ============================================================

/**
 * 将 Agent ID 转换为 StepExecutor 类型
 *
 * @param agentId - Agent 标识（如 'agent-sub-writer'）
 * @returns 对应的 StepExecutor（如 'writer'）
 */
export function agentIdToExecutor(agentId: string): StepExecutor {
  return AGENT_TO_EXECUTOR_MAP[agentId] || 'system';
}

/**
 * 获取 Agent 的显示名称
 *
 * @param agentId - Agent 标识
 * @returns 人类可读的名称
 */
export function agentIdToDisplayName(agentId: string): string {
  const displayNames: Record<string, string> = {
    'agent-general': '通用助手',
    'agent-worldbuilder': '世界观架构师',
    'agent-character': '角色设计师',
    'agent-plotter': '剧情策划师',
    'agent-editor': '文字润色师',
    'agent-sub-writer': '章节写手',
    'agent-sub-planner': '大纲规划师',
    'agent-sub-memory': '记忆整理专家',
    'agent-sub-researcher': '资料研究员',
    'agent-sub-reviewer': '审校员',
  };
  return displayNames[agentId] || agentId;
}

// ============================================================
// AgentInput → CreateStepInput 转换
// ============================================================

/**
 * 将 AgentInput 转换为 CreateStepInput
 *
 * CreateStepInput 是 StepMemoryService.createStep() 所需的输入格式。
 * 主要映射：
 * - AgentInput.userRequest → StepInput.userRequest
 * - AgentInput.context → StepInput.context
 * - AgentInput.options.params → StepInput.params
 *
 * @param agentId - Agent ID
 * @param agentInput - Agent 输入
 * @param stepName - 步骤名称
 * @param dependencies - 依赖的 Step ID 列表
 * @param chainId - 所属的 StepChain ID
 * @returns CreateStepInput
 */
export function agentInputToStepInput(
  agentId: string,
  agentInput: AgentInput,
  stepName: string,
  dependencies: string[],
  chainId?: string,
): CreateStepInput {
  return {
    name: stepName,
    description: agentInput.userRequest.slice(0, 100),
    executor: agentIdToExecutor(agentId),
    input: {
      userRequest: agentInput.userRequest,
      context: agentInput.context,
      targetFileIds: agentInput.options?.targetFileIds as string[] ?? [],
      params: (agentInput.options?.params as Record<string, unknown>) ?? {},
    },
    dependencies,
    chainId,
    maxRetries: 3,
  };
}

// ============================================================
// AgentOutput → StepOutput 转换
// ============================================================

/**
 * 将 AgentOutput 转换为 StepOutput
 *
 * StepOutput 是 StepMemoryService.completeStep() 所需的输出格式。
 *
 * @param agentOutput - Agent 输出
 * @returns StepOutput
 */
export function agentOutputToStepOutput(agentOutput: AgentOutput): StepOutput {
  const hasFiles = agentOutput.modifiedFileIds.length > 0;

  return {
    content: agentOutput.content,
    modifiedFileIds: agentOutput.modifiedFileIds,
    outputType: hasFiles ? 'file' : 'text',
    suggestedNextSteps: agentOutput.suggestedNextSteps,
    summary: agentOutput.summary,
  };
}
