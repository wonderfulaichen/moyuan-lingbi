/**
 * DependencyResolver
 *
 * DAG 依赖解析器：将 AgentExecutionPlan 的依赖关系解析为拓扑排序的可执行队列。
 *
 * 职责：
 * - 解析 plan.steps[].dependsOn（引用其他 step 的 input.stepId）
 * - 拓扑排序，生成 ExecutableStep[]（按依赖顺序排列）
 * - 循环依赖检测
 * - 就绪队列管理（入度为 0 的步骤进入就绪队列）
 *
 * 与 StepMemory 的协同：
 * - StepMemory 系统中的依赖关系由 AgentRuntime 通过 createStep() 的 dependencies 参数记录
 * - 本解析器只负责运行时的执行顺序（内存中），不负责持久化
 */

import type { AgentExecutionPlan } from '../types';
import type { ExecutableStep } from '../types';

// ============================================================
// 执行顺序解析
// ============================================================

/**
 * 解析执行顺序（拓扑排序）
 *
 * 将 AgentExecutionPlan 解析为拓扑排序后的 ExecutableStep[]。
 *
 * @param plan - Agent 执行计划
 * @returns 拓扑排序后的可执行步骤列表
 * @throws 如果存在循环依赖则抛出错误
 */
export function resolveExecutionOrder(plan: AgentExecutionPlan): ExecutableStep[] {
  const steps = plan.steps;
  if (steps.length === 0) {
    return [];
  }

  // ----------------------------------------------------------
  // 第一步：建立 stepIndex 映射（stepId → index）
  // ----------------------------------------------------------
  // 由于 dependsOn 引用的是其他 step 的 input.stepId，需要先建立映射
  const stepIdToIndex = new Map<string, number>();

  for (let i = 0; i < steps.length; i++) {
    const stepId = steps[i].input.stepId;
    if (stepId) {
      // 如果多个 step 有相同的 stepId，只保留最后一个（但这种情况不应出现）
      stepIdToIndex.set(stepId, i);
    }
  }

  // ----------------------------------------------------------
  // 第二步：构建 ExecutableStep 图结构
  // ----------------------------------------------------------
  const executableSteps: ExecutableStep[] = steps.map((step, index) => {
    // 解析 dependsOn：将 stepId 引用转换为 index 引用
    const dependsOnIndices: number[] = [];
    for (const depStepId of step.dependsOn) {
      const depIndex = stepIdToIndex.get(depStepId);
      if (depIndex !== undefined) {
        dependsOnIndices.push(depIndex);
      }
      // 如果 depIndex 未找到（引用了 plan 外部的 step），忽略——该依赖将在 StepMemory 层处理
    }

    return {
      index,
      agentId: step.agentId,
      name: step.input.userRequest.slice(0, 40) || `Step ${index}`,
      input: step.input,
      dependsOn: dependsOnIndices,
      dependedBy: [],
      inDegree: dependsOnIndices.length,
    };
  });

  // ----------------------------------------------------------
  // 第三步：填充 dependedBy（反向依赖）
  // ----------------------------------------------------------
  for (const step of executableSteps) {
    for (const depIndex of step.dependsOn) {
      if (depIndex >= 0 && depIndex < executableSteps.length) {
        executableSteps[depIndex].dependedBy.push(step.index);
      }
    }
  }

  // ----------------------------------------------------------
  // 第四步：检测循环依赖
  // ----------------------------------------------------------
  const cycle = detectCycle(executableSteps);
  if (cycle) {
    throw new Error(
      `[DependencyResolver] 检测到循环依赖：${cycle.join(' → ')}。请检查 plan.steps 的依赖关系。`,
    );
  }

  // ----------------------------------------------------------
  // 第五步：拓扑排序（Kahn 算法）
  // ----------------------------------------------------------
  return topologicalSort(executableSteps);
}

// ============================================================
// 循环依赖检测（DFS）
// ============================================================

/**
 * 检测 DAG 中的循环依赖
 *
 * 使用三色 DFS 标记法（WHITE/GRAY/BLACK）。
 * 如果在 DFS 遍历中遇到 GRAY 节点，说明存在环。
 *
 * @param steps - 可执行步骤列表
 * @returns 如果存在环，返回环路径；否则返回 null
 */
export function detectCycle(steps: ExecutableStep[]): string[] | null {
  const WHITE = 0; // 未访问
  const GRAY = 1;  // 正在访问（当前 DFS 路径中）
  const BLACK = 2; // 已访问完毕

  const colors = new Array<number>(steps.length).fill(WHITE);
  const path: number[] = [];

  function dfs(nodeIndex: number): boolean {
    colors[nodeIndex] = GRAY;
    path.push(nodeIndex);

    const node = steps[nodeIndex];
    for (const depIndex of node.dependsOn) {
      if (colors[depIndex] === GRAY) {
        // 发现环
        path.push(depIndex);
        return true;
      }
      if (colors[depIndex] === WHITE) {
        if (dfs(depIndex)) {
          return true;
        }
      }
    }

    path.pop();
    colors[nodeIndex] = BLACK;
    return false;
  }

  for (let i = 0; i < steps.length; i++) {
    if (colors[i] === WHITE) {
      if (dfs(i)) {
        // 将索引转换为有意义的名称
        return path.map(idx => {
          const step = steps[idx];
          return step.name || `Step ${idx}`;
        });
      }
    }
  }

  return null;
}

// ============================================================
// 拓扑排序（Kahn 算法）
// ============================================================

/**
 * Kahn 算法拓扑排序
 *
 * 策略：
 * 1. 将所有入度为 0 的节点加入就绪队列
 * 2. 从就绪队列取出一个节点，将其所有下游节点的入度减 1
 * 3. 如果下游节点入度变为 0，加入就绪队列
 * 4. 重复直到所有节点处理完毕
 *
 * @param steps - 可执行步骤列表
 * @returns 拓扑排序后的步骤列表（按执行顺序排列）
 */
export function topologicalSort(steps: ExecutableStep[]): ExecutableStep[] {
  // 拷贝入度（不修改原始数据）
  const inDegrees = steps.map(s => s.inDegree);
  const result: ExecutableStep[] = [];

  // 就绪队列（入度为 0）
  const readyQueue: number[] = [];
  for (let i = 0; i < steps.length; i++) {
    if (inDegrees[i] === 0) {
      readyQueue.push(i);
    }
  }

  // 按就绪队列顺序逐个处理
  // 注意：就绪队列中的步骤可以并行执行，这里只是确定顺序
  while (readyQueue.length > 0) {
    const currentIndex = readyQueue.shift()!;
    result.push(steps[currentIndex]);

    // 更新下游节点的入度
    for (const depByIndex of steps[currentIndex].dependedBy) {
      inDegrees[depByIndex]--;
      if (inDegrees[depByIndex] === 0) {
        readyQueue.push(depByIndex);
      }
    }
  }

  // 如果结果长度不等于步骤总数，说明存在未被处理的节点（循环依赖）
  if (result.length !== steps.length) {
    throw new Error(
      `[DependencyResolver] 拓扑排序不完整：${result.length}/${steps.length} 已排序，` +
      `可能存在循环依赖。`,
    );
  }

  return result;
}

// ============================================================
// 就绪队列管理
// ============================================================

/**
 * 获取当前批次的可执行步骤（入度为 0 的步骤）
 *
 * 在串行执行模式下，每次只返回一个步骤。
 * 在并行执行模式下，返回所有入度为 0 的步骤。
 *
 * @param steps - 可执行步骤列表（拓扑排序后，按顺序）
 * @param startIndex - 从哪个索引开始搜索
 * @param serial - 是否串行执行
 * @returns [就绪步骤列表, 下一个起始索引]
 */
export function getReadyBatch(
  steps: ExecutableStep[],
  startIndex: number,
  serial: boolean,
): { batch: ExecutableStep[]; nextIndex: number } {
  if (startIndex >= steps.length) {
    return { batch: [], nextIndex: startIndex };
  }

  const batch: ExecutableStep[] = [];
  let nextIndex = startIndex;

  for (let i = startIndex; i < steps.length; i++) {
    if (steps[i].inDegree === 0) {
      batch.push(steps[i]);
      nextIndex = i + 1;
      if (serial) {
        // 串行模式：只取一个
        break;
      }
      // 并行模式：取所有入度为 0 的步骤
      // 但需要注意，取了一个后，索引不能简单地设为 i+1
      // 因为拓扑排序后入度为 0 的步骤可能不连续
    }
  }

  // 如果串行模式且没有找到入度为 0 的步骤，返回第一个可用的
  if (serial && batch.length === 0 && startIndex < steps.length) {
    batch.push(steps[startIndex]);
    nextIndex = startIndex + 1;
  }

  return { batch, nextIndex };
}

/**
 * 标记一个步骤为已完成（更新其下游节点的入度）
 *
 * @param steps - 所有可执行步骤
 * @param completedIndex - 已完成的步骤索引
 */
export function markStepCompleted(steps: ExecutableStep[], completedIndex: number): void {
  const step = steps[completedIndex];
  if (!step) return;

  for (const depByIndex of step.dependedBy) {
    if (depByIndex >= 0 && depByIndex < steps.length) {
      steps[depByIndex].inDegree = Math.max(0, steps[depByIndex].inDegree - 1);
    }
  }
}
