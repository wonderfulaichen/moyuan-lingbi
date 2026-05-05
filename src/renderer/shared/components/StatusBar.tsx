import React from 'react';
import { useAIStatus } from '../contexts/AIStatusContext';

const StatusBar: React.FC = () => {
  const { status } = useAIStatus();

  // 没有任何状态需要显示
  if (!status.isGenerating && !status.statusMessage && !status.tokenUsage) {
    return null;
  }

  return (
    <div className="flex items-center gap-3 text-xs">
      {/* 生成动画指示器（代替静止的进度条） */}
      {status.isGenerating && (
        <div className="flex items-center gap-2">
          {/* 脉冲动画点 */}
          <div className="flex items-center gap-1">
            <div className="w-1.5 h-1.5 rounded-full animate-pulse"
              style={{ backgroundColor: 'var(--color-primary-400)' }}></div>
            <div className="w-1.5 h-1.5 rounded-full animate-pulse"
              style={{ backgroundColor: 'var(--color-primary-400)', animationDelay: '300ms' }}></div>
            <div className="w-1.5 h-1.5 rounded-full animate-pulse"
              style={{ backgroundColor: 'var(--color-primary-400)', animationDelay: '600ms' }}></div>
          </div>
          <span className="text-gray-400 min-w-[4rem]">{status.statusMessage}</span>
        </div>
      )}

      {/* 生成完成消息 (短暂显示) */}
      {!status.isGenerating && status.statusMessage && (
        <span className="text-emerald-400/80 animate-fade-in">
          <i className="fas fa-check-circle mr-1"></i>
          {status.statusMessage}
        </span>
      )}

      {/* Token 用量 —— 核心显示 */}
      {status.tokenUsage && (
        <div className="flex items-center gap-2 text-[11px] px-2.5 py-1 rounded-lg"
          style={{
            backgroundColor: status.isGenerating ? 'var(--color-primary-100)' : 'var(--color-surface-hover)',
            border: `1px solid ${status.isGenerating ? 'var(--color-primary-200)' : 'var(--color-border-default)'}`,
          }}
        >
          <i className="fas fa-microchip text-[10px]" style={{ color: 'var(--color-primary-400, #a855f7)' }}></i>
          <div className="flex items-center gap-2.5">
            <span>
              <span className="text-gray-500">P:</span>{' '}
              <span className="font-medium tabular-nums" style={{ color: 'var(--color-text-primary, #f1f5f9)' }}>
                {status.tokenUsage.prompt.toLocaleString()}
              </span>
            </span>
            <span className="text-gray-600">|</span>
            <span>
              <span className="text-gray-500">C:</span>{' '}
              <span className="font-medium tabular-nums" style={{ color: 'var(--color-text-primary, #f1f5f9)' }}>
                {status.tokenUsage.completion.toLocaleString()}
              </span>
            </span>
            <span className="text-gray-600">|</span>
            <span>
              <span className="text-gray-500">T:</span>{' '}
              <span className="font-bold tabular-nums" style={{ color: 'var(--color-primary-400, #a855f7)' }}>
                {status.tokenUsage.total.toLocaleString()}
              </span>
            </span>
          </div>
        </div>
      )}

      {/* 错误信息 */}
      {status.error && (
        <span className="text-red-400/80">
          <i className="fas fa-exclamation-triangle mr-1"></i>
          {status.error}
        </span>
      )}
    </div>
  );
};

export default StatusBar;
