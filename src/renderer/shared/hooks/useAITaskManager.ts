import { useState, useEffect, useCallback } from 'react';
import { aiTaskManager, AITask, TaskStatus } from '../services/AITaskManager';

/**
 * AI任务管理器Hook
 * 在组件中使用此hook可以订阅任务变化，切换标签页不会影响任务
 */
export function useAITaskManager() {
  const [tasks, setTasks] = useState<AITask[]>([]);
  const [runningTasks, setRunningTasks] = useState<AITask[]>([]);
  const [stats, setStats] = useState({
    total: 0,
    running: 0,
    pending: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
  });

  useEffect(() => {
    // 订阅任务变化
    const unsubscribe = aiTaskManager.subscribe((newTasks) => {
      setTasks(newTasks);
      setRunningTasks(newTasks.filter(t => t.status === 'running' || t.status === 'pending'));
      setStats(aiTaskManager.getStats());
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const cancelTask = useCallback((taskId: string) => {
    aiTaskManager.cancel(taskId);
  }, []);

  const cancelAllTasks = useCallback(() => {
    aiTaskManager.cancelAll();
  }, []);

  const clearCompleted = useCallback(() => {
    aiTaskManager.clearCompleted();
  }, []);

  const clearAll = useCallback(() => {
    aiTaskManager.clearAll();
  }, []);

  return {
    tasks,
    runningTasks,
    stats,
    cancelTask,
    cancelAllTasks,
    clearCompleted,
    clearAll,
    isRunning: stats.running > 0 || stats.pending > 0,
  };
}

/**
 * 获取单个任务的状态
 */
export function useTask(taskId: string | undefined) {
  const [task, setTask] = useState<AITask | undefined>(
    taskId ? aiTaskManager.getTask(taskId) : undefined
  );

  useEffect(() => {
    if (!taskId) return;

    const unsubscribe = aiTaskManager.subscribe((tasks) => {
      const found = tasks.find(t => t.id === taskId);
      setTask(found);
    });

    return () => {
      unsubscribe();
    };
  }, [taskId]);

  const cancel = useCallback(() => {
    if (taskId) {
      aiTaskManager.cancel(taskId);
    }
  }, [taskId]);

  return {
    task,
    cancel,
    isRunning: task?.status === 'running' || task?.status === 'pending',
    isCompleted: task?.status === 'completed',
    isFailed: task?.status === 'failed',
    isCancelled: task?.status === 'cancelled',
  };
}

/**
 * 快速提交任务的Hook
 */
export function useSubmitTask() {
  const submitTask = useCallback(<T,>(
    name: string,
    type: AITask['type'],
    executor: (task: AITask) => Promise<T>,
    callbacks?: {
      onProgress?: (progress: number) => void;
      onComplete?: (result: T) => void;
      onError?: (error: string) => void;
    },
    description?: string
  ) => {
    return aiTaskManager.submitTask(name, type, executor, callbacks, description);
  }, []);

  const submitSimpleTask = useCallback(<T,>(
    name: string,
    type: AITask['type'],
    executor: () => Promise<T>
  ) => {
    return aiTaskManager.submitSimpleTask(name, type, executor);
  }, []);

  return {
    submitTask,
    submitSimpleTask,
    cancelTask: (taskId: string) => aiTaskManager.cancel(taskId),
    cancelAll: () => aiTaskManager.cancelAll(),
  };
}
