/**
 * AuditorAgent 单元测试
 *
 * 测试范围：
 * - executeAuditorAgent() 输入校验
 * - executeAuditorAgent() prompt 组装
 * - executeAuditorAgent() 严格程度参数
 * - executeAuditorAgent() 上下文注入
 * - executeAuditorAgent() 取消支持
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AgentOutput } from '../types';

// ============================================================
// Mock
// ============================================================

const mockExecuteStep = vi.hoisted(() => vi.fn());

vi.mock('../internal/StepRunner', () => ({
  executeStep: mockExecuteStep,
}));

// ============================================================
// SUT
// ============================================================

import { executeAuditorAgent } from './AuditorAgent';
import type { AuditorInput } from './AuditorAgent';
import { CancellationToken } from '../internal/CancellationToken';

// ============================================================
// Factory
// ============================================================

function makeValidInput(overrides: Partial<AuditorInput> = {}): AuditorInput {
  return {
    chapterDraft: '## 第5章 — 迷雾之森\n\n正文内容...',
    chapterOutline: '主角穿越迷雾森林，遭遇暗影狼群，在战斗中觉醒新能力。',
    ...overrides,
  };
}

function makeAgentOutput(overrides: Partial<AgentOutput> = {}): AgentOutput {
  return {
    content: '## 审校报告\n\n### 总体评分\n- **综合得分**：7.5 / 10',
    modifiedFileIds: [],
    memoryUpdates: [],
    suggestedNextSteps: [],
    status: 'completed',
    summary: '审校完成',
    ...overrides,
  };
}

// ============================================================
// Tests
// ============================================================

describe('AuditorAgent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExecuteStep.mockResolvedValue(makeAgentOutput());
  });

  // ----------------------------------------------------------
  // 输入校验
  // ----------------------------------------------------------

  describe('输入校验', () => {
    it('章节正文为空时应抛出错误', async () => {
      await expect(
        executeAuditorAgent({ chapterDraft: '' }),
      ).rejects.toThrow('[AuditorAgent] 章节正文不能为空');
    });

    it('章节正文为纯空白时应抛出错误', async () => {
      await expect(
        executeAuditorAgent({ chapterDraft: '   ' }),
      ).rejects.toThrow('[AuditorAgent] 章节正文不能为空');
    });

    it('有效的完整输入应成功执行', async () => {
      const result = await executeAuditorAgent(makeValidInput());
      expect(result.status).toBe('completed');
    });
  });

  // ----------------------------------------------------------
  // Prompt 组装
  // ----------------------------------------------------------

  describe('prompt 组装', () => {
    it('应将章节正文包含在 userRequest 中', async () => {
      const draft = '第10章：决战时刻\n\n正文内容...';
      await executeAuditorAgent(makeValidInput({ chapterDraft: draft }));

      const agentInput = mockExecuteStep.mock.calls[0][1];
      expect(agentInput.userRequest).toContain(draft);
    });

    it('默认严格程度应为 normal', async () => {
      await executeAuditorAgent(makeValidInput());

      const agentInput = mockExecuteStep.mock.calls[0][1];
      expect(agentInput.options.strictness).toBe('normal');
    });

    it('strict 严格程度应生效', async () => {
      await executeAuditorAgent(makeValidInput({ strictness: 'strict' }));

      const agentInput = mockExecuteStep.mock.calls[0][1];
      expect(agentInput.options.strictness).toBe('strict');
    });
  });

  // ----------------------------------------------------------
  // 上下文注入
  // ----------------------------------------------------------

  describe('上下文注入', () => {
    it('projectContext 应放入 relevantMemory', async () => {
      const ctx = '世界观：魔法纪元1375年...';
      await executeAuditorAgent(makeValidInput({ projectContext: ctx }));

      const agentInput = mockExecuteStep.mock.calls[0][1];
      const mem = agentInput.context.relevantMemory.find(
        (m: { type: string }) => m.type === 'context',
      );
      expect(mem).toBeDefined();
      expect(mem.content).toBe(ctx);
    });

    it('chapterOutline 应放入 relevantMemory', async () => {
      const outline = '第5章大纲：穿越森林...';
      await executeAuditorAgent(makeValidInput({ chapterOutline: outline }));

      const agentInput = mockExecuteStep.mock.calls[0][1];
      expect(agentInput.userRequest).not.toContain(outline);
      // outline 放在了 relevantMemory 中，不是 userRequest
      // outline 是唯一 context 条目，类型为 'context'
      expect(agentInput.context.relevantMemory.length).toBeGreaterThan(0);
      const mem = agentInput.context.relevantMemory.find(
        (m: { type: string }) => (m as any).content.includes(outline),
      );
      expect(mem).toBeDefined();
    });
  });

  // ----------------------------------------------------------
  // 调用参数
  // ----------------------------------------------------------

  describe('调用参数', () => {
    it('应使用 agentId "agent-sub-reviewer" 调用 executeStep', async () => {
      await executeAuditorAgent(makeValidInput());

      const agentId = mockExecuteStep.mock.calls[0][0];
      expect(agentId).toBe('agent-sub-reviewer');
    });
  });

  // ----------------------------------------------------------
  // 取消支持
  // ----------------------------------------------------------

  describe('取消支持', () => {
    it('传入 CancellationToken 应透传', async () => {
      const token = new CancellationToken();
      await executeAuditorAgent(makeValidInput(), token);

      const ct = mockExecuteStep.mock.calls[0][2];
      expect(ct).toBe(token);
    });

    it('不传 CancellationToken 应自动创建', async () => {
      await executeAuditorAgent(makeValidInput());

      const ct = mockExecuteStep.mock.calls[0][2];
      expect(ct).toBeInstanceOf(CancellationToken);
    });
  });

  // ----------------------------------------------------------
  // 输出
  // ----------------------------------------------------------

  describe('输出', () => {
    it('应返回 executeStep 的输出', async () => {
      const expected = makeAgentOutput({ summary: '审校完成' });
      mockExecuteStep.mockResolvedValue(expected);

      const result = await executeAuditorAgent(makeValidInput());
      expect(result).toEqual(expected);
    });
  });
});
