/**
 * AgentRuntime 集成测试
 *
 * 测试目标：
 * - execute() 正常执行链路
 * - execute() 空计划校验
 * - execute() 防重入检查
 * - execute() 步骤失败处理
 * - cancel() 取消正在执行的计划
 * - 生命周期事件
 * - 快照管理
 * - 多步骤执行
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { AgentExecutionPlan, AgentOutput, AgentInput } from './types';
import type { ExecutableStep } from './types';

// ============================================================
// Mock 工厂 — 使用 vi.hoisted 确保在 vi.mock 之前初始化
// ============================================================

const { mockStepMemory, mockExecuteStep, mockResolveExecutionOrder, mockMarkStepCompleted } = vi.hoisted(
  () => ({
    mockStepMemory: {
      createChain: vi.fn(),
      createStep: vi.fn(),
      addStepToChain: vi.fn(),
      updateStepStatus: vi.fn(),
      completeStep: vi.fn(),
      addFragment: vi.fn(),
      getChainStatus: vi.fn(),
    },

    mockExecuteStep: vi.fn(),

    mockResolveExecutionOrder: vi.fn(),

    mockMarkStepCompleted: vi.fn(),
  }),
);

// ============================================================
// Mock 模块
// ============================================================

vi.mock('../step-memory/StepMemoryService', () => ({
  stepMemoryService: mockStepMemory,
}));

vi.mock('./internal/StepRunner', () => ({
  executeStep: mockExecuteStep,
  LLMTimeoutError: class LLMTimeoutError extends Error {
    constructor(msg?: string) { super(msg ?? 'LLM 请求超时'); this.name = 'LLMTimeoutError'; }
  },
  LLMRateLimitError: class LLMRateLimitError extends Error {
    constructor(msg?: string) { super(msg ?? 'LLM 请求被限流'); this.name = 'LLMRateLimitError'; }
  },
  LLMTemporaryError: class LLMTemporaryError extends Error {
    constructor(msg: string) { super(msg); this.name = 'LLMTemporaryError'; }
  },
}));

vi.mock('./internal/DependencyResolver', async () => {
  const actual = await vi.importActual('./internal/DependencyResolver');
  return {
    ...(actual as object),
    resolveExecutionOrder: mockResolveExecutionOrder,
    markStepCompleted: mockMarkStepCompleted,
  };
});

// ============================================================
// Imports (after mocks)
// ============================================================

import { AgentRuntime, createAgentRuntime } from './AgentRuntime';

// ============================================================
// Helpers
// ============================================================

function createTestInput(stepId: string, userRequest: string): AgentInput {
  return {
    stepId,
    userRequest,
    context: {
      projectState: { title: '测试小说', currentChapter: null, totalChapters: 10, lastModified: Date.now() },
      relevantMemory: [],
      activeSteps: [],
      userPreferences: { writingStyle: 'default', checkStrictness: 'normal', autoSave: true },
    },
    messages: [],
  };
}

function makeExecutableStep(index: number, name: string, dependsOn: number[] = []): ExecutableStep {
  return {
    index,
    agentId: 'agent-general',
    name,
    input: createTestInput(`step-${index}`, name),
    dependsOn,
    dependedBy: [],
    inDegree: dependsOn.length,
  };
}

function createMockAgentOutput(overrides: Partial<AgentOutput> = {}): AgentOutput {
  return {
    content: '测试输出内容',
    modifiedFileIds: [],
    memoryUpdates: [],
    suggestedNextSteps: [],
    status: 'completed',
    summary: '测试完成',
    ...overrides,
  };
}

// ============================================================
// Test Suite
// ============================================================

describe('AgentRuntime', () => {
  let runtime: AgentRuntime;

  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock implementations
    mockStepMemory.createChain.mockResolvedValue({ id: 'chain-1', name: 'test-chain', status: 'pending' });
    mockStepMemory.createStep.mockResolvedValue({ id: 'step-created-1' });
    mockStepMemory.addStepToChain.mockResolvedValue(undefined);
    mockStepMemory.updateStepStatus.mockResolvedValue(undefined);
    mockStepMemory.completeStep.mockResolvedValue(undefined);
    mockStepMemory.addFragment.mockResolvedValue('frag-1');
    mockStepMemory.getChainStatus.mockResolvedValue('completed');

    mockExecuteStep.mockResolvedValue(createMockAgentOutput());

    runtime = new AgentRuntime({ projectId: 'proj-1' });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ================================================================
  // 构造函数
  // ================================================================

  describe('构造函数', () => {
    it('应使用默认选项填充缺失值', () => {
      const r = new AgentRuntime({ projectId: 'proj-1' });
      expect(r.getStatus()).toBe('idle');
    });

    it('应接受自定义选项', () => {
      const r = new AgentRuntime({
        projectId: 'proj-1',
        snapshotIntervalMs: 1000,
        retryBaseDelayMs: 2000,
        autoWriteMemory: false,
        serialExecution: false,
      });
      expect(r.getStatus()).toBe('idle');
    });
  });

  // ================================================================
  // execute() - 核心执行
  // ================================================================

  describe('execute()', () => {
    it('应成功执行单步计划', async () => {
      mockResolveExecutionOrder.mockReturnValue([makeExecutableStep(0, '第一步')]);

      const result = await runtime.execute({
        chainId: 'test-chain',
        steps: [{ agentId: 'agent-general', input: createTestInput('step-0', '第一步'), dependsOn: [] }],
      });

      // 验证 StepMemory 调用链路
      expect(mockStepMemory.createChain).toHaveBeenCalledWith('proj-1', expect.any(Object));
      expect(mockStepMemory.createStep).toHaveBeenCalledWith('proj-1', expect.any(Object));
      expect(mockStepMemory.addStepToChain).toHaveBeenCalled();
      expect(mockStepMemory.updateStepStatus).toHaveBeenCalledWith('proj-1', 'step-created-1', 'running');
      expect(mockExecuteStep).toHaveBeenCalledWith('agent-general', expect.any(Object), expect.any(Object), 1000);
      expect(mockStepMemory.completeStep).toHaveBeenCalled();

      expect(result.status).toBe('completed');
      expect(result.completedSteps).toHaveLength(1);
      expect(result.totalSteps).toBe(1);
      expect(result.chainId).toBe('chain-1');
    });

    it('空 plan 应抛出错误', async () => {
      await expect(runtime.execute({ chainId: 'test', steps: [] })).rejects.toThrow('执行计划不能为空');
    });

    it('缺少 agentId 应抛出错误', async () => {
      await expect(runtime.execute({
        chainId: 'test',
        steps: [{ agentId: '', input: createTestInput('step-0', '测试'), dependsOn: [] }],
      })).rejects.toThrow('缺少 agentId');
    });

    it('缺少 userRequest 应抛出错误', async () => {
      const input = createTestInput('step-0', '测试');
      await expect(runtime.execute({
        chainId: 'test',
        steps: [{
          agentId: 'agent-general',
          input: { ...input, userRequest: '' },
          dependsOn: [],
        }],
      })).rejects.toThrow('缺少 userRequest');
    });

    it('链式多步骤应按顺序执行', async () => {
      const step0 = makeExecutableStep(0, '第一步');
      const step1 = makeExecutableStep(1, '第二步', [0]);
      step0.dependedBy = [1];
      mockResolveExecutionOrder.mockReturnValue([step0, step1]);

      mockStepMemory.createStep
        .mockResolvedValueOnce({ id: 'step-created-1' })
        .mockResolvedValueOnce({ id: 'step-created-2' });

      const result = await runtime.execute({
        chainId: 'test-chain',
        steps: [
          { agentId: 'agent-general', input: createTestInput('step-0', '第一步'), dependsOn: [] },
          { agentId: 'agent-general', input: createTestInput('step-1', '第二步'), dependsOn: ['step-0'] },
        ],
      });

      expect(result.status).toBe('completed');
      expect(result.completedSteps).toHaveLength(2);
      expect(mockExecuteStep).toHaveBeenCalledTimes(2);
    });

    it('步骤失败应导致整个执行失败', async () => {
      mockResolveExecutionOrder.mockReturnValue([makeExecutableStep(0, '第一步')]);
      mockExecuteStep.mockRejectedValue(new Error('LLM 调用失败'));

      const result = await runtime.execute({
        chainId: 'test',
        steps: [{ agentId: 'agent-general', input: createTestInput('step-0', '第一步'), dependsOn: [] }],
      });

      expect(result.status).toBe('failed');
      expect(result.failedSteps).toHaveLength(1);
      expect(result.failedSteps[0].error).toBe('LLM 调用失败');
      expect(mockStepMemory.updateStepStatus).toHaveBeenCalledWith('proj-1', 'step-created-1', 'failed', 'LLM 调用失败');
    });

    it('createChain 返回 null 时仍应继续执行', async () => {
      mockStepMemory.createChain.mockResolvedValue(null);
      mockResolveExecutionOrder.mockReturnValue([makeExecutableStep(0, '第一步')]);

      const result = await runtime.execute({
        chainId: 'test',
        steps: [{ agentId: 'agent-general', input: createTestInput('step-0', '测试'), dependsOn: [] }],
      });

      expect(result.status).toBe('completed');
      expect(result.chainId).toBe('');
    });
  });

  // ================================================================
  // cancel()
  // ================================================================

  describe('cancel()', () => {
    it('未运行时调用 cancel 应无操作', async () => {
      await runtime.cancel();
      expect(mockStepMemory.updateStepStatus).not.toHaveBeenCalled();
    });

    it('应取消正在执行的计划并返回 cancelled 状态', async () => {
      mockResolveExecutionOrder.mockReturnValue([makeExecutableStep(0, '第一步')]);

      // 创建一个可控且能感知取消信号的 executeStep mock
      mockExecuteStep.mockImplementation((_agentId, _input, token) => {
        return new Promise((_resolve, reject) => {
          // 注册取消回调：cancel 发生时 reject
          token.onCancelled(() => {
            reject(Object.assign(new Error('操作已被取消'), { name: 'CancelledError' }));
          });
        });
      });

      const execPromise = runtime.execute({
        chainId: 'test',
        steps: [{ agentId: 'agent-general', input: createTestInput('step-0', '测试'), dependsOn: [] }],
      });

      // 等待 executeStep mock 被调用
      await vi.waitFor(() => expect(mockExecuteStep).toHaveBeenCalled(), { timeout: 3000, interval: 10 });

      await runtime.cancel();
      const result = await execPromise;

      expect(result.status).toBe('cancelled');
    });
  });

  // ================================================================
  // 事件系统
  // ================================================================

  describe('事件系统', () => {
    it('应触发 stepStart 事件', async () => {
      mockResolveExecutionOrder.mockReturnValue([makeExecutableStep(0, '第一步')]);
      const onStepStart = vi.fn();
      runtime.onStepStart(onStepStart);

      await runtime.execute({
        chainId: 'test',
        steps: [{ agentId: 'agent-general', input: createTestInput('step-0', '第一步'), dependsOn: [] }],
      });

      expect(onStepStart).toHaveBeenCalledTimes(1);
      expect(onStepStart.mock.calls[0][0].stepName).toBe('第一步');
      expect(onStepStart.mock.calls[0][0].status).toBe('running');
    });

    it('应触发 stepComplete 事件', async () => {
      mockResolveExecutionOrder.mockReturnValue([makeExecutableStep(0, '第一步')]);
      const onStepComplete = vi.fn();
      runtime.onStepComplete(onStepComplete);

      await runtime.execute({
        chainId: 'test',
        steps: [{ agentId: 'agent-general', input: createTestInput('step-0', '测试'), dependsOn: [] }],
      });

      expect(onStepComplete).toHaveBeenCalledTimes(1);
      expect(onStepComplete.mock.calls[0][0].status).toBe('completed');
    });

    it('应触发 stepFail 事件', async () => {
      mockResolveExecutionOrder.mockReturnValue([makeExecutableStep(0, '第一步')]);
      mockExecuteStep.mockRejectedValue(new Error('执行错误'));
      const onStepFail = vi.fn();

      runtime.onStepFail(onStepFail);
      await runtime.execute({
        chainId: 'test',
        steps: [{ agentId: 'agent-general', input: createTestInput('step-0', '测试'), dependsOn: [] }],
      });

      expect(onStepFail).toHaveBeenCalled();
      expect(onStepFail.mock.calls[0][0].error).toContain('执行错误');
    });

    it('应触发 statusChange 事件', async () => {
      mockResolveExecutionOrder.mockReturnValue([makeExecutableStep(0, '第一步')]);
      const onStatusChange = vi.fn();
      runtime.onStatusChange(onStatusChange);

      await runtime.execute({
        chainId: 'test',
        steps: [{ agentId: 'agent-general', input: createTestInput('step-0', '测试'), dependsOn: [] }],
      });

      const statuses = onStatusChange.mock.calls.map((c: unknown[]) => c[0]);
      expect(statuses).toContain('running');
      expect(statuses).toContain('completed');
    });

    it('应触发 progress 事件', async () => {
      mockResolveExecutionOrder.mockReturnValue([makeExecutableStep(0, '第一步')]);
      const onProgress = vi.fn();
      runtime.onProgress(onProgress);

      await runtime.execute({
        chainId: 'test',
        steps: [{ agentId: 'agent-general', input: createTestInput('step-0', '测试'), dependsOn: [] }],
      });

      expect(onProgress).toHaveBeenCalled();
    });
  });

  // ================================================================
  // 快照管理
  // ================================================================

  describe('快照管理', () => {
    it('getStatus 应返回当前状态', () => {
      expect(runtime.getStatus()).toBe('idle');
    });

    it('getResult 应在未执行时返回 null', () => {
      expect(runtime.getResult()).toBeNull();
    });

    it('getSnapshot 应返回当前快照信息', async () => {
      mockResolveExecutionOrder.mockReturnValue([makeExecutableStep(0, '第一步')]);

      await runtime.execute({
        chainId: 'test',
        steps: [{ agentId: 'agent-general', input: createTestInput('step-0', '测试'), dependsOn: [] }],
      });

      const snapshot = runtime.getSnapshot();
      expect(snapshot.status).toBe('completed');
      expect(snapshot.completedSteps).toBe(1);
      expect(snapshot.totalSteps).toBe(1);
    });

    it('getResult 应返回完整结果', async () => {
      mockResolveExecutionOrder.mockReturnValue([makeExecutableStep(0, '第一步')]);

      await runtime.execute({
        chainId: 'test',
        steps: [{ agentId: 'agent-general', input: createTestInput('step-0', '测试'), dependsOn: [] }],
      });

      const result = runtime.getResult();
      expect(result).not.toBeNull();
      expect(result!.status).toBe('completed');
      expect(result!.summary).toContain('执行完成');
    });
  });

  // ================================================================
  // autoWriteMemory
  // ================================================================

  describe('autoWriteMemory', () => {
    it('启用时（默认）应写入 memoryUpdates', async () => {
      mockResolveExecutionOrder.mockReturnValue([makeExecutableStep(0, '第一步')]);
      mockExecuteStep.mockResolvedValue(createMockAgentOutput({
        memoryUpdates: [
          { type: 'character', content: '角色记忆', sourceFileId: null },
        ],
      }));

      await runtime.execute({
        chainId: 'test',
        steps: [{ agentId: 'agent-general', input: createTestInput('step-0', '测试'), dependsOn: [] }],
      });

      expect(mockStepMemory.addFragment).toHaveBeenCalledWith('proj-1', {
        type: 'character',
        content: '角色记忆',
        sourceFileId: null,
      });
    });

    it('禁用时不应写入 memoryUpdates', async () => {
      const runtimeNoMem = new AgentRuntime({ projectId: 'proj-1', autoWriteMemory: false });
      mockResolveExecutionOrder.mockReturnValue([makeExecutableStep(0, '第一步')]);
      mockExecuteStep.mockResolvedValue(createMockAgentOutput({
        memoryUpdates: [
          { type: 'character', content: '角色记忆', sourceFileId: null },
        ],
      }));

      await runtimeNoMem.execute({
        chainId: 'test',
        steps: [{ agentId: 'agent-general', input: createTestInput('step-0', '测试'), dependsOn: [] }],
      });

      expect(mockStepMemory.addFragment).not.toHaveBeenCalled();
    });

    it('memoryUpdates 为空时不应调用 addFragment', async () => {
      mockResolveExecutionOrder.mockReturnValue([makeExecutableStep(0, '第一步')]);
      mockExecuteStep.mockResolvedValue(createMockAgentOutput({ memoryUpdates: [] }));

      await runtime.execute({
        chainId: 'test',
        steps: [{ agentId: 'agent-general', input: createTestInput('step-0', '测试'), dependsOn: [] }],
      });

      expect(mockStepMemory.addFragment).not.toHaveBeenCalled();
    });
  });

  // ================================================================
  // createAgentRuntime 工厂函数
  // ================================================================

  describe('createAgentRuntime', () => {
    it('应创建 AgentRuntime 实例', () => {
      const r = createAgentRuntime({ projectId: 'proj-1' });
      expect(r).toBeInstanceOf(AgentRuntime);
      expect(r.getStatus()).toBe('idle');
    });
  });
});
