/**
 * ResearcherAgent 单元测试
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeResearcherAgent } from './ResearcherAgent';
import * as StepRunner from '../internal/StepRunner';

vi.mock('../internal/StepRunner', () => ({
  executeStep: vi.fn(),
}));

describe('ResearcherAgent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(StepRunner.executeStep).mockResolvedValue({
      success: true,
      content: '根据已有设定资料...',
      error: undefined,
    });
  });

  it('应成功执行资料查询', async () => {
    const result = await executeResearcherAgent({
      query: '主角的武器是什么？',
    });
    expect((result as any).success).toBe(true);
    expect(StepRunner.executeStep).toHaveBeenCalledWith(
      'agent-sub-researcher',
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
  });

  it('空查询应返回错误', async () => {
    const result = await executeResearcherAgent({ query: '' });
    expect((result as any).success).toBe(false);
  });

  it('应传递已有资料作为引用', async () => {
    await executeResearcherAgent({
      query: '世界观设定中魔法体系的规则',
      existingMaterials: ['魔法有五种属性', '魔法需要消耗精神力'],
      scope: 'world',
    });
    const agentInput = vi.mocked(StepRunner.executeStep).mock.calls[0][1];
    const content = agentInput.context.relevantMemory[0].content;
    expect(content).toContain('五种属性');
    expect(content).toContain('world');
  });
});
