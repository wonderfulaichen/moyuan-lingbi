/**
 * StepMemoryService
 *
 * Agent 流水线中 Step 的统一存储管理层。
 * 职责：
 * - Step 的 CRUD（Step 创建后不可变，仅 status 可流转）
 * - Step 之间的依赖关系管理
 * - StepMemoryFragment 的存储与按执行者类型召回
 * - StepChain 的分组管理
 * - 通过 StorageProvider 持久化，内存缓存加速读操作
 *
 * 设计原则：
 * - 单例模式，全局共享一个实例
 * - init() 使用 Promise 缓存避免重复初始化
 * - 写操作后自动保存到 StorageProvider
 * - 读操作优先从内存缓存返回，带 TTL 失效机制
 * - 错误处理：查询方法返回默认空值，变更方法直接透传异常
 */

import { createStorageProvider, StorageProvider } from '../storage/StorageProvider';
import type {
  Step,
  StepChain,
  StepMemoryFragment,
  StepMemoryQuery,
  StepMemoryContext,
  StepSummary,
  StepStatus,
  StepExecutor,
  StepInput,
  StepOutput,
} from './types';

// ===== 公开输入类型 =====

/**
 * 创建 Step 的输入参数
 */
export interface CreateStepInput {
  /** 步骤名称 */
  name: string;
  /** 步骤描述 */
  description?: string;
  /** 执行者类型 */
  executor: StepExecutor;
  /** 输入数据 */
  input: StepInput;
  /** 依赖的 Step ID 列表 */
  dependencies?: string[];
  /** 所属 StepChain ID */
  chainId?: string;
  /** 执行优先级（数值越小越优先） */
  priority?: number;
  /** 最大重试次数 */
  maxRetries?: number;
}

// ===== 内部类型 =====

/** 每个项目的缓存数据 */
interface ProjectCache {
  steps: Step[];
  fragments: StepMemoryFragment[];
  chains: StepChain[];
}

/** 执行者类型到记忆体片段类型的映射 */
const EXECUTOR_FRAGMENT_MAP: Record<StepExecutor, StepMemoryFragment['type'][]> = {
  writer: ['world', 'character', 'plot', 'timeline'],
  auditor: ['plot', 'character', 'foreshadowing'],
  planner: ['plot', 'timeline', 'world'],
  editor: ['user_preference'],
  worldbuilder: ['world', 'timeline'],
  character: ['character'],
  plotter: ['plot', 'timeline'],
  inspiration: ['world', 'character', 'plot'],
  foreshadowing: ['foreshadowing', 'timeline'],
  memory: ['world', 'character', 'plot', 'timeline', 'foreshadowing', 'user_preference'],
  researcher: ['world', 'character', 'plot', 'timeline'],
  system: [],
};

// ===== 内部工具 =====

function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function getStepsKey(projectId: string): string {
  return `step-memory/${projectId}/steps`;
}

function getFragmentsKey(projectId: string): string {
  return `step-memory/${projectId}/fragments`;
}

function getChainsKey(projectId: string): string {
  return `step-memory/${projectId}/chains`;
}

// ===== 服务实现 =====

export class StepMemoryService {
  private storageProvider: StorageProvider | null = null;
  private cache: Map<string, ProjectCache> = new Map();
  /** stepId → projectId 的逆向索引，用于在只有 stepId 时查找所属项目 */
  private stepProjectIndex: Map<string, string> = new Map();
  /** 每个项目缓存的上次更新时间戳 */
  private cacheTimestamp: Map<string, number> = new Map();
  /** 缓存失效阈值（毫秒） */
  private readonly CACHE_TTL = 5000;
  /** 是否已初始化 */
  private initialized = false;
  /** 初始化 Promise 缓存，替代自旋锁 */
  private initPromise: Promise<void> | null = null;

  // ------------------------------------------------------------------
  // 初始化与生命周期
  // ------------------------------------------------------------------

  /**
   * 初始化服务实例。
   *
   * 使用 Promise 缓存确保并发调用只初始化一次。
   * 可在首次调用任意业务方法前手动调用，业务方法内部也会自动调用。
   */
  async init(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      await this.getStorageProvider();
      this.initialized = true;
    })();

    return this.initPromise;
  }

  // ------------------------------------------------------------------
  // 内部方法
  // ------------------------------------------------------------------

  /**
   * 获取或初始化 StorageProvider（懒加载）
   */
  private async getStorageProvider(): Promise<StorageProvider> {
    if (!this.storageProvider) {
      this.storageProvider = await createStorageProvider();
    }
    return this.storageProvider;
  }

  /**
   * 从存储加载项目的 Step 列表，优先返回缓存
   */
  private async loadSteps(projectId: string): Promise<Step[]> {
    const cached = this.cache.get(projectId);
    const lastUpdate = this.cacheTimestamp.get(projectId) ?? 0;
    if (cached && Date.now() - lastUpdate < this.CACHE_TTL) return cached.steps;

    const provider = await this.getStorageProvider();
    const steps = (await provider.load<Step[]>(getStepsKey(projectId))) || [];

    this.ensureCache(projectId, { steps, fragments: cached?.fragments ?? [], chains: cached?.chains ?? [] });
    this.cacheTimestamp.set(projectId, Date.now());
    this.rebuildStepIndex(projectId, steps);

    return steps;
  }

  /**
   * 从存储加载项目的 Fragment 列表，优先返回缓存
   */
  private async loadFragments(projectId: string): Promise<StepMemoryFragment[]> {
    const cached = this.cache.get(projectId);
    const lastUpdate = this.cacheTimestamp.get(projectId) ?? 0;
    if (cached && Date.now() - lastUpdate < this.CACHE_TTL) return cached.fragments;

    const provider = await this.getStorageProvider();
    const fragments = (await provider.load<StepMemoryFragment[]>(getFragmentsKey(projectId))) || [];

    this.ensureCache(projectId, { steps: cached?.steps ?? [], fragments, chains: cached?.chains ?? [] });
    this.cacheTimestamp.set(projectId, Date.now());

    return fragments;
  }

  /**
   * 从存储加载项目的 Chain 列表，优先返回缓存
   */
  private async loadChains(projectId: string): Promise<StepChain[]> {
    const cached = this.cache.get(projectId);
    const lastUpdate = this.cacheTimestamp.get(projectId) ?? 0;
    if (cached && Date.now() - lastUpdate < this.CACHE_TTL) return cached.chains;

    const provider = await this.getStorageProvider();
    const chains = (await provider.load<StepChain[]>(getChainsKey(projectId))) || [];

    this.ensureCache(projectId, { steps: cached?.steps ?? [], fragments: cached?.fragments ?? [], chains });
    this.cacheTimestamp.set(projectId, Date.now());

    return chains;
  }

  /**
   * 持久化 Step 列表并更新缓存
   */
  private async saveSteps(projectId: string, steps: Step[]): Promise<void> {
    const provider = await this.getStorageProvider();
    await provider.save(getStepsKey(projectId), steps);

    const cached = this.cache.get(projectId);
    this.ensureCache(projectId, { steps, fragments: cached?.fragments ?? [], chains: cached?.chains ?? [] });
    this.cacheTimestamp.set(projectId, Date.now());
    this.rebuildStepIndex(projectId, steps);
  }

  /**
   * 持久化 Fragment 列表并更新缓存
   */
  private async saveFragments(projectId: string, fragments: StepMemoryFragment[]): Promise<void> {
    const provider = await this.getStorageProvider();
    await provider.save(getFragmentsKey(projectId), fragments);

    const cached = this.cache.get(projectId);
    this.ensureCache(projectId, { steps: cached?.steps ?? [], fragments, chains: cached?.chains ?? [] });
    this.cacheTimestamp.set(projectId, Date.now());
  }

  /**
   * 持久化 Chain 列表并更新缓存
   */
  private async saveChains(projectId: string, chains: StepChain[]): Promise<void> {
    const provider = await this.getStorageProvider();
    await provider.save(getChainsKey(projectId), chains);

    const cached = this.cache.get(projectId);
    this.ensureCache(projectId, { steps: cached?.steps ?? [], fragments: cached?.fragments ?? [], chains });
    this.cacheTimestamp.set(projectId, Date.now());
  }

  /**
   * 确保缓存中存在指定的项目条目
   */
  private ensureCache(projectId: string, data: ProjectCache): void {
    const existing = this.cache.get(projectId);
    if (existing) {
      existing.steps = data.steps;
      existing.fragments = data.fragments;
      existing.chains = data.chains;
    } else {
      this.cache.set(projectId, { ...data });
    }
  }

  /**
   * 从 Step 列表重建 stepId → projectId 索引
   */
  private rebuildStepIndex(projectId: string, steps: Step[]): void {
    // 清除该项目的旧索引
    for (const [stepId, pid] of this.stepProjectIndex) {
      if (pid === projectId) {
        this.stepProjectIndex.delete(stepId);
      }
    }
    // 重建索引
    for (const step of steps) {
      this.stepProjectIndex.set(step.id, projectId);
    }
  }

  /**
   * 根据 stepId 查找所属的 projectId
   * 先查索引，未命中则扫描所有已缓存的项目
   */
  private findProjectForStep(stepId: string): string | null {
    const direct = this.stepProjectIndex.get(stepId);
    if (direct) return direct;

    for (const [projectId, cache] of this.cache) {
      if (cache.steps.some(s => s.id === stepId)) {
        this.stepProjectIndex.set(stepId, projectId);
        return projectId;
      }
    }

    return null;
  }

  /**
   * 解析 Step 间的传递依赖（广度优先获取所有上游依赖）
   */
  private resolveDependencyChain(
    stepId: string,
    allSteps: Step[],
    visited: Set<string> = new Set(),
  ): Step[] {
    const step = allSteps.find(s => s.id === stepId);
    if (!step) return [];

    const result: Step[] = [];

    for (const depId of step.dependencies) {
      if (visited.has(depId)) continue;
      visited.add(depId);

      const depStep = allSteps.find(s => s.id === depId);
      if (depStep) {
        result.push(depStep);
        // 递归获取上游的上游
        const upstream = this.resolveDependencyChain(depId, allSteps, visited);
        result.push(...upstream);
      }
    }

    return result;
  }

  /**
   * 从 Step 列表推导 Chain 状态
   */
  private deriveChainStatus(chainId: string, steps: Step[]): StepChain['status'] {
    const chainSteps = steps.filter(s => s.chainId === chainId);
    if (chainSteps.length === 0) return 'pending';

    const hasCompleted = chainSteps.every(s => s.status === 'completed');
    if (hasCompleted) return 'completed';

    const hasFailed = chainSteps.some(s => s.status === 'failed');
    if (hasFailed) return 'failed';

    const hasCancelled = chainSteps.some(s => s.status === 'cancelled');
    if (hasCancelled) return 'cancelled';

    const hasRunning = chainSteps.some(s => s.status === 'running');
    if (hasRunning) return 'running';

    // All remaining are pending/ready/blocked/needs_review
    return 'pending';
  }

  // ------------------------------------------------------------------
  // 公开 API：Step CRUD
  // ------------------------------------------------------------------

  /**
   * 读取单个 Step。
   *
   * @param projectId - 项目 ID
   * @param stepId - 步骤 ID
   * @returns 找到的 Step，未找到返回 null
   */
  async getStep(projectId: string, stepId: string): Promise<Step | null> {
    try {
      await this.init();
      const steps = await this.loadSteps(projectId);
      return steps.find(s => s.id === stepId) ?? null;
    } catch (error) {
      console.error('[StepMemoryService] getStep 失败:', error);
      return null;
    }
  }

  /**
   * 按条件查询 Step 列表。
   *
   * 支持按状态、执行者、时间范围、Chain ID 过滤，
   * 以及排序和分页。
   *
   * @param projectId - 项目 ID
   * @param query - 可选的查询条件
   * @returns 符合条件的 Step 列表
   */
  async listSteps(projectId: string, query?: StepMemoryQuery): Promise<Step[]> {
    try {
      await this.init();
      let steps = await this.loadSteps(projectId);
      if (!query) return steps;

      // 按状态过滤
      if (query.status && query.status.length > 0) {
        steps = steps.filter(s => query.status!.includes(s.status));
      }

      // 按执行者过滤
      if (query.executor && query.executor.length > 0) {
        steps = steps.filter(s => query.executor!.includes(s.executor));
      }

      // 按时间范围过滤
      if (query.createdAfter !== undefined) {
        steps = steps.filter(s => s.createdAt >= query.createdAfter!);
      }
      if (query.createdBefore !== undefined) {
        steps = steps.filter(s => s.createdAt <= query.createdBefore!);
      }

      // 按 Chain ID 过滤
      if (query.chainId !== undefined) {
        steps = steps.filter(s => s.chainId === query.chainId);
      }

      // 排序
      if (query.sortBy) {
        steps = [...steps].sort((a, b) => {
          const aVal = a[query.sortBy!] ?? 0;
          const bVal = b[query.sortBy!] ?? 0;
          const diff = (aVal as number) - (bVal as number);
          return query.sortOrder === 'asc' ? diff : -diff;
        });
      }

      // 分页
      const offset = query.offset ?? 0;
      const limit = query.limit ?? steps.length;
      steps = steps.slice(offset, offset + limit);

      return steps;
    } catch (error) {
      console.error('[StepMemoryService] listSteps 失败:', error);
      return [];
    }
  }

  /**
   * 创建新 Step。
   *
   * 自动分配 id、createdAt，并根据依赖自动设定初始 status：
   * - 有依赖时 → 'pending'
   * - 无依赖时 → 'ready'
   *
   * @param projectId - 项目 ID
   * @param input - 创建 Step 的输入参数
   * @returns 创建的 Step
   */
  async createStep(projectId: string, input: CreateStepInput): Promise<Step> {
    await this.init();
    const steps = await this.loadSteps(projectId);

    const newStep: Step = {
      id: generateId(),
      projectId,
      name: input.name,
      description: input.description ?? '',
      executor: input.executor,
      status: input.dependencies && input.dependencies.length > 0 ? 'pending' : 'ready',
      input: input.input,
      output: null,
      dependencies: input.dependencies ?? [],
      chainId: input.chainId ?? null,
      priority: input.priority ?? 0,
      retryCount: 0,
      maxRetries: input.maxRetries ?? 0,
      duration: null,
      createdAt: Date.now(),
      startedAt: null,
      completedAt: null,
      error: null,
      metadata: {},
    };

    steps.push(newStep);
    await this.saveSteps(projectId, steps);

    return newStep;
  }

  /**
   * 更新 Step 状态。
   *
   * Step 本身不可变，只有 status 可以流转。
   * 自动处理时间戳：
   * - pending/ready → running 时记录 startedAt
   * - running → completed/failed/cancelled 时记录 completedAt 并计算 duration
   *
   * @param projectId - 项目 ID
   * @param stepId - 步骤 ID
   * @param status - 新状态
   * @param error - 可选错误信息（状态为 failed 时使用）
   */
  async updateStepStatus(
    projectId: string,
    stepId: string,
    status: StepStatus,
    error?: string,
  ): Promise<void> {
    await this.init();
    const steps = await this.loadSteps(projectId);
    const idx = steps.findIndex(s => s.id === stepId);
    if (idx === -1) {
      throw new Error(`[StepMemoryService] updateStepStatus 失败：Step 不存在 ${stepId}`);
    }

    // P0-4 修复：写时拷贝，不直接修改缓存中的 step 对象，避免并发读取拿到不一致状态
    const oldStep = steps[idx];
    const now = Date.now();
    const updatedStep: Step = {
      ...oldStep,
      status,
      error: error !== undefined ? error : oldStep.error,
      startedAt: status === 'running' && oldStep.startedAt === null ? now : oldStep.startedAt,
      completedAt: status === 'completed' || status === 'failed' || status === 'cancelled'
        ? now
        : oldStep.completedAt,
      duration: status === 'completed' || status === 'failed' || status === 'cancelled'
        ? (oldStep.startedAt !== null ? now - oldStep.startedAt : oldStep.duration)
        : oldStep.duration,
    };

    // 创建新数组替换旧元素，保持不可变约定
    const newSteps = [...steps.slice(0, idx), updatedStep, ...steps.slice(idx + 1)];
    await this.saveSteps(projectId, newSteps);

    // 如果某个 Step 完成，检查是否有依赖它的 Step 可以变为 ready
    if (status === 'completed') {
      await this.cascadeUnblockDependents(projectId, stepId, newSteps);
    }
  }

  /**
   * 完成 Step 并写入输出数据。
   *
   * 设置 Step 的输出内容，将状态标记为 completed，并自动更新依赖此 Step 的其他 Step 状态。
   *
   * @param projectId - 项目 ID
   * @param stepId - 步骤 ID
   * @param output - 执行输出数据
   */
  async completeStep(projectId: string, stepId: string, output: StepOutput): Promise<void> {
    await this.init();
    const steps = await this.loadSteps(projectId);
    const idx = steps.findIndex(s => s.id === stepId);
    if (idx === -1) {
      throw new Error(`[StepMemoryService] completeStep 失败：Step 不存在 ${stepId}`);
    }

    // P0-4 修复：写时拷贝，不直接修改缓存中的 step 对象
    const oldStep = steps[idx];
    const now = Date.now();
    const updatedStep: Step = {
      ...oldStep,
      status: 'completed',
      output,
      completedAt: now,
      duration: oldStep.startedAt !== null ? now - oldStep.startedAt : oldStep.duration,
    };

    const newSteps = [...steps.slice(0, idx), updatedStep, ...steps.slice(idx + 1)];
    await this.saveSteps(projectId, newSteps);
    await this.cascadeUnblockDependents(projectId, stepId, newSteps);
  }

  /**
   * 级联解除阻塞：当一个 Step 完成后，检查所有依赖它的 Step 是否可变为 ready 状态。
   */
  private async cascadeUnblockDependents(
    projectId: string,
    completedStepId: string,
    allSteps: Step[],
  ): Promise<void> {
    let changed = false;

    // P0-4 修复：写时拷贝，不直接修改 step 对象，用 map 生成新数组
    const newSteps = allSteps.map(step => {
      if (step.status !== 'pending' || !step.dependencies.includes(completedStepId)) return step;

      // 检查该 Step 的所有依赖是否都已完成
      const allDepsCompleted = step.dependencies.every(depId => {
        const dep = allSteps.find(s => s.id === depId);
        return dep?.status === 'completed';
      });

      if (allDepsCompleted) {
        changed = true;
        return { ...step, status: 'ready' as StepStatus };
      }
      return step;
    });

    if (changed) {
      await this.saveSteps(projectId, newSteps);
    }
  }

  /**
   * 删除指定 Step。
   *
   * @param projectId - 项目 ID
   * @param stepId - 步骤 ID
   * @returns 是否成功删除
   */
  async deleteStep(projectId: string, stepId: string): Promise<boolean> {
    try {
      await this.init();
      const steps = await this.loadSteps(projectId);
      const index = steps.findIndex(s => s.id === stepId);
      if (index === -1) return false;

      steps.splice(index, 1);
      await this.saveSteps(projectId, steps);
      return true;
    } catch (error) {
      console.error('[StepMemoryService] deleteStep 失败:', error);
      return false;
    }
  }

  // ------------------------------------------------------------------
  // 公开 API：依赖管理
  // ------------------------------------------------------------------

  /**
   * 在两个 Step 之间添加依赖关系。
   *
   * 自动判断：
   * - 防止重复添加
   * - 防止自依赖
   * - 若目标 Step 原为 'ready' 状态，因新增未完成依赖改为 'pending'
   *
   * @param projectId - 项目 ID
   * @param stepId - 当前 Step ID（依赖于其他 Step）
   * @param dependsOnStepId - 被依赖的 Step ID
   */
  async addDependency(projectId: string, stepId: string, dependsOnStepId: string): Promise<void> {
    await this.init();

    if (stepId === dependsOnStepId) {
      throw new Error('[StepMemoryService] addDependency 失败：不允许自依赖');
    }

    const steps = await this.loadSteps(projectId);
    const idx = steps.findIndex(s => s.id === stepId);
    const dependsOn = steps.find(s => s.id === dependsOnStepId);

    if (idx === -1 || !dependsOn) {
      throw new Error('[StepMemoryService] addDependency 失败：Step 不存在');
    }

    const oldStep = steps[idx];

    // 防止重复添加
    if (oldStep.dependencies.includes(dependsOnStepId)) {
      return;
    }

    // 循环依赖检测：检查 dependsOnStepId 是否已传递依赖了 stepId
    if (this.wouldCreateCycle(stepId, dependsOnStepId, steps)) {
      throw new Error(
        `[StepMemoryService] addDependency 失败：添加依赖 ${dependsOnStepId} 到 ${stepId} 将形成循环依赖`,
      );
    }

    // P0-4 修复：写时拷贝，不直接修改 step 对象
    const newDeps = [...oldStep.dependencies, dependsOnStepId];
    const newStatus = dependsOn.status !== 'completed' && oldStep.status === 'ready' ? 'pending' as StepStatus : oldStep.status;
    const updatedStep: Step = { ...oldStep, dependencies: newDeps, status: newStatus };
    const newSteps = [...steps.slice(0, idx), updatedStep, ...steps.slice(idx + 1)];
    await this.saveSteps(projectId, newSteps);
  }

  /**
   * DFS 检测：从 dependsOnStepId 出发，沿已有依赖链搜索是否可达 stepId。
   * 若可达则说明添加新依赖会形成环。
   */
  private wouldCreateCycle(stepId: string, dependsOnStepId: string, allSteps: Step[]): boolean {
    const visited = new Set<string>();
    const stack = [dependsOnStepId];

    while (stack.length > 0) {
      const currentId = stack.pop()!;
      if (currentId === stepId) return true;

      const current = allSteps.find(s => s.id === currentId);
      if (!current) continue;

      for (const depId of current.dependencies) {
        if (!visited.has(depId)) {
          visited.add(depId);
          stack.push(depId);
        }
      }
    }

    return false;
  }

  /**
   * 获取所有可执行的 Step（依赖已完成的 'ready' 状态 Step）。
   *
   * 主 Agent 可轮询此方法获取下一个需要执行的 Step。
   *
   * @param projectId - 项目 ID
   * @returns 所有 status 为 'ready' 的 Step 列表
   */
  async getUnblockedSteps(projectId: string): Promise<Step[]> {
    try {
      await this.init();
      const steps = await this.loadSteps(projectId);
      return steps.filter(s => s.status === 'ready');
    } catch (error) {
      console.error('[StepMemoryService] getUnblockedSteps 失败:', error);
      return [];
    }
  }

  /**
   * 获取所有被阻塞的 Step（依赖未完成的 'pending' 或 'blocked' 状态 Step）。
   *
   * @param projectId - 项目 ID
   * @returns 被阻塞的 Step 列表
   */
  async getBlockedSteps(projectId: string): Promise<Step[]> {
    try {
      await this.init();
      const steps = await this.loadSteps(projectId);
      return steps.filter(s => s.status === 'pending' || s.status === 'blocked');
    } catch (error) {
      console.error('[StepMemoryService] getBlockedSteps 失败:', error);
      return [];
    }
  }

  /**
   * 获取指定 Step 的完整上游依赖链（包含传递依赖）。
   *
   * @param stepId - 步骤 ID
   * @returns 所有上游依赖 Step 列表
   */
  async getDependencyChain(stepId: string): Promise<Step[]> {
    try {
      await this.init();
      const projectId = this.findProjectForStep(stepId);
      if (!projectId) return [];

      const steps = await this.loadSteps(projectId);
      return this.resolveDependencyChain(stepId, steps);
    } catch (error) {
      console.error('[StepMemoryService] getDependencyChain 失败:', error);
      return [];
    }
  }

  // ------------------------------------------------------------------
  // 公开 API：上下文构建
  // ------------------------------------------------------------------

  /**
   * 为指定的 Agent 构建执行上下文。
   *
   * 召回相关的 StepMemoryFragment，收集活跃的 Step 摘要，
   * 并构建完整的 StepMemoryContext 供 Agent 执行时使用。
   *
   * @param projectId - 项目 ID
   * @param agentId - Agent 标识（对应 StepExecutor 类型）
   * @returns 包含项目状态、相关记忆和活跃 Step 的上下文
   */
  async buildContext(projectId: string, agentId: string): Promise<StepMemoryContext> {
    try {
      await this.init();
      const [steps, fragments] = await Promise.all([
        this.loadSteps(projectId),
        this.loadFragments(projectId),
      ]);

      // 将 agentId 视为 StepExecutor 类型获取相关片段
      const agentExecutor = agentId as StepExecutor;
      const allowedTypes = EXECUTOR_FRAGMENT_MAP[agentExecutor] ?? [];
      const relevantMemory = allowedTypes.length > 0
        ? fragments.filter(f => allowedTypes.includes(f.type))
        : [];

      // 构建活跃 Step 摘要
      const activeSteps: StepSummary[] = steps
        .filter(s => s.status === 'running' || s.status === 'ready')
        .map(s => ({
          id: s.id,
          name: s.name,
          executor: s.executor,
          status: s.status,
          createdAt: s.createdAt,
          completedAt: s.completedAt,
        }));

      return {
        projectState: {
          title: '',
          currentChapter: null,
          totalChapters: 0,
          lastModified: Date.now(),
        },
        relevantMemory,
        activeSteps,
        userPreferences: {
          writingStyle: 'default',
          checkStrictness: 'normal',
          autoSave: true,
        },
      };
    } catch (error) {
      console.error('[StepMemoryService] buildContext 失败:', error);

      // 返回最小默认上下文
      return {
        projectState: {
          title: '',
          currentChapter: null,
          totalChapters: 0,
          lastModified: Date.now(),
        },
        relevantMemory: [],
        activeSteps: [],
        userPreferences: {
          writingStyle: 'default',
          checkStrictness: 'normal',
          autoSave: true,
        },
      };
    }
  }

  // ------------------------------------------------------------------
  // 公开 API：Fragment 管理
  // ------------------------------------------------------------------

  /**
   * 添加记忆体片段。
   *
   * @param projectId - 项目 ID
   * @param data - 片段数据（id、createdAt、updatedAt 自动生成）
   * @returns 创建的片段 ID，失败返回 null
   */
  async addFragment(
    projectId: string,
    data: Omit<StepMemoryFragment, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<string | null> {
    try {
      await this.init();
      const fragments = await this.loadFragments(projectId);

      const now = Date.now();
      const fragment: StepMemoryFragment = {
        ...data,
        id: generateId(),
        createdAt: now,
        updatedAt: now,
      };

      fragments.push(fragment);
      await this.saveFragments(projectId, fragments);

      return fragment.id;
    } catch (error) {
      console.error('[StepMemoryService] addFragment 失败:', error);
      return null;
    }
  }

  /**
   * 根据执行者类型获取相关的记忆体片段。
   *
   * 通过 EXECUTOR_FRAGMENT_MAP 将执行者类型映射到片段类型进行过滤。
   * 例如 writer 会获取 world、character、plot、timeline 类型的片段。
   *
   * @param projectId - 项目 ID
   * @param executorType - 执行者类型
   * @returns 相关的记忆体片段列表
   */
  async getRelevantFragments(
    projectId: string,
    executorType: StepExecutor,
  ): Promise<StepMemoryFragment[]> {
    try {
      await this.init();
      const fragments = await this.loadFragments(projectId);
      const allowedTypes = EXECUTOR_FRAGMENT_MAP[executorType];

      if (!allowedTypes || allowedTypes.length === 0) return [];

      return fragments.filter(f => allowedTypes.includes(f.type));
    } catch (error) {
      console.error('[StepMemoryService] getRelevantFragments 失败:', error);
      return [];
    }
  }

  /**
   * 按片段类型获取记忆体片段列表。
   *
   * @param projectId - 项目 ID
   * @param type - 片段类型
   * @returns 指定类型的片段列表
   */
  async getFragmentsByType(
    projectId: string,
    type: StepMemoryFragment['type'],
  ): Promise<StepMemoryFragment[]> {
    try {
      await this.init();
      const fragments = await this.loadFragments(projectId);
      return fragments.filter(f => f.type === type);
    } catch (error) {
      console.error('[StepMemoryService] getFragmentsByType 失败:', error);
      return [];
    }
  }

  /**
   * 按关键词搜索记忆体片段（搜索 content 字段）。
   *
   * @param projectId - 项目 ID
   * @param keyword - 搜索关键词
   * @returns 内容中匹配关键词的片段列表
   */
  async searchFragments(projectId: string, keyword: string): Promise<StepMemoryFragment[]> {
    try {
      await this.init();
      const fragments = await this.loadFragments(projectId);

      const lowerKeyword = keyword.toLowerCase();
      return fragments.filter(f => f.content.toLowerCase().includes(lowerKeyword));
    } catch (error) {
      console.error('[StepMemoryService] searchFragments 失败:', error);
      return [];
    }
  }

  // ------------------------------------------------------------------
  // 公开 API：Chain 管理
  // ------------------------------------------------------------------

  /**
   * 创建新的 StepChain。
   *
   * StepChain 用于将一组相关的 Step 分组管理。
   *
   * @param projectId - 项目 ID
   * @param input - 链的名称和描述
   * @returns 创建的 StepChain，失败返回 null
   */
  async createChain(
    projectId: string,
    input: { name: string; description: string },
  ): Promise<StepChain | null> {
    try {
      await this.init();
      const chains = await this.loadChains(projectId);

      const chain: StepChain = {
        id: generateId(),
        projectId,
        name: input.name,
        description: input.description,
        stepIds: [],
        status: 'pending',
        createdAt: Date.now(),
        completedAt: null,
      };

      chains.push(chain);
      await this.saveChains(projectId, chains);

      return chain;
    } catch (error) {
      console.error('[StepMemoryService] createChain 失败:', error);
      return null;
    }
  }

  /**
   * 将 Step 添加到指定 Chain 中。
   *
   * @param projectId - 项目 ID
   * @param chainId - Chain ID
   * @param stepId - Step ID
   */
  async addStepToChain(projectId: string, chainId: string, stepId: string): Promise<void> {
    try {
      await this.init();
      const [chains, steps] = await Promise.all([
        this.loadChains(projectId),
        this.loadSteps(projectId),
      ]);

      const chain = chains.find(c => c.id === chainId);
      if (!chain) {
        console.warn('[StepMemoryService] addStepToChain 失败：Chain 不存在', chainId);
        return;
      }

      const idx = steps.findIndex(s => s.id === stepId);
      if (idx === -1) {
        console.warn('[StepMemoryService] addStepToChain 失败：Step 不存在', stepId);
        return;
      }

      const oldStep = steps[idx];

      // 防止重复添加
      if (chain.stepIds.includes(stepId)) return;

      // TODO(P1): chain 对象也应写时拷贝（与 step 同类问题），当前保留原样属 P0-4 范围外
      chain.stepIds.push(stepId);

      // P0-4 修复：写时拷贝更新 step 的 chainId，不直接修改缓存中的 step 对象
      let workingSteps = steps;
      if (oldStep.chainId !== chainId) {
        const updatedStep: Step = { ...oldStep, chainId };
        workingSteps = [...steps.slice(0, idx), updatedStep, ...steps.slice(idx + 1)];
        await this.saveSteps(projectId, workingSteps);
      }

      // 重新推导 Chain 状态（用 workingSteps 确保读到最新 step 状态）
      chain.status = this.deriveChainStatus(chainId, workingSteps);
      await this.saveChains(projectId, chains);
    } catch (error) {
      console.error('[StepMemoryService] addStepToChain 失败:', error);
    }
  }

  /**
   * 获取指定 Chain 的当前状态。
   *
   * 状态由链中所有 Step 的状态共同推导得出：
   * - 全部 completed → 'completed'
   * - 存在 failed → 'failed'
   * - 存在 cancelled → 'cancelled'
   * - 存在 running → 'running'
   * - 其他 → 'pending'
   *
   * @param projectId - 项目 ID
   * @param chainId - Chain ID
   * @returns Chain 的当前状态
   */
  async getChainStatus(projectId: string, chainId: string): Promise<StepChain['status'] | null> {
    try {
      await this.init();
      const [chains, steps] = await Promise.all([
        this.loadChains(projectId),
        this.loadSteps(projectId),
      ]);

      const chain = chains.find(c => c.id === chainId);
      if (!chain) return null;

      // 从 Step 列表重新推导状态
      chain.status = this.deriveChainStatus(chainId, steps);
      await this.saveChains(projectId, chains);

      return chain.status;
    } catch (error) {
      console.error('[StepMemoryService] getChainStatus 失败:', error);
      return null;
    }
  }

  // ------------------------------------------------------------------
  // 缓存管理
  // ------------------------------------------------------------------

  /**
   * 使缓存失效。
   *
   * @param projectId - 可选，指定项目的缓存；不传则使所有缓存失效
   */
  invalidateCache(projectId?: string): void {
    if (projectId) {
      this.cache.delete(projectId);
      this.cacheTimestamp.delete(projectId);
      for (const [stepId, pid] of this.stepProjectIndex) {
        if (pid === projectId) {
          this.stepProjectIndex.delete(stepId);
        }
      }
    } else {
      this.cache.clear();
      this.cacheTimestamp.clear();
      this.stepProjectIndex.clear();
    }
  }
}

// ===== 单例导出 =====

export const stepMemoryService = new StepMemoryService();
