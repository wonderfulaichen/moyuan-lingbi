/**
 * AgentRuntime
 *
 * Agent 流水线调度引擎——编排层与执行层分离的核心。
 *
 * ## 设计原则
 *
 * 1. **编排层与执行层分离**
 *    AgentRuntime 只做编排（依赖解析、调度、生命周期），不关心 Agent 内部逻辑。
 *    Agent 的逻辑由 `AgentDefinition.systemPrompt` + LLM 调用承载。
 *
 * 2. **数据驱动**
 *    所有执行状态写入 StepMemory，确保进程重启后可恢复。
 *    AgentRuntime 本身无状态。
 *
 * 3. **LLM 是第一执行器**
 *    Agent 的核心是"配置好的 LLM 调用"（systemPrompt + context → AgentOutput），
 *    无需手写 Agent 执行代码。
 *
 * 4. **可取消性作为一等公民**
 *    每一步都必须接受 AbortSignal，LLM 调用层面也传递此信号。
 *
 * ## 核心职责
 *
 * | 职责 | 说明 |
 * |------|------|
 * | 执行编排 | 接收 AgentExecutionPlan，解析依赖 DAG，拓扑顺序执行 |
 * | Step 映射 | Plan 的每一步 → stepMemoryService.createStep() → completeStep() |
 * | Agent 查找 | 根据 agentId 从 AgentRegistry 获取 AgentDefinition |
 * | LLM 集成 | 组装 systemPrompt + context + messages，调用底层 AI 服务 |
 * | 生命周期 | idle → running → completed/failed/cancelled |
 * | 重试 | 按 AgentDefinition.maxRetries 配置自动重试，指数退避 |
 * | 取消 | AbortController 模式，安全中断正在执行的步骤 |
 * | 进度快照 | 定时生成 AgentRuntimeSnapshot 供 UI 消费 |
 * | 事件钩子 | step start / complete / fail 的回调 |
 *
 * ## 使用示例
 *
 * ```typescript
 * import { AgentRuntime } from './agent-runtime';
 *
 * const runtime = new AgentRuntime({ projectId: 'proj-123' });
 *
 * runtime.onStepStart((event) => {
 *   console.log(`[${event.agentName}] 开始执行`);
 * });
 *
 * const result = await runtime.execute(plan);
 * console.log(`完成：${result.completedSteps.length}/${result.totalSteps}`);
 * ```
 */

import type {
  AgentExecutionPlan,
  AgentRuntimeOptions,
  AgentRuntimeResult,
  AgentRuntimeSnapshot,
  AgentRunStatus,
  StepLifecycleEvent,
  StepResult,
  ExecutableStep,
} from './types';
import { resolveExecutionOrder, markStepCompleted } from './internal/DependencyResolver';
import { CancellationToken } from './internal/CancellationToken';
import { executeStep } from './internal/StepRunner';
import {
  agentInputToStepInput,
  agentOutputToStepOutput,
  agentIdToDisplayName,
} from './internal/mapper';
import { stepMemoryService } from '../step-memory/StepMemoryService';

// ============================================================
// 事件监听器类型
// ============================================================

type ListenerMap = {
  stepStart: Set<(event: StepLifecycleEvent) => void>;
  stepComplete: Set<(event: StepLifecycleEvent) => void>;
  stepFail: Set<(event: StepLifecycleEvent & { error: string }) => void>;
  stepCancel: Set<(event: StepLifecycleEvent) => void>;
  statusChange: Set<(status: AgentRunStatus) => void>;
  progress: Set<(snapshot: AgentRuntimeSnapshot) => void>;
};

// ============================================================
// AgentRuntime 类
// ============================================================

export class AgentRuntime {
  // === 配置 ===
  private readonly options: Required<AgentRuntimeOptions>;

  // === 运行时状态 ===
  private token: CancellationToken | null = null;
  private status: AgentRunStatus = 'idle';
  private currentRunResult: AgentRuntimeResult | null = null;
  private snapshotIntervalId: ReturnType<typeof setInterval> | null = null;

  // === 当前执行中步骤的追踪 ==
  private currentStepId: string | null = null;
  private currentAgentId: string | null = null;
  private startedAt: number = 0;
  private stepIdMap: Map<number, string> = new Map(); // plan index → stepId
  private stepIdToPlanIndex: Map<string, number> = new Map(); // stepId → plan index
  private executableSteps: ExecutableStep[] = [];

  // === 事件监听器 ===
  private listeners: ListenerMap = {
    stepStart: new Set(),
    stepComplete: new Set(),
    stepFail: new Set(),
    stepCancel: new Set(),
    statusChange: new Set(),
    progress: new Set(),
  };

  // ================================================================
  // 构造函数
  // ================================================================

  constructor(options: AgentRuntimeOptions) {
    this.options = {
      projectId: options.projectId,
      snapshotIntervalMs: options.snapshotIntervalMs ?? 500,
      retryBaseDelayMs: options.retryBaseDelayMs ?? 1000,
      autoWriteMemory: options.autoWriteMemory ?? true,
      serialExecution: options.serialExecution ?? true,
    };
  }

  // ================================================================
  // 核心 API
  // ================================================================

  /**
   * 执行一个 Agent 执行计划
   *
   * 执行顺序：
   * 1. 校验（plan 非空、agentId 存在、无循环依赖）
   * 2. 检查当前不是 running 状态（防重入）
   * 3. 创建 CancellationToken & AbortController
   * 4. stepMemoryService.createChain() 创建 StepChain
   * 5. resolveExecutionOrder() 拓扑排序
   * 6. 循环执行排序后的步骤队列
   * 7. 完成后更新 chain status，清理运行时状态
   * 8. 返回完整的 AgentRuntimeResult
   *
   * @param plan - Agent 执行计划
   * @returns 执行结果
   */
  async execute(plan: AgentExecutionPlan): Promise<AgentRuntimeResult> {
    // 1. 校验
    this.validatePlan(plan);

    // 2. 防重入检查
    if (this.status === 'running') {
      throw new Error('[AgentRuntime] 已有正在执行的计划，不能重复执行');
    }

    // 3. 初始化运行时状态
    this.token = new CancellationToken();
    this.status = 'running';
    this.startedAt = Date.now();
    this.stepIdMap.clear();
    this.stepIdToPlanIndex.clear();

    // 初始化结果对象
    const result: AgentRuntimeResult = {
      chainId: '',
      status: 'running',
      completedSteps: [],
      failedSteps: [],
      cancelledSteps: [],
      totalSteps: plan.steps.length,
      startedAt: this.startedAt,
      completedAt: null,
      elapsedMs: 0,
      summary: '',
    };
    this.currentRunResult = result;

    try {
      // 触发状态变更
      this.emitStatusChange('running');

      // 4. 创建 StepChain
      const chain = await stepMemoryService.createChain(this.options.projectId, {
        name: plan.chainId || `Agent 执行链 - ${new Date().toLocaleString()}`,
        description: `执行计划：共 ${plan.steps.length} 步`,
      });
      if (chain) {
        result.chainId = chain.id;
      }

      // 5. 拓扑排序
      this.executableSteps = resolveExecutionOrder(plan);
      const executableSteps = this.executableSteps;

      // 并行模式尚未实现：serialExecution=false 时告警，避免静默降级
      if (!this.options.serialExecution) {
        console.warn('[AgentRuntime] serialExecution=false 但并行模式尚未实现，将使用串行执行');
      }

      // 6. 启动快照通知
      this.startSnapshotInterval(executableSteps);

      // 7. 逐步执行
      await this.executeStepsSequentially(executableSteps, result);

      // 8. 完成
      result.status = 'completed';
      result.completedAt = Date.now();
      result.elapsedMs = result.completedAt - result.startedAt;
      result.summary = this.buildSummary(result);

      // 更新 Chain 状态
      if (chain) {
        await stepMemoryService.getChainStatus(this.options.projectId, chain.id);
      }

      this.status = 'completed';
      this.emitStatusChange('completed');
      this.emitProgress(executableSteps);

      return result;
    } catch (error) {
      // 如果是取消错误
      if (this.token?.isCancelled) {
        result.status = 'cancelled';
        this.status = 'cancelled';
        result.completedAt = Date.now();
        result.elapsedMs = result.completedAt - result.startedAt;
        result.summary = this.buildSummary(result);
        this.emitStatusChange('cancelled');
        return result;
      }

      // 其他错误
      result.status = 'failed';
      this.status = 'failed';
      result.completedAt = Date.now();
      result.elapsedMs = result.completedAt - result.startedAt;
      result.summary = error instanceof Error ? error.message : '执行失败';
      this.emitStatusChange('failed');
      return result;
    } finally {
      this.cleanupRun();
    }
  }

  /**
   * 取消当前执行
   *
   * 行为：
   * 1. 调用 CancellationToken.cancel()
   * 2. 正在执行的 LLM 调用收到 AbortSignal 后中断
   * 3. 当前 running step 状态为 'cancelled'
   * 4. 所有未开始的步骤标记为 'cancelled'
   */
  async cancel(): Promise<void> {
    if (!this.token || this.status !== 'running') {
      return;
    }

    this.token.cancel();

    // 如果有正在执行的 Step，更新其状态
    if (this.currentStepId) {
      try {
        await stepMemoryService.updateStepStatus(
          this.options.projectId,
          this.currentStepId,
          'cancelled',
        );
      } catch {
        // 忽略更新失败
      }
    }

    this.emitStatusChange('cancelled');
  }

  // ================================================================
  // 步骤执行循环
  // ================================================================

  /**
   * 串行执行步骤队列
   *
   * 按拓扑排序后的顺序，每次都等待上一步完成后再执行下一步。
   *
   * @param steps - 拓扑排序后的可执行步骤列表
   * @param result - 执行结果对象（会被修改）
   */
  private async executeStepsSequentially(
    steps: ExecutableStep[],
    result: AgentRuntimeResult,
  ): Promise<void> {
    for (const step of steps) {
      // 检查取消
      this.token!.throwIfCancelled();

      // 执行单步
      const stepResult = await this.executeSingleStep(step, result);

      // 将结果加入结果集
      switch (stepResult.status) {
        case 'completed':
          result.completedSteps.push(stepResult);
          break;
        case 'failed':
          result.failedSteps.push(stepResult);
          // 失败策略：目前是 abort（停止整个链）
          // 后续可支持 skip 模式
          throw new Error(`Step "${step.name}" 执行失败: ${stepResult.error}`);
        case 'cancelled':
          result.cancelledSteps.push(stepResult);
          throw new Error('执行被取消');
        case 'skipped':
          // 跳过步骤不加入任何列表
          break;
      }
    }
  }

  /**
   * 执行单个步骤
   *
   * 完整流程：
   * 1. 创建 Step（stepMemoryService.createStep）
   * 2. 将 Step 加入 Chain
   * 3. 更新状态为 running
   * 4. 调用 AI 服务执行
   * 5. 完成 Step 并写入输出
   * 6. 写入 memoryUpdates
   *
   * @param step - 可执行步骤
   * @param result - 执行结果
   * @returns 单步执行结果
   */
  private async executeSingleStep(
    step: ExecutableStep,
    result: AgentRuntimeResult,
  ): Promise<StepResult> {
    const agentName = agentIdToDisplayName(step.agentId);
    const stepStartedAt = Date.now();
    let stepResult: StepResult | null = null;

    try {
      // --------------------------------------------------
      // 1. 创建 Step 到 StepMemory
      // --------------------------------------------------
      const planStep = step;

      // 解析依赖的 Step ID
      const dependencyStepIds: string[] = [];
      for (const depIndex of planStep.dependsOn) {
        const depStepId = this.stepIdMap.get(depIndex);
        if (depStepId) {
          dependencyStepIds.push(depStepId);
        }
      }

      const createStepInput = agentInputToStepInput(
        step.agentId,
        step.input,
        agentName,
        dependencyStepIds,
        result.chainId || undefined,
      );

      const createdStep = await stepMemoryService.createStep(
        this.options.projectId,
        createStepInput,
      );
      const stepId = createdStep.id;

      // 记录映射
      this.stepIdMap.set(step.index, stepId);
      this.stepIdToPlanIndex.set(stepId, step.index);

      // 2. 将 Step 加入 Chain
      if (result.chainId) {
        await stepMemoryService.addStepToChain(
          this.options.projectId,
          result.chainId,
          stepId,
        );
      }

      // 3. 更新状态为 running
      await stepMemoryService.updateStepStatus(this.options.projectId, stepId, 'running');

      // 更新当前执行追踪
      this.currentStepId = stepId;
      this.currentAgentId = step.agentId;

      // 触发 onStepStart
      this.emitStepStart(stepId, step.agentId, agentName, step.name);

      // --------------------------------------------------
      // 4. 执行（调用 AI 服务）
      // --------------------------------------------------
      const agentOutput = await executeStep(
        step.agentId,
        step.input,
        this.token!,
        this.options.retryBaseDelayMs,
      );

      // --------------------------------------------------
      // 5. 完成 Step 并写入输出
      // --------------------------------------------------
      const stepOutput = agentOutputToStepOutput(agentOutput);

      await stepMemoryService.completeStep(
        this.options.projectId,
        stepId,
        stepOutput,
      );

      // 6. 写入 memoryUpdates（如果启用）
      if (this.options.autoWriteMemory && agentOutput.memoryUpdates.length > 0) {
        for (const fragment of agentOutput.memoryUpdates) {
          await stepMemoryService.addFragment(this.options.projectId, {
            type: fragment.type,
            content: fragment.content,
            sourceFileId: fragment.sourceFileId,
          });
        }
      }

      this.emitProgressForStep(step);

      // 标记依赖完成（更新入度）
      markStepCompleted(this.executableSteps, step.index);

      const stepCompletedAt = Date.now();

      stepResult = {
        stepId,
        agentId: step.agentId,
        name: agentName,
        status: 'completed',
        output: agentOutput,
        error: null,
        attemptCount: 1,
        startedAt: stepStartedAt,
        completedAt: stepCompletedAt,
        durationMs: stepCompletedAt - stepStartedAt,
      };

      // 触发 onStepComplete
      this.emitStepComplete(stepId, step.agentId, agentName, step.name);

      return stepResult;
    } catch (error) {
      const stepCompletedAt = Date.now();
      const isCancelled = error instanceof Error && error.name === 'CancelledError';

      // 更新 Step 状态
      if (this.currentStepId) {
        try {
          await stepMemoryService.updateStepStatus(
            this.options.projectId,
            this.currentStepId,
            isCancelled ? 'cancelled' : 'failed',
            error instanceof Error ? error.message : String(error),
          );
        } catch {
          // 忽略更新失败
        }
      }

      const status = isCancelled ? 'cancelled' : 'failed';

      stepResult = {
        stepId: this.currentStepId || '',
        agentId: step.agentId,
        name: agentName,
        status,
        output: null,
        error: error instanceof Error ? error.message : String(error),
        attemptCount: 1,
        startedAt: stepStartedAt,
        completedAt: stepCompletedAt,
        durationMs: stepCompletedAt - stepStartedAt,
      };

      if (isCancelled) {
        this.emitStepCancel(agentIdToDisplayName(step.agentId));
      } else {
        this.emitStepFail(
          this.currentStepId || '',
          step.agentId,
          agentName,
          step.name,
          error instanceof Error ? error.message : String(error),
        );
      }

      return stepResult;
    } finally {
      this.currentStepId = null;
      this.currentAgentId = null;
    }
  }

  // ================================================================
  // 快照管理
  // ================================================================

  /**
   * 获取当前执行快照（同步）
   *
   * @returns AgentRuntimeSnapshot
   */
  getSnapshot(): AgentRuntimeSnapshot {
    const now = Date.now();
    const result = this.currentRunResult;

    return {
      currentAgentId: this.currentAgentId,
      currentStepId: this.currentStepId,
      status: this.status,
      completedSteps: result?.completedSteps.length ?? 0,
      totalSteps: result?.totalSteps ?? 0,
      error: result?.failedSteps[0]?.error ?? null,
      startedAt: result?.startedAt ?? null,
      elapsedMs: result?.startedAt ? now - result.startedAt : 0,
    };
  }

  /**
   * 获取完整执行摘要
   *
   * @returns AgentRuntimeResult 或 null（如果没有执行过）
   */
  getResult(): AgentRuntimeResult | null {
    return this.currentRunResult;
  }

  /**
   * 获取当前运行状态
   */
  getStatus(): AgentRunStatus {
    return this.status;
  }

  // ================================================================
  // 快照推送
  // ================================================================

  /**
   * 启动定时快照推送
   */
  private startSnapshotInterval(steps: ExecutableStep[]): void {
    this.stopSnapshotInterval();

    this.snapshotIntervalId = setInterval(() => {
      this.emitProgress(steps);
    }, this.options.snapshotIntervalMs);
  }

  /**
   * 停止定时快照推送
   */
  private stopSnapshotInterval(): void {
    if (this.snapshotIntervalId !== null) {
      clearInterval(this.snapshotIntervalId);
      this.snapshotIntervalId = null;
    }
  }

  // ================================================================
  // 校验
  // ================================================================

  /**
   * 校验执行计划
   *
   * @param plan - 执行计划
   * @throws 校验失败时抛出错误
   */
  private validatePlan(plan: AgentExecutionPlan): void {
    if (!plan || !plan.steps || plan.steps.length === 0) {
      throw new Error('[AgentRuntime] 执行计划不能为空');
    }

    for (let i = 0; i < plan.steps.length; i++) {
      const step = plan.steps[i];
      if (!step.agentId) {
        throw new Error(`[AgentRuntime] 第 ${i} 步缺少 agentId`);
      }
      if (!step.input || !step.input.userRequest) {
        throw new Error(`[AgentRuntime] 第 ${i} 步缺少 userRequest`);
      }
    }
  }

  // ================================================================
  // 清理
  // ================================================================

  /**
   * 清理运行时状态
   */
  private cleanupRun(): void {
    this.stopSnapshotInterval();
    this.token = null;
  }

  // ================================================================
  // 事件系统
  // ================================================================

  /** 注册 step start 事件 */
  onStepStart(callback: (event: StepLifecycleEvent) => void): void {
    this.listeners.stepStart.add(callback);
  }

  /** 注册 step complete 事件 */
  onStepComplete(callback: (event: StepLifecycleEvent) => void): void {
    this.listeners.stepComplete.add(callback);
  }

  /** 注册 step fail 事件 */
  onStepFail(callback: (event: StepLifecycleEvent & { error: string }) => void): void {
    this.listeners.stepFail.add(callback);
  }

  /** 注册 step cancel 事件 */
  onStepCancel(callback: (event: StepLifecycleEvent) => void): void {
    this.listeners.stepCancel.add(callback);
  }

  /** 注册 status change 事件 */
  onStatusChange(callback: (status: AgentRunStatus) => void): void {
    this.listeners.statusChange.add(callback);
  }

  /** 注册 progress 事件 */
  onProgress(callback: (snapshot: AgentRuntimeSnapshot) => void): void {
    this.listeners.progress.add(callback);
  }

  /** 移除所有监听器 */
  removeAllListeners(): void {
    for (const key of Object.keys(this.listeners) as Array<keyof ListenerMap>) {
      this.listeners[key].clear();
    }
  }

  // ----------------------------------------------------------
  // 事件触发
  // ----------------------------------------------------------

  private emitStepStart(
    stepId: string,
    agentId: string,
    agentName: string,
    stepName: string,
  ): void {
    const event: StepLifecycleEvent = {
      stepId,
      agentId,
      agentName,
      stepName,
      status: 'running',
      timestamp: Date.now(),
    };
    this.listeners.stepStart.forEach(cb => cb(event));
  }

  private emitStepComplete(
    stepId: string,
    agentId: string,
    agentName: string,
    stepName: string,
  ): void {
    const event: StepLifecycleEvent = {
      stepId,
      agentId,
      agentName,
      stepName,
      status: 'completed',
      timestamp: Date.now(),
    };
    this.listeners.stepComplete.forEach(cb => cb(event));
  }

  private emitStepFail(
    stepId: string,
    agentId: string,
    agentName: string,
    stepName: string,
    error: string,
  ): void {
    const maxLen = 500;
    const truncatedError = error.length > maxLen ? error.slice(0, maxLen) + '...' : error;
    this.listeners.stepFail.forEach(cb =>
      cb({
        stepId,
        agentId,
        agentName,
        stepName,
        status: 'failed',
        timestamp: Date.now(),
        error: truncatedError,
      }),
    );
  }

  private emitStepCancel(agentName: string): void {
    this.listeners.stepCancel.forEach(cb =>
      cb({
        stepId: '',
        agentId: '',
        agentName,
        stepName: '',
        status: 'cancelled',
        timestamp: Date.now(),
      }),
    );
  }

  private emitStatusChange(status: AgentRunStatus): void {
    this.listeners.statusChange.forEach(cb => cb(status));
  }

  private emitProgress(steps: ExecutableStep[]): void {
    const snapshot = this.getSnapshot();
    this.listeners.progress.forEach(cb => cb(snapshot));
  }

  private emitProgressForStep(_step: ExecutableStep): void {
    const snapshot = this.getSnapshot();
    this.listeners.progress.forEach(cb => cb(snapshot));
  }

  // ================================================================
  // 工具
  // ================================================================

  /**
   * 构建执行摘要
   */
  private buildSummary(result: AgentRuntimeResult): string {
    const total = result.totalSteps;
    const completed = result.completedSteps.length;
    const failed = result.failedSteps.length;
    const cancelled = result.cancelledSteps.length;

    if (result.status === 'completed') {
      return `✅ 执行完成：${completed}/${total} 步成功`;
    }
    if (result.status === 'cancelled') {
      return `⏹️ 已取消：已完成 ${completed}/${total} 步`;
    }
    if (result.status === 'failed') {
      return `❌ 执行失败：已完成 ${completed}/${total} 步，失败 ${failed} 步`;
    }
    return `执行中：${completed}/${total} 步`;
  }
}

// ============================================================
// 工厂函数
// ============================================================

/**
 * 创建 AgentRuntime 实例
 *
 * @param options - 运行时选项
 * @returns AgentRuntime 实例
 */
export function createAgentRuntime(options: AgentRuntimeOptions): AgentRuntime {
  return new AgentRuntime(options);
}
