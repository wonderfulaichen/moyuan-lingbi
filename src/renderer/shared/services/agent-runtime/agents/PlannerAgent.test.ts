/**
 * PlannerAgent 单元测试
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executePlannerAgent } from './PlannerAgent';
import * as StepRunner from '../internal/StepRunner';

vi.mock('../internal/StepRunner', () => ({
  executeStep: vi.fn(),
}));

describe('PlannerAgent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(StepRunner.executeStep).mockResolvedValue({
      success: true,
      content: '## 第1章\n黎明之城\n场景：...',
      error: undefined,
    });
  });

  it('应成功执行大纲规划', async () => {
    const result = await executePlannerAgent({
      outline: '主角从村庄出发，经历冒险成为英雄。',
      chapterCount: 3,
    });
    expect((result as any).success).toBe(true);
    expect(StepRunner.executeStep).toHaveBeenCalledWith(
      'agent-sub-planner',
      expect.objectContaining({
        task: 'outline',
        context: expect.objectContaining({
          currentStep: 'planner',
        }),
      }),
      expect.anything(),
      expect.anything(),
    );
  });

  it('空大纲应返回错误', async () => {
    const result = await executePlannerAgent({ outline: '' });
    expect((result as any).success).toBe(false);
    expect((result as any).error).toContain('outline');
  });

  it('缺失 outline 应返回错误', async () => {
    const result = await executePlannerAgent({} as any);
    expect((result as any).success).toBe(false);
  });

  it('应传递可选参数', async () => {
    await executePlannerAgent({
      outline: '测试大纲',
      worldSettings: '魔幻世界',
      characterProfiles: '英雄、反派',
      targetWordCount: 4000,
      chapterCount: 10,
    });
    const agentInput = vi.mocked(StepRunner.executeStep).mock.calls[0][1];
    const content = agentInput.context.relevantMemory[0].content;
    expect(content).toContain('10 个章节');
    expect(content).toContain('魔幻世界');
  });
});
