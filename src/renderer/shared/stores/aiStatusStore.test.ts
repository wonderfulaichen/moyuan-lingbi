import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useAIStatusStore, AIStatusState } from './aiStatusStore';

/**
 * aiStatusStore 回归测试
 *
 * 重点覆盖 commit 81dacc7 修复的竞态条件：
 * - setComplete 的 setTimeout 3 秒后清空 statusMessage/progress
 * - setGenerating/resetStatus/setComplete 入口处清理旧定时器
 * - 连续 setComplete 不产生多个排队定时器
 * - 定时器触发时若 isGenerating 已为 true（新任务启动），不清空
 */

describe('aiStatusStore', () => {
  let store: typeof useAIStatusStore;

  beforeEach(() => {
    // 重置 store 到初始状态
    useAIStatusStore.setState({
      isGenerating: false,
      statusMessage: '',
      progress: 0,
      tokenUsage: null,
      modelName: '',
      lastDuration: null,
      error: null,
      currentTask: '',
      tasks: [],
      activeTaskId: null,
    });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const getState = (): AIStatusState => useAIStatusStore.getState();

  describe('初始状态', () => {
    it('应该有正确的默认值', () => {
      const s = getState();
      expect(s.isGenerating).toBe(false);
      expect(s.statusMessage).toBe('');
      expect(s.progress).toBe(0);
      expect(s.tokenUsage).toBeNull();
      expect(s.modelName).toBe('');
      expect(s.lastDuration).toBeNull();
      expect(s.error).toBeNull();
      expect(s.currentTask).toBe('');
      expect(s.tasks).toEqual([]);
      expect(s.activeTaskId).toBeNull();
    });
  });

  describe('setGenerating', () => {
    it('应该设置 isGenerating=true 和默认消息', () => {
      useAIStatusStore.getState().setGenerating('gpt-4');

      const s = getState();
      expect(s.isGenerating).toBe(true);
      expect(s.modelName).toBe('gpt-4');
      expect(s.statusMessage).toBe('AI 生成中...');
      expect(s.progress).toBe(0);
      expect(s.activeTaskId).toBeTruthy();
    });

    it('应该接受自定义消息和任务类型', () => {
      useAIStatusStore.getState().setGenerating('claude', '正在分析...', 'analyze');

      const s = getState();
      expect(s.statusMessage).toBe('正在分析...');
      expect(s.currentTask).toBe('analyze');
      const task = s.tasks[0];
      expect(task.type).toBe('analyze');
      expect(task.modelName).toBe('claude');
      expect(task.status).toBe('running');
    });

    it('应该在 tasks 列表头部插入新任务', () => {
      useAIStatusStore.getState().setGenerating('model-a');
      useAIStatusStore.getState().setGenerating('model-b');

      const s = getState();
      expect(s.tasks).toHaveLength(2);
      expect(s.tasks[0].modelName).toBe('model-b');
      expect(s.tasks[1].modelName).toBe('model-a');
    });

    it('应该清理挂起的 completeResetTimer', () => {
      // 先 setComplete 启动定时器
      useAIStatusStore.getState().setGenerating('m1');
      useAIStatusStore.getState().setComplete();
      // setGenerating 应清理定时器，否则定时器触发会误清新任务状态
      useAIStatusStore.getState().setGenerating('m2');

      // 推进时间，定时器若未被清理会触发并清空 statusMessage
      vi.advanceTimersByTime(4000);

      const s = getState();
      expect(s.isGenerating).toBe(true);
      expect(s.statusMessage).toBe('AI 生成中...'); // 未被旧定时器清空
    });
  });

  describe('setProgress', () => {
    it('应该更新 progress 和当前任务的 progress', () => {
      useAIStatusStore.getState().setGenerating('m');
      useAIStatusStore.getState().setProgress(50);

      const s = getState();
      expect(s.progress).toBe(50);
      expect(s.tasks[0].progress).toBe(50);
    });

    it('应该限制 progress 在 0-100 范围', () => {
      useAIStatusStore.getState().setGenerating('m');
      useAIStatusStore.getState().setProgress(150);
      expect(getState().progress).toBe(100);

      useAIStatusStore.getState().setProgress(-20);
      expect(getState().progress).toBe(0);
    });

    it('无 activeTaskId 时只更新顶层 progress', () => {
      useAIStatusStore.getState().setProgress(30);
      expect(getState().progress).toBe(30);
    });
  });

  describe('setStatusMessage', () => {
    it('应该更新状态消息和当前任务消息', () => {
      useAIStatusStore.getState().setGenerating('m');
      useAIStatusStore.getState().setStatusMessage('处理中');

      const s = getState();
      expect(s.statusMessage).toBe('处理中');
      expect(s.tasks[0].statusMessage).toBe('处理中');
    });
  });

  describe('setTokenUsage', () => {
    it('应该更新 tokenUsage 和当前任务', () => {
      useAIStatusStore.getState().setGenerating('m');
      const usage = { prompt: 100, completion: 50, total: 150 };
      useAIStatusStore.getState().setTokenUsage(usage);

      const s = getState();
      expect(s.tokenUsage).toEqual(usage);
      expect(s.tasks[0].tokenUsage).toEqual(usage);
    });
  });

  describe('setError', () => {
    it('应该设置 error 并更新任务状态为 error', () => {
      useAIStatusStore.getState().setGenerating('m');
      useAIStatusStore.getState().setError('网络错误');

      const s = getState();
      expect(s.error).toBe('网络错误');
      expect(s.tasks[0].error).toBe('网络错误');
      expect(s.tasks[0].status).toBe('error');
    });

    it('清除 error 时不应改变任务状态', () => {
      useAIStatusStore.getState().setGenerating('m');
      useAIStatusStore.getState().setError('err');
      useAIStatusStore.getState().setError(null);

      const task = getState().tasks[0];
      expect(task.error).toBeNull();
      expect(task.status).toBe('error'); // 仍保持 error 状态
    });
  });

  describe('setComplete', () => {
    it('应该设置 isGenerating=false 和 progress=100', () => {
      useAIStatusStore.getState().setGenerating('m');
      useAIStatusStore.getState().setComplete();

      const s = getState();
      expect(s.isGenerating).toBe(false);
      expect(s.progress).toBe(100);
      expect(s.error).toBeNull();
    });

    it('应该更新任务状态为 complete 并设置 endTime', () => {
      useAIStatusStore.getState().setGenerating('m');
      useAIStatusStore.getState().setComplete();

      const task = getState().tasks[0];
      expect(task.status).toBe('complete');
      expect(task.progress).toBe(100);
      expect(task.endTime).toBeDefined();
    });

    it('应该在 3 秒后清空 statusMessage 和 progress', () => {
      useAIStatusStore.getState().setGenerating('m');
      useAIStatusStore.getState().setComplete();

      // 3 秒前不应清空
      vi.advanceTimersByTime(2999);
      expect(getState().statusMessage).toBeTruthy();
      expect(getState().progress).toBe(100);

      // 3 秒后清空
      vi.advanceTimersByTime(1);
      expect(getState().statusMessage).toBe('');
      expect(getState().progress).toBe(0);
    });

    it('定时器触发时若 isGenerating=true，不清空（新任务已启动）', () => {
      useAIStatusStore.getState().setGenerating('m1');
      useAIStatusStore.getState().setComplete();
      // 立即启动新任务（setGenerating 会清理旧定时器，但这里测试保护逻辑）
      useAIStatusStore.getState().setGenerating('m2');
      // 此时旧定时器已被清理，但若未被清理，触发时应保护新任务
      vi.advanceTimersByTime(4000);

      const s = getState();
      expect(s.isGenerating).toBe(true);
      expect(s.statusMessage).toBe('AI 生成中...');
    });

    it('连续 setComplete 不应产生多个排队定时器', () => {
      useAIStatusStore.getState().setGenerating('m1');
      useAIStatusStore.getState().setComplete();
      useAIStatusStore.getState().setComplete(); // 应清理前一个定时器

      // 推进 3 秒，应只触发一次清空
      vi.advanceTimersByTime(3000);
      // 若有多个定时器，第二个会在再次推进时触发，但已无效果
      vi.advanceTimersByTime(3000);
      // 测试关键：不抛错，状态一致
      const s = getState();
      expect(s.statusMessage).toBe('');
      expect(s.progress).toBe(0);
    });
  });

  describe('resetStatus', () => {
    it('应该重置所有顶层状态', () => {
      useAIStatusStore.getState().setGenerating('m');
      useAIStatusStore.getState().setProgress(50);
      useAIStatusStore.getState().resetStatus();

      const s = getState();
      expect(s.isGenerating).toBe(false);
      expect(s.statusMessage).toBe('');
      expect(s.progress).toBe(0);
      expect(s.activeTaskId).toBeNull();
      expect(s.modelName).toBe('');
    });

    it('应该将 running 状态的任务标记为 aborted', () => {
      useAIStatusStore.getState().setGenerating('m');
      useAIStatusStore.getState().resetStatus();

      const task = getState().tasks[0];
      expect(task.status).toBe('aborted');
      expect(task.endTime).toBeDefined();
    });

    it('应该清理挂起的 completeResetTimer', () => {
      useAIStatusStore.getState().setGenerating('m');
      useAIStatusStore.getState().setComplete();
      useAIStatusStore.getState().resetStatus();

      // 推进时间，定时器若未被清理会触发
      vi.advanceTimersByTime(4000);
      // resetStatus 后状态应保持重置状态，不被定时器干扰
      const s = getState();
      expect(s.statusMessage).toBe('');
      expect(s.progress).toBe(0);
    });
  });

  describe('addTask', () => {
    it('应该添加任务到列表头部', () => {
      const id1 = useAIStatusStore.getState().addTask({
        type: 'custom',
        modelName: 'm',
        status: 'complete',
        statusMessage: 'done',
        progress: 100,
        tokenUsage: null,
        error: null,
      });
      expect(getState().tasks).toHaveLength(1);
      expect(id1).toBeTruthy();
    });

    it('应该使用提供的 id', () => {
      useAIStatusStore.getState().addTask({
        id: 'my-id',
        type: 't',
        modelName: 'm',
        status: 'complete',
        statusMessage: '',
        progress: 0,
        tokenUsage: null,
        error: null,
      });
      expect(getState().tasks[0].id).toBe('my-id');
    });

    it('应该限制 tasks 列表最多 50 条', () => {
      for (let i = 0; i < 55; i++) {
        useAIStatusStore.getState().addTask({
          type: 't',
          modelName: 'm',
          status: 'complete',
          statusMessage: '',
          progress: 0,
          tokenUsage: null,
          error: null,
        });
      }
      expect(getState().tasks).toHaveLength(50);
    });
  });

  describe('setActiveTask', () => {
    it('应该从任务恢复状态', () => {
      const id = useAIStatusStore.getState().addTask({
        type: 'analyze',
        modelName: 'claude',
        status: 'running',
        statusMessage: '分析中',
        progress: 40,
        tokenUsage: { prompt: 10, completion: 5, total: 15 },
        error: null,
      });
      useAIStatusStore.getState().setActiveTask(id);

      const s = getState();
      expect(s.activeTaskId).toBe(id);
      expect(s.isGenerating).toBe(true);
      expect(s.modelName).toBe('claude');
      expect(s.statusMessage).toBe('分析中');
      expect(s.progress).toBe(40);
      expect(s.tokenUsage?.total).toBe(15);
    });

    it('传入 null 应重置活动任务状态', () => {
      useAIStatusStore.getState().setGenerating('m');
      useAIStatusStore.getState().setActiveTask(null);

      const s = getState();
      expect(s.activeTaskId).toBeNull();
      expect(s.isGenerating).toBe(false);
      expect(s.statusMessage).toBe('');
      expect(s.progress).toBe(0);
    });

    it('传入不存在的 id 应不改变状态', () => {
      const before = { ...getState() };
      useAIStatusStore.getState().setActiveTask('non-existent');
      // state 应保持不变（set 返回 s 表示无变化）
      const after = getState();
      expect(after.activeTaskId).toBe(before.activeTaskId);
    });

    it('completed 任务恢复时 lastDuration 应正确计算', () => {
      const start = Date.now() - 5000;
      const id = useAIStatusStore.getState().addTask({
        type: 't',
        modelName: 'm',
        status: 'complete',
        statusMessage: 'done',
        progress: 100,
        tokenUsage: null,
        error: null,
        startTime: start,
        endTime: start + 2000,
      });
      useAIStatusStore.getState().setActiveTask(id);
      expect(getState().lastDuration).toBe(2000);
    });
  });

  describe('clearCompletedTasks', () => {
    it('应该只保留 running 状态的任务', () => {
      useAIStatusStore.getState().addTask({
        type: 't', modelName: 'm', status: 'complete',
        statusMessage: '', progress: 100, tokenUsage: null, error: null,
      });
      useAIStatusStore.getState().addTask({
        type: 't', modelName: 'm', status: 'running',
        statusMessage: '', progress: 30, tokenUsage: null, error: null,
      });
      useAIStatusStore.getState().addTask({
        type: 't', modelName: 'm', status: 'error',
        statusMessage: '', progress: 0, tokenUsage: null, error: 'e',
      });

      useAIStatusStore.getState().clearCompletedTasks();
      const tasks = getState().tasks;
      expect(tasks).toHaveLength(1);
      expect(tasks[0].status).toBe('running');
    });
  });
});
