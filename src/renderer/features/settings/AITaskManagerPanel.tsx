import React, { useState } from 'react';
import { useAITaskManager } from '../../shared/hooks/useAITaskManager';
import { AITask, TaskStatus } from '../../shared/services/AITaskManager';

/**
 * AI任务管理面板组件
 * 可以集成到系统设置或状态栏中
 */
export function AITaskManagerPanel() {
  const { tasks, runningTasks, stats, cancelTask, cancelAllTasks, clearCompleted, clearAll } = useAITaskManager();
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);

  // 获取状态显示配置（使用语义色变量，主题切换自动适配）
  const getStatusConfig = (status: TaskStatus) => {
    const configs = {
      pending: { label: '等待中', color: 'text-[var(--color-warning)]', bg: 'bg-[var(--color-warning-bg)]' },
      running: { label: '运行中', color: 'text-[var(--color-info)]', bg: 'bg-[var(--color-info-bg)]' },
      completed: { label: '已完成', color: 'text-[var(--color-success)]', bg: 'bg-[var(--color-success-bg)]' },
      failed: { label: '失败', color: 'text-[var(--color-error)]', bg: 'bg-[var(--color-error-bg)]' },
      cancelled: { label: '已取消', color: 'text-[var(--color-neutral)]', bg: 'bg-[var(--color-neutral-bg)]' },
    };
    return configs[status] || configs.pending;
  };

  // 获取类型显示配置（使用主题感知的 accent 色变量）
  const getTypeConfig = (type: AITask['type']) => {
    const configs = {
      generation: { label: '生成', icon: 'fa-magic', color: 'text-[var(--color-primary-500)]' },
      analysis: { label: '分析', icon: 'fa-search', color: 'text-[var(--color-info)]' },
      consistency: { label: '检查', icon: 'fa-check-circle', color: 'text-[var(--color-success)]' },
      memory: { label: '记忆', icon: 'fa-brain', color: 'text-[var(--color-accent-cyan)]' },
      review: { label: '审查', icon: 'fa-clipboard-check', color: 'text-[var(--color-accent-orange)]' },
      other: { label: '其他', icon: 'fa-cube', color: 'text-[var(--color-neutral)]' },
    };
    return configs[type] || configs.other;
  };

  const formatDuration = (start?: number, end?: number) => {
    if (!start) return '';
    const endTime = end || Date.now();
    const duration = Math.floor((endTime - start) / 1000);
    
    if (duration < 60) return `${duration}s`;
    if (duration < 3600) return `${Math.floor(duration / 60)}m ${duration % 60}s`;
    return `${Math.floor(duration / 3600)}h ${Math.floor((duration % 3600) / 60)}m`;
  };

  return (
    <div className="h-full flex flex-col">
      {/* 头部统计 */}
      <div className="p-4 border-b border-[var(--color-border-default)]">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <i className="fas fa-robot text-[var(--color-primary-500)]"></i>
            <h3 className="font-semibold text-[var(--color-text-primary)]">AI 任务管理</h3>
          </div>
          <div className="flex items-center gap-2">
            {stats.running > 0 && (
              <button
                onClick={cancelAllTasks}
                className="px-3 py-1.5 text-xs font-medium text-[var(--color-error)] bg-[var(--color-error-bg)] rounded-lg hover:bg-[var(--color-error-border)] transition-colors"
              >
                <i className="fas fa-stop mr-1"></i>
                全部停止
              </button>
            )}
            {stats.completed + stats.failed + stats.cancelled > 0 && (
              <button
                onClick={clearCompleted}
                className="px-3 py-1.5 text-xs font-medium text-[var(--color-neutral)] bg-[var(--color-neutral-bg)] rounded-lg hover:bg-[var(--color-neutral-border)] transition-colors"
              >
                <i className="fas fa-trash mr-1"></i>
                清除已完成
              </button>
            )}
          </div>
        </div>

        {/* 统计信息 */}
        <div className="grid grid-cols-4 gap-2">
          <div className="bg-[var(--color-info-bg)] rounded-lg p-2 text-center">
            <div className="text-lg font-bold text-[var(--color-info)]">{stats.running + stats.pending}</div>
            <div className="text-xs text-[var(--color-info)] opacity-70">进行中</div>
          </div>
          <div className="bg-[var(--color-success-bg)] rounded-lg p-2 text-center">
            <div className="text-lg font-bold text-[var(--color-success)]">{stats.completed}</div>
            <div className="text-xs text-[var(--color-success)] opacity-70">已完成</div>
          </div>
          <div className="bg-[var(--color-error-bg)] rounded-lg p-2 text-center">
            <div className="text-lg font-bold text-[var(--color-error)]">{stats.failed}</div>
            <div className="text-xs text-[var(--color-error)] opacity-70">失败</div>
          </div>
          <div className="bg-[var(--color-neutral-bg)] rounded-lg p-2 text-center">
            <div className="text-lg font-bold text-[var(--color-neutral)]">{stats.total}</div>
            <div className="text-xs text-[var(--color-neutral)] opacity-70">总计</div>
          </div>
        </div>
      </div>

      {/* 任务列表 */}
      <div className="flex-1 overflow-y-auto">
        {tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-[var(--color-text-muted)]">
            <i className="fas fa-inbox text-4xl mb-3"></i>
            <p className="text-sm">暂无AI任务</p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--color-border-default)]">
            {tasks.map((task) => {
              const statusConfig = getStatusConfig(task.status);
              const typeConfig = getTypeConfig(task.type);
              const isExpanded = expandedTaskId === task.id;

              return (
                <div key={task.id} className="p-3 hover:bg-[var(--color-surface-hover)] transition-colors">
                  {/* 任务头部 */}
                  <div
                    className="flex items-center justify-between cursor-pointer"
                    onClick={() => setExpandedTaskId(isExpanded ? null : task.id)}
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <i className={`fas ${typeConfig.icon} ${typeConfig.color}`}></i>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm text-[var(--color-text-primary)] truncate">
                            {task.name}
                          </span>
                          <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${statusConfig.bg} ${statusConfig.color}`}>
                            {statusConfig.label}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 text-xs text-[var(--color-text-muted)]">
                          <span>{typeConfig.label}</span>
                          <span>•</span>
                          <span>{formatDuration(task.startedAt, task.completedAt)}</span>
                          {(task.status === 'running' || task.status === 'pending') && (
                            <>
                              <span>•</span>
                              <span>{task.progress}%</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {(task.status === 'running' || task.status === 'pending') && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            cancelTask(task.id);
                          }}
                          className="p-1.5 text-[var(--color-error)] hover:bg-[var(--color-error-bg)] rounded transition-colors"
                          title="取消任务"
                        >
                          <i className="fas fa-times"></i>
                        </button>
                      )}
                      <i className={`fas fa-chevron-${isExpanded ? 'up' : 'down'} text-[var(--color-text-muted)]`}></i>
                    </div>
                  </div>

                  {/* 进度条 */}
                  {(task.status === 'running' || task.status === 'pending') && (
                    <div className="mt-2">
                      <div className="h-1.5 bg-[var(--color-surface-muted)] rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[var(--color-info)] transition-all duration-300"
                          style={{ width: `${task.progress}%` }}
                        ></div>
                      </div>
                    </div>
                  )}

                  {/* 扩展信息 */}
                  {isExpanded && (
                    <div className="mt-3 p-3 bg-[var(--color-surface-muted)] rounded-lg">
                      {task.description && (
                        <div className="mb-2">
                          <span className="text-xs font-medium text-[var(--color-text-muted)]">描述：</span>
                          <span className="text-xs text-[var(--color-text-secondary)] ml-1">{task.description}</span>
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-2 text-xs mb-2">
                        <div>
                          <span className="font-medium text-[var(--color-text-muted)]">创建时间：</span>
                          <span className="text-[var(--color-text-secondary)]">
                            {new Date(task.createdAt).toLocaleTimeString('zh-CN')}
                          </span>
                        </div>
                        {task.startedAt && (
                          <div>
                            <span className="font-medium text-[var(--color-text-muted)]">开始时间：</span>
                            <span className="text-[var(--color-text-secondary)]">
                              {new Date(task.startedAt).toLocaleTimeString('zh-CN')}
                            </span>
                          </div>
                        )}
                        {task.completedAt && (
                          <div>
                            <span className="font-medium text-[var(--color-text-muted)]">完成时间：</span>
                            <span className="text-[var(--color-text-secondary)]">
                              {new Date(task.completedAt).toLocaleTimeString('zh-CN')}
                            </span>
                          </div>
                        )}
                        <div>
                          <span className="font-medium text-[var(--color-text-muted)]">任务ID：</span>
                          <span className="text-[var(--color-text-secondary)] font-mono text-xs">{task.id.slice(0, 20)}...</span>
                        </div>
                      </div>

                      {task.error && (
                        <div className="p-2 bg-[var(--color-error-bg)] rounded text-xs text-[var(--color-error)]">
                          <i className="fas fa-exclamation-circle mr-1"></i>
                          {task.error}
                        </div>
                      )}

                      {task.result && (
                        <div className="mt-2">
                          <span className="text-xs font-medium text-[var(--color-text-muted)]">结果：</span>
                          <div className="mt-1 p-2 bg-[var(--color-surface-elevated)] rounded border border-[var(--color-border-default)] max-h-32 overflow-y-auto">
                            <pre className="text-xs text-[var(--color-text-secondary)] whitespace-pre-wrap">
                              {typeof task.result === 'string'
                                ? task.result.slice(0, 500)
                                : JSON.stringify(task.result, null, 2).slice(0, 500)}
                              {(typeof task.result === 'string' ? task.result.length : JSON.stringify(task.result).length) > 500 && '...'}
                            </pre>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 底部提示 */}
      {runningTasks.length > 0 && (
        <div className="p-3 bg-[var(--color-info-bg)] border-t border-[var(--color-info-border)]">
          <p className="text-xs text-[var(--color-info)] flex items-center gap-2">
            <i className="fas fa-info-circle"></i>
            <span>
              正在进行 {runningTasks.length} 个AI任务，切换标签页不会中断任务执行
            </span>
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * 简化版任务状态指示器（用于状态栏）
 */
export function AITaskIndicator() {
  const { stats, isRunning } = useAITaskManager();

  if (!isRunning) return null;

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-[var(--color-info-bg)] rounded-lg text-xs">
      <div className="w-2 h-2 bg-[var(--color-info)] rounded-full animate-pulse"></div>
      <span className="text-[var(--color-info)] font-medium">
        AI任务: {stats.running + stats.pending} 进行中
      </span>
      <div className="flex gap-1">
        {stats.running > 0 && (
          <span className="text-[var(--color-info)]">{stats.running}运行</span>
        )}
        {stats.pending > 0 && (
          <span className="text-[var(--color-warning)]">{stats.pending}等待</span>
        )}
      </div>
    </div>
  );
}
