import React, { useEffect, useState } from 'react';
import { WellnessMessage } from '../../../shared/services/WellnessService';
import { useTheme } from '../../../shared/contexts/ThemeContext';
import { useUIStore } from '../../../shared/stores/uiStore';

interface WellnessToastProps {
  message: WellnessMessage | null;
  onDismiss: () => void;
  onAction?: () => void;
}

const WellnessToast: React.FC<WellnessToastProps> = ({ message, onDismiss, onAction }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [progress, setProgress] = useState(100);
  const { themeInfo } = useTheme();
  const { animationLevel } = useUIStore();
  const hasAnimations = animationLevel !== 'none';

  useEffect(() => {
    if (message) {
      setIsVisible(true);
      setProgress(100);

      const duration = 8000;
      const interval = 100;
      const step = 100 / (duration / interval);

      const progressTimer = setInterval(() => {
        setProgress(prev => {
          const next = prev - step;
          if (next <= 0) {
            clearInterval(progressTimer);
            return 0;
          }
          return next;
        });
      }, interval);

      const dismissTimer = setTimeout(() => {
        setIsVisible(false);
        setTimeout(onDismiss, 300);
      }, duration);

      return () => {
        clearInterval(progressTimer);
        clearTimeout(dismissTimer);
      };
    }
  }, [message, onDismiss]);

  if (!message) return null;

  const handleAction = () => {
    onAction?.();
    setIsVisible(false);
    setTimeout(onDismiss, 300);
  };

  return (
    <div
      className={`
        fixed bottom-6 right-6 z-[100] max-w-sm
        ${hasAnimations ? 'transition-all duration-300' : ''}
        ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}
      `}
    >
      <div
        className="rounded-2xl overflow-hidden shadow-2xl"
        style={{
          background: 'var(--glass-bg)',
          backdropFilter: 'blur(16px)',
          border: `1px solid ${message.color}40`,
        }}
      >
        <div
          className="h-1 transition-all duration-100"
          style={{
            width: `${progress}%`,
            background: `linear-gradient(90deg, ${message.color}, ${message.color}80)`,
          }}
        />

        <div className="p-4">
          <div className="flex items-start gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{
                background: `${message.color}20`,
              }}
            >
              <i className={`fas ${message.icon} text-lg`} style={{ color: message.color }} />
            </div>

            <div className="flex-1 min-w-0">
              <h4 className="font-bold text-sm mb-1" style={{ color: 'var(--text-primary)' }}>
                {message.title}
              </h4>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                {message.message}
              </p>

              {message.action && (
                <button
                  onClick={handleAction}
                  className="mt-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                  style={{
                    background: message.color,
                    color: '#fff',
                  }}
                >
                  {message.action}
                </button>
              )}
            </div>

            <button
              onClick={() => {
                setIsVisible(false);
                setTimeout(onDismiss, 300);
              }}
              className="w-6 h-6 rounded-full flex items-center justify-center transition-colors"
              style={{
                background: 'var(--bg-tertiary)',
                color: 'var(--text-muted)',
              }}
            >
              <i className="fas fa-times text-xs" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WellnessToast;
