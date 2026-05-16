import { create } from 'zustand';

export interface TokenUsage {
  prompt: number;
  completion: number;
  total: number;
}

export interface AITaskRecord {
  id: string;
  type: string;
  modelName: string;
  status: 'running' | 'complete' | 'error' | 'aborted';
  statusMessage: string;
  progress: number;
  tokenUsage: TokenUsage | null;
  error: string | null;
  startTime: number;
  endTime?: number;
}

export interface AIStatusState {
  isGenerating: boolean;
  statusMessage: string;
  progress: number;
  tokenUsage: TokenUsage | null;
  modelName: string;
  lastDuration: number | null;
  error: string | null;
  currentTask: string;
  tasks: AITaskRecord[];
  activeTaskId: string | null;
}

export const useAIStatusStore = create<AIStatusState>()((set, get) => ({
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

  setGenerating: (modelName: string, message: string = 'AI 生成中...', task: string = '') => {
    const taskId = `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const now = Date.now();
    const newTask: AITaskRecord = {
      id: taskId,
      type: task || 'ai-generate',
      modelName,
      status: 'running',
      statusMessage: message,
      progress: 0,
      tokenUsage: null,
      error: null,
      startTime: now,
    };
    set(s => ({
      isGenerating: true,
      statusMessage: message,
      progress: 0,
      tokenUsage: null,
      modelName,
      lastDuration: null,
      error: null,
      currentTask: task,
      tasks: [newTask, ...s.tasks].slice(0, 50),
      activeTaskId: taskId,
    }));
  },

  setProgress: (progress: number) => {
    const p = Math.min(100, Math.max(0, progress));
    set(s => {
      if (!s.activeTaskId) return { progress: p };
      return {
        progress: p,
        tasks: s.tasks.map(t => t.id === s.activeTaskId ? { ...t, progress: p } : t),
      };
    });
  },

  setStatusMessage: (message: string) => {
    set(s => {
      if (!s.activeTaskId) return { statusMessage: message };
      return {
        statusMessage: message,
        tasks: s.tasks.map(t => t.id === s.activeTaskId ? { ...t, statusMessage: message } : t),
      };
    });
  },

  setTokenUsage: (usage: TokenUsage) => {
    set(s => {
      if (!s.activeTaskId) return { tokenUsage: usage };
      return {
        tokenUsage: usage,
        tasks: s.tasks.map(t => t.id === s.activeTaskId ? { ...t, tokenUsage: usage } : t),
      };
    });
  },

  setError: (error: string | null) => {
    set(s => {
      if (!s.activeTaskId) return { error };
      return {
        error,
        tasks: s.tasks.map(t =>
          t.id === s.activeTaskId
            ? { ...t, error, status: error ? 'error' as const : t.status }
            : t
        ),
      };
    });
  },

  setComplete: () => {
    const state = get();
    const duration = state.tasks.find(t => t.id === state.activeTaskId)
      ? Date.now() - (state.tasks.find(t => t.id === state.activeTaskId)?.startTime ?? Date.now())
      : null;
    const now = Date.now();
    const completeMsg = duration ? `生成完成 (${(duration / 1000).toFixed(1)}s)` : '生成完成';

    set(s => {
      const updatedTasks = s.activeTaskId
        ? s.tasks.map(t =>
            t.id === s.activeTaskId
              ? { ...t, status: 'complete' as const, progress: 100, statusMessage: completeMsg, endTime: now }
              : t
          )
        : s.tasks;

      return {
        isGenerating: false,
        progress: 100,
        statusMessage: completeMsg,
        lastDuration: duration,
        error: null,
        tasks: updatedTasks,
      };
    });

    setTimeout(() => {
      set(s => {
        if (s.isGenerating) return s;
        return { statusMessage: '', progress: 0 };
      });
    }, 3000);
  },

  resetStatus: () => {
    set(s => ({
      isGenerating: false,
      statusMessage: '',
      progress: 0,
      tokenUsage: null,
      modelName: '',
      lastDuration: null,
      error: null,
      currentTask: '',
      activeTaskId: null,
      tasks: s.tasks.map(t =>
        t.id === s.activeTaskId && t.status === 'running'
          ? { ...t, status: 'aborted' as const, endTime: Date.now() }
          : t
      ),
    }));
  },

  addTask: (task: Omit<AITaskRecord, 'startTime'> & { startTime?: number }): string => {
    const id = task.id || `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const newTask: AITaskRecord = {
      ...task as AITaskRecord,
      id,
      startTime: task.startTime || Date.now(),
    };
    set(s => ({
      tasks: [newTask, ...s.tasks].slice(0, 50),
    }));
    return id;
  },

  setActiveTask: (taskId: string | null) => {
    if (!taskId) {
      set(s => ({
        activeTaskId: null,
        isGenerating: false,
        statusMessage: '',
        progress: 0,
      }));
      return;
    }
    set(s => {
      const task = s.tasks.find(t => t.id === taskId);
      if (!task) return s;
      return {
        activeTaskId: taskId,
        isGenerating: task.status === 'running',
        statusMessage: task.statusMessage,
        progress: task.progress,
        tokenUsage: task.tokenUsage,
        modelName: task.modelName,
        error: task.error,
        currentTask: task.type,
        lastDuration: task.endTime ? task.endTime - task.startTime : null,
      };
    });
  },

  clearCompletedTasks: () => {
    set(s => ({
      tasks: s.tasks.filter(t => t.status === 'running'),
    }));
  },
}));
