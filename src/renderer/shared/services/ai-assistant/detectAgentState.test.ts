import { describe, it, expect } from 'vitest';
import { detectAgentState, PendingConfirm } from './detectAgentState';
import { AgentPhase, AIChatMessage, AIPendingPrompt } from '../../../../shared/types/fileSystem';

/**
 * detectAgentState 测试
 *
 * 覆盖 agent 状态机的所有分支：
 * - 空闲态（所有输入为空/false）
 * - 等待确认文件操作（pendingConfirm，区分 create/update）
 * - 等待用户输入（pendingPrompt）
 * - 生成中（streamingContent + isProcessing）
 * - 分析中（仅 isProcessing）
 *
 * 优先级顺序（测试重点）：
 * pendingConfirm > pendingPrompt > streamingContent+isProcessing > isProcessing > idle
 */

describe('detectAgentState', () => {
  const emptyMessages: AIChatMessage[] = [];

  describe('空闲态', () => {
    it('所有输入为空/false 时应返回 IDLE', () => {
      const result = detectAgentState(emptyMessages, false, null, null, null);

      expect(result.phase).toBe(AgentPhase.IDLE);
      expect(result.currentTask).toBe('');
      expect(result.progress).toBe(0);
      expect(result.requiredAction).toBe('none');
      expect(result.error).toBeNull();
      expect(result.pendingFiles).toEqual([]);
      expect(result.iteration).toBe(0);
      expect(result.maxIterations).toBe(3);
    });

    it('仅 streamingContent 非 null 但 isProcessing=false 时应返回 IDLE', () => {
      // 流式内容已结束但未清空，不算活动状态
      const result = detectAgentState(emptyMessages, false, 'residual', null, null);
      expect(result.phase).toBe(AgentPhase.IDLE);
    });
  });

  describe('等待确认文件操作（pendingConfirm，最高优先级）', () => {
    it('只有 create_file 时应返回 confirm_create', () => {
      const confirm: PendingConfirm = {
        files: [
          { action: 'create_file', name: 'f1.md', parentId: null, content: 'c' },
        ],
      };

      const result = detectAgentState(emptyMessages, false, null, confirm, null);

      expect(result.phase).toBe(AgentPhase.WAITING_CONFIRM);
      expect(result.currentTask).toBe('等待确认文件操作');
      expect(result.progress).toBe(85);
      expect(result.requiredAction).toBe('confirm_create');
      expect(result.pendingFiles).toEqual(confirm.files);
    });

    it('包含 update_file 时应返回 confirm_update', () => {
      const confirm: PendingConfirm = {
        files: [
          { action: 'create_file', name: 'f1.md', parentId: null, content: 'c' },
          { action: 'update_file', name: 'f2.md', parentId: null, content: 'c2', fileId: 'id2' },
        ],
      };

      const result = detectAgentState(emptyMessages, false, null, confirm, null);

      expect(result.requiredAction).toBe('confirm_update');
      expect(result.pendingFiles).toHaveLength(2);
    });

    it('只有 update_file 时应返回 confirm_update', () => {
      const confirm: PendingConfirm = {
        files: [
          { action: 'update_file', name: 'f.md', parentId: null, content: 'c', fileId: 'id' },
        ],
      };

      const result = detectAgentState(emptyMessages, false, null, confirm, null);
      expect(result.requiredAction).toBe('confirm_update');
    });

    it('pendingConfirm 优先级高于 isProcessing/streamingContent/pendingPrompt', () => {
      const confirm: PendingConfirm = { files: [] };
      const prompt = { content: 'question' } as AIPendingPrompt;

      // 同时存在所有状态，pendingConfirm 应胜出
      const result = detectAgentState(
        emptyMessages,
        true,            // isProcessing
        'streaming',     // streamingContent
        confirm,         // pendingConfirm
        prompt,          // pendingPrompt
      );

      expect(result.phase).toBe(AgentPhase.WAITING_CONFIRM);
      expect(result.requiredAction).toBe('confirm_create'); // 空 files 数组，无 update
    });

    it('空 files 数组应返回 confirm_create', () => {
      const confirm: PendingConfirm = { files: [] };
      const result = detectAgentState(emptyMessages, true, 's', confirm, null);
      expect(result.requiredAction).toBe('confirm_create');
    });
  });

  describe('等待用户输入（pendingPrompt，次高优先级）', () => {
    it('应返回 WAITING_CONFIRM + answer_question', () => {
      const prompt = { content: '请回答' } as AIPendingPrompt;

      const result = detectAgentState(emptyMessages, false, null, null, prompt);

      expect(result.phase).toBe(AgentPhase.WAITING_CONFIRM);
      expect(result.currentTask).toBe('等待用户输入');
      expect(result.progress).toBe(50);
      expect(result.requiredAction).toBe('answer_question');
    });

    it('pendingPrompt 优先级高于 isProcessing/streamingContent', () => {
      const prompt = { content: 'q' } as AIPendingPrompt;

      const result = detectAgentState(emptyMessages, true, 'streaming', null, prompt);

      expect(result.phase).toBe(AgentPhase.WAITING_CONFIRM);
      expect(result.requiredAction).toBe('answer_question');
    });
  });

  describe('生成中（streamingContent + isProcessing）', () => {
    it('应返回 GENERATING', () => {
      const result = detectAgentState(emptyMessages, true, '生成内容', null, null);

      expect(result.phase).toBe(AgentPhase.GENERATING);
      expect(result.currentTask).toBe('生成中');
      expect(result.progress).toBe(40);
      expect(result.requiredAction).toBe('none');
    });

    it('streamingContent 为 null 但 isProcessing=true 不应进入 GENERATING', () => {
      const result = detectAgentState(emptyMessages, true, null, null, null);
      expect(result.phase).not.toBe(AgentPhase.GENERATING);
    });

    it('streamingContent 非 null 但 isProcessing=false 不应进入 GENERATING', () => {
      const result = detectAgentState(emptyMessages, false, 's', null, null);
      expect(result.phase).not.toBe(AgentPhase.GENERATING);
    });
  });

  describe('分析中（仅 isProcessing）', () => {
    it('应返回 ANALYZING', () => {
      const result = detectAgentState(emptyMessages, true, null, null, null);

      expect(result.phase).toBe(AgentPhase.ANALYZING);
      expect(result.currentTask).toBe('分析中');
      expect(result.progress).toBe(10);
      expect(result.requiredAction).toBe('none');
    });
  });

  describe('优先级顺序验证', () => {
    it('pendingConfirm > pendingPrompt > streamingContent+isProcessing > isProcessing', () => {
      // 逐级移除，验证优先级
      const prompt = { content: 'q' } as AIPendingPrompt;
      const confirm: PendingConfirm = { files: [] };

      // 全部存在 → WAITING_CONFIRM (confirm)
      expect(detectAgentState(emptyMessages, true, 's', confirm, prompt).phase)
        .toBe(AgentPhase.WAITING_CONFIRM);

      // 移除 confirm → WAITING_CONFIRM (prompt)
      expect(detectAgentState(emptyMessages, true, 's', null, prompt).phase)
        .toBe(AgentPhase.WAITING_CONFIRM);

      // 移除 prompt → GENERATING
      expect(detectAgentState(emptyMessages, true, 's', null, null).phase)
        .toBe(AgentPhase.GENERATING);

      // 移除 streaming → ANALYZING
      expect(detectAgentState(emptyMessages, true, null, null, null).phase)
        .toBe(AgentPhase.ANALYZING);

      // 移除 isProcessing → IDLE
      expect(detectAgentState(emptyMessages, false, null, null, null).phase)
        .toBe(AgentPhase.IDLE);
    });
  });

  describe('base 状态完整性', () => {
    it('所有返回的 state 都应有完整的 base 字段', () => {
      const testCases = [
        detectAgentState(emptyMessages, false, null, null, null),
        detectAgentState(emptyMessages, true, null, null, null),
        detectAgentState(emptyMessages, true, 's', null, null),
        detectAgentState(emptyMessages, false, null, { files: [] }, null),
        detectAgentState(emptyMessages, false, null, null, { content: 'q' } as AIPendingPrompt),
      ];

      for (const result of testCases) {
        expect(result).toHaveProperty('phase');
        expect(result).toHaveProperty('currentTask');
        expect(result).toHaveProperty('progress');
        expect(result).toHaveProperty('requiredAction');
        expect(result).toHaveProperty('error');
        expect(result).toHaveProperty('pendingFiles');
        expect(result).toHaveProperty('iteration');
        expect(result).toHaveProperty('maxIterations');
        expect(result.maxIterations).toBe(3);
        expect(result.iteration).toBe(0);
        expect(result.error).toBeNull();
      }
    });
  });
});
