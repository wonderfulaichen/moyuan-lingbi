/**
 * StepMemory 类型定义
 *
 * Step 是 Agent 流水线中的基本工作单元。
 * 每个 Step 代表一个 Agent 的一次执行：输入上下文 → 处理 → 输出结果。
 *
 * 设计原则：
 * - Step 是不可变的（创建后只能通过 status 字段流转状态）
 * - 每个 Step 有唯一的 stepId，关联到 projectId
 * - Step 之间可以建立依赖关系（用于编排 Agent 执行顺序）
 * - StepMemoryService 是所有 Step 的统一存储层
 */

import { VFile } from '../../../../shared/types/fileSystem';

// ===== Step 基础类型 =====

/**
 * Step 状态
 */
export type StepStatus =
  | 'pending'      // 等待执行（依赖未完成）
  | 'ready'        // 可执行（依赖已完成）
  | 'running'      // 正在执行
  | 'completed'    // 已完成
  | 'failed'       // 执行失败
  | 'cancelled'    // 已取消
  | 'needs_review' // 需要人工审核
  | 'blocked';     // 被阻塞

/**
 * Step 执行器类型
 */
export type StepExecutor =
  | 'writer'        // 章节写手
  | 'auditor'       // 审计员
  | 'planner'       // 大纲规划师
  | 'editor'        // 文风润色师
  | 'worldbuilder'  // 世界观守门员
  | 'character'     // 角色审计师
  | 'plotter'       // 情节审计师
  | 'inspiration'   // 灵感挖掘师
  | 'foreshadowing' // 伏笔追踪员
  | 'memory' // 记忆整理
  | 'memory'        // 记忆整理专家
  | 'researcher'    // 研究员
  | 'system';       // 系统内置

/**
 * Step 完整数据结构
 */
export interface Step {
  /** 唯一标识 */
  id: string;
  /** 所属项目 ID */
  projectId: string;
  /** 步骤名称（人类可读） */
  name: string;
  /** 步骤描述 */
  description: string;
  /** 执行者类型 */
  executor: StepExecutor;
  /** 当前状态 */
  status: StepStatus;
  /** 输入数据（从 StepMemory 读取或由上游 Step 传递） */
  input: StepInput;
  /** 输出数据（执行完成后写入 StepMemory） */
  output: StepOutput | null;
  /** 依赖的 Step ID 列表（这些 Step 必须 completed 才能执行） */
  dependencies: string[];
  /** 所属的 StepChain（用于分组） */
  chainId: string | null;
  /** 执行优先级（数值越小越优先） */
  priority: number;
  /** 重试次数 */
  retryCount: number;
  /** 最大重试次数 */
  maxRetries: number;
  /** 执行耗时（毫秒） */
  duration: number | null;
  /** 创建时间 */
  createdAt: number;
  /** 开始执行时间 */
  startedAt: number | null;
  /** 完成时间 */
  completedAt: number | null;
  /** 错误信息 */
  error: string | null;
  /** 扩展元数据 */
  metadata: Record<string, unknown>;
}

/**
 * Step 输入数据
 */
export interface StepInput {
  /** 用户指令（来自用户对话） */
  userRequest: string;
  /** 上下文片段（从 StepMemory 召回的项目状态） */
  context: StepMemoryContext;
  /** 需要处理的文件 ID 列表 */
  targetFileIds: string[];
  /** 传递给执行者的额外参数 */
  params: Record<string, unknown>;
}

/**
 * Step 输出数据
 */
export interface StepOutput {
  /** 生成的文本内容 */
  content: string;
  /** 修改/创建的文件 ID 列表 */
  modifiedFileIds: string[];
  /** 输出的类型标签（用于 UI 展示） */
  outputType: 'text' | 'file' | 'analysis' | 'suggestion';
  /** 下游建议的 Step（给主 Agent 参考） */
  suggestedNextSteps: string[];
  /** 输出摘要（用于 UI 展示） */
  summary: string;
}

/**
 * Step 上下文（从 StepMemory 召回）
 */
export interface StepMemoryContext {
  /** 项目当前状态快照 */
  projectState?: {
    title: string;
    currentChapter: string | null;
    totalChapters: number;
    lastModified: number;
  };
  /** 与本 Step 相关的记忆体数据 */
  relevantMemory: StepMemoryFragment[];
  /** 活跃的 Step 列表（当前流水线中正在执行的 Step） */
  activeSteps?: StepSummary[];
  /** 用户偏好 */
  userPreferences?: {
    writingStyle: string;
    checkStrictness: 'relaxed' | 'normal' | 'strict';
    autoSave: boolean;
  };
  /** 扩展字段 */
  stepHistory?: unknown[];
  [key: string]: unknown;
}

/**
 * StepMemory 片段
 */
export interface StepMemoryFragment {
  /** 片段 ID */
  id?: string;
  /** 片段类型 */
  type: 'world' | 'character' | 'plot' | 'timeline' | 'foreshadowing' | 'user_preference' | 'memory' | 'context' | 'outline';
  /** 内容摘要 */
  content: string;
  /** 来源文件 ID */
  sourceFileId?: string | null;
  /** 创建时间 */
  createdAt?: number;
  /** 最后更新时间 */
  updatedAt?: number;
  /** 时间戳 */
  timestamp?: number;
}

/**
 * Step 摘要（用于快速展示）
 */
export interface StepSummary {
  id: string;
  name: string;
  executor: StepExecutor;
  status: StepStatus;
  createdAt: number;
  completedAt: number | null;
}

/**
 * StepChain（Step 链，用于分组管理一组相关的 Step）
 */
export interface StepChain {
  /** 链 ID */
  id: string;
  /** 所属项目 ID */
  projectId: string;
  /** 链名称 */
  name: string;
  /** 链描述 */
  description: string;
  /** 包含的 Step ID 列表（有序） */
  stepIds: string[];
  /** 链状态（根据包含的 Step 状态推导） */
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  /** 创建时间 */
  createdAt: number;
  /** 完成时间 */
  completedAt: number | null;
}

/**
 * StepMemory 存储结构
 */
export interface StepMemoryStore {
  /** 项目 ID → Step 列表 */
  steps: Record<string, Step[]>;
  /** 项目 ID → StepChain 列表 */
  chains: Record<string, StepChain[]>;
  /** 项目 ID → StepMemoryFragment 列表 */
  fragments: Record<string, StepMemoryFragment[]>;
  /** 版本号（用于乐观锁） */
  version: number;
  /** 最后更新时间 */
  updatedAt: number;
}

/**
 * StepMemory 查询选项
 */
export interface StepMemoryQuery {
  /** 按状态过滤 */
  status?: StepStatus[];
  /** 按执行者过滤 */
  executor?: StepExecutor[];
  /** 按时间范围过滤 */
  createdAfter?: number;
  createdBefore?: number;
  /** 按 Chain ID 过滤 */
  chainId?: string;
  /** 排序字段 */
  sortBy?: 'createdAt' | 'completedAt' | 'priority';
  /** 排序方向 */
  sortOrder?: 'asc' | 'desc';
  /** 分页 */
  limit?: number;
  offset?: number;
}
