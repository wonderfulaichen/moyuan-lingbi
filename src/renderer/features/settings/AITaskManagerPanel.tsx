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

  // 获取状态显示配置
  const getStatusConfig = (status: TaskStatus) => {
    const configs = {
      pending: { label: '等待中', color: 'text-yellow-600', bg: 'bg-yellow-100' },
      running: { label: '运行中', color: 'text-blue-600', bg: 'bg-blue-100' },
      completed: { label: '已完成', color: 'text-green-600', bg: 'bg-green-100' },
      failed: { label: '失败', color: 'text-red-600', bg: 'bg-red-100' },
      cancelled: { label: '已取消', color: 'text-gray-600', bg: 'bg-gray-100' },
    };
    return configs[status] || configs.pending;
  };

  // 获取类型显示配置
  const getTypeConfig = (type: AITask['type']) => {
    const configs = {
      generation: { label: '生成', icon: 'fa-magic', color: 'text-purple-600' },
      analysis: { label: '分析', icon: 'fa-search', color: 'text-blue-600' },
      consistency: { label: '检查', icon: 'fa-check-circle', color: 'text-green-600' },
      memory: { label: '记忆', icon: 'fa-brain', color: 'text-cyan-600' },
      review: { label: '审查', icon: 'fa-clipboard-check', color: 'text-orange-600' },
      other: { label: '其他', icon: 'fa-cube', color: 'text-gray-600' },
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
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <i className="fas fa-robot text-purple-600"></i>
            <h3 className="font-semibold text-gray-900">AI 任务管理</h3>
          </div>
          <div className="flex items-center gap-2">
            {stats.running > 0 && (
              <button
                onClick={cancelAllTasks}
                className="px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
              >
                <i className="fas fa-stop mr-1"></i>
                全部停止
              </button>
            )}
            {stats.completed + stats.failed + stats.cancelled > 0 && (
              <button
                onClick={clearCompleted}
                className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <i className="fas fa-trash mr-1"></i>
                清除已完成
              </button>
            )}
          </div>
        </div>

        {/* 统计信息 */}
        <div className="grid grid-cols-4 gap-2">
          <div className="bg-blue-50 rounded-lg p-2 text-center">
            <div className="text-lg font-bold text-blue-600">{stats.running + stats.pending}</div>
            <div className="text-xs text-blue-600/70">进行中</div>
          </div>
          <div className="bg-green-50 rounded-lg p-2 text-center">
            <div className="text-lg font-bold text-green-600">{stats.completed}</div>
            <div className="text-xs text-green-600/70">已完成</div>
          </div>
          <div className="bg-red-50 rounded-lg p-2 text-center">
            <div className="text-lg font-bold text-red-600">{stats.failed}</div>
            <div className="text-xs text-red-600/70">失败</div>
          </div>
          <div className="bg-gray-50 rounded-lg p-2 text-center">
            <div className="text-lg font-bold text-gray-600">{stats.total}</div>
            <div className="text-xs text-gray-600/70">总计</div>
          </div>
        </div>
      </div>

      {/* 任务列表 */}
      <div className="flex-1 overflow-y-auto">
        {tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-400">
            <i className="fas fa-inbox text-4xl mb-3"></i>
            <p className="text-sm">暂无AI任务</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {tasks.map((task) => {
              const statusConfig = getStatusConfig(task.status);
              const typeConfig = getTypeConfig(task.type);
              const isExpanded = expandedTaskId === task.id;

              return (
                <div key={task.id} className="p-3 hover:bg-gray-50 transition-colors">
                  {/* 任务头部 */}
                  <div 
                    className="flex items-center justify-between cursor-pointer"
                    onClick={() => setExpandedTaskId(isExpanded ? null : task.id)}
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <i className={`fas ${typeConfig.icon} ${typeConfig.color}`}></i>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm text-gray-900 truncate">
                            {task.name}
                          </span>
                          <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${statusConfig.bg} ${statusConfig.color}`}>
                            {statusConfig.label}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-500">
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
                          className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                          title="取消任务"
                        >
                          <i className="fas fa-times"></i>
                        </button>
                      )}
                      <i className={`fas fa-chevron-${isExpanded ? 'up' : 'down'} text-gray-400`}></i>
                    </div>
                  </div>

                  {/* 进度条 */}
                  {(task.status === 'running' || task.status === 'pending') && (
                    <div className="mt-2">
                      <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-blue-500 transition-all duration-300"
                          style={{ width: `${task.progress}%` }}
                        ></div>
                      </div>
                    </div>
                  )}

                  {/* 扩展信息 */}
                  {isExpanded && (
                    <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                      {task.description && (
                        <div className="mb-2">
                          <span className="text-xs font-medium text-gray-600">描述：</span>
                          <span className="text-xs text-gray-700 ml-1">{task.description}</span>
                        </div>
                      )}
                      
                      <div className="grid grid-cols-2 gap-2 text-xs mb-2">
                        <div>
                          <span className="font-medium text-gray-600">创建时间：</span>
                          <span className="text-gray-700">
                            {new Date(task.createdAt).toLocaleTimeString('zh-CN')}
                          </span>
                        </div>
                        {task.startedAt && (
                          <div>
                            <span className="font-medium text-gray-600">开始时间：</span>
                            <span className="text-gray-700">
                              {new Date(task.startedAt).toLocaleTimeString('zh-CN')}
                            </span>
                          </div>
                        )}
                        {task.completedAt && (
                          <div>
                            <span className="font-medium text-gray-600">完成时间：</span>
                            <span className="text-gray-700">
                              {new Date(task.completedAt).toLocaleTimeString('zh-CN')}
                            </span>
                          </div>
                        )}
                        <div>
                          <span className="font-medium text-gray-600">任务ID：</span>
                          <span className="text-gray-700 font-mono text-xs">{task.id.slice(0, 20)}...</span>
                        </div>
                      </div>

                      {task.error && (
                        <div className="p-2 bg-red-50 rounded text-xs text-red-700">
                          <i className="fas fa-exclamation-circle mr-1"></i>
                          {task.error}
                        </div>
                      )}

                      {task.result && (
                        <div className="mt-2">
                          <span className="text-xs font-medium text-gray-600">结果：</span>
                          <div className="mt-1 p-2 bg-white rounded border border-gray-200 max-h-32 overflow-y-auto">
                            <pre className="text-xs text-gray-700 whitespace-pre-wrap">
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
        <div className="p-3 bg-blue-50 border-t border-blue-200">
          <p className="text-xs text-blue-700 flex items-center gap-2">
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
    <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 rounded-lg text-xs">
      <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
      <span className="text-blue-700 font-medium">
        AI任务: {stats.running + stats.pending} 进行中
      </span>
      <div className="flex gap-1">
        {stats.running > 0 && (
          <span className="text-blue-600">{stats.running}运行</span>
        )}
        {stats.pending > 0 && (
          <span className="text-yellow-600">{stats.pending}等待</span>
        )}
      </div>
    </div>
  );
}
