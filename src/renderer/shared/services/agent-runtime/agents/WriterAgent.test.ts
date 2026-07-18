/**
 * WriterAgent 单元测试
 *
 * 测试范围：
 * - executeWriterAgent() 输入校验
 * - executeWriterAgent() prompt 组装
 * - executeWriterAgent() 通过 executeStep 调用 LLM
 * - executeWriterAgent() 取消支持
 * - executeWriterAgent() 各种字段组合
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

import { executeWriterAgent } from './WriterAgent';
import type { WriterInput } from './WriterAgent';
import { CancellationToken } from '../internal/CancellationToken';

// ============================================================
// Factory
// ============================================================

function makeValidInput(overrides: Partial<WriterInput> = {}): WriterInput {
  return {
    chapterOutline: '第5章：主角穿越迷雾森林，遭遇暗影狼群，在战斗中觉醒新能力。',
    projectContext: '世界背景：魔法纪元1375年，人类王国边境森林。主角是逃亡中的见习法师。',
    ...overrides,
  };
}

function makeAgentOutput(overrides: Partial<AgentOutput> = {}): AgentOutput {
  return {
    content: '## 第5章 — 迷雾之森\n\n正文内容...\n\n### 章节信息\n- **字数**：3200 字',
    modifiedFileIds: [],
    memoryUpdates: [],
    suggestedNextSteps: [],
    status: 'completed',
    summary: '第5章创作完成',
    ...overrides,
  };
}

// ============================================================
// Tests
// ============================================================

describe('WriterAgent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExecuteStep.mockResolvedValue(makeAgentOutput());
  });

  // ----------------------------------------------------------
  // 输入校验
  // ----------------------------------------------------------

  describe('输入校验', () => {
    it('章节大纲为空时应抛出错误', async () => {
      await expect(
        executeWriterAgent({ chapterOutline: '' }),
      ).rejects.toThrow('[WriterAgent] 章节大纲不能为空');
    });

    it('章节大纲为纯空白时应抛出错误', async () => {
      await expect(
        executeWriterAgent({ chapterOutline: '   ' }),
      ).rejects.toThrow('[WriterAgent] 章节大纲不能为空');
    });

    it('有效的完整输入应成功执行', async () => {
      const result = await executeWriterAgent(makeValidInput());
      expect(result.status).toBe('completed');
    });
  });

  // ----------------------------------------------------------
  // prompt 组装
  // ----------------------------------------------------------

  describe('prompt 组装', () => {
    it('应将章节大纲包含在 userRequest 中', async () => {
      const outline = '第10章：决战时刻';
      await executeWriterAgent(makeValidInput({ chapterOutline: outline }));

      // 验证传入 executeStep 的 input.userRequest 包含大纲
      const agentInput = mockExecuteStep.mock.calls[0][1];
      expect(agentInput.userRequest).toContain(outline);
    });

    it('用户自定义指令应优先放在 userRequest 开头', async () => {
      const customRequest = '请侧重战斗描写，减少对话';
      await executeWriterAgent(
        makeValidInput({ userRequest: customRequest }),
      );

      const agentInput = mockExecuteStep.mock.calls[0][1];
      expect(agentInput.userRequest).toContain(customRequest);
    });

    it('styleGuide 应在 userRequest 中包含', async () => {
      const styleGuide = '文风类似金庸武侠，多一些心理描写';
      await executeWriterAgent(makeValidInput({ styleGuide }));

      const agentInput = mockExecuteStep.mock.calls[0][1];
      expect(agentInput.userRequest).toContain(styleGuide);
    });

    it('previousChapterSummary 应出现在 userRequest 中', async () => {
      const summary = '前一章主角在森林中迷路，遇到了神秘老者。';
      await executeWriterAgent(makeValidInput({ previousChapterSummary: summary }));

      const agentInput = mockExecuteStep.mock.calls[0][1];
      expect(agentInput.userRequest).toContain(summary);
    });
  });

  // ----------------------------------------------------------
  // 上下文注入
  // ----------------------------------------------------------

  describe('上下文注入', () => {
    it('projectContext 应放入 agentInput.context.relevantMemory', async () => {
      const ctx = '世界观：魔法体系分为五系...';
      await executeWriterAgent(makeValidInput({ projectContext: ctx }));

      const agentInput = mockExecuteStep.mock.calls[0][1];
      expect(agentInput.context.relevantMemory).toBeDefined();
      const mem = agentInput.context.relevantMemory.find(
        (m: { type: string }) => m.type === 'context',
      );
      expect(mem).toBeDefined();
      expect(mem.content).toBe(ctx);
    });

    it('characterContext 应放入 relevantMemory', async () => {
      const charCtx = '主角当前状态：受伤，魔力值剩余30%';
      await executeWriterAgent(makeValidInput({ characterContext: charCtx }));

      const agentInput = mockExecuteStep.mock.calls[0][1];
      const mem = agentInput.context.relevantMemory.find(
        (m: { type: string }) => m.type === 'character',
      );
      expect(mem).toBeDefined();
      expect(mem.content).toBe(charCtx);
    });

    it('无 context 时 relevantMemory 应为空数组', async () => {
      await executeWriterAgent(makeValidInput({
        projectContext: undefined,
        characterContext: undefined,
        previousChapterSummary: undefined,
      }));

      const agentInput = mockExecuteStep.mock.calls[0][1];
      expect(agentInput.context.relevantMemory).toEqual([]);
    });
  });

  // ----------------------------------------------------------
  // 调用参数
  // ----------------------------------------------------------

  describe('调用参数', () => {
    it('应使用 agentId "agent-sub-writer" 调用 executeStep', async () => {
      await executeWriterAgent(makeValidInput());

      const agentId = mockExecuteStep.mock.calls[0][0];
      expect(agentId).toBe('agent-sub-writer');
    });

    it('应透传 retryBaseDelayMs', async () => {
      await executeWriterAgent(makeValidInput(), undefined, 2000);

      const retryDelay = mockExecuteStep.mock.calls[0][3];
      expect(retryDelay).toBe(2000);
    });
  });

  // ----------------------------------------------------------
  // 取消支持
  // ----------------------------------------------------------

  describe('取消支持', () => {
    it('传入 CancellationToken 应传递给 executeStep', async () => {
      const token = new CancellationToken();
      await executeWriterAgent(makeValidInput(), token);

      const ct = mockExecuteStep.mock.calls[0][2];
      expect(ct).toBe(token);
    });

    it('不传 CancellationToken 应自动创建', async () => {
      await executeWriterAgent(makeValidInput());

      const ct = mockExecuteStep.mock.calls[0][2];
      expect(ct).toBeInstanceOf(CancellationToken);
    });
  });

  // ----------------------------------------------------------
  // 目标字数
  // ----------------------------------------------------------

  describe('目标字数', () => {
    it('默认目标字数应包含在 userRequest 中', async () => {
      await executeWriterAgent(makeValidInput());

      const agentInput = mockExecuteStep.mock.calls[0][1];
      expect(agentInput.userRequest).toContain('3000');
    });

    it('自定义字数应生效', async () => {
      await executeWriterAgent(makeValidInput({ targetWords: 5000 }));

      const agentInput = mockExecuteStep.mock.calls[0][1];
      expect(agentInput.userRequest).toContain('5000');
    });

    it('字数应被钳制在 800-8000 范围内', async () => {
      await executeWriterAgent(makeValidInput({ targetWords: 100 }));

      const agentInput = mockExecuteStep.mock.calls[0][1];
      expect(agentInput.userRequest).toContain('800');
    });
  });

  // ----------------------------------------------------------
  // 输出
  // ----------------------------------------------------------

  describe('输出', () => {
    it('应返回 executeStep 的输出', async () => {
      const expectedOutput = makeAgentOutput({
        content: '## 第3章 — 新的开始\n\n...',
        summary: '第3章完成',
      });
      mockExecuteStep.mockResolvedValue(expectedOutput);

      const result = await executeWriterAgent(makeValidInput());
      expect(result).toEqual(expectedOutput);
    });
  });
});
