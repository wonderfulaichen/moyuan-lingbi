
import React, { useState, useEffect, useCallback, useMemo, lazy, Suspense } from 'react';
import { AppData } from '../../shared/types/fileSystem';
import { Project } from '../../shared/types';
import { dataService } from '../shared/services/DataService';
import { AIStatusProvider } from '../shared/contexts/AIStatusContext';
import { useAIStatusStore } from '../shared/stores/aiStatusStore';
import { ThemeProvider } from '../shared/contexts/ThemeContext';
import { ToastProvider } from '../shared/contexts/ToastContext';
import { ZoomProvider } from '../shared/contexts/ZoomContext';
import { useDevice } from '../shared/hooks/useDevice';
import StepSidebar from './app-shell/StepSidebar';
import AIAssistantPanel from './app-shell/AIAssistantPanel';
import ThemeToggle from '../shared/components/ThemeToggle';
import { ConfirmModal } from '../shared/components/Modal';
import { useZoom } from '../shared/contexts/ZoomContext';
import { useMemoryStatus } from '../shared/hooks/useMemoryStatus';
import { PROVIDER_INFO } from '../../shared/constants';
import { useModule, useModuleRegistry } from '../shared/modules';

// Step 组件懒加载：按需加载各功能页，减小首屏 bundle 体积
const StepInspiration = lazy(() => import('../features/inspiration/StepInspiration'));
const StepSettings = lazy(() => import('../features/settings/StepSettings'));
const StepPlot = lazy(() => import('../features/plot/StepPlot'));
const StepReview = lazy(() => import('../features/review/StepReview'));
const StepMemory = lazy(() => import('../features/memory/StepMemory'));
// Modal 类组件懒加载：触发时才加载弹窗代码
const SettingsModal = lazy(() => import('../features/settings/SettingsModal'));
const CreateProjectModal = lazy(() => import('../shared/components/CreateProjectModal'));
// MobileApp 懒加载：移动端入口按需加载
const MobileApp = lazy(() => import('./mobile/MobileApp'));

export type StepId = 'inspiration' | 'content' | 'plot' | 'review' | 'memory';

const STEPS: { id: StepId; label: string; icon: string; shortLabel: string }[] = [
  { id: 'inspiration', label: '灵感萌发', icon: 'fa-lightbulb', shortLabel: '灵感' },
  { id: 'content', label: '内容设定', icon: 'fa-folder-tree', shortLabel: '设定' },
  { id: 'plot', label: '情节创作', icon: 'fa-pen-nib', shortLabel: '情节' },
  { id: 'review', label: '智能审查', icon: 'fa-search', shortLabel: '审查' },
];

function TopInfoBar({ activeProject, activeStep, activeModel }: {
  activeProject: AppData['projects'][0] | null;
  activeStep: StepId;
  activeModel: AppData['models'][0];
}) {
  const { isGenerating, statusMessage, progress, tokenUsage, error } = useAIStatusStore();
  const { zoomPercent, zoomIn, zoomOut, zoomReset } = useZoom();
  const { lastUpdated, relativeTime, totalEntries, isInitialized } = useMemoryStatus();
  const stepLabel = STEPS.find(s => s.id === activeStep)?.label || '';
  const stepIcon = STEPS.find(s => s.id === activeStep)?.icon || '';
  
  // 获取记忆体模块状态
  const memoryModuleInstance = useModule('memory');
  const isMemoryEnabled = memoryModuleInstance && memoryModuleInstance.status !== 'disabled';

  return (
    <header className="h-10 flex items-center justify-between px-3 border-b shrink-0 sticky top-0 z-50"
      style={{ 
        backgroundColor: 'var(--color-surface-elevated)', 
        borderColor: 'var(--color-border-default)',
        backdropFilter: 'blur(12px)',
      }}>

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
          <div className={`w-3.5 h-3.5 rounded bg-gradient-to-br ${activeModel ? PROVIDER_INFO[activeModel.provider]?.bgGradient || 'from-[var(--color-primary-400)] to-[var(--color-primary-500)]' : 'from-gray-500 to-gray-600'} flex items-center justify-center shadow-sm`}>
            <i className={`fas ${activeModel ? (PROVIDER_INFO[activeModel.provider]?.icon || 'fa-robot') : 'fa-plug'} text-white text-[6px]`} />
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
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg shrink-0 cursor-pointer"
            style={{ background: 'var(--color-error-50, rgba(239,68,68,0.08))', border: '1px solid var(--color-error-200, rgba(239,68,68,0.18))' }}
            title={error}
            aria-live="polite">
            <i className="fas fa-circle-exclamation text-[9px]" style={{ color: 'var(--color-error-400, #f87171)' }} />
            <span className="text-[10px] truncate max-w-[180px]" style={{ color: 'var(--color-error-400, #f87171)' }}>
              {error.includes('网络连接失败') ? '请配置API密钥' : error.split('\n')[0]}
            </span>
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

        {/* 分隔线 */}
        <div className="w-px h-4 rounded-full shrink-0" style={{ background: 'var(--color-border-default)' }} />

        {/* 记忆体状态 — 只有记忆体模块启用时显示 */}
        {activeProject && isMemoryEnabled && (
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg shrink-0"
            style={{ background: 'var(--color-surface-hover)', border: '1px solid var(--color-border-default)' }}
            title={lastUpdated ? `共 ${totalEntries} 条维护记录，最近操作：${relativeTime}` : '记忆体尚未更新'}>
            <i className={`fas fa-brain text-[9px] ${lastUpdated ? 'animate-pulse' : ''}`}
              style={{ color: lastUpdated ? 'var(--color-primary-400)' : 'var(--color-text-muted)', opacity: lastUpdated ? 1 : 0.45 }} />
            {lastUpdated ? (
              <span className="text-[9px]" style={{ color: 'var(--color-primary-300)' }}>
                记忆已更新（{relativeTime}）
              </span>
            ) : (
              <span className="text-[9px]" style={{ color: 'var(--color-text-muted)', opacity: 0.6 }}>
                {isInitialized ? '记忆体待更新' : '记忆体未初始化'}
              </span>
            )}
          </div>
        )}
      </div>

      {/* ═══ 右侧：字体缩放 + 主题快速切换 ═══ */}
      <div className="flex items-center gap-0.5 shrink-0 ml-2">

        {/* 缩小字体 */}
        <button
          onClick={zoomOut}
          className="w-7 h-7 rounded-lg flex items-center justify-center transition-all duration-200 hover:bg-[var(--color-surface-hover)]"
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
          className="w-7 h-7 rounded-lg flex items-center justify-center transition-all duration-200 hover:bg-[var(--color-surface-hover)]"
          style={{ color: 'var(--color-text-muted)' }}
          title="放大文字"
        >
          <i className="fas fa-plus text-[10px]" />
        </button>

        {/* 重置字体 */}
        <button
          onClick={zoomReset}
          className="w-7 h-7 rounded-lg flex items-center justify-center transition-all duration-200 hover:bg-[var(--color-surface-hover)]"
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
  const { isMobile } = useDevice();
  const [data, setData] = useState<AppData>(dataService.getData());
  const [activeStep, setActiveStep] = useState<StepId>('inspiration');
  const [activeFileId, setActiveFileId] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isCreateProjectOpen, setIsCreateProjectOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string } | null>(null);

  // 获取记忆体模块状态
  const memoryModuleInstance = useModule('memory');
  const isMemoryEnabled = memoryModuleInstance && memoryModuleInstance.status !== 'disabled';
  
  // 动态生成步骤列表
  const dynamicSteps = useMemo(() => {
    let steps = [...STEPS];
    if (isMemoryEnabled) {
      steps = [...steps, { id: 'memory' as StepId, label: '记忆体管理', icon: 'fa-brain', shortLabel: '记忆' }];
    }
    return steps;
  }, [isMemoryEnabled]);

  // 移动端使用专用的MobileApp组件
  if (isMobile) {
    return (
      <Suspense fallback={<div className="flex items-center justify-center h-screen text-xs" style={{ color: 'var(--color-text-muted)' }}>加载中...</div>}>
        <MobileApp />
      </Suspense>
    );
  }

  useEffect(() => {
    const unsub = dataService.subscribe(() => {
      setData({ ...dataService.getData() });
    });
    return unsub;
  }, []);

  // 初始化加密密钥 -> 迁移旧 XOR 密钥 -> 升级到 safeStorage -> 缓存明文到内存
  useEffect(() => {
    dataService.initCryptoKey()
      .then(() => dataService.migrateApiKeys())
      .then(() => dataService.upgradeToSafeStorage())
      .then(() => dataService.initApiKeyCache())
      .then(() => {
        // 缓存就绪后刷新一次 UI（getModels 现在能读到明文）
        setData({ ...dataService.getData() });
      })
      .catch(err => console.error('[App] 加密初始化失败:', err));
  }, []);

  const activeProject = data.projects.find(p => p.id === data.activeProjectId) || null;
  const models = dataService.getModels();
  const activeModel = models.find(m => m.id === data.activeModelId) || models[0];

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

  const stepContent = useMemo(() => {
    if (!activeProject) {
      return (
        <div className="h-full flex flex-col items-center justify-center px-8">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-purple-600 to-violet-800 flex items-center justify-center shadow-lg shadow-purple-900/50 animate-float mb-8">
            <i className="fas fa-pen-fancy text-white text-2xl"></i>
          </div>
          <h2 className="text-2xl font-black tracking-tight text-white mb-2">欢迎使用墨渊灵笔</h2>
          <p className="text-sm text-[var(--color-text-tertiary)] mb-8">从左侧创建新作品，开始你的创作之旅</p>
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
      case 'memory':
        return (
          <StepMemory
            activeModel={activeModel}
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
  }, [activeProject, activeStep, activeModel, data.prompts, projectForSettings, handleConfirmScheme, handleUpdateProject]);

  return (
    <ThemeProvider>
      <ZoomProvider>
        <AIStatusProvider>
          <ToastProvider>
            <div className="fixed inset-0 flex flex-col overflow-hidden" 
              style={{
                background: 'var(--gradient-surface-base, var(--color-surface-base, #030712))',
              }}>
              {/* 主题渐变光晕层 */}
              <div 
                className="fixed inset-0 pointer-events-none"
                style={{
                  background: `radial-gradient(ellipse 90% 70% at 50% -20%, var(--color-p-alpha-12, rgba(139, 92, 246, 0.12)) 0%, transparent 65%), radial-gradient(ellipse 70% 55% at 88% 115%, var(--color-p-alpha-08, rgba(168, 85, 247, 0.08)) 0%, transparent 60%), radial-gradient(ellipse 50% 40% at 12% 50%, var(--color-p-alpha-05, rgba(107, 127, 168, 0.05)) 0%, transparent 55%)`,
                }}
              />

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
                  steps={dynamicSteps}
                  activeStep={activeStep}
                  onSelectStep={setActiveStep}
                  projects={data.projects}
                  activeProjectId={data.activeProjectId}
                  models={models}
                  activeModelId={data.activeModelId}
                  onCreateProject={handleCreateProject}
                  onSelectProject={(id) => dataService.setActiveProject(id)}
                  onDeleteProject={handleDeleteProject}
                  onRenameProject={(id, name) => dataService.renameProject(id, name)}
                  onOpenSettings={() => setIsSettingsOpen(true)}
                />

                {/* ── 中间内容区 ── */}
                <main 
                  className="flex-1 overflow-auto min-w-0"
                  style={{
                    backdropFilter: 'blur(12px)',
                  }}>
                  <Suspense fallback={<div className="flex items-center justify-center h-full text-xs" style={{ color: 'var(--color-text-muted)' }}>加载中...</div>}>
                    {stepContent}
                  </Suspense>
                </main>

                {/* ── 右侧 AI 助手面板（常驻） ── */}
                <AIAssistantPanel
                  activeModel={activeModel}
                  models={models}
                  activeModelId={data.activeModelId}
                  onSelectModel={(id) => dataService.setActiveModel(id)}
                  onOpenSettings={() => setIsSettingsOpen(true)}
                />

              </div>

              {/* Settings Modal */}
              {isSettingsOpen && (
                <Suspense fallback={null}>
                  <SettingsModal
                    models={models}
                    activeModelId={data.activeModelId}
                    prompts={data.prompts}
                    onUpdateModels={(models) => dataService.updateModels(models)}
                    onUpdateActiveModelId={(id) => dataService.setActiveModel(id)}
                    onUpdatePrompts={(prompts) => dataService.updatePrompts(prompts)}
                    onFactoryReset={() => { dataService.clearAll(); window.location.reload(); }}
                    onClose={() => setIsSettingsOpen(false)}
                  />
                </Suspense>
              )}

              {/* Create Project Modal */}
              <Suspense fallback={null}>
                <CreateProjectModal
                  isOpen={isCreateProjectOpen}
                  onClose={() => setIsCreateProjectOpen(false)}
                  onCreate={handleCreateProjectConfirm}
                />
              </Suspense>

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
