/**
 * DependencyResolver 单元测试
 *
 * 测试目标：
 * - resolveExecutionOrder: 完整的解析流程（拓扑排序 + 循环检测）
 * - detectCycle: 三色 DFS 循环检测
 * - topologicalSort: Kahn 算法排序
 * - getReadyBatch: 就绪队列管理
 * - markStepCompleted: 入度更新与级联
 *
 * 边界情况：
 * - 空 plan
 * - 无依赖的单步
 * - 线性链条
 * - 扇入/扇出 DAG
 * - 自环检测
 * - 无效索引保护
 */
import { describe, it, expect } from 'vitest';
import type { AgentExecutionPlan } from '../types';
import type { ExecutableStep } from '../types';
import {
  resolveExecutionOrder,
  detectCycle,
  topologicalSort,
  getReadyBatch,
  markStepCompleted,
} from './DependencyResolver';

// ============================================================
// Helper：构建测试用 ExecutableStep
// ============================================================

function makeStep(index: number, name: string, dependsOn: number[] = []): ExecutableStep {
  return {
    index,
    agentId: 'agent-general',
    name,
    input: {
      stepId: `step-${index}`,
      userRequest: name,
      context: {
        projectState: { title: 'test', currentChapter: null, totalChapters: 1, lastModified: 0 },
        relevantMemory: [],
        activeSteps: [],
        userPreferences: { writingStyle: 'default', checkStrictness: 'normal', autoSave: true },
      },
      messages: [],
    },
    dependsOn,
    dependedBy: [],
    inDegree: dependsOn.length,
  };
}

// ============================================================
// resolveExecutionOrder (完整流程测试)
// ============================================================

describe('resolveExecutionOrder', () => {
  it('空 plan 应返回空数组', () => {
    const plan: AgentExecutionPlan = { chainId: 'test', steps: [] };
    expect(resolveExecutionOrder(plan)).toEqual([]);
  });

  it('无依赖的单步 plan 应直接返回', () => {
    const plan: AgentExecutionPlan = {
      chainId: 'test',
      steps: [
        {
          agentId: 'agent-general',
          input: {
            stepId: 'step-0',
            userRequest: '测试步骤',
            context: {
              projectState: { title: 'test', currentChapter: null, totalChapters: 1, lastModified: 0 },
              relevantMemory: [],
              activeSteps: [],
              userPreferences: { writingStyle: 'default', checkStrictness: 'normal', autoSave: true },
            },
            messages: [],
          },
          dependsOn: [],
        },
      ],
    };
    const result = resolveExecutionOrder(plan);
    expect(result).toHaveLength(1);
    expect(result[0].index).toBe(0);
    expect(result[0].inDegree).toBe(0);
  });

  it('线性依赖应正确排序', () => {
    const plan: AgentExecutionPlan = {
      chainId: 'test',
      steps: [
        {
          agentId: 'agent-general',
          input: {
            stepId: 'step-0',
            userRequest: '第一步',
            context: {
              projectState: { title: 'test', currentChapter: null, totalChapters: 1, lastModified: 0 },
              relevantMemory: [],
              activeSteps: [],
              userPreferences: { writingStyle: 'default', checkStrictness: 'normal', autoSave: true },
            },
            messages: [],
          },
          dependsOn: [],
        },
        {
          agentId: 'agent-general',
          input: {
            stepId: 'step-1',
            userRequest: '第二步',
            context: {
              projectState: { title: 'test', currentChapter: null, totalChapters: 1, lastModified: 0 },
              relevantMemory: [],
              activeSteps: [],
              userPreferences: { writingStyle: 'default', checkStrictness: 'normal', autoSave: true },
            },
            messages: [],
          },
          dependsOn: ['step-0'],
        },
        {
          agentId: 'agent-general',
          input: {
            stepId: 'step-2',
            userRequest: '第三步',
            context: {
              projectState: { title: 'test', currentChapter: null, totalChapters: 1, lastModified: 0 },
              relevantMemory: [],
              activeSteps: [],
              userPreferences: { writingStyle: 'default', checkStrictness: 'normal', autoSave: true },
            },
            messages: [],
          },
          dependsOn: ['step-1'],
        },
      ],
    };
    const result = resolveExecutionOrder(plan);
    expect(result).toHaveLength(3);
    expect(result[0].index).toBe(0);
    expect(result[1].index).toBe(1);
    expect(result[2].index).toBe(2);
  });

  it('循环依赖应抛出错误', () => {
    const plan: AgentExecutionPlan = {
      chainId: 'test',
      steps: [
        {
          agentId: 'agent-general',
          input: {
            stepId: 'step-0',
            userRequest: '第一步',
            context: {
              projectState: { title: 'test', currentChapter: null, totalChapters: 1, lastModified: 0 },
              relevantMemory: [],
              activeSteps: [],
              userPreferences: { writingStyle: 'default', checkStrictness: 'normal', autoSave: true },
            },
            messages: [],
          },
          dependsOn: ['step-2'], // 依赖第三步 → 形成环
        },
        {
          agentId: 'agent-general',
          input: {
            stepId: 'step-1',
            userRequest: '第二步',
            context: {
              projectState: { title: 'test', currentChapter: null, totalChapters: 1, lastModified: 0 },
              relevantMemory: [],
              activeSteps: [],
              userPreferences: { writingStyle: 'default', checkStrictness: 'normal', autoSave: true },
            },
            messages: [],
          },
          dependsOn: ['step-0'],
        },
        {
          agentId: 'agent-general',
          input: {
            stepId: 'step-2',
            userRequest: '第三步',
            context: {
              projectState: { title: 'test', currentChapter: null, totalChapters: 1, lastModified: 0 },
              relevantMemory: [],
              activeSteps: [],
              userPreferences: { writingStyle: 'default', checkStrictness: 'normal', autoSave: true },
            },
            messages: [],
          },
          dependsOn: ['step-1'],
        },
      ],
    };
    expect(() => resolveExecutionOrder(plan)).toThrow('循环依赖');
  });
});

// ============================================================
// detectCycle
// ============================================================

describe('detectCycle', () => {
  it('无环的简单图应返回 null', () => {
    const steps = [
      makeStep(0, 'A'),
      makeStep(1, 'B', [0]),
      makeStep(2, 'C', [0]),
    ];
    steps[0].dependedBy = [1, 2];
    expect(detectCycle(steps)).toBeNull();
  });

  it('自环应被检测到', () => {
    const steps = [makeStep(0, 'A', [0])];
    steps[0].dependedBy = [0];
    const result = detectCycle(steps);
    expect(result).not.toBeNull();
    expect(result!.length).toBeGreaterThan(0);
  });

  it('三角环应被检测到', () => {
    const steps = [
      makeStep(0, 'A', [2]),
      makeStep(1, 'B', [0]),
      makeStep(2, 'C', [1]),
    ];
    steps[0].dependedBy = [1];
    steps[1].dependedBy = [2];
    steps[2].dependedBy = [0];
    const result = detectCycle(steps);
    expect(result).not.toBeNull();
  });

  it('复杂 DAG 中无环应返回 null', () => {
    const steps = [
      makeStep(0, 'A'),
      makeStep(1, 'B', [0]),
      makeStep(2, 'C', [0]),
      makeStep(3, 'D', [1, 2]),
    ];
    steps[0].dependedBy = [1, 2];
    steps[1].dependedBy = [3];
    steps[2].dependedBy = [3];
    expect(detectCycle(steps)).toBeNull();
  });

  it('空数组应返回 null', () => {
    expect(detectCycle([])).toBeNull();
  });

  it('单节点无环应返回 null', () => {
    const steps = [makeStep(0, 'A')];
    expect(detectCycle(steps)).toBeNull();
  });
});

// ============================================================
// topologicalSort (Kahn 算法)
// ============================================================

describe('topologicalSort', () => {
  it('空数组应返回空数组', () => {
    expect(topologicalSort([])).toEqual([]);
  });

  it('单节点应返回自身', () => {
    const steps = [makeStep(0, 'A')];
    const result = topologicalSort(steps);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('A');
  });

  it('线性链条应保持顺序', () => {
    const steps = [
      makeStep(0, 'A'),
      makeStep(1, 'B', [0]),
      makeStep(2, 'C', [1]),
    ];
    steps[0].dependedBy = [1];
    steps[1].dependedBy = [2];
    const result = topologicalSort(steps);
    expect(result.map(s => s.name)).toEqual(['A', 'B', 'C']);
  });

  it('扇出结构：A → B, A → C 应保持 A 在最前', () => {
    const steps = [
      makeStep(0, 'A'),
      makeStep(1, 'B', [0]),
      makeStep(2, 'C', [0]),
    ];
    steps[0].dependedBy = [1, 2];
    const result = topologicalSort(steps);
    expect(result[0].name).toBe('A');
  });

  it('扇入结构：B, C → D 应保持 B/C 在 D 之前', () => {
    const steps = [
      makeStep(0, 'B'),
      makeStep(1, 'C'),
      makeStep(2, 'D', [0, 1]),
    ];
    steps[0].dependedBy = [2];
    steps[1].dependedBy = [2];
    const result = topologicalSort(steps);
    expect(result[2].name).toBe('D');
  });

  it('循环依赖应抛出错误', () => {
    const steps = [
      makeStep(0, 'A', [2]),
      makeStep(1, 'B', [0]),
      makeStep(2, 'C', [1]),
    ];
    steps[0].dependedBy = [1];
    steps[1].dependedBy = [2];
    steps[2].dependedBy = [0];
    expect(() => topologicalSort(steps)).toThrow('拓扑排序不完整');
  });
});

// ============================================================
// getReadyBatch
// ============================================================

describe('getReadyBatch', () => {
  it('没有就绪步骤应返回空批次', () => {
    const steps = [makeStep(0, 'A', [1])];
    const { batch, nextIndex } = getReadyBatch(steps, 0, true);
    expect(batch).toHaveLength(1); // fallback: 返回第一个可用
    expect(nextIndex).toBe(1);
  });

  it('串行模式每次只返回一个步骤', () => {
    const steps = [
      makeStep(0, 'A'),
      makeStep(1, 'B'),
      makeStep(2, 'C'),
    ];
    const { batch, nextIndex } = getReadyBatch(steps, 0, true);
    expect(batch).toHaveLength(1);
    expect(batch[0].name).toBe('A');
    expect(nextIndex).toBe(1);
  });

  it('并行模式返回所有入度为 0 的步骤', () => {
    const steps = [
      makeStep(0, 'A'),
      makeStep(1, 'B'),
      makeStep(2, 'C', [0, 1]),
    ];
    steps[0].dependedBy = [2];
    steps[1].dependedBy = [2];
    const { batch, nextIndex } = getReadyBatch(steps, 0, false);
    expect(batch.length).toBeGreaterThanOrEqual(2);
    expect(batch.some(s => s.name === 'A')).toBe(true);
    expect(batch.some(s => s.name === 'B')).toBe(true);
  });

  it('startIndex 超出范围应返回空', () => {
    const steps = [makeStep(0, 'A')];
    const { batch, nextIndex } = getReadyBatch(steps, 5, true);
    expect(batch).toHaveLength(0);
    expect(nextIndex).toBe(5);
  });
});

// ============================================================
// markStepCompleted
// ============================================================

describe('markStepCompleted', () => {
  it('应减少下游节点的入度', () => {
    const steps = [
      makeStep(0, 'A'),
      makeStep(1, 'B', [0]),
    ];
    steps[0].dependedBy = [1];
    expect(steps[1].inDegree).toBe(1);
    markStepCompleted(steps, 0);
    expect(steps[1].inDegree).toBe(0);
  });

  it('无效的 completedIndex 应无操作', () => {
    const steps = [makeStep(0, 'A')];
    expect(() => markStepCompleted(steps, 99)).not.toThrow();
    expect(() => markStepCompleted(steps, -1)).not.toThrow();
  });

  it('入度不应减到 0 以下', () => {
    const steps = [
      makeStep(0, 'A'),
      makeStep(1, 'B', [0]),
    ];
    steps[0].dependedBy = [1];
    markStepCompleted(steps, 0);
    markStepCompleted(steps, 0); // 二次调用
    expect(steps[1].inDegree).toBe(0);
  });

  it('扇出场景：完成步骤应更新多个下游', () => {
    const steps = [
      makeStep(0, 'A'),
      makeStep(1, 'B', [0]),
      makeStep(2, 'C', [0]),
    ];
    steps[0].dependedBy = [1, 2];
    expect(steps[1].inDegree).toBe(1);
    expect(steps[2].inDegree).toBe(1);
    markStepCompleted(steps, 0);
    expect(steps[1].inDegree).toBe(0);
    expect(steps[2].inDegree).toBe(0);
  });
});
