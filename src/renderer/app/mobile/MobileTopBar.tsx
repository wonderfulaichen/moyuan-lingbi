import React from 'react';
import { useAIStatus } from '../../shared/contexts/AIStatusContext';
import { useMemoryStatus } from '../../shared/hooks/useMemoryStatus';
import { useTheme } from '../../shared/contexts/ThemeContext';
import { StepId } from './BottomNav';

interface MobileTopBarProps {
  activeProjectTitle?: string;
  activeStep: StepId;
  activeModelName?: string;
  onOpenDrawer?: () => void;
  onOpenAssistant?: () => void;
}

const STEPS: { id: StepId; label: string; icon: string }[] = [
  { id: 'inspiration', label: '灵感萌发', icon: 'fa-lightbulb' },
  { id: 'content', label: '内容设定', icon: 'fa-folder-tree' },
  { id: 'plot', label: '情节创作', icon: 'fa-pen-nib' },
  { id: 'review', label: '智能审查', icon: 'fa-brain' },
];

const MobileTopBar: React.FC<MobileTopBarProps> = ({
  activeProjectTitle,
  activeStep,
  activeModelName,
  onOpenDrawer,
  onOpenAssistant,
}) => {
  const { status } = useAIStatus();
  const { isGenerating, statusMessage } = status;
  const { isInitialized } = useMemoryStatus();
  const { mode, toggleMode, themeInfo } = useTheme();

  const currentStep = STEPS.find((s) => s.id === activeStep);

  const getThemeIcon = () => {
    if (mode === 'light') return 'fa-sun';
    return 'fa-moon';
  };

  return (
    <header className="mobile-top-bar">
      <div className="mobile-top-bar-content">
        {/* 左侧：汉堡菜单 + 项目/标题 */}
        <div className="mobile-top-bar-left">
          <button
            onClick={onOpenDrawer}
            className="w-9 h-9 rounded-xl flex items-center justify-center mr-2 transition-colors active:scale-95"
            style={{ background: 'var(--color-surface-muted)', color: 'var(--color-text-secondary)' }}
            aria-label="打开菜单"
          >
            <i className="fas fa-bars text-sm"></i>
          </button>
          {activeProjectTitle ? (
            <div className="flex items-center gap-2 min-w-0">
              <h1 className="mobile-project-title truncate">{activeProjectTitle}</h1>
              <span className="mobile-step-badge shrink-0">
                <i className={`fas ${currentStep?.icon} text-[10px]`}></i>
                {currentStep?.label}
              </span>
            </div>
          ) : (
            <h1 className="mobile-app-title">墨渊灵笔</h1>
          )}
        </div>

        {/* 右侧：状态指示器 + 助手按钮 + 主题切换 */}
        <div className="mobile-top-bar-right">
          {/* AI状态 */}
          {isGenerating ? (
            <div className="mobile-status-generating">
              <div className="mobile-status-dot pulse" />
              <span className="mobile-status-text">{statusMessage || '生成中'}</span>
            </div>
          ) : (
            <div className="mobile-status-ready">
              <div className="mobile-status-dot" />
              <span className="mobile-status-text">就绪</span>
            </div>
          )}

          {/* 助手按钮 */}
          {onOpenAssistant && (
            <button
              onClick={onOpenAssistant}
              className="w-8 h-8 rounded-xl flex items-center justify-center transition-colors active:scale-95"
              style={{ background: 'var(--color-primary-100)', color: 'var(--color-primary-400)' }}
              aria-label="打开AI助手"
            >
              <i className="fas fa-robot text-sm"></i>
            </button>
          )}

          {/* 主题切换（仅白天/夜晚模式） */}
          <button
            onClick={toggleMode}
            className="w-8 h-8 rounded-xl flex items-center justify-center transition-colors active:scale-95"
            style={{ background: 'var(--color-surface-muted)', color: 'var(--color-text-secondary)' }}
            aria-label="切换主题模式"
          >
            <i className={`fas ${getThemeIcon()} text-sm`}></i>
          </button>
        </div>
      </div>

      {/* 底部辅助信息栏（可选） */}
      {activeModelName && (
        <div className="mobile-aux-bar">
          <div className="mobile-model-info">
            <i className="fas fa-robot text-[10px]"></i>
            <span className="text-[10px]">{activeModelName}</span>
          </div>
          {activeProjectTitle && (
            <div className="mobile-memory-info">
              <i className={`fas fa-brain text-[10px] ${isInitialized ? 'pulse' : ''}`}></i>
              <span className="text-[10px]">{isInitialized ? '记忆已同步' : '记忆待更新'}</span>
            </div>
          )}
        </div>
      )}
    </header>
  );
};

export default MobileTopBar;
