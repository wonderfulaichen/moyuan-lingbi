import React, { useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { ModelConfig } from '../../../shared/types';
import AIAssistantPanel from '../app-shell/AIAssistantPanel';

interface RightDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  activeModel: ModelConfig;
  models: ModelConfig[];
  activeModelId: string;
  onSelectModel: (id: string) => void;
}

const RightDrawer: React.FC<RightDrawerProps> = ({
  isOpen,
  onClose,
  activeModel,
  models,
  activeModelId,
  onSelectModel,
}) => {
  const [touchStartX, setTouchStartX] = React.useState(0);
  const [isDragging, setIsDragging] = React.useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsDragging(false);
    }
  }, [isOpen]);

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    setTouchStartX(touch.clientX);
    setIsDragging(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;
    const touch = e.touches[0];
    const delta = touchStartX - touch.clientX;
    if (delta > 80) {
      onClose();
      setIsDragging(false);
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
  };

  if (!isOpen) return null;

  const drawerContent = (
    <div
      className="fixed inset-0 z-[10001] flex flex-col"
      style={{
        background: 'var(--color-surface-base)',
        width: '100vw',
        height: '100dvh',
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div className="flex items-center justify-between px-3 py-2.5 border-b shrink-0" style={{ borderColor: 'var(--color-border-default)' }}>
        <div className="flex items-center gap-2">
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center transition-colors"
            style={{ background: 'var(--color-surface-muted)', color: 'var(--color-text-muted)' }}
          >
            <i className="fas fa-chevron-left text-sm"></i>
          </button>
          <span className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>AI 助手</span>
        </div>
      </div>
      <div className="flex-1 min-h-0">
        <AIAssistantPanel
          activeModel={activeModel}
          models={models}
          activeModelId={activeModelId}
          onSelectModel={onSelectModel}
          onOpenSettings={() => {}}
        />
      </div>
    </div>
  );

  return ReactDOM.createPortal(drawerContent, document.body);
};

export default RightDrawer;
