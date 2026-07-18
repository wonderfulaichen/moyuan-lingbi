/**
 * Agent 运行时模块
 *
 * 墨渊灵笔 Agent 流水线的基础接口层 + 调度引擎。
 * 提供标准化的 Agent 接口定义、注册管理、类型系统、以及编排执行能力。
 *
 * ## 模块结构
 * - types.ts           — Agent 核心类型（AgentInput/Output/Definition/ExecutionPlan）
 * - AgentRegistry.ts   — Agent 注册表（单例，管理内置 + 自定义 Agent）
 * - AgentRuntime.ts    — [新] 调度引擎主类
 * - agents/
 *   - WriterAgent.ts    — [新] 章节写手 Agent 实现
 *   - index.ts          — [新] Agent 模块导出
 * - internal/
 *   - DependencyResolver.ts  — [新] DAG 依赖解析
 *   - StepRunner.ts          — [新] 单步执行器（LLM 调用 + 重试）
 *   - CancellationToken.ts   — [新] 取消信号封装
 *   - mapper.ts              — [新] 类型映射工具
 *
 * ## 使用示例
 *
 * ```typescript
 * import { agentRegistry, AgentRuntime } from './agent-runtime';
 *
 * // 获取所有 Agent
 * const allAgents = agentRegistry.list();
 *
 * // 创建运行时
 * const runtime = new AgentRuntime({ projectId: 'proj-123' });
 *
 * // 注册事件
 * runtime.onProgress((snapshot) => {
 *   updateUI(snapshot);
 * });
 *
 * // 执行计划
 * const result = await runtime.execute(plan);
 * console.log(result.summary);
 * ```
 *
 * ## 取消执行
 *
 * ```typescript
 * // 在另一个地方调用
 * await runtime.cancel();
 * ```
 */

// ============================================================
// 类型导出
// ============================================================

export type {
  AnyAgentId,
  AgentInput,
  AgentOutput,
  AgentDefinition,
  AgentExecutionPlan,
  AgentFilterOptions,
  AgentRunStatus,
  AgentRuntimeSnapshot,
  AgentRuntimeOptions,
  AgentRuntimeResult,
  StepResult,
  StepLifecycleEvent,
} from './types';

// ============================================================
// Service 导出
// ============================================================

export { agentRegistry } from './AgentRegistry';
export { AgentRuntime, createAgentRuntime } from './AgentRuntime';

// ============================================================
// 内部模块导出（供需要直接使用的场景）
// ============================================================

export {
  resolveExecutionOrder,
  detectCycle,
  topologicalSort,
  getReadyBatch,
  markStepCompleted,
} from './internal/DependencyResolver';

export { CancellationToken, CancelledError, delay } from './internal/CancellationToken';

export {
  executeStep,
  LLMTimeoutError,
  LLMRateLimitError,
  LLMTemporaryError,
} from './internal/StepRunner';

export {
  agentIdToExecutor,
  agentIdToDisplayName as _agentIdToDisplayName,
  agentInputToStepInput,
  agentOutputToStepOutput,
} from './internal/mapper';

// 内部使用
import { agentIdToDisplayName as _idToDisplayName } from './internal/mapper';

// ============================================================
// Agent 实现模块导出
// ============================================================

export {
  executeWriterAgent,
  executeAuditorAgent,
  executeRevisorAgent,
  executePlannerAgent,
  executeResearcherAgent,
  executeMemoryAgent,
} from './agents';
export type {
  WriterInput,
  AuditorInput,
  RevisorInput,
  PlannerInput,
  ResearcherInput,
  MemoryInput,
} from './agents';

// ============================================================
// Skill Registry 导出
// ============================================================

export { skillRegistry } from '../skill-registry';
export type { SkillDefinition, SkillInput, SkillOutput } from '../skill-registry';

// ============================================================
// 工具函数
// ============================================================

/**
 * 根据 Agent ID 生成默认显示名称
 *
 * @param agentId - 内部 Agent ID
 * @returns 人类可读的显示名称
 */
export function getAgentDisplayName(agentId: string): string {
  return _idToDisplayName(agentId);
}
