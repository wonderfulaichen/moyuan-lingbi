/**
 * MemoryAgent 单元测试
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeMemoryAgent } from './MemoryAgent';
import * as StepRunner from '../internal/StepRunner';

vi.mock('../internal/StepRunner', () => ({
  executeStep: vi.fn(),
}));

describe('MemoryAgent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(StepRunner.executeStep).mockResolvedValue({
      success: true,
      content: '## 记忆摘要\n- 角色：主角...',
      error: undefined,
    });
  });

  it('extract 操作应执行成功', async () => {
    const result = await executeMemoryAgent({
      action: 'extract',
      content: '主角林风，二十岁，拥有影遁能力。',
    });
    expect((result as any).success).toBe(true);
  });

  it('check 操作应校验一致性', async () => {
    const result = await executeMemoryAgent({
      action: 'check',
      content: '主角名叫林风。',
      existingMemory: '主角名叫林雨。',
    });
    expect((result as any).success).toBe(true);
    const agentInput = vi.mocked(StepRunner.executeStep).mock.calls[0][1];
    const content = agentInput.context.relevantMemory[0].content;
    expect(content).toContain('check');
    expect(content).toContain('林雨');
  });

  it('merge 操作应合并记忆', async () => {
    await executeMemoryAgent({
      action: 'merge',
      content: '新增角色：老村长，知情人。',
      existingMemory: '已有角色：主角林风',
    });
    const agentInput = vi.mocked(StepRunner.executeStep).mock.calls[0][1];
    const content = agentInput.context.relevantMemory[0].content;
    expect(content).toContain('merge');
  });

  it('无效输入应返回错误', async () => {
    const result = await executeMemoryAgent({} as any);
    expect((result as any).success).toBe(false);
  });

  it('空内容应返回错误', async () => {
    const result = await executeMemoryAgent({ action: 'extract', content: '' });
    expect((result as any).success).toBe(false);
  });
});
