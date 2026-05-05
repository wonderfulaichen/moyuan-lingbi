import React, { useState, useEffect, useCallback } from 'react';
import { AppData } from '../../shared/types/fileSystem';
import { Project } from '../../shared/types';
import { dataService } from '../shared/services/DataService';
import { AIStatusProvider } from '../shared/contexts/AIStatusContext';
import { ThemeProvider } from '../shared/contexts/ThemeContext';
import { ToastProvider } from '../shared/contexts/ToastContext';
import { ZoomProvider } from '../shared/contexts/ZoomContext';
import StepSidebar from './app-shell/StepSidebar';
import StepInspiration from '../features/inspiration/StepInspiration';
import StepSettings from '../features/settings/StepSettings';
import StepPlot from '../features/plot/StepPlot';
import StepReview from '../features/review/StepReview';
import AIAssistantPanel from './app-shell/AIAssistantPanel';
import SettingsModal from '../features/settings/SettingsModal';
import ThemeToggle from '../shared/components/ThemeToggle';
import CreateProjectModal from '../shared/components/CreateProjectModal';
import { ConfirmModal } from '../shared/components/Modal';
import { useAIStatus } from '../shared/contexts/AIStatusContext';
import { useZoom } from '../shared/contexts/ZoomContext';

export type StepId = 'inspiration' | 'content' | 'plot' | 'review';

const STEPS: { id: StepId; label: string; icon: string; shortLabel: string }[] = [
  { id: 'inspiration', label: '灵感萌发', icon: 'fa-lightbulb', shortLabel: '灵感' },
  { id: 'content', label: '内容设定', icon: 'fa-folder-tree', shortLabel: '设定' },
  { id: 'plot', label: '情节创作', icon: 'fa-pen-nib', shortLabel: '情节' },
  { id: 'review', label: '审查校对', icon: 'fa-check-double', shortLabel: '审查' },
];

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

function TopInfoBar({ activeProject, activeStep, activeModel }: {
  activeProject: AppData['projects'][0] | null;
  activeStep: StepId;
  activeModel: AppData['models'][0];
}) {
  const { status } = useAIStatus();
  const { isGenerating, statusMessage, progress, tokenUsage, error } = status;
  const { zoomPercent, zoomIn, zoomOut, zoomReset } = useZoom();
  const stepLabel = STEPS.find(s => s.id === activeStep)?.label || '';
  const stepIcon = STEPS.find(s => s.id === activeStep)?.icon || '';

  return (
    <header className="h-10 flex items-center justify-between px-3 border-b shrink-0 sticky top-0 z-50"
      style={{ backgroundColor: 'var(--color-surface-base)', borderColor: 'var(--color-border-default)' }}>

      {/* ═══ 左侧：项目路径 + 当前步骤 ═══ */}
      <div className="flex items-center gap-2 min-w-0">
        {activeProject ? (
          <>
            <span className="text-xs font-bold truncate" style={{ color: 'var(--color-text-primary)' }}>{activeProject.title}</span>
            <i className="fas fa-chevron-right text-[8px]" style={{ color: 'var(--color-text-muted)' }} />
            <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-md"
              style={{ background: 'var(--color-surface-muted)', border: '1px solid var(--color-border-default)' }}>
              <i className={`fas ${stepIcon} text-[9px]`} style={{ color: 'var(--color-primary-400)' }} />
              <span className="text-[10px] font-medium" style={{ color: 'var(--color-primary-300)' }}>{stepLabel}</span>
            </div>
            {activeProject.selectedSchemeId && (
              <span className="badge badge-purple text-[8px]">已选方案</span>
            )}
          </>
        ) : (
          <span className="text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>墨渊灵笔 · AI小说创作工坊</span>
        )}
      </div>

      {/* ═══ 中间：AI 状态区（常驻） ═══ */}
      <div className="flex items-center gap-2 overflow-hidden">

        {/* 模型指示器 — 常驻 */}
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg shrink-0"
          style={{ background: 'var(--color-surface-hover)', border: '1px solid var(--color-border-default)' }}>
          <div className={`w-3.5 h-3.5 rounded bg-gradient-to-br ${activeModel ? providerColors[activeModel.provider] || 'from-[var(--color-primary-400)] to-[var(--color-primary-500)]' : 'from-gray-500 to-gray-600'} flex items-center justify-center shadow-sm`}>
            <i className={`fas ${activeModel ? (providerIcons[activeModel.provider] || 'fa-robot') : 'fa-plug'} text-white text-[6px]`} />
          </div>
          <span className="text-[10px] truncate max-w-[90px]" style={{ color: activeModel ? 'var(--color-text-secondary)' : 'var(--color-text-muted)' }}>
            {activeModel?.name || '未配置'}
          </span>
        </div>

        {/* 分隔线 */}
        <div className="w-px h-4 rounded-full shrink-0" style={{ background: 'var(--color-border-default)' }} />

        {/* AI 状态槽位 */}
        {isGenerating ? (
          <div className="flex items-center gap-2 px-2.5 py-0.5 rounded-lg animate-fade-in shrink-0"
            style={{ background: 'var(--color-primary-50)', border: '1px solid var(--color-primary-200)' }}>
            <div className="flex items-center gap-0.5">
              <div className="w-1 h-1 rounded-full animate-pulse" style={{ backgroundColor: 'var(--color-primary-400)', animationDelay: '0ms' }}></div>
              <div className="w-1 h-1 rounded-full animate-pulse" style={{ backgroundColor: 'var(--color-primary-400)', animationDelay: '200ms' }}></div>
              <div className="w-1 h-1 rounded-full animate-pulse" style={{ backgroundColor: 'var(--color-primary-400)', animationDelay: '400ms' }}></div>
            </div>
            <span className="text-[10px] truncate max-w-[140px]" style={{ color: 'var(--color-primary-300)' }}>{statusMessage || 'AI 生成中...'}</span>
            {progress > 0 && (
              <div className="w-12 h-1 rounded-full overflow-hidden" style={{ background: 'var(--color-primary-100)' }}>
                <div className="h-full rounded-full transition-all duration-300"
                  style={{ width: progress + '%', background: 'linear-gradient(90deg, var(--color-primary-500), var(--color-primary-300))' }} />
              </div>
            )}
          </div>
        ) : error ? (
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg shrink-0"
            style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.18)' }}>
            <i className="fas fa-circle-exclamation text-[9px] text-red-400" />
            <span className="text-[10px] text-red-400 truncate max-w-[120px]">{error}</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg shrink-0"
            style={{ background: 'var(--color-surface-hover)', border: '1px solid var(--color-border-default)' }}>
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--color-text-muted)', opacity: 0.4 }} />
            <span className="text-[10px]" style={{ color: 'var(--color-text-muted)', opacity: 0.6 }}>就绪</span>
          </div>
        )}

        {/* 分隔线 */}
        <div className="w-px h-4 rounded-full shrink-0" style={{ background: 'var(--color-border-default)' }} />

        {/* Token 用量 — 常驻 */}
        <div className="flex items-center gap-2 px-2 py-0.5 rounded-lg shrink-0"
          style={{ background: 'var(--color-surface-hover)', border: '1px solid var(--color-border-default)' }}>
          <i className="fas fa-microchip text-[9px]"
            style={{ color: (tokenUsage && tokenUsage.total > 0) ? 'var(--color-text-secondary)' : 'var(--color-text-muted)',
                      opacity: (tokenUsage && tokenUsage.total > 0) ? 1 : 0.45 }} />
          {(tokenUsage && tokenUsage.total > 0) ? (
            <>
              <span className="text-[9px] tabular-nums" style={{ color: 'var(--color-text-muted)' }}>
                输入 {tokenUsage.prompt.toLocaleString()} · 输出 {tokenUsage.completion.toLocaleString()}
              </span>
              <span className="text-[9px] font-semibold tabular-nums" style={{ color: 'var(--color-primary-400)' }}>
                合计 {tokenUsage.total.toLocaleString()}
              </span>
            </>
          ) : (
            <span className="text-[9px] tabular-nums" style={{ color: 'var(--color-text-muted)', opacity: 0.45 }}>输入 0 · 输出 0 合计 0</span>
          )}
        </div>
      </div>

      {/* ═══ 右侧：字体缩放 + 主题快速切换 ═══ */}
      <div className="flex items-center gap-0.5 shrink-0 ml-2">

        {/* 缩小字体 */}
        <button
          onClick={zoomOut}
          className="w-7 h-7 rounded-lg flex items-center justify-center transition-all duration-200 hover:bg-black/5 dark:hover:bg-white/5"
          style={{ color: 'var(--color-text-muted)' }}
          title="缩小文字"
        >
          <i className="fas fa-minus text-[10px]" />
        </button>

        {/* 字体大小显示 */}
        <span className="text-[9px] min-w-[32px] text-center tabular-nums px-0.5"
          style={{ color: 'var(--color-text-muted)' }}>
          {zoomPercent}%
        </span>

        {/* 放大字体 */}
        <button
          onClick={zoomIn}
          className="w-7 h-7 rounded-lg flex items-center justify-center transition-all duration-200 hover:bg-black/5 dark:hover:bg-white/5"
          style={{ color: 'var(--color-text-muted)' }}
          title="放大文字"
        >
          <i className="fas fa-plus text-[10px]" />
        </button>

        {/* 重置字体 */}
        <button
          onClick={zoomReset}
          className="w-7 h-7 rounded-lg flex items-center justify-center transition-all duration-200 hover:bg-black/5 dark:hover:bg-white/5"
          style={{ color: 'var(--color-text-muted)', opacity: zoomPercent !== 100 ? 1 : 0.35 }}
          title="重置为默认大小 (100%)"
        >
          <i className="fas fa-font text-[10px]" />
        </button>

        {/* 分隔线 */}
        <div className="w-px h-4 mx-1" style={{ background: 'var(--color-border-default)' }} />

        {/* 主题快速切换（暗色/亮色 + 配色选择） */}
        <ThemeToggle />
      </div>
    </header>
  );
}

const App: React.FC = () => {
  const [data, setData] = useState<AppData>(dataService.getData());
  const [activeStep, setActiveStep] = useState<StepId>('inspiration');
  const [activeFileId, setActiveFileId] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isCreateProjectOpen, setIsCreateProjectOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string } | null>(null);

  useEffect(() => {
    const unsub = dataService.subscribe(() => {
      setData({ ...dataService.getData() });
    });
    return unsub;
  }, []);

  const activeProject = data.projects.find(p => p.id === data.activeProjectId) || null;
  const activeModel = data.models.find(m => m.id === data.activeModelId) || data.models[0];

  const projectForSettings: Project | null = activeProject ? {
    id: activeProject.id,
    title: activeProject.title,
    inspiration: typeof activeProject.inspiration === 'string' 
      ? activeProject.inspiration 
      : (activeProject.inspiration as { text?: string }).text || '',
    intro: activeProject.intro || '',
    characters: [],
    outline: activeProject.outline || '',
    chapters: [],
    knowledge: [],
    locations: [],
    factions: [],
    ruleSystems: [],
    timelineEvents: [],
    inspirationTags: [],
    novelSchemes: activeProject.novelSchemes || [],
    selectedSchemeId: activeProject.selectedSchemeId || null,
    schemeGroups: activeProject.schemeGroups || [],
    schemeHistory: activeProject.schemeHistory || [],
    folders: (activeProject as unknown as Project).folders || [],
    lastModified: activeProject.updatedAt || Date.now(),
  } : null;

  const handleCreateProject = useCallback(() => {
    setIsCreateProjectOpen(true);
  }, []);

  const handleCreateProjectConfirm = useCallback((title: string) => {
    dataService.createProject(title);
  }, []);

  const handleDeleteProject = useCallback((id: string) => {
    setDeleteConfirm({ id });
  }, []);

  const handleDeleteProjectConfirm = useCallback(() => {
    if (deleteConfirm) {
      dataService.deleteProject(deleteConfirm.id);
      setActiveFileId(null);
    }
    setDeleteConfirm(null);
  }, [deleteConfirm]);

  const handleConfirmScheme = useCallback(() => {
    setActiveStep('content');
  }, []);

  const handleUpdateProject = useCallback((updates: Partial<Project>) => {
    if (!activeProject) return;
    const { folders, ...metaUpdates } = updates as Record<string, unknown>;
    if (folders) {
      dataService.updateProjectMeta({ folders: folders as typeof activeProject.folders });
    }
    if (Object.keys(metaUpdates).length > 0) {
      dataService.updateProjectMeta(metaUpdates as Partial<typeof activeProject>);
    }
  }, [activeProject]);

  const renderStepContent = () => {
    if (!activeProject) {
      return (
        <div className="h-full flex flex-col items-center justify-center px-8">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-purple-600 to-violet-800 flex items-center justify-center shadow-lg shadow-purple-900/50 animate-float mb-8">
            <i className="fas fa-pen-fancy text-white text-2xl"></i>
          </div>
          <h2 className="text-2xl font-black tracking-tight text-white mb-2">欢迎使用墨渊灵笔</h2>
          <p className="text-sm text-gray-500 mb-8">从左侧创建新作品，开始你的创作之旅</p>
          <button
            onClick={handleCreateProject}
            className="card-float-hover px-6 py-2.5 text-white rounded-lg transition-all text-sm font-medium shadow-lg flex items-center gap-2"
            style={{ background: 'linear-gradient(135deg, var(--color-primary-400), var(--color-primary-500))' }}
          >
            <i className="fas fa-plus"></i>创建新作品
          </button>
        </div>
      );
    }

    switch (activeStep) {
      case 'inspiration':
        return (
          <StepInspiration
            activeModel={activeModel}
            prompts={data.prompts}
            onConfirmScheme={handleConfirmScheme}
            onOpenSettings={() => setIsSettingsOpen(true)}
          />
        );
      case 'content':
        return (
          <StepSettings
            project={projectForSettings!}
            prompts={data.prompts}
            activeModel={activeModel}
            onUpdate={handleUpdateProject}
            onOpenSettings={() => setIsSettingsOpen(true)}
          />
        );
      case 'plot':
        return (
          <StepPlot
            project={projectForSettings!}
            prompts={data.prompts}
            activeModel={activeModel}
            onUpdate={handleUpdateProject}
            onOpenSettings={() => setIsSettingsOpen(true)}
          />
        );
      case 'review':
        return (
          <StepReview
            activeModel={activeModel}
            onOpenSettings={() => setIsSettingsOpen(true)}
          />
        );
      default:
        return null;
    }
  };

  return (
    <ThemeProvider>
      <ZoomProvider>
        <AIStatusProvider>
          <ToastProvider>
            <div className="fixed inset-0 flex flex-col overflow-hidden" style={{ backgroundColor: 'var(--color-surface-base)' }}>

              {/* ═══════ 顶部信息栏（全宽） ═══════ */}
              <TopInfoBar
                activeProject={activeProject}
                activeStep={activeStep}
                activeModel={activeModel}
              />

              {/* ═══════ 主区域：左中右三栏 ═══════ */}
              <div className="flex-1 flex overflow-hidden">

                {/* ── 左侧导航栏 ── */}
                <StepSidebar
                  steps={STEPS}
                  activeStep={activeStep}
                  onSelectStep={setActiveStep}
                  projects={data.projects}
                  activeProjectId={data.activeProjectId}
                  models={data.models}
                  activeModelId={data.activeModelId}
                  onCreateProject={handleCreateProject}
                  onSelectProject={(id) => dataService.setActiveProject(id)}
                  onDeleteProject={handleDeleteProject}
                  onRenameProject={(id, name) => dataService.renameProject(id, name)}
                  onOpenSettings={() => setIsSettingsOpen(true)}
                />

                {/* ── 中间内容区 ── */}
                <main className="flex-1 overflow-auto min-w-0">
                  {renderStepContent()}
                </main>

                {/* ── 右侧 AI 助手面板（常驻） ── */}
                <AIAssistantPanel
                  activeModel={activeModel}
                  onOpenSettings={() => setIsSettingsOpen(true)}
                />

              </div>

              {/* Settings Modal */}
              {isSettingsOpen && (
                <SettingsModal
                  models={data.models}
                  activeModelId={data.activeModelId}
                  prompts={data.prompts}
                  onUpdateModels={(models) => dataService.updateModels(models)}
                  onUpdateActiveModelId={(id) => dataService.setActiveModel(id)}
                  onUpdatePrompts={(prompts) => dataService.updatePrompts(prompts)}
                  onFactoryReset={() => { dataService.clearAll(); window.location.reload(); }}
                  onClose={() => setIsSettingsOpen(false)}
                />
              )}

              {/* Create Project Modal */}
              <CreateProjectModal
                isOpen={isCreateProjectOpen}
                onClose={() => setIsCreateProjectOpen(false)}
                onCreate={handleCreateProjectConfirm}
              />

              {/* Delete Project Confirm */}
              {deleteConfirm && (
                <ConfirmModal
                  title="删除作品"
                  message="确定要删除此作品吗？此操作不可撤销。"
                  variant="danger"
                  confirmText="删除"
                  onConfirm={handleDeleteProjectConfirm}
                  onCancel={() => setDeleteConfirm(null)}
                />
              )}
            </div>
          </ToastProvider>
        </AIStatusProvider>
      </ZoomProvider>
    </ThemeProvider>
  );
};

export default App;
