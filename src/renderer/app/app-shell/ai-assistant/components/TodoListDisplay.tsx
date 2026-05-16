import React from 'react';
import { TodoItem } from '../../../../shared/types/fileSystem';

interface TodoListDisplayProps {
  todos: TodoItem[];
  compact?: boolean;
  onUserEdit?: (todos: TodoItem[]) => void;
  onStepClick?: (stepId: string, action: 'skip' | 'cancel') => void;
}

const statusConfig = {
  pending: { icon: 'fa-circle', color: 'var(--color-text-muted)', bg: 'transparent', label: '' },
  in_progress: { icon: 'fa-spinner fa-spin', color: 'var(--color-primary-400)', bg: 'var(--color-primary-050)', label: '进行中' },
  completed: { icon: 'fa-circle-check', color: 'var(--color-success-400)', bg: 'transparent', label: '' },
  failed: { icon: 'fa-circle-xmark', color: 'var(--color-danger-400)', bg: 'var(--color-danger-050)', label: '失败' },
};

const systemIcons: Record<string, string> = {
  'fa-database': 'fa-database',
  'fa-scroll': 'fa-scroll',
  'fa-robot': 'fa-robot',
  'fa-code': 'fa-code',
  'fa-play': 'fa-play',
  'fa-check-double': 'fa-check-double',
};

export const TodoListDisplay: React.FC<TodoListDisplayProps> = ({ todos, compact = false, onUserEdit, onStepClick }) => {
  if (todos.length === 0) return null;

  const systemSteps = todos.filter(t => t.type === 'system');
  const taskSteps = todos.filter(t => t.type !== 'system');

  const completedCount = taskSteps.filter(t => t.status === 'completed').length;
  const taskProgress = taskSteps.length > 0 ? Math.round((completedCount / taskSteps.length) * 100) : 0;

  const systemInProgress = systemSteps.find(s => s.status === 'in_progress');

  if (compact) {
    return (
      <div className="mt-2 mb-1">
        {/* Compact: Task Steps Only */}
        {taskSteps.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5">
                <i className="fas fa-list-check text-[9px]" style={{ color: 'var(--color-text-muted)' }} />
                <span className="text-[9px] font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
                  任务清单
                </span>
                <span className="text-[8px] px-1.5 py-0.5 rounded-full" style={{
                  background: 'var(--color-surface-muted)',
                  color: 'var(--color-text-muted)',
                }}>
                  {completedCount}/{taskSteps.length}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-12 h-1 rounded-full overflow-hidden" style={{ background: 'var(--color-border-default)' }}>
                  <div 
                    className="h-full rounded-full transition-all duration-300" 
                    style={{ 
                      width: `${taskProgress}%`, 
                      background: taskProgress === 100 ? 'var(--color-success-400)' : 'var(--color-primary-400)' 
                    }} 
                  />
                </div>
                <span className="text-[8px]" style={{ color: 'var(--color-text-muted)' }}>{taskProgress}%</span>
              </div>
            </div>
            
            <div className="space-y-0.5 max-h-28 overflow-y-auto">
              {taskSteps.map((todo, idx) => {
                const config = statusConfig[todo.status];
                const isActive = todo.status === 'in_progress';
                
                return (
                  <div 
                    key={todo.id}
                    className="flex items-start gap-1.5 px-1.5 py-0.5 rounded transition-all cursor-pointer"
                    style={{ 
                      background: isActive ? 'var(--color-primary-050)' : 'transparent',
                    }}
                  >
                    <i 
                      className={`fas ${config.icon} text-[7px] mt-0.5 shrink-0`} 
                      style={{ color: config.color }} 
                    />
                    <span 
                      className="text-[9px] leading-relaxed flex-1"
                      style={{ 
                        color: todo.status === 'completed' ? 'var(--color-text-muted)' : 'var(--color-text-primary)',
                        textDecoration: todo.status === 'completed' ? 'line-through' : 'none',
                      }}
                    >
                      {todo.content}
                    </span>
                    {isActive && (
                      <span className="text-[7px] px-1 py-0.5 rounded shrink-0 animate-pulse" style={{
                        background: 'var(--color-primary-200)',
                        color: 'var(--color-primary-600)',
                      }}>
                        进行中
                      </span>
                    )}
                    {todo.status === 'failed' && (
                      <span className="text-[7px] px-1 py-0.5 rounded shrink-0" style={{
                        background: 'var(--color-danger-200)',
                        color: 'var(--color-danger-600)',
                      }}>
                        失败
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-xl border overflow-hidden animate-fade-in" style={{
      background: 'var(--color-surface-base)',
      borderColor: 'var(--color-border-default)',
      boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    }}>
      {systemSteps.length > 0 && (
        <div className="border-b" style={{ borderColor: 'var(--color-border-default)' }}>
          <div className="px-3 py-2 flex items-center gap-2" style={{
            background: 'var(--color-surface-muted)',
          }}>
            <i className="fas fa-gears text-[10px]" style={{ color: 'var(--color-primary-400)' }} />
            <span className="text-[10px] font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
              系统执行步骤
            </span>
            {systemInProgress && (
              <span className="text-[8px] px-1.5 py-0.5 rounded-full animate-pulse" style={{
                background: 'var(--color-primary-100)',
                color: 'var(--color-primary-400)',
              }}>
                运行中
              </span>
            )}
          </div>
          <div className="p-2 space-y-1 max-h-32 overflow-y-auto">
            {systemSteps.map((step, idx) => {
              const config = statusConfig[step.status];
              const isLast = idx === systemSteps.length - 1;
              const isActive = step.status === 'in_progress';
              
              return (
                <div key={step.id} className="flex items-center gap-2">
                  <div className="flex flex-col items-center">
                    <div className="w-5 h-5 rounded-full flex items-center justify-center" style={{
                      background: isActive ? 'var(--color-primary-100)' : config.bg,
                    }}>
                      <i className={`fas ${step.icon || systemIcons['fa-play']} text-[7px]`} style={{ color: config.color }} />
                    </div>
                    {!isLast && (
                      <div className="w-0.5 h-3" style={{ 
                        background: step.status === 'completed' ? 'var(--color-success-400)' : 'var(--color-border-default)' 
                      }} />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px]" style={{ 
                        color: step.status === 'completed' ? 'var(--color-text-muted)' : 'var(--color-text-primary)',
                        textDecoration: step.status === 'completed' ? 'line-through' : 'none',
                      }}>
                        {step.content}
                      </span>
                      {isActive && step.details && (
                        <span className="text-[8px] px-1 py-0.5 rounded" style={{
                          background: 'var(--color-primary-100)',
                          color: 'var(--color-primary-400)',
                        }}>
                          {step.details}
                        </span>
                      )}
                      {step.status === 'failed' && step.details && (
                        <span className="text-[8px] px-1 py-0.5 rounded" style={{
                          background: 'var(--color-danger-100)',
                          color: 'var(--color-danger-400)',
                        }}>
                          {step.details}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {taskSteps.length > 0 && (
        <div className="p-2">
          <div className="flex items-center justify-between px-2 py-1.5 border-b" style={{
            borderColor: 'var(--color-border-default)',
          }}>
            <div className="flex items-center gap-2">
              <i className="fas fa-list-check text-[10px]" style={{ color: 'var(--color-text-muted)' }} />
              <span className="text-[10px] font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
                任务清单
              </span>
              <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{
                background: 'var(--color-surface-muted)',
                color: 'var(--color-text-muted)',
              }}>
                {completedCount}/{taskSteps.length}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-16 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--color-border-default)' }}>
                <div 
                  className="h-full rounded-full transition-all duration-300" 
                  style={{ 
                    width: `${taskProgress}%`, 
                    background: taskProgress === 100 ? 'var(--color-success-400)' : 'var(--color-primary-400)' 
                  }} 
                />
              </div>
              <span className="text-[9px]" style={{ color: 'var(--color-text-muted)' }}>{taskProgress}%</span>
            </div>
          </div>
          
          <div className="p-1.5 space-y-0.5 max-h-36 overflow-y-auto">
            {taskSteps.map((todo, idx) => {
              const config = statusConfig[todo.status];
              const isActive = todo.status === 'in_progress';
              
              return (
                <div 
                  key={todo.id}
                  className="flex items-start gap-2 px-2 py-1.5 rounded-lg transition-all cursor-pointer"
                  style={{ 
                    background: isActive ? 'var(--color-primary-050)' : 'transparent',
                  }}
                  onMouseEnter={e => {
                    if (!isActive) e.currentTarget.style.background = 'var(--color-surface-muted)';
                  }}
                  onMouseLeave={e => {
                    if (!isActive) e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <i 
                    className={`fas ${config.icon} text-[8px] mt-1 shrink-0`} 
                    style={{ color: config.color }} 
                  />
                  <span 
                    className="text-[10px] leading-relaxed flex-1"
                    style={{ 
                      color: todo.status === 'completed' ? 'var(--color-text-muted)' : 'var(--color-text-primary)',
                      textDecoration: todo.status === 'completed' ? 'line-through' : 'none',
                    }}
                  >
                    {todo.content}
                  </span>
                  {isActive && (
                    <span className="text-[8px] px-1 py-0.5 rounded shrink-0 animate-pulse" style={{
                      background: 'var(--color-primary-200)',
                      color: 'var(--color-primary-600)',
                    }}>
                      进行中
                    </span>
                  )}
                  {todo.status === 'failed' && (
                    <span className="text-[8px] px-1 py-0.5 rounded shrink-0" style={{
                      background: 'var(--color-danger-200)',
                      color: 'var(--color-danger-600)',
                    }}>
                      失败
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export function todoItemsToMarkdown(todos: TodoItem[]): string {
  return todos
    .map(t => {
      let box = '[ ]';
      if (t.status === 'completed') box = '[x]';
      else if (t.status === 'in_progress') box = '[-]';
      return `${box} ${t.content}`;
    })
    .join('\n');
}

export function todoItemsFromMarkdown(md: string): TodoItem[] {
  const lines = md.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const todos: TodoItem[] = [];
  
  for (const line of lines) {
    const match = line.match(/^(?:[-*]\s*)?\[\s*([ xX\-~])\s*\]\s+(.+)$/);
    if (!match) continue;
    
    let status: TodoItem['status'] = 'pending';
    if (match[1] === 'x' || match[1] === 'X') status = 'completed';
    else if (match[1] === '-' || match[1] === '~') status = 'in_progress';
    
    todos.push({ 
      id: `todo-${Date.now()}-${todos.length}`,
      content: match[2].trim(), 
      status,
      type: 'task',
    });
  }
  
  return todos;
}
