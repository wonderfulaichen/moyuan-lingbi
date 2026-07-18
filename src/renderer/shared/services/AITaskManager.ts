/**
 * AI任务管理系统
 * 
 * 目标：解决切换标签页时AI任务被中断的问题
 * 架构：任务队列 + 全局状态 + 独立运行
 */

import { ModelConfig } from '../../../shared/types';

// ========== 任务定义 ==========

export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export type TaskType = 
  | 'generation'      // 内容生成
  | 'analysis'         // 分析任务
  | 'consistency'      // 一致性检查
  | 'memory'           // 记忆维护
  | 'review'           // 审查任务
  | 'other';           // 其他任务

export interface AITask {
  id: string;
  name: string;
  description?: string;
  type: TaskType;
  status: TaskStatus;
  progress: number;              // 0-100
  result?: any;                  // 任务结果
  error?: string;               // 错误信息
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  abortController?: AbortController;
}

export interface TaskCallback {
  onProgress?: (progress: number) => void;
  onComplete?: (result: any) => void;
  onError?: (error: string) => void;
}

// ========== 任务管理器 ==========

class AITaskManager {
  private tasks: Map<string, AITask> = new Map();
  private listeners: Set<(tasks: AITask[]) => void> = new Set();
  private _nextId = 0;

  // 生成唯一ID
  private generateId(): string {
    return `task-${Date.now()}-${++this._nextId}`;
  }

  // 通知所有监听器
  private notify(): void {
    const taskList = this.getTasks();
    this.listeners.forEach(listener => listener(taskList));
  }

  // 创建任务
  private createTask(name: string, type: TaskType, description?: string): AITask {
    const task: AITask = {
      id: this.generateId(),
      name,
      type,
      description,
      status: 'pending',
      progress: 0,
      createdAt: Date.now(),
    };
    this.tasks.set(task.id, task);
    this.notify();
    return task;
  }

  // 提交异步任务
  async submitTask<T>(
    name: string,
    type: TaskType,
    executor: (task: AITask) => Promise<T>,
    callbacks?: TaskCallback,
    description?: string
  ): Promise<string> {
    const task = this.createTask(name, type, description);
    const abortController = new AbortController();
    task.abortController = abortController;

    // 更新状态为运行中
    task.status = 'running';
    task.startedAt = Date.now();
    this.notify();

    try {
      // 执行任务
      const result = await executor(task);

      // 任务完成
      task.status = 'completed';
      task.progress = 100;
      task.completedAt = Date.now();
      task.result = result;

      callbacks?.onProgress?.(100);
      callbacks?.onComplete?.(result);

      this.notify();
      return task.id;

    } catch (error) {
      // 任务失败
      if (task.status !== 'cancelled') {
        task.status = 'failed';
        task.error = error instanceof Error ? error.message : '未知错误';
        task.completedAt = Date.now();

        callbacks?.onError?.(task.error);
        this.notify();
      }
      throw error;
    }
  }

  // 提交简单任务（不需要进度回调）
  async submitSimpleTask<T>(
    name: string,
    type: TaskType,
    executor: () => Promise<T>
  ): Promise<{ taskId: string; result: T }> {
    const taskId = await this.submitTask(name, type, async () => {
      return await executor();
    });
    
    const task = this.tasks.get(taskId);
    return {
      taskId,
      result: task?.result as T
    };
  }

  // 取消任务
  cancel(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;

    if (task.status === 'pending' || task.status === 'running') {
      // 调用 abort
      if (task.abortController) {
        task.abortController.abort();
      }
      
      task.status = 'cancelled';
      task.completedAt = Date.now();
      this.notify();
      return true;
    }
    return false;
  }

  // 取消所有任务
  cancelAll(): void {
    this.tasks.forEach(task => {
      if (task.status === 'pending' || task.status === 'running') {
        if (task.abortController) {
          task.abortController.abort();
        }
        task.status = 'cancelled';
        task.completedAt = Date.now();
      }
    });
    this.notify();
  }

  // 更新任务进度
  updateProgress(taskId: string, progress: number): void {
    const task = this.tasks.get(taskId);
    if (task && task.status === 'running') {
      task.progress = Math.min(100, Math.max(0, progress));
      this.notify();
    }
  }

  // 更新任务（更通用的更新方法）
  updateTask(taskId: string, updates: Partial<Pick<AITask, 'progress' | 'status' | 'result' | 'error'>>): void {
    const task = this.tasks.get(taskId);
    if (task) {
      if (updates.progress !== undefined) {
        task.progress = Math.min(100, Math.max(0, updates.progress));
      }
      if (updates.status !== undefined) {
        task.status = updates.status;
        if (updates.status === 'completed' || updates.status === 'failed' || updates.status === 'cancelled') {
          task.completedAt = Date.now();
        }
        if (updates.status === 'running') {
          task.startedAt = Date.now();
        }
      }
      if (updates.result !== undefined) {
        task.result = updates.result;
      }
      if (updates.error !== undefined) {
        task.error = updates.error;
      }
      this.notify();
    }
  }

  // 等待任务完成
  waitForTask(taskId: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const task = this.tasks.get(taskId);
      if (!task) {
        reject(new Error('任务不存在'));
        return;
      }

      if (task.status === 'completed') {
        resolve(task.result);
        return;
      }

      if (task.status === 'failed') {
        reject(new Error(task.error || '任务失败'));
        return;
      }

      if (task.status === 'cancelled') {
        reject(new Error('任务已取消'));
        return;
      }

      const unsubscribe = this.subscribe((tasks) => {
        const updatedTask = tasks.find(t => t.id === taskId);
        if (updatedTask) {
          if (updatedTask.status === 'completed') {
            unsubscribe();
            resolve(updatedTask.result);
          } else if (updatedTask.status === 'failed') {
            unsubscribe();
            reject(new Error(updatedTask.error || '任务失败'));
          } else if (updatedTask.status === 'cancelled') {
            unsubscribe();
            reject(new Error('任务已取消'));
          }
        }
      });
    });
  }

  // 获取所有任务
  getTasks(): AITask[] {
    return Array.from(this.tasks.values())
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  // 获取正在运行的任务
  getRunningTasks(): AITask[] {
    return this.getTasks().filter(t => t.status === 'running' || t.status === 'pending');
  }

  // 获取已完成的任务
  getCompletedTasks(limit?: number): AITask[] {
    const completed = this.getTasks().filter(t => 
      t.status === 'completed' || t.status === 'failed' || t.status === 'cancelled'
    );
    return limit ? completed.slice(0, limit) : completed;
  }

  // 获取任务详情
  getTask(taskId: string): AITask | undefined {
    return this.tasks.get(taskId);
  }

  // 清除已完成的任务
  clearCompleted(): void {
    this.tasks.forEach((task, id) => {
      if (['completed', 'failed', 'cancelled'].includes(task.status)) {
        this.tasks.delete(id);
      }
    });
    this.notify();
  }

  // 清除所有任务
  clearAll(): void {
    this.tasks.clear();
    this.notify();
  }

  // 订阅任务变化
  subscribe(listener: (tasks: AITask[]) => void): () => void {
    this.listeners.add(listener);
    // 立即调用一次，返回当前状态
    listener(this.getTasks());
    
    // 返回取消订阅函数
    return () => {
      this.listeners.delete(listener);
    };
  }

  // 获取统计信息
  getStats(): {
    total: number;
    running: number;
    pending: number;
    completed: number;
    failed: number;
    cancelled: number;
  } {
    const tasks = this.getTasks();
    return {
      total: tasks.length,
      running: tasks.filter(t => t.status === 'running').length,
      pending: tasks.filter(t => t.status === 'pending').length,
      completed: tasks.filter(t => t.status === 'completed').length,
      failed: tasks.filter(t => t.status === 'failed').length,
      cancelled: tasks.filter(t => t.status === 'cancelled').length,
    };
  }
}

// 全局单例
export const aiTaskManager = new AITaskManager();

// ========== 便捷函数 ==========

// 包装需要支持取消的异步函数
export function createCancellableTask<T>(
  executor: (signal: AbortSignal) => Promise<T>
): {
  taskId: string;
  promise: Promise<T>;
  cancel: () => void;
} {
  const abortController = new AbortController();
  let taskId = '';
  let cancelled = false;

  const promise = aiTaskManager.submitTask(
    '异步任务',
    'other',
    async (task) => {
      taskId = task.id;
      try {
        const result = await executor(abortController.signal);
        return result;
      } catch (error) {
        cancelled = true;
        throw error;
      }
    }
  ).then(id => {
    return aiTaskManager.getTask(id)?.result as T;
  });

  return {
    taskId,
    promise,
    cancel: () => abortController.abort()
  };
}
