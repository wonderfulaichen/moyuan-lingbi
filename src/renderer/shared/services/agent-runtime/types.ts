/**
 * Agent 运行时核心类型定义
 *
 * 本文件定义了 Agent 接口层的所有核心类型：
 * - AgentInput / AgentOutput：Agent 的统一输入输出格式
 * - AgentDefinition：Agent 元数据定义
 * - AgentExecutionPlan：Agent 执行计划（给 AgentRuntime 编排用）
 * - AnyAgentId：扩展的 AgentId（兼容现有 + 新增子 Agent）
 */

import type { StepMemoryContext, StepMemoryFragment } from '../step-memory/types';
import type { AIChatMessage } from '../../../../shared/types/fileSystem';
import type { TaskType } from '../ModelRouter';
import type { AgentId } from '../../../../shared/prompts/types';

// ============================================================
// AgentId 扩展
// ============================================================

/**
 * 扩展的 AgentId 类型
 *
 * 在现有 5 个内置 Agent（agent-general, agent-worldbuilder, agent-character,
 * agent-plotter, agent-editor）的基础上，新增写作子 Agent 类型，
 * 用于更细粒度的流水线编排。
 */
export type AnyAgentId =
  | AgentId
  | 'agent-sub-writer'       // 子 Agent：章节写手
  | 'agent-sub-planner'      // 子 Agent：大纲规划师
  | 'agent-sub-memory'       // 子 Agent：记忆整理
  | 'agent-sub-researcher'   // 子 Agent：资料研究员
  | 'agent-sub-reviewer';    // 子 Agent：审校员

// ============================================================
// Agent 统一输入输出
// ============================================================

/**
 * Agent 接收的统一输入格式
 *
 * 所有 Agent 实现必须接收此格式，确保整个流水线的输入接口一致。
 * 与 StepMemory 系统共享 context 类型，确保上下文可跨系统传递。
 */
export interface AgentInput {
  /** 关联的 Step ID（与 StepMemory 系统中的 Step 一一对应） */
  stepId: string;
  /** 用户原始请求 */
  userRequest: string;
  /** 上下文（与 StepMemory 共享，包含项目状态快照、记忆片段等） */
  context: StepMemoryContext;
  /** 对话历史（用于多轮交互或上下文延续） */
  messages: AIChatMessage[];
  /** 指定模型 ID（可选。不指定则使用 ModelRouter 自动选择） */
  modelId?: string;
  /** 任务描述 */
  task?: string;
  /** 扩展选项（供特定 Agent 实现自定义参数） */
  options?: Record<string, unknown>;
}

/**
 * Agent 统一输出格式
 *
 * 无论 Agent 内部逻辑如何，所有 Agent 必须返回此格式的输出。
 * 其中 memoryUpdates 和 suggestedNextSteps 支持后续的流水线编排。
 */
export interface AgentOutput {
  /** 生成的文本内容（AI 的原始回复） */
  content: string;
  /** 修改/创建的文件 ID 列表 */
  modifiedFileIds?: string[];
  /** 内存更新片段列表（写入 StepMemory，供后续 Agent 参考） */
  memoryUpdates?: StepMemoryFragment[];
  /** 建议的下一步操作描述（给 AgentRuntime 参考） */
  suggestedNextSteps?: string[];
  /** 执行状态 */
  status?: 'completed' | 'needs_review' | 'blocked' | 'failed';
  /** 输出摘要（用于 UI 展示和日志记录） */
  summary?: string;
  /** 是否成功 */
  success?: boolean;
  /** 错误信息 */
  error?: string;
}

// ============================================================
// Agent 元数据
// ============================================================

/**
 * Agent 元数据定义
 *
 * 描述一个 Agent 的完整元数据，包括身份标识、视觉信息、
 * 能力范围、行为约束等。用于 AgentRegistry 注册和 AgentRuntime 调度。
 */
export interface AgentDefinition {
  /** Agent 唯一标识（如 'agent-general'、'agent-sub-writer'） */
  id: string;
  /** 显示名称（用于 UI，如 '通用助手'、'章节写手'） */
  name: string;
  /** 图标（FontAwesome 类名，如 'fa-robot'、'fa-feather-pointed'） */
  icon: string;
  /** 主题色（十六进制颜色值，如 '#10b981'） */
  color: string;
  /** 功能描述（用于 UI 展示和筛选） */
  description: string;
  /** 系统提示词（可被 PromptComposer 引用组合） */
  systemPrompt: string;
  /** 兼容的任务类型列表（与 ModelRouter 的 TaskType 对齐） */
  compatibleTasks: TaskType[];
  /** 允许的工具类别列表（如 ['file', 'search', 'memory', 'ai']） */
  allowedToolCategories: string[];
  /** 最大重试次数（执行失败时自动重试） */
  maxRetries: number;
  /** 默认是否对用户隐藏（某些子 Agent 默认不展示在 UI 中） */
  hiddenOfDefault: boolean;
}

// ============================================================
// 执行计划
// ============================================================

/**
 * Agent 执行计划
 *
 * 定义一组 Agent 的执行顺序和依赖关系，由 AgentRuntime 解释执行。
 * chainId 用于关联 StepMemory 中的 StepChain。
 */
export interface AgentExecutionPlan {
  /** 执行链 ID（对应 StepMemory 的 chainId） */
  chainId: string;
  /** 执行步骤列表（有序） */
  steps: Array<{
    /** 要执行的 Agent ID */
    agentId: string;
    /** Agent 输入 */
    input: AgentInput;
    /** 依赖的 stepId 列表（这些 Step 必须完成才能执行本步） */
    dependsOn: string[];
  }>;
}

// ============================================================
// 辅助类型
// ============================================================

/**
 * Agent 过滤器选项
 *
 * 用于 AgentRegistry.listByFilter 方法的过滤条件。
 */
export interface AgentFilterOptions {
  /** 按任务类型过滤 */
  taskType?: TaskType;
  /** 是否包含隐藏 Agent（默认 false） */
  includeHidden?: boolean;
  /** 搜索关键词（匹配 name / description / id） */
  searchQuery?: string;
}

/**
 * Agent 执行状态
 */
export type AgentRunStatus = 'idle' | 'running' | 'completed' | 'failed' | 'cancelled';

/**
 * Agent 运行时快照（用于 UI 展示当前执行状态）
 */
export interface AgentRuntimeSnapshot {
  /** 当前正在执行的 Agent ID */
  currentAgentId: string | null;
  /** 当前 Step ID */
  currentStepId: string | null;
  /** 执行状态 */
  status: AgentRunStatus;
  /** 已完成的步骤数 */
  completedSteps: number;
  /** 总步骤数 */
  totalSteps: number;
  /** 错误信息 */
  error: string | null;
  /** 开始时间 */
  startedAt: number | null;
  /** 当前阶段的耗时（毫秒） */
  elapsedMs: number;
}

// ============================================================
// AgentRuntime 调度引擎类型
// ============================================================

/**
 * AgentRuntime 构造选项
 *
 * @remarks
 * 用于自定义 AgentRuntime 的行为参数。
 * 所有字段都是可选的，提供合理的默认值。
 */
export interface AgentRuntimeOptions {
  /** 项目 ID（必须） */
  projectId: string;
  /** 快照通知间隔（毫秒，默认 500） */
  snapshotIntervalMs?: number;
  /** 重试退避基础时间（毫秒，默认 1000） */
  retryBaseDelayMs?: number;
  /** 是否自动将 memoryUpdates 写入 StepMemory（默认 true） */
  autoWriteMemory?: boolean;
  /** 串行执行模式（禁用并行，默认 true） */
  serialExecution?: boolean;
}

/**
 * 执行结果（完整摘要）
 */
export interface AgentRuntimeResult {
  /** 关联的 StepChain ID */
  chainId: string;
  /** 整体执行状态 */
  status: AgentRunStatus;
  /** 已完成的步骤 */
  completedSteps: StepResult[];
  /** 失败的步骤 */
  failedSteps: StepResult[];
  /** 被取消的步骤 */
  cancelledSteps: StepResult[];
  /** 总步骤数 */
  totalSteps: number;
  /** 开始时间戳 */
  startedAt: number;
  /** 完成时间戳 */
  completedAt: number | null;
  /** 耗时（毫秒） */
  elapsedMs: number;
  /** 摘要文本 */
  summary: string;
}

/**
 * 单步执行结果
 */
export interface StepResult {
  /** Step ID（对应 StepMemory 中的 Step） */
  stepId: string;
  /** Agent ID */
  agentId: string;
  /** 步骤名称 */
  name: string;
  /** 执行状态 */
  status: 'completed' | 'failed' | 'cancelled' | 'skipped';
  /** Agent 输出（成功时） */
  output: AgentOutput | null;
  /** 错误信息（失败时） */
  error: string | null;
  /** 重试次数 */
  attemptCount: number;
  /** 开始时间戳 */
  startedAt: number;
  /** 完成时间戳 */
  completedAt: number;
  /** 耗时（毫秒） */
  durationMs: number;
}

/**
 * 步骤生命周期事件（回调参数）
 */
export interface StepLifecycleEvent {
  /** Step ID */
  stepId: string;
  /** Agent ID */
  agentId: string;
  /** Agent 显示名称 */
  agentName: string;
  /** 步骤名称 */
  stepName: string;
  /** 当前状态 */
  status: AgentRunStatus;
  /** 事件时间戳 */
  timestamp: number;
}

/**
 * 内部可执行步骤（依赖已解析）
 *
 * 在 Plan 的基础上，拓扑排序后生成的可执行结构。
 * 包含已解析的依赖关系和在 Plan 中的原始索引。
 */
export interface ExecutableStep {
  /** 步骤在 Plan 中的原始索引 */
  index: number;
  /** 要执行的 Agent ID */
  agentId: string;
  /** 步骤名称（自动生成或来自 plan） */
  name: string;
  /** Agent 输入 */
  input: AgentInput;
  /** 依赖的 Plan step 索引列表 */
  dependsOn: number[];
  /** 被哪些步骤依赖（供级联用） */
  dependedBy: number[];
  /** 当前入度（剩余未完成依赖数） */
  inDegree: number;
}
