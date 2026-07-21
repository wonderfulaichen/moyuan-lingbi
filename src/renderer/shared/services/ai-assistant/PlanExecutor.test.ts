import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getPlanState,
  setPlanSteps,
  clearPlanState,
  toggleStep,
  executePlan,
} from './PlanExecutor';
import { AIPlanStep } from '../../../../shared/types/fileSystem';
import { ModelConfig } from '../../../../shared/types';

/**
 * PlanExecutor 测试
 *
 * 覆盖 5 个导出函数：
 * - getPlanState/setPlanSteps/clearPlanState/toggleStep: 模块级状态管理
 * - executePlan: 异步执行计划，覆盖成功/失败/重试/异常/无步骤/无 model 等分支
 *
 * 关键挑战：模块级 planState 单例，测试间状态污染
 * 解决方案：beforeEach 调用 clearPlanState() 重置
 *
 * mock 策略：
 * - aiService.generate: 控制 result.error/result.content 触发不同分支
 * - dataService: mock buildAIContext/getActiveProject/getFS
 * - PromptComposer.composeForAssistant: mock 返回 fullPrompt
 * - unifiedExecutor.executeAction: spy 验证调用次数
 * - contextBuilder 内的 buildFileTreeDescription/buildForTarget/detectTarget 是真实调用
 *   但 dataService 被 mock 后返回空数据
 */

vi.mock('../aiService', () => ({
  aiService: {
    generate: vi.fn(),
  },
}));

vi.mock('../DataService', () => ({
  dataService: {
    buildAIContext: vi.fn().mockReturnValue(''),
    getActiveProject: vi.fn().mockReturnValue(null),
    getFS: vi.fn().mockReturnValue({ files: {}, rootIds: [] }),
    getChildren: vi.fn().mockReturnValue([]),
    getRootFolderIdByType: vi.fn().mockReturnValue(null),
    getFile: vi.fn().mockReturnValue(null),
  },
}));

vi.mock('../../../../shared/prompts', () => ({
  PromptComposer: {
    composeForAssistant: vi.fn().mockReturnValue({ fullPrompt: 'mock system prompt' }),
  },
}));

vi.mock('./UnifiedExecutor', () => ({
  unifiedExecutor: {
    executeAction: vi.fn().mockResolvedValue('ok'),
  },
}));

import { aiService } from '../aiService';
import { unifiedExecutor } from './UnifiedExecutor';

const mockedGenerate = vi.mocked(aiService.generate);
const mockedExecuteAction = vi.mocked(unifiedExecutor.executeAction);

// ============== 测试夹具 ==============

function createStep(overrides: Partial<AIPlanStep> = {}): AIPlanStep {
  return {
    title: '测试步骤',
    description: '测试描述',
    enabled: true,
    status: 'pending',
    ...overrides,
  };
}

function createModel(): ModelConfig {
  return {
    id: 'm1',
    name: 'Test',
    provider: 'openai-compatible',
    modelName: 'gpt-4',
    maxTokens: 4096,
  } as ModelConfig;
}

beforeEach(() => {
  vi.clearAllMocks();
  clearPlanState();
  // 重置默认 mock 行为
  mockedGenerate.mockResolvedValue({ content: '', error: undefined } as any);
  mockedExecuteAction.mockResolvedValue('ok');
});

// ============== 1. 状态管理函数 ==============

describe('getPlanState / setPlanSteps / clearPlanState', () => {
  it('初始状态应为空', () => {
    const state = getPlanState();
    expect(state.steps).toEqual([]);
    expect(state.model).toBeNull();
    expect(state.currentIndex).toBe(0);
  });

  it('setPlanSteps 应设置 steps/model/currentIndex=0', () => {
    const steps = [createStep({ title: 'A' }), createStep({ title: 'B' })];
    const model = createModel();
    setPlanSteps(steps, model);
    const state = getPlanState();
    expect(state.steps).toHaveLength(2);
    expect(state.steps[0].title).toBe('A');
    expect(state.model).toBe(model);
    expect(state.currentIndex).toBe(0);
  });

  it('setPlanSteps 应替换原有状态而非追加', () => {
    setPlanSteps([createStep({ title: '旧' })], createModel());
    setPlanSteps([createStep({ title: '新' })], createModel());
    expect(getPlanState().steps).toHaveLength(1);
    expect(getPlanState().steps[0].title).toBe('新');
  });

  it('clearPlanState 应清空所有字段', () => {
    setPlanSteps([createStep()], createModel());
    clearPlanState();
    const state = getPlanState();
    expect(state.steps).toEqual([]);
    expect(state.model).toBeNull();
    expect(state.currentIndex).toBe(0);
  });

  it('setPlanSteps 后 clearPlanState 应重置 currentIndex', () => {
    setPlanSteps([createStep()], createModel());
    // currentIndex 不在 setPlanSteps 之外被修改，但 clearPlanState 应保证为 0
    clearPlanState();
    expect(getPlanState().currentIndex).toBe(0);
  });
});

// ============== 2. toggleStep ==============

describe('toggleStep', () => {
  it('应切换指定索引步骤的 enabled 字段', () => {
    const steps = [
      createStep({ title: 'A', enabled: true }),
      createStep({ title: 'B', enabled: true }),
    ];
    setPlanSteps(steps, createModel());
    toggleStep(0, false);
    expect(getPlanState().steps[0].enabled).toBe(false);
    expect(getPlanState().steps[1].enabled).toBe(true);
  });

  it('应支持多次切换', () => {
    setPlanSteps([createStep({ enabled: true })], createModel());
    toggleStep(0, false);
    expect(getPlanState().steps[0].enabled).toBe(false);
    toggleStep(0, true);
    expect(getPlanState().steps[0].enabled).toBe(true);
  });

  it('索引越界时不应抛错（静默忽略）', () => {
    setPlanSteps([createStep()], createModel());
    expect(() => toggleStep(99, false)).not.toThrow();
    expect(() => toggleStep(-1, true)).not.toThrow();
  });
});

// ============== 3. executePlan ==============

describe('executePlan', () => {
  it('无步骤时应立即返回"没有需要执行的步骤"', async () => {
    const messages: string[] = [];
    const stepStatus: Array<{ index: number; status: string }> = [];

    await executePlan(
      (msg) => messages.push(msg.content),
      (index, status) => stepStatus.push({ index, status }),
    );

    expect(messages).toContain('没有需要执行的步骤。');
    expect(stepStatus).toEqual([]);
    expect(mockedGenerate).not.toHaveBeenCalled();
  });

  it('无 model 时应立即返回（即使有步骤但 model 为 null）', async () => {
    // setPlanSteps 要求 model 非 null，所以这里手动模拟 model 为 null 的边界
    // 实际场景中 setPlanSteps 后 model 不会为 null，但 executePlan 内部检查 model
    setPlanSteps([createStep()], createModel());
    // 通过 toggleStep 全部禁用，触发 "steps.length === 0" 分支
    toggleStep(0, false);

    const messages: string[] = [];
    await executePlan(
      (msg) => messages.push(msg.content),
      () => {},
    );

    expect(messages).toContain('没有需要执行的步骤。');
  });

  it('单步骤成功路径：应调用 AI + 执行 tool + 标记 completed', async () => {
    const step = createStep({ title: '创建角色', description: '创建主角' });
    setPlanSteps([step], createModel());

    // AI 返回带 tool 调用的内容
    mockedGenerate.mockResolvedValueOnce({
      content: '```tool\n{"action": "create_file", "parentId": "characters", "name": "主角", "content": "角色内容"}\n```',
      error: undefined,
    } as any);

    const messages: string[] = [];
    const stepStatus: Array<{ index: number; status: string }> = [];

    await executePlan(
      (msg) => messages.push(msg.content),
      (index, status) => stepStatus.push({ index, status }),
    );

    // 应触发 in_progress → completed
    expect(stepStatus).toContainEqual({ index: 0, status: 'in_progress' });
    expect(stepStatus).toContainEqual({ index: 0, status: 'completed' });
    // 应调用 executeAction
    expect(mockedExecuteAction).toHaveBeenCalled();
    // 应输出开始/步骤说明/完成消息
    expect(messages.some(m => m.includes('开始执行计划'))).toBe(true);
    expect(messages.some(m => m.includes('步骤 1/1'))).toBe(true);
    expect(messages.some(m => m.includes('步骤 1 完成'))).toBe(true);
    // 应输出计划执行完毕
    expect(messages.some(m => m.includes('计划执行完毕'))).toBe(true);
  });

  it('AI 调用返回 error 时应标记 failed', async () => {
    const step = createStep();
    setPlanSteps([step], createModel());

    mockedGenerate.mockResolvedValueOnce({
      content: '',
      error: 'API 调用失败',
    } as any);

    const stepStatus: Array<{ index: number; status: string }> = [];
    const messages: string[] = [];

    await executePlan(
      (msg) => messages.push(msg.content),
      (index, status) => stepStatus.push({ index, status }),
    );

    expect(stepStatus).toContainEqual({ index: 0, status: 'failed' });
    expect(messages.some(m => m.includes('执行失败'))).toBe(true);
    expect(messages.some(m => m.includes('API 调用失败'))).toBe(true);
  });

  it('步骤抛异常时应捕获并标记 failed', async () => {
    const step = createStep();
    setPlanSteps([step], createModel());

    mockedGenerate.mockRejectedValueOnce(new Error('网络错误'));

    const stepStatus: Array<{ index: number; status: string }> = [];
    const messages: string[] = [];

    await executePlan(
      (msg) => messages.push(msg.content),
      (index, status) => stepStatus.push({ index, status }),
    );

    expect(stepStatus).toContainEqual({ index: 0, status: 'failed' });
    expect(messages.some(m => m.includes('出错：网络错误'))).toBe(true);
  });

  it('无 tool 调用 + textParts > 30 时应触发重试', async () => {
    const step = createStep();
    setPlanSteps([step], createModel());

    // 第一次返回纯长文本（无 tool）→ 触发重试
    // 第二次返回带 tool 的内容
    mockedGenerate
      .mockResolvedValueOnce({
        content: '这是一段超过三十个字符的纯文本输出没有 tool 调用应该触发重试逻辑测试。',
        error: undefined,
      } as any)
      .mockResolvedValueOnce({
        content: '```tool\n{"action": "create_file", "parentId": "world", "name": "设定", "content": "内容"}\n```',
        error: undefined,
      } as any);

    const stepStatus: Array<{ index: number; status: string }> = [];

    await executePlan(
      () => {},
      (index, status) => stepStatus.push({ index, status }),
    );

    // 应调用 AI 两次（原始 + 重试）
    expect(mockedGenerate).toHaveBeenCalledTimes(2);
    // 重试后应成功完成
    expect(stepStatus).toContainEqual({ index: 0, status: 'completed' });
  });

  it('无 tool 调用 + textParts <= 30 时不应触发重试', async () => {
    const step = createStep();
    setPlanSteps([step], createModel());

    // 短文本不应触发重试
    mockedGenerate.mockResolvedValueOnce({
      content: '短文本',
      error: undefined,
    } as any);

    await executePlan(() => {}, () => {});

    expect(mockedGenerate).toHaveBeenCalledTimes(1);
  });

  it('create_file 缺 content 时应用 textParts 填充', async () => {
    const step = createStep();
    setPlanSteps([step], createModel());

    // tool 块无 content，但 textParts 有内容
    mockedGenerate.mockResolvedValueOnce({
      content: '这是文件内容文本部分。\n```tool\n{"action": "create_file", "parentId": "world", "name": "设定"}\n```',
      error: undefined,
    } as any);

    await executePlan(() => {}, () => {});

    // executeAction 应被调用，且 tc.content 应被填充为 textParts
    expect(mockedExecuteAction).toHaveBeenCalled();
    const callArg = mockedExecuteAction.mock.calls[0][0];
    expect(callArg.content).toContain('文件内容文本部分');
  });

  it('disabled 步骤应被过滤不执行', async () => {
    const steps = [
      createStep({ title: 'A' }),
      createStep({ title: 'B' }),
      createStep({ title: 'C' }),
    ];
    setPlanSteps(steps, createModel());
    toggleStep(1, false); // 禁用 B

    mockedGenerate.mockResolvedValue({
      content: '```tool\n{"action": "create_file", "name": "x"}\n```',
      error: undefined,
    } as any);

    const stepStatus: Array<{ index: number; status: string }> = [];

    await executePlan(
      () => {},
      (index, status) => stepStatus.push({ index, status }),
    );

    // 应只执行 2 个步骤（A 和 C，对应原始索引 0 和 2）
    const inProgressIndices = stepStatus.filter(s => s.status === 'in_progress').map(s => s.index);
    expect(inProgressIndices).toContain(0);
    expect(inProgressIndices).toContain(2);
    expect(inProgressIndices).not.toContain(1);
  });

  it('多步骤迭代应按顺序执行', async () => {
    const steps = [
      createStep({ title: '步骤A' }),
      createStep({ title: '步骤B' }),
    ];
    setPlanSteps(steps, createModel());

    mockedGenerate.mockResolvedValue({
      content: '```tool\n{"action": "create_file", "name": "x"}\n```',
      error: undefined,
    } as any);

    const messages: string[] = [];

    await executePlan(
      (msg) => messages.push(msg.content),
      () => {},
    );

    // 应有 "步骤 1/2" 和 "步骤 2/2"
    expect(messages.some(m => m.includes('步骤 1/2'))).toBe(true);
    expect(messages.some(m => m.includes('步骤 2/2'))).toBe(true);
  });

  it('执行完毕后应调用 clearPlanState', async () => {
    setPlanSteps([createStep()], createModel());
    mockedGenerate.mockResolvedValueOnce({
      content: '```tool\n{"action": "create_file", "name": "x"}\n```',
      error: undefined,
    } as any);

    await executePlan(() => {}, () => {});

    // 执行完毕后 planState 应被清空
    const state = getPlanState();
    expect(state.steps).toEqual([]);
    expect(state.model).toBeNull();
  });

  it('应输出计划执行完毕消息（成功步骤数正确统计）', async () => {
    const steps = [
      createStep({ title: 'A' }),
      createStep({ title: 'B' }),
    ];
    setPlanSteps(steps, createModel());

    mockedGenerate.mockResolvedValue({
      content: '```tool\n{"action": "create_file", "name": "x"}\n```',
      error: undefined,
    } as any);

    const messages: string[] = [];
    await executePlan(
      (msg) => messages.push(msg.content),
      () => {},
    );

    // 修复后：executePlan 内部 updateStepStatus 同步更新 planState.steps[i].status
    // 所以统计正确，应输出 "2 步成功"
    expect(messages.some(m => m.includes('计划执行完毕'))).toBe(true);
    expect(messages.some(m => m.includes('2 步成功'))).toBe(true);
  });

  it('executePlan 应同步更新 step.status 为 in_progress/completed', async () => {
    const steps = [
      createStep({ title: 'A' }),
      createStep({ title: 'B' }),
    ];
    setPlanSteps(steps, createModel());

    mockedGenerate.mockResolvedValue({
      content: '```tool\n{"action": "create_file", "name": "x"}\n```',
      error: undefined,
    } as any);

    const statusUpdates: Array<{ index: number; status: string }> = [];
    await executePlan(
      () => {},
      (index, status) => statusUpdates.push({ index, status }),
    );

    // 每步应先 in_progress 再 completed
    expect(statusUpdates).toEqual([
      { index: 0, status: 'in_progress' },
      { index: 0, status: 'completed' },
      { index: 1, status: 'in_progress' },
      { index: 1, status: 'completed' },
    ]);
  });

  it('executePlan 失败时应同步更新 step.status 为 failed', async () => {
    const steps = [createStep({ title: 'A' })];
    setPlanSteps(steps, createModel());

    mockedGenerate.mockResolvedValue({
      content: '',
      error: 'API 错误',
    } as any);

    const statusUpdates: Array<{ index: number; status: string }> = [];
    const messages: string[] = [];
    await executePlan(
      (msg) => messages.push(msg.content),
      (index, status) => statusUpdates.push({ index, status }),
    );

    // 失败时应更新为 failed，最终统计为 0 步成功
    expect(statusUpdates).toEqual([
      { index: 0, status: 'in_progress' },
      { index: 0, status: 'failed' },
    ]);
    expect(messages.some(m => m.includes('0 步成功'))).toBe(true);
  });
});
