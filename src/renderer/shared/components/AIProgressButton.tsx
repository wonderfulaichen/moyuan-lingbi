import React from 'react';

interface AIProgressButtonProps {
  onClick: () => void;
  isGenerating: boolean;
  progress: number;
  label: string;
  generatingLabel?: string;
  disabled?: boolean;
  icon?: string;
  variant?: 'primary' | 'secondary' | 'outline';
  className?: string;
  style?: React.CSSProperties;
}

const AIProgressButton: React.FC<AIProgressButtonProps> = ({
  onClick,
  isGenerating,
  progress,
  label,
  generatingLabel,
  disabled,
  icon,
  variant = 'primary',
  className = '',
  style,
}) => {
  const clampedProgress = Math.min(100, Math.max(0, progress));

  const variantStyles: Record<string, React.CSSProperties> = {
    primary: {
      background: 'var(--color-surface-muted)',
      color: 'var(--color-text-primary)',
      border: '1px solid var(--color-border-default)',
      '--progress-color': 'linear-gradient(90deg, var(--color-primary-400), var(--color-primary-500))',
    } as React.CSSProperties,
    secondary: {
      background: 'var(--color-surface-base)',
      color: 'var(--color-primary-400)',
      border: '1px solid var(--color-primary-200)',
      '--progress-color': 'linear-gradient(90deg, var(--color-primary-300), var(--color-primary-400))',
    } as React.CSSProperties,
    outline: {
      background: 'transparent',
      color: 'var(--color-text-secondary)',
      border: '1px solid var(--color-border-default)',
      '--progress-color': 'linear-gradient(90deg, var(--color-primary-300), var(--color-primary-400))',
    } as React.CSSProperties,
  };

  const baseStyle: React.CSSProperties = {
    position: 'relative',
    overflow: 'hidden',
    padding: '10px 20px',
    borderRadius: '12px',
    fontSize: '14px',
    fontWeight: 500,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.4 : 1,
    transition: 'all 0.3s ease',
    border: 'none',
    outline: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    ...variantStyles[variant],
    ...style,
  };

  const progressFillStyle: React.CSSProperties = {
    position: 'absolute',
    top: 0,
    left: 0,
    height: '100%',
    width: `${clampedProgress}%`,
    background: 'linear-gradient(90deg, var(--color-primary-400), var(--color-primary-500))',
    opacity: isGenerating ? 0.25 : 0,
    transition: 'width 0.5s ease, opacity 0.3s ease',
    borderRadius: '12px',
    zIndex: 0,
  };

  const contentStyle: React.CSSProperties = {
    position: 'relative',
    zIndex: 1,
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled || isGenerating}
      className={`${className} ${!isGenerating ? 'card-float-hover' : ''}`}
      style={baseStyle}
    >
      <div style={progressFillStyle} />
      <span style={contentStyle}>
        {isGenerating ? (
          <>
            <i className="fas fa-spinner fa-spin text-xs" />
            <span>{generatingLabel || '生成中...'} {clampedProgress > 5 ? `${Math.round(clampedProgress)}%` : ''}</span>
          </>
        ) : (
          <>
            {icon && <i className={`fas ${icon} text-xs`} />}
            <span>{label}</span>
          </>
        )}
      </span>
    </button>
  );
};

export default AIProgressButton;
