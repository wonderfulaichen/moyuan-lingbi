/**
 * RevisorAgent 单元测试
 *
 * 测试范围：
 * - executeRevisorAgent() 输入校验
 * - executeRevisorAgent() 委托给 WriterAgent
 * - executeRevisorAgent() prompt 组装
 * - executeRevisorAgent() 取消支持
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AgentOutput } from '../types';

// ============================================================
// Mock — 完全 mock WriterAgent，验证委托逻辑
// ============================================================

const mockExecuteWriter = vi.hoisted(() => vi.fn());

vi.mock('./WriterAgent', () => ({
  executeWriterAgent: mockExecuteWriter,
}));

// ============================================================
// SUT
// ============================================================

import { executeRevisorAgent } from './RevisorAgent';
import type { RevisorInput } from './RevisorAgent';
import { CancellationToken } from '../internal/CancellationToken';

// ============================================================
// Factory
// ============================================================

function makeValidInput(overrides: Partial<RevisorInput> = {}): RevisorInput {
  return {
    chapterDraft: '## 第5章 — 迷雾之森\n\n正文内容...',
    auditReport: '## 审校报告\n\n### 总体评分\n- 综合得分：6.5/10\n\n### ⚠️ 必须修复\n1. 主角性格前后矛盾...',
    ...overrides,
  };
}

function makeAgentOutput(overrides: Partial<AgentOutput> = {}): AgentOutput {
  return {
    content: '## 第5章 — 迷雾之森（修订版）\n\n修订后正文...',
    modifiedFileIds: [],
    memoryUpdates: [],
    suggestedNextSteps: [],
    status: 'completed',
    summary: '修订完成',
    ...overrides,
  };
}

// ============================================================
// Tests
// ============================================================

describe('RevisorAgent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExecuteWriter.mockResolvedValue(makeAgentOutput());
  });

  // ----------------------------------------------------------
  // 输入校验
  // ----------------------------------------------------------

  describe('输入校验', () => {
    it('章节草稿为空时应抛出错误', async () => {
      await expect(
        executeRevisorAgent({ chapterDraft: '', auditReport: '报告...' }),
      ).rejects.toThrow('[RevisorAgent] 章节草稿不能为空');
    });

    it('审校报告为空时应抛出错误', async () => {
      await expect(
        executeRevisorAgent({ chapterDraft: '正文...', auditReport: '' }),
      ).rejects.toThrow('[RevisorAgent] 审校报告不能为空');
    });

    it('有效的完整输入应成功执行', async () => {
      const result = await executeRevisorAgent(makeValidInput());
      expect(result.status).toBe('completed');
    });
  });

  // ----------------------------------------------------------
  // 委托给 WriterAgent
  // ----------------------------------------------------------

  describe('委托 WriterAgent', () => {
    it('应调用 executeWriterAgent', async () => {
      await executeRevisorAgent(makeValidInput());
      expect(mockExecuteWriter).toHaveBeenCalledTimes(1);
    });

    it('输入的 userRequest 应包含审校报告内容', async () => {
      const auditReport = '### 必须修复\n1. 节奏拖沓';
      await executeRevisorAgent(makeValidInput({ auditReport }));

      const writerInput = mockExecuteWriter.mock.calls[0][0];
      expect(writerInput.userRequest).toContain(auditReport);
    });

    it('输入的 userRequest 应包含原文', async () => {
      const draft = '## 第5章 正文...';
      await executeRevisorAgent(makeValidInput({ chapterDraft: draft }));

      const writerInput = mockExecuteWriter.mock.calls[0][0];
      expect(writerInput.userRequest).toContain(draft);
    });

    it('修订原则应包含在 userRequest 中', async () => {
      await executeRevisorAgent(makeValidInput());

      const writerInput = mockExecuteWriter.mock.calls[0][0];
      expect(writerInput.userRequest).toContain('保留原文的优秀部分');
      expect(writerInput.userRequest).toContain('输出修订后的完整章节全文');
    });

    it('应透传 projectContext 和 characterContext', async () => {
      const projCtx = '魔法纪元1375年';
      const charCtx = '主角受伤状态';
      await executeRevisorAgent(
        makeValidInput({ projectContext: projCtx, characterContext: charCtx }),
      );

      const writerInput = mockExecuteWriter.mock.calls[0][0];
      expect(writerInput.projectContext).toBe(projCtx);
      expect(writerInput.characterContext).toBe(charCtx);
    });

    it('styleGuide 应追加修订说明', async () => {
      const style = '文风类似金庸';
      await executeRevisorAgent(makeValidInput({ styleGuide: style }));

      const writerInput = mockExecuteWriter.mock.calls[0][0];
      expect(writerInput.styleGuide).toContain(style);
      expect(writerInput.styleGuide).toContain('保留原文精华');
    });

    it('targetWords 应为 0（不限制字数）', async () => {
      await executeRevisorAgent(makeValidInput());

      const writerInput = mockExecuteWriter.mock.calls[0][0];
      expect(writerInput.targetWords).toBe(0);
    });
  });

  // ----------------------------------------------------------
  // 取消支持
  // ----------------------------------------------------------

  describe('取消支持', () => {
    it('传入 CancellationToken 应透传给 Writer', async () => {
      const token = new CancellationToken();
      await executeRevisorAgent(makeValidInput(), token);

      const ct = mockExecuteWriter.mock.calls[0][1];
      expect(ct).toBe(token);
    });

    it('不传 CancellationToken 应为 undefined', async () => {
      await executeRevisorAgent(makeValidInput());

      const ct = mockExecuteWriter.mock.calls[0][1];
      expect(ct).toBeUndefined();
    });
  });

  // ----------------------------------------------------------
  // 输出
  // ----------------------------------------------------------

  describe('输出', () => {
    it('应返回 WriterAgent 的输出', async () => {
      const expected = makeAgentOutput({
        content: '修订后第3章...',
        summary: '修订完成',
      });
      mockExecuteWriter.mockResolvedValue(expected);

      const result = await executeRevisorAgent(makeValidInput());
      expect(result).toEqual(expected);
    });
  });
});
