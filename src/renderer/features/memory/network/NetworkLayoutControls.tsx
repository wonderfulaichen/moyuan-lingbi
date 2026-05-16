import React from 'react';

interface NetworkLayoutControlsProps {
  onResetLayout: () => void;
}

const NetworkLayoutControls: React.FC<NetworkLayoutControlsProps> = ({ onResetLayout }) => {
  return (
    <div
      className="glass-card rounded-2xl p-4 shadow-lg"
      style={{
        backgroundColor: 'var(--color-surface-base)',
        border: '1px solid var(--color-border-default)',
      }}
    >
      <h3 className="font-bold text-sm mb-3" style={{ color: 'var(--color-text-primary)' }}>
        <i className="fas fa-arrows-alt mr-2" style={{ color: 'var(--color-primary-400)' }} />
        布局控制
      </h3>
      <button
        onClick={onResetLayout}
        className="w-full px-3 py-2 rounded-xl text-xs font-medium transition-all hover:opacity-80"
        style={{
          backgroundColor: 'var(--color-primary-100)',
          color: 'var(--color-primary-500)',
        }}
      >
        <i className="fas fa-sync-alt mr-1" />
        重置布局
      </button>
    </div>
  );
};

export default NetworkLayoutControls;
