import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { ProjectMeta } from '../../../shared/types/fileSystem';
import { ModelConfig } from '../../../shared/types';
import { StepId } from '../App';
import { dataService } from '../../shared/services/DataService';
import { InputModal, ConfirmModal } from '../../shared/components/Modal';
import { useAIStatus } from '../../shared/contexts/AIStatusContext';
import { CHANGELOG } from '../../shared/data/changelog';
import { PROVIDER_INFO } from '../../../shared/constants';
import AppIcon from '../../../assets/icon.png';

interface StepSidebarProps {
  steps: { id: StepId; label: string; icon: string; shortLabel: string }[];
  activeStep: StepId;
  onSelectStep: (id: StepId) => void;
  projects: ProjectMeta[];
  activeProjectId: string | null;
  models: ModelConfig[];
  activeModelId: string;
  onCreateProject: () => void;
  onSelectProject: (id: string) => void;
  onDeleteProject: (id: string) => void;
  onRenameProject: (id: string, name: string) => void;
  onOpenSettings: () => void;
}

const StepSidebar: React.FC<StepSidebarProps> = ({
  steps, activeStep, onSelectStep,
  projects, activeProjectId, models, activeModelId,
  onCreateProject, onSelectProject, onDeleteProject, onRenameProject,
  onOpenSettings,
}) => {
  const [renameModal, setRenameModal] = useState<{ isOpen: boolean; bookId: string; currentTitle: string }>(
    { isOpen: false, bookId: '', currentTitle: '' }
  );
  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; bookId: string; bookTitle: string }>(
    { isOpen: false, bookId: '', bookTitle: '' }
  );
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('moyuan-sidebar-collapsed') === 'true'; } catch { return false; }
  });
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const modelTriggerRef = useRef<HTMLButtonElement>(null);
  const modelDropdownRef = useRef<HTMLDivElement>(null);
  const toggleCollapse = () => {
    setCollapsed(prev => {
      const next = !prev;
      try { localStorage.setItem('moyuan-sidebar-collapsed', String(next)); } catch {}
      return next;
    });
  };

  React.useEffect(() => {
    if (!modelDropdownOpen) return;
    const handler = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof MouseEvent) {
        const target = e.target as Node;
        const inTrigger = modelTriggerRef.current?.contains(target);
        const inDropdown = modelDropdownRef.current?.contains(target);
        if (!inTrigger && !inDropdown) setModelDropdownOpen(false);
      }
      if (e instanceof KeyboardEvent && e.key === 'Escape') setModelDropdownOpen(false);
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', handler);
    return () => { document.removeEventListener('mousedown', handler); document.removeEventListener('keydown', handler); };
  }, [modelDropdownOpen]);

  const activeModel = models.find(m => m.id === activeModelId);
  const { status } = useAIStatus();
  const { isGenerating, statusMessage, progress, tokenUsage, error } = status;

  return (
    <div className={`${collapsed ? 'w-13' : 'w-44 lg:w-48'} text-[var(--color-text-primary)] flex flex-col h-full border-r shrink-0
      overflow-hidden transition-all duration-300 ease-in-out`}
      style={{
        background: 'rgba(255, 255, 255, 0.02)',
        backdropFilter: 'blur(16px)',
        borderRight: '1px solid var(--color-border-default)',
      }}>

      {/* Logo区域 */}
      <div className={`${collapsed ? 'px-3 py-4' : 'px-4 py-4'} transition-all duration-300`}
        style={{
          background: 'var(--color-surface-hover)',
          borderBottom: '1px solid var(--color-border-default)',
        }}>
        <div className={`flex items-center ${collapsed ? 'justify-center' : 'gap-2.5'}`}>
          <div 
            className="w-8 h-8 rounded-xl overflow-hidden flex items-center justify-center animate-float"
            style={{
              background: 'var(--color-p-alpha-15)',
              boxShadow: '0 4px 15px var(--color-p-alpha-20)',
              border: '1px solid var(--color-border-default)',
            }}>
            <img src={AppIcon} alt="墨渊灵笔" className="w-full h-full object-contain" />
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <h1 className="text-base font-bold tracking-tight"
                style={{
                  background: 'var(--gradient-primary)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}>
                墨渊灵笔
              </h1>
              <p className="text-[9px] tracking-wider" style={{ color: 'var(--color-text-muted)' }}>AI小说创作工坊</p>
            </div>
          )}
        </div>
      </div>

      {/* 书籍管理区域 */}
      {collapsed ? (
        <div className="flex flex-col items-center py-3 gap-2">
          <div className="relative" title={`${projects.length} 个作品`}>
            <i className="fas fa-book text-sm text-gray-400"></i>
            {projects.length > 0 && (
              <span className="absolute -top-2 -right-2 min-w-[14px] h-[14px] rounded-full text-[7px] flex items-center justify-center text-white font-bold px-0.5"
                style={{ backgroundColor: 'var(--color-primary-500)' }}>
                {projects.length}
              </span>
            )}
          </div>
          <button onClick={onCreateProject} className="text-gray-500 hover:text-[var(--color-primary-400)] transition-colors" title="新建作品">
            <i className="fas fa-plus text-xs"></i>
          </button>
        </div>
      ) : (
        <div className="px-4 pt-4 animate-fade-in-up delay-100">
          <div className="text-[10px] text-gray-500 font-bold uppercase tracking-widest px-2 mb-2">作品管理</div>
          <div className="glass-card-inset p-2 card-float-hover">
            <div className="max-h-40 overflow-y-auto space-y-1 theme-scrollbar">
              {projects.map((book, i) => (
                <div
                  key={book.id}
                  className={`group flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-all duration-200 ${
                    activeProjectId === book.id
                      ? 'bg-theme-primary-100 text-theme-primary shadow-sm'
                      : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
                  }`}
                  style={{ animationDelay: i * 30 + 'ms' }}
                  onClick={() => onSelectProject(book.id)}
                >
                  <i className={`fas fa-book text-xs ${activeProjectId === book.id ? 'animate-glow-breathing' : ''}`}></i>
                  <span className="text-xs truncate flex-1">{book.title}</span>
                  <div className="hidden group-hover:flex items-center gap-1">
                    <button
                      onClick={(e) => { e.stopPropagation(); setRenameModal({ isOpen: true, bookId: book.id, currentTitle: book.title }); }}
                      className="text-gray-500 hover:text-theme-primary p-0.5 transition-colors"
                    >
                      <i className="fas fa-edit text-[10px]"></i>
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setDeleteModal({ isOpen: true, bookId: book.id, bookTitle: book.title }); }}
                      className="text-gray-500 hover:text-red-400 p-0.5 transition-colors"
                    >
                      <i className="fas fa-trash text-[10px]"></i>
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <button
              onClick={onCreateProject}
              className="w-full mt-2 px-2 py-1.5 text-xs text-theme-primary hover:bg-theme-primary-50 rounded-lg transition-all duration-200 flex items-center gap-2 group"
            >
              <i className="fas fa-plus group-hover:rotate-90 transition-transform duration-300"></i>
              <span>新建作品</span>
            </button>

            {/* 本地模型状态卡片 */}
            {activeModel && activeModel.provider === 'local' && (
              <div className="mt-2 mx-1 px-2.5 py-2 rounded-xl border border-amber-500/15 bg-gradient-to-r from-amber-500/5 to-orange-500/5 animate-fade-in-down">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <i className="fas fa-microchip text-[8px] text-amber-400"></i>
                  <span className="text-[9px] font-bold text-amber-400/80 uppercase tracking-wider">本地模型</span>
                  <div className="ml-auto flex items-center gap-1">
                    <div className={`w-1.5 h-1.5 rounded-full ${activeModel.gpuAcceleration ? 'bg-emerald-400' : 'bg-gray-500'}`}></div>
                    <span className={`text-[8px] ${activeModel.gpuAcceleration ? 'text-emerald-400' : 'text-gray-500'}`}>
                      {activeModel.gpuAcceleration ? 'GPU' : 'CPU'}
                    </span>
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[8px] text-gray-500">模型</span>
                    <span className="text-[9px] text-gray-300 truncate max-w-[140px]" title={activeModel.modelPath || activeModel.modelName}>
                      {activeModel.modelName || '未选择'}
                    </span>
                  </div>
                  {activeModel.contextSize && (
                    <div className="flex items-center justify-between">
                      <span className="text-[8px] text-gray-500">上下文</span>
                      <span className="text-[9px] text-amber-400/80 font-mono">
                        {(activeModel.contextSize / 1000).toFixed(0)}K
                      </span>
                    </div>
                  )}
                  {activeModel.gpuAcceleration && activeModel.gpuLayers !== undefined && (
                    <div className="flex items-center justify-between">
                      <span className="text-[8px] text-gray-500">GPU层</span>
                      <span className="text-[9px] text-emerald-400/80 font-mono">{activeModel.gpuLayers}</span>
                    </div>
                  )}
                </div>
                <div className="mt-2 pt-1.5 border-t border-amber-500/10 flex items-center gap-1">
                  <i className="fas fa-hdd text-[7px] text-gray-600"></i>
                  <span className="text-[8px] text-gray-600 truncate max-w-[160px]">
                    {activeModel.modelPath ? activeModel.modelPath.split(/[\\/]/).pop() : '未配置路径'}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 快速模型切换 */}
      {collapsed ? (
        activeModel && (
          <div className="flex justify-center py-1">
            <div
              className={`w-5 h-5 rounded-md bg-gradient-to-br ${PROVIDER_INFO[activeModel.provider]?.bgGradient || 'from-[var(--color-primary-400)] to-[var(--color-primary-500)]'} flex items-center justify-center ${activeModel.provider === 'local' ? 'ring-1 ring-amber-400/30' : ''}`}
              title={`${activeModel.name}${activeModel.provider === 'local' && activeModel.gpuAcceleration ? ' 🟢 GPU' : ''}`}
            >
              <i className={`fas ${PROVIDER_INFO[activeModel.provider]?.icon || 'fa-robot'} text-white text-[8px]`}></i>
            </div>
          </div>
        )
      ) : (
        <div className="px-4 pt-3 animate-fade-in-up delay-200">
          <div className="text-[10px] text-gray-500 font-bold uppercase tracking-widest px-2 mb-2">当前模型</div>
          <div className="glass-card-inset p-2 card-float-hover">
            <button
              type="button"
              ref={modelTriggerRef}
              onClick={() => setModelDropdownOpen(v => !v)}
              className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-pointer transition-all duration-200 hover:bg-white/5"
            >
              {activeModel ? (
                <>
                  <div className={`w-5 h-5 rounded-md bg-gradient-to-br ${PROVIDER_INFO[activeModel.provider]?.bgGradient || 'from-[var(--color-primary-400)] to-[var(--color-primary-500)]'} flex items-center justify-center shrink-0 shadow-sm`}>
                    <i className={`fas ${PROVIDER_INFO[activeModel.provider]?.icon || 'fa-robot'} text-white text-[8px]`}></i>
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <span className="text-xs font-medium text-gray-200 block truncate">{activeModel.name}</span>
                    <span className="text-[9px] text-gray-500 truncate block">{activeModel.modelName}</span>
                  </div>
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    activeModel.provider === 'local' ? 'bg-amber-400' :
                    activeModel.provider === 'ollama' ? 'bg-green-400' :
                    activeModel.provider === 'deepseek' ? 'bg-blue-400' : 'bg-[var(--color-primary-400)]'
                  }`} />
                </>
              ) : (
                <>
                  <div className="w-5 h-5 rounded-md bg-gradient-to-br from-gray-600 to-gray-700 flex items-center justify-center shrink-0">
                    <i className="fas fa-plug text-white text-[8px]"></i>
                  </div>
                  <span className="text-xs text-gray-500 flex-1">未配置模型</span>
                </>
              )}
              <i className={`fas fa-chevron-down text-[9px] text-gray-500 transition-transform duration-200 ${modelDropdownOpen ? 'rotate-180' : ''}`}></i>
            </button>
          </div>
        </div>
      )}

      {/* Portal: 模型下拉菜单 */}
      {modelDropdownOpen && modelTriggerRef.current && ReactDOM.createPortal(
        <div
          ref={modelDropdownRef}
          className="fixed z-[9999] animate-fade-in-down shadow-xl shadow-black/30 rounded-xl overflow-hidden"
          style={{
            background: 'var(--color-surface-overlay)',
            border: '1px solid var(--color-border-default)',
            backdropFilter: 'blur(12px)',
            minWidth: modelTriggerRef.current.offsetWidth - 16,
            top: modelTriggerRef.current.getBoundingClientRect().bottom + 6,
            left: modelTriggerRef.current.getBoundingClientRect().left,
          }}
        >
          <div className="max-h-52 overflow-y-auto theme-scrollbar py-1">
            {models.map(m => {
              const isActive = m.id === activeModelId;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => { dataService.setActiveModel(m.id); setModelDropdownOpen(false); }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 transition-all duration-150 text-left
                    ${isActive ? 'bg-[var(--color-primary-500)]/15' : 'hover:bg-[var(--color-surface-hover)]'}`}
                >
                  <div className={`w-6 h-6 rounded-lg bg-gradient-to-br ${PROVIDER_INFO[m.provider]?.bgGradient || 'from-[var(--color-primary-400)] to-[var(--color-primary-500)]'} flex items-center justify-center shrink-0 shadow-sm`}>
                    <i className={`fas ${PROVIDER_INFO[m.provider]?.icon || 'fa-robot'} text-white text-[9px]`}></i>
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className={`text-[11px] font-medium block truncate ${isActive ? 'text-[var(--color-primary-300)]' : 'text-[var(--color-text-primary)]'}`}>{m.name}</span>
                    <span className="text-[9px] truncate block" style={{ color: 'var(--color-text-muted)' }}>{m.modelName}</span>
                  </div>
                  {isActive && (
                    <i className="fas fa-check text-[9px] text-[var(--color-primary-400)] shrink-0"></i>
                  )}
                </button>
              );
            })}
          </div>
        </div>,
        document.body
      )}

      {/* 导航步骤 */}
      <nav className={`${collapsed ? 'mt-2' : 'mt-3'} ${collapsed ? 'px-1' : 'px-2'} flex-1`}>
        <div className={`${collapsed ? 'flex flex-col items-center gap-1' : 'space-y-0.5'}`}>
          {steps.map((step, i) => {
            const isActive = activeStep === step.id;
            const isDisabled = !activeProjectId && step.id !== 'inspiration';
            return (
              <button
                key={step.id}
                type="button"
                disabled={isDisabled}
                onClick={() => onSelectStep(step.id)}
                className={`flex items-center rounded-lg transition-all duration-200 ${
                  collapsed ? 'justify-center p-2.5 w-full' : 'w-full px-3 py-2.5'
                } ${isDisabled ? 'opacity-30 cursor-not-allowed' : ''}`}
                style={{
                  animationDelay: `${i * 60}ms`,
                  background: isActive 
                    ? 'var(--color-p-alpha-12)' 
                    : 'transparent',
                  boxShadow: isActive 
                    ? '0 2px 8px var(--color-p-alpha-12)' 
                    : 'none',
                  borderLeft: isActive ? '2px solid var(--color-primary-400)' : '2px solid transparent',
                  color: isActive ? 'var(--color-primary-300)' : 'var(--color-text-secondary)',
                }}
                onMouseEnter={(e) => {
                  if (!isDisabled && !isActive) {
                    e.currentTarget.style.background = 'var(--color-surface-hover)';
                    e.currentTarget.style.color = 'var(--color-text-primary)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isDisabled && !isActive) {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.color = 'var(--color-text-secondary)';
                  }
                }}
                title={collapsed ? step.label : undefined}
              >
                <div className={`flex items-center justify-center transition-all duration-200 ${isActive ? 'scale-105' : ''}`}>
                <i className={`fas ${step.icon} text-sm`} style={{ 
                  filter: isActive ? 'drop-shadow(0 0 4px var(--color-p-alpha-40))' : 'none',
                  color: isActive ? 'var(--color-primary-400)' : 'var(--color-text-muted)'
                }}></i>
              </div>
                {!collapsed && (
                  <>
                    <span className="ml-2 text-sm font-medium">{step.label}</span>
                    {isActive && (
                      <div 
                        className="ml-auto w-1 h-1 rounded-full"
                        style={{ 
                          background: 'var(--color-primary-400)',
                          boxShadow: '0 0 6px var(--color-p-alpha-60)',
                        }}
                      ></div>
                    )}
                  </>
                )}
              </button>
            );
          })}
        </div>
      </nav>

      {/* 设置按钮 */}
      <div className={collapsed ? 'px-1 mb-1' : 'px-2 mb-1'}>
        <button
          onClick={onOpenSettings}
          className={`flex items-center rounded-xl transition-all duration-200 text-xs ${
            collapsed ? 'w-full justify-center py-2' : 'w-full gap-2 px-3 py-2'
          }`}
          style={{
            color: 'var(--color-text-muted)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'var(--color-text-primary)';
            e.currentTarget.style.background = 'var(--color-surface-hover)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--color-text-muted)';
            e.currentTarget.style.background = 'transparent';
          }}
          title={collapsed ? '设置' : undefined}
        >
          <i className="fas fa-gear text-sm"></i>
          {!collapsed && <span className="font-medium">设置</span>}
        </button>
      </div>

      {/* 底部状态栏 */}
      {!collapsed && (
        <div 
          className="animate-fade-in-up delay-500"
          style={{
            borderTop: '1px solid var(--color-border-default)',
            background: 'var(--color-surface-hover)',
          }}>
          <div className="px-3 py-2 space-y-1">
            {isGenerating ? (
              <>
                <div className="flex items-center gap-1.5">
                  <div 
                    className="w-1.5 h-1.5 rounded-full animate-pulse"
                    style={{ 
                      background: 'var(--color-accent-emerald)',
                      boxShadow: '0 0 8px var(--color-accent-emerald)',
                    }}
                  ></div>
                  <span className="text-[9px] truncate flex-1" style={{ color: 'var(--color-accent-emerald)' }}>
                    {statusMessage || 'AI 生成中...'}
                  </span>
                </div>
                {tokenUsage && (
                  <div className="flex items-center gap-2 text-[8px]" style={{ color: 'var(--color-text-muted)' }}>
                    <span>{'↑' + tokenUsage.prompt}</span>
                    <span>{'↓' + tokenUsage.completion}</span>
                  </div>
                )}
              </>
            ) : error ? (
              <div className="flex items-center gap-1.5">
                <i className="fas fa-circle-exclamation text-[9px]" style={{ color: 'var(--color-accent-rose)' }}></i>
                <span className="text-[9px] truncate" style={{ color: 'var(--color-accent-rose)' }}>{error}</span>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <span className="text-[9px]" style={{ color: 'var(--color-text-muted)' }}>
                  v{CHANGELOG[0]?.version || '0.0.1'} · wonderful艾晨
                </span>
                {tokenUsage && tokenUsage.total > 0 && (
                  <span className="text-[9px]" style={{ color: 'var(--color-primary-300)' }}>
                    {tokenUsage.total.toLocaleString()} tokens
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 展开/收起按钮 */}
      <div style={{ borderTop: '1px solid var(--color-border-default)' }}>
        <button
          onClick={toggleCollapse}
          className="w-full flex items-center justify-center py-2 transition-all duration-200"
          style={{
            color: 'var(--color-text-muted)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'var(--color-text-primary)';
            e.currentTarget.style.background = 'var(--color-surface-hover)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--color-text-muted)';
            e.currentTarget.style.background = 'transparent';
          }}
          title={collapsed ? '展开侧边栏' : '收起侧边栏'}
        >
          <i className={`fas ${collapsed ? 'fa-chevron-right' : 'fa-chevron-left'} text-xs`}></i>
        </button>
      </div>

      {/* 重命名弹窗 */}
      {renameModal.isOpen && (
        <InputModal
          title="重命名作品"
          message="输入新的作品名称"
          placeholder="作品名称..."
          defaultValue={renameModal.currentTitle}
          confirmText="重命名"
          onConfirm={(newTitle) => { onRenameProject(renameModal.bookId, newTitle); setRenameModal({ isOpen: false, bookId: '', currentTitle: '' }); }}
          onCancel={() => setRenameModal({ isOpen: false, bookId: '', currentTitle: '' })}
        />
      )}

      {/* 删除确认弹窗 */}
      {deleteModal.isOpen && (
        <ConfirmModal
          title="删除作品"
          message={'确定要删除《' + deleteModal.bookTitle + '》吗？此操作不可撤销，所有相关数据将被永久删除。'}
          variant="danger"
          confirmText="确认删除"
          onConfirm={() => { onDeleteProject(deleteModal.bookId); setDeleteModal({ isOpen: false, bookId: '', bookTitle: '' }); }}
          onCancel={() => setDeleteModal({ isOpen: false, bookId: '', bookTitle: '' })}
        />
      )}
    </div>
  );
};

export default StepSidebar;
