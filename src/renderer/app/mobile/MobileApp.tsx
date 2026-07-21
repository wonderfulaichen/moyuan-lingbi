import React, { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { AppData } from '../../../shared/types/fileSystem';
import { Project } from '../../../shared/types';
import { dataService } from '../../shared/services/DataService';
import { AIStatusProvider } from '../../shared/contexts/AIStatusContext';
import { ThemeProvider } from '../../shared/contexts/ThemeContext';
import { ToastProvider } from '../../shared/contexts/ToastContext';
import { ZoomProvider } from '../../shared/contexts/ZoomContext';
import BottomNav, { StepId } from './BottomNav';
import MobileTopBar from './MobileTopBar';
import MobileWelcome from './MobileWelcome';
import MobileContentPanel from './MobileContentPanel';
import LeftDrawer from './LeftDrawer';
import RightDrawer from './RightDrawer';
import { ConfirmModal } from '../../shared/components/Modal';

// Step 组件懒加载：移动端按需加载各功能页
const StepInspiration = lazy(() => import('../../features/inspiration/StepInspiration'));
const StepSettings = lazy(() => import('../../features/settings/StepSettings'));
const StepPlot = lazy(() => import('../../features/plot/StepPlot'));
const StepReview = lazy(() => import('../../features/review/StepReview'));
// Modal 类组件懒加载
const SettingsModal = lazy(() => import('../../features/settings/SettingsModal'));
const CreateProjectModal = lazy(() => import('../../shared/components/CreateProjectModal'));

const STEPS: { id: StepId; label: string; icon: string }[] = [
  { id: 'inspiration', label: '灵感', icon: 'fa-lightbulb' },
  { id: 'content', label: '设定', icon: 'fa-folder-tree' },
  { id: 'plot', label: '创作', icon: 'fa-pen-nib' },
  { id: 'review', label: '审查', icon: 'fa-brain' },
];

const MobileApp: React.FC = () => {
  const [data, setData] = useState<AppData>(dataService.getData());
  const [activeStep, setActiveStep] = useState<StepId>('inspiration');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isCreateProjectOpen, setIsCreateProjectOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string } | null>(null);
  const [isLeftDrawerOpen, setIsLeftDrawerOpen] = useState(false);
  const [isRightDrawerOpen, setIsRightDrawerOpen] = useState(false);

  // 边缘滑动手势：从屏幕左边缘向右滑 → 打开左侧菜单
  const edgeSwipeState = useRef({ startX: 0, startY: 0, isEdgeSwipe: false });

  const handleEdgeTouchStart = useCallback((e: React.TouchEvent) => {
    if (isLeftDrawerOpen || isRightDrawerOpen) return;
    const touch = e.touches[0];
    const edgeThreshold = 30;

    if (touch.clientX < edgeThreshold) {
      edgeSwipeState.current = { startX: touch.clientX, startY: touch.clientY, isEdgeSwipe: true };
    } else {
      edgeSwipeState.current.isEdgeSwipe = false;
    }
  }, [isLeftDrawerOpen, isRightDrawerOpen]);

  const handleEdgeTouchMove = useCallback((e: React.TouchEvent) => {
    if (!edgeSwipeState.current.isEdgeSwipe) return;
    const touch = e.touches[0];
    const deltaX = touch.clientX - edgeSwipeState.current.startX;
    const deltaY = Math.abs(touch.clientY - edgeSwipeState.current.startY);

    // 竖向滑动超过横向，取消边缘手势（防止与滚动冲突）
    if (deltaY > Math.abs(deltaX) * 1.5) {
      edgeSwipeState.current.isEdgeSwipe = false;
      return;
    }

    e.preventDefault();
  }, []);

  const handleEdgeTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!edgeSwipeState.current.isEdgeSwipe) return;
    const touch = e.changedTouches[0];
    const deltaX = touch.clientX - edgeSwipeState.current.startX;
    const deltaY = Math.abs(touch.clientY - edgeSwipeState.current.startY);
    const minSwipeDistance = 50;

    // 竖向滑动干扰，不触发
    if (deltaY > Math.abs(deltaX) * 1.5) {
      edgeSwipeState.current.isEdgeSwipe = false;
      return;
    }

    // 从左边缘向右滑
    if (edgeSwipeState.current.startX < 30 && deltaX > minSwipeDistance) {
      setIsLeftDrawerOpen(true);
    }

    edgeSwipeState.current.isEdgeSwipe = false;
  }, []);

  useEffect(() => {
    const unsub = dataService.subscribe(() => {
      setData({ ...dataService.getData() });
    });
    return unsub;
  }, []);

  const activeProject = data.projects.find(p => p.id === data.activeProjectId) || null;
  const activeModel = data.models.find(m => m.id === data.activeModelId) || data.models[0];

  const projectForContent: Project | null = activeProject ? {
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

  const renderContent = () => {
    if (!activeProject) {
      return <MobileWelcome onCreateProject={handleCreateProject} />;
    }

    switch (activeStep) {
      case 'inspiration':
        return (
          <MobileContentPanel>
            <StepInspiration
              activeModel={activeModel}
              prompts={data.prompts}
              onConfirmScheme={handleConfirmScheme}
              onOpenSettings={() => setIsSettingsOpen(true)}
            />
          </MobileContentPanel>
        );
      case 'content':
        return (
          <MobileContentPanel>
            <StepSettings
              project={projectForContent!}
              prompts={data.prompts}
              activeModel={activeModel}
              onUpdate={handleUpdateProject}
              onOpenSettings={() => setIsSettingsOpen(true)}
            />
          </MobileContentPanel>
        );
      case 'plot':
        return (
          <MobileContentPanel>
            <StepPlot
              project={projectForContent!}
              prompts={data.prompts}
              activeModel={activeModel}
              onUpdate={handleUpdateProject}
              onOpenSettings={() => setIsSettingsOpen(true)}
            />
          </MobileContentPanel>
        );
      case 'review':
        return (
          <MobileContentPanel>
            <StepReview
              activeModel={activeModel}
            />
          </MobileContentPanel>
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
            <div
              className="mobile-app-container"
              onTouchStart={handleEdgeTouchStart}
              onTouchMove={handleEdgeTouchMove}
              onTouchEnd={handleEdgeTouchEnd}
            >
              {/* 顶部状态栏 */}
              <MobileTopBar
                activeProjectTitle={activeProject?.title}
                activeStep={activeStep}
                activeModelName={activeModel?.name}
                onOpenDrawer={() => setIsLeftDrawerOpen(true)}
                onOpenAssistant={() => setIsRightDrawerOpen(true)}
              />

              {/* 主内容区 */}
              <main className="mobile-main-content">
                <Suspense fallback={<div className="flex items-center justify-center h-full text-xs" style={{ color: 'var(--color-text-muted)' }}>加载中...</div>}>
                  {renderContent()}
                </Suspense>
              </main>

              {/* 底部导航栏 */}
              <BottomNav
                steps={STEPS}
                activeStep={activeStep}
                onSelectStep={setActiveStep}
                onOpenAssistant={() => setIsRightDrawerOpen(true)}
              />

              {/* 左侧抽屉菜单 */}
              <LeftDrawer
                isOpen={isLeftDrawerOpen}
                onClose={() => setIsLeftDrawerOpen(false)}
                projects={data.projects}
                activeProjectId={data.activeProjectId}
                activeStep={activeStep}
                onSelectProject={(id) => dataService.setActiveProject(id)}
                onDeleteProject={handleDeleteProject}
                onRenameProject={(id, name) => dataService.renameProject(id, name)}
                onCreateProject={handleCreateProject}
                onOpenSettings={() => setIsSettingsOpen(true)}
                models={data.models}
                activeModelId={data.activeModelId}
              />

              {/* 右侧助手抽屉 */}
              <RightDrawer
                isOpen={isRightDrawerOpen}
                onClose={() => setIsRightDrawerOpen(false)}
                activeModel={activeModel}
                models={data.models}
                activeModelId={data.activeModelId}
                onSelectModel={(id) => dataService.setActiveModel(id)}
              />

              {/* Settings Modal */}
              {isSettingsOpen && (
                <Suspense fallback={null}>
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

export default MobileApp;
