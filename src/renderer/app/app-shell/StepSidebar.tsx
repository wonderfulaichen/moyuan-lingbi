import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { ProjectMeta } from '../../../shared/types/fileSystem';
import { ModelConfig } from '../../../shared/types';
import { StepId } from '../App';
import { dataService } from '../../shared/services/DataService';
import { InputModal, ConfirmModal } from '../../shared/components/Modal';
import { useAIStatus } from '../../shared/contexts/AIStatusContext';
import { CHANGELOG } from '../../shared/data/changelog';

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

const providerColors: Record<string, string> = {
  'openai-compatible': 'from-[var(--color-primary-400)] to-[var(--color-primary-500)]',
  'deepseek': 'from-blue-500 to-cyan-600',
  'ollama': 'from-green-500 to-emerald-600',
};

const providerIcons: Record<string, string> = {
  'openai-compatible': 'fa-cloud',
  'deepseek': 'fa-dragon',
  'ollama': 'fa-server',
};

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
      if (e instanceof MouseEvent && modelTriggerRef.current && !modelTriggerRef.current.contains(e.target as Node)) setModelDropdownOpen(false);
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
    <div className={`${collapsed ? 'w-16' : 'w-56 lg:w-64'} text-gray-100 flex flex-col h-full border-r shrink-0
      bg-gray-950/70 backdrop-blur-xl border-r-white/5 overflow-hidden transition-all duration-300 ease-in-out`}>

      {/* Logo区域 */}
      <div className={`${collapsed ? 'px-3 py-4' : 'p-5'} border-b border-white/5 transition-all duration-300`}>
        <div className={`flex items-center ${collapsed ? 'justify-center' : 'gap-3'}`}>
          <div className="w-9 h-9 rounded-xl overflow-hidden flex items-center justify-center shadow-lg animate-float card-float-hover">
            <img src="/icon.png" alt="墨渊灵笔" className="w-full h-full object-contain" />
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-bold tracking-tight bg-clip-text text-transparent gradient-text-theme"
                style={{ backgroundImage: 'linear-gradient(to right, var(--color-primary-300), var(--color-primary-400))' }}>
                墨渊灵笔
              </h1>
              <p className="text-[10px] text-gray-500 tracking-wider">AI小说创作工坊</p>
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
          </div>
        </div>
      )}

      {/* 快速模型切换 */}
      {collapsed ? (
        activeModel && (
          <div className="flex justify-center py-1">
            <div
              className={`w-5 h-5 rounded-md bg-gradient-to-br ${providerColors[activeModel.provider] || 'from-[var(--color-primary-400)] to-[var(--color-primary-500)]'} flex items-center justify-center`}
              title={activeModel.modelName || '未配置模型'}
            >
              <i className={`fas ${providerIcons[activeModel.provider] || 'fa-robot'} text-white text-[8px]`}></i>
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
                  <div className={`w-5 h-5 rounded-md bg-gradient-to-br ${providerColors[activeModel.provider] || 'from-[var(--color-primary-400)] to-[var(--color-primary-500)]'} flex items-center justify-center shrink-0 shadow-sm`}>
                    <i className={`fas ${providerIcons[activeModel.provider] || 'fa-robot'} text-white text-[8px]`}></i>
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <span className="text-xs font-medium text-gray-200 block truncate">{activeModel.name}</span>
                    <span className="text-[9px] text-gray-500 truncate block">{activeModel.modelName}</span>
                  </div>
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
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
          className="fixed z-[9999] animate-fade-in-down shadow-xl shadow-black/30 rounded-xl overflow-hidden"
          style={{
            background: 'rgba(20, 20, 28, 0.97)',
            border: '1px solid rgba(255,255,255,0.08)',
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
                    ${isActive ? 'bg-[var(--color-primary-500)]/15' : 'hover:bg-white/5'}`}
                >
                  <div className={`w-6 h-6 rounded-lg bg-gradient-to-br ${providerColors[m.provider] || 'from-[var(--color-primary-400)] to-[var(--color-primary-500)]'} flex items-center justify-center shrink-0 shadow-sm`}>
                    <i className={`fas ${providerIcons[m.provider] || 'fa-robot'} text-white text-[9px]`}></i>
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className={`text-[11px] font-medium block truncate ${isActive ? 'text-[var(--color-primary-300)]' : 'text-gray-300'}`}>{m.name}</span>
                    <span className="text-[9px] truncate block text-gray-500">{m.modelName}</span>
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
      <nav className={`${collapsed ? 'mt-2' : 'mt-4'} ${collapsed ? 'px-1' : 'px-2'} flex-1`}>
        <div className={`${collapsed ? 'flex flex-col items-center gap-1' : 'glass-card-inset p-1.5 space-y-0.5'}`}>
          {steps.map((step, i) => (
            <button
              key={step.id}
              type="button"
              disabled={!activeProjectId && step.id !== 'inspiration'}
              onClick={() => onSelectStep(step.id)}
              className={`flex items-center rounded-xl transition-all duration-300 ${
                collapsed ? 'justify-center p-2.5' : 'w-full px-3 py-2.5'
              } ${
                activeStep === step.id
                  ? 'bg-theme-primary-100 text-theme-primary shadow-sm card-float-hover'
                  : 'text-gray-500 hover:bg-white/5 hover:text-gray-300'
              } ${!activeProjectId && step.id !== 'inspiration' ? 'opacity-30 cursor-not-allowed' : ''}`}
              style={{ animationDelay: i * 60 + 'ms' }}
              title={collapsed ? step.label : undefined}
            >
              <div className={`flex items-center justify-center transition-all duration-300 ${
                activeStep === step.id ? 'scale-110' : ''
              }`}>
                <i className={`fas ${step.icon} text-sm`}></i>
              </div>
              {!collapsed && (
                <>
                  <span className="ml-3 text-sm font-semibold tracking-wide">{step.label}</span>
                  {activeStep === step.id && (
                    <div className="ml-auto w-1.5 h-1.5 rounded-full bg-theme-primary animate-glow-breathing"></div>
                  )}
                </>
              )}
            </button>
          ))}
        </div>
      </nav>

      {/* 设置按钮 */}
      <div className={collapsed ? 'px-1 mb-1' : 'px-2 mb-1'}>
        <button
          onClick={onOpenSettings}
          className={`flex items-center rounded-xl text-gray-500 hover:text-gray-300 hover:bg-white/5 transition-all duration-200 text-xs ${
            collapsed ? 'w-full justify-center py-2' : 'w-full gap-2 px-3 py-2'
          }`}
          title={collapsed ? '设置' : undefined}
        >
          <i className="fas fa-gear text-sm"></i>
          {!collapsed && <span className="font-medium">设置</span>}
        </button>
      </div>

      {/* 底部状态栏 */}
      {!collapsed && (
        <div className="border-t border-white/5 animate-fade-in-up delay-500">
          <div className="px-3 py-2 space-y-1">
            {isGenerating ? (
              <>
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"></div>
                  <span className="text-[9px] text-green-400/80 truncate flex-1">{statusMessage || 'AI 生成中...'}</span>
                </div>
                {progress > 0 && (
                  <div className="w-full h-1 rounded-full overflow-hidden bg-white/5">
                    <div className="h-full rounded-full transition-all duration-300"
                      style={{ width: progress + '%', background: 'linear-gradient(90deg, var(--color-primary-500), var(--color-primary-300))' }}
                    />
                  </div>
                )}
                {tokenUsage && (
                  <div className="flex items-center gap-2 text-[8px] text-gray-500">
                    <span>{'↑' + tokenUsage.prompt}</span>
                    <span>{'↓' + tokenUsage.completion}</span>
                    <span>{Math.round(progress)}%</span>
                  </div>
                )}
              </>
            ) : error ? (
              <div className="flex items-center gap-1.5">
                <i className="fas fa-circle-exclamation text-[9px] text-red-400"></i>
                <span className="text-[9px] text-red-400/80 truncate">{error}</span>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                  v{CHANGELOG[0]?.version || '0.0.1'} · wonderful艾晨
                </span>
                {tokenUsage && tokenUsage.total > 0 && (
                  <span className="text-[9px]" style={{ color: 'var(--color-text-muted)' }}>{tokenUsage.total.toLocaleString()} tokens</span>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 展开/收起按钮 */}
      <div className="border-t border-white/5">
        <button
          onClick={toggleCollapse}
          className="w-full flex items-center justify-center py-2 text-gray-500 hover:text-gray-300 hover:bg-white/5 transition-all duration-200"
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
