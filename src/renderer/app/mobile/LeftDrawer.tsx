import React, { useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { ProjectMeta } from '../../../shared/types/fileSystem';
import { ModelConfig } from '../../../shared/types';
import { dataService } from '../../shared/services/DataService';
import { StepId } from './BottomNav';
import { useTheme } from '../../shared/contexts/ThemeContext';
import { PROVIDER_INFO } from '../../../shared/constants';

interface LeftDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  projects: ProjectMeta[];
  activeProjectId: string | null;
  activeStep: StepId;
  onSelectProject: (id: string) => void;
  onDeleteProject: (id: string) => void;
  onRenameProject: (id: string, name: string) => void;
  onCreateProject: () => void;
  onOpenSettings?: () => void;
  models: ModelConfig[];
  activeModelId: string;
}

const LeftDrawer: React.FC<LeftDrawerProps> = ({
  isOpen,
  onClose,
  projects,
  activeProjectId,
  activeStep,
  onSelectProject,
  onDeleteProject,
  onRenameProject,
  onCreateProject,
  onOpenSettings,
  models,
  activeModelId,
}) => {
  const { themeInfo } = useTheme();
  const drawerRef = useRef<HTMLDivElement>(null);
  const [touchStartX, setTouchStartX] = React.useState(0);
  const [touchCurrentX, setTouchCurrentX] = React.useState(0);
  const [isDragging, setIsDragging] = React.useState(false);
  const [dragOffset, setDragOffset] = React.useState(0);

  const activeModel = models.find(m => m.id === activeModelId);
  const drawerWidth = 280;

  useEffect(() => {
    if (isOpen) {
      setDragOffset(0);
      setIsDragging(false);
    }
  }, [isOpen]);

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    setTouchStartX(touch.clientX);
    setTouchCurrentX(touch.clientX);
    setIsDragging(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;
    const touch = e.touches[0];
    setTouchCurrentX(touch.clientX);
    const delta = touch.clientX - touchStartX;
    if (delta > 0) {
      setDragOffset(delta);
    }
  };

  const handleTouchEnd = () => {
    if (dragOffset > drawerWidth * 0.3) {
      onClose();
    }
    setDragOffset(0);
    setIsDragging(false);
  };

  const translateX = isOpen ? Math.max(0, dragOffset) : -drawerWidth;

  if (!isOpen && dragOffset === 0) return null;

  const drawerContent = (
    <div
      className="fixed inset-0 z-[10001] flex"
      style={{ pointerEvents: isOpen ? 'auto' : 'none' }}
    >
      <div
        className={`fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-300 ${
          dragOffset > 0 || isOpen ? 'opacity-100' : 'opacity-0'
        }`}
        style={{ backgroundColor: dragOffset > 0 ? `rgba(0,0,0,${0.3 + (dragOffset / drawerWidth) * 0.2})` : undefined }}
        onClick={onClose}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      />

      <div
        ref={drawerRef}
        className="fixed top-0 left-0 h-full w-72 flex flex-col shadow-2xl animate-slide-in-left"
        style={{
          background: 'var(--color-surface-base)',
          transform: `translateX(${translateX}px)`,
          transition: isDragging ? 'none' : 'transform 0.3s ease-out',
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div
          className="flex items-center gap-3 px-4 py-5 border-b shrink-0"
          style={{ borderColor: 'var(--color-border-default)' }}
        >
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{
              background: themeInfo.gradient,
              boxShadow: '0 4px 12px var(--color-p-alpha-20)',
            }}
          >
            <i className="fas fa-pen-fancy text-white text-lg"></i>
          </div>
          <div>
            <h2 className="text-base font-bold" style={{ color: 'var(--color-text-primary)' }}>
              墨渊灵笔
            </h2>
            <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
              AI小说创作工坊
            </p>
          </div>
          <button
            onClick={onClose}
            className="ml-auto w-8 h-8 rounded-full flex items-center justify-center transition-colors"
            style={{ background: 'var(--color-surface-muted)', color: 'var(--color-text-muted)' }}
          >
            <i className="fas fa-xmark text-sm"></i>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-3">
          <div className="px-4 mb-2">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
                作品列表
              </span>
              <button
                onClick={onCreateProject}
                className="w-6 h-6 rounded-lg flex items-center justify-center transition-colors"
                style={{ background: 'var(--color-primary-100)', color: 'var(--color-primary-400)' }}
              >
                <i className="fas fa-plus text-[10px]"></i>
              </button>
            </div>
          </div>

          <div className="px-3 space-y-0.5">
            {projects.map((project) => (
              <button
                key={project.id}
                onClick={() => {
                  onSelectProject(project.id);
                  onClose();
                }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-left"
                style={{
                  background: activeProjectId === project.id ? 'var(--color-p-alpha-12)' : 'transparent',
                  border: activeProjectId === project.id ? '1px solid var(--color-primary-200)' : '1px solid transparent',
                }}
              >
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: 'var(--color-primary-100)' }}
                >
                  <i
                    className="fas fa-book text-sm"
                    style={{ color: 'var(--color-primary-400)' }}
                  ></i>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: 'var(--color-text-primary)' }}>
                    {project.title}
                  </p>
                  <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                    {new Date(project.updatedAt || Date.now()).toLocaleDateString()}
                  </p>
                </div>
                {activeProjectId === project.id && (
                  <div
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ background: 'var(--color-primary-400)' }}
                  ></div>
                )}
              </button>
            ))}

            {projects.length === 0 && (
              <div className="py-8 text-center">
                <i className="fas fa-book-open text-2xl mb-2 block" style={{ color: 'var(--color-text-muted)' }}></i>
                <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  暂无作品
                </p>
                <button
                  onClick={onCreateProject}
                  className="mt-2 text-xs px-4 py-1.5 rounded-lg transition-colors"
                  style={{ background: 'var(--color-primary-100)', color: 'var(--color-primary-400)' }}
                >
                  创建第一个作品
                </button>
              </div>
            )}
          </div>

          <div className="px-4 mt-6 mb-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
              当前模型
            </span>
          </div>

          <div className="px-3 space-y-0.5">
            {models.map((model) => (
              <button
                key={model.id}
                onClick={() => {
                  dataService.setActiveModel(model.id);
                }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-left"
                style={{
                  background: activeModelId === model.id ? 'var(--color-p-alpha-12)' : 'transparent',
                }}
              >
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-gradient-to-br ${PROVIDER_INFO[model.provider]?.bgGradient || PROVIDER_INFO['openai-compatible']?.bgGradient}`}
                >
                  <i className={`fas ${PROVIDER_INFO[model.provider]?.icon || 'fa-robot'} text-white text-xs`}></i>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: 'var(--color-text-primary)' }}>
                    {model.name}
                  </p>
                  <p className="text-[10px] truncate" style={{ color: 'var(--color-text-muted)' }}>
                    {model.modelName}
                  </p>
                </div>
                {activeModelId === model.id && (
                  <i className="fas fa-check text-xs" style={{ color: 'var(--color-primary-400)' }}></i>
                )}
              </button>
            ))}
          </div>
        </div>

        <div
          className="p-4 border-t shrink-0"
          style={{ borderColor: 'var(--color-border-default)' }}
        >
          <button
            onClick={() => {
              onClose();
              onOpenSettings?.();
            }}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors"
            style={{ background: 'var(--color-surface-muted)', color: 'var(--color-text-secondary)' }}
          >
            <i className="fas fa-gear text-sm"></i>
            <span className="text-sm font-medium">设置</span>
          </button>
        </div>
      </div>
    </div>
  );

  return ReactDOM.createPortal(drawerContent, document.body);
};

export default LeftDrawer;
