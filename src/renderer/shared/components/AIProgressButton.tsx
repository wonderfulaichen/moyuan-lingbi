import React, { useRef, useEffect, useCallback } from 'react';

interface AIProgressButtonProps {
  onClick: () => void;
  isGenerating: boolean;
  progress?: number;
  label: string;
  generatingLabel?: string;
  disabled?: boolean;
  icon?: string;
  variant?: 'primary' | 'secondary' | 'outline';
  className?: string;
  style?: React.CSSProperties;
  size?: 'default' | 'sm';
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
  size = 'default',
}) => {
  const isSm = size === 'sm';
  const showProgress = isGenerating && progress !== undefined && progress !== null && progress > 0;
  const buttonRef = useRef<HTMLButtonElement>(null);
  const onClickRef = useRef(onClick);
  onClickRef.current = onClick;

  useEffect(() => {
    const el = buttonRef.current;
    if (!el || disabled || isGenerating) return;
    const handler = (e: MouseEvent) => {
      console.log('[AIProgressButton][native] mousedown!', { label, isGenerating, disabled });
    };
    el.addEventListener('mousedown', handler);
    return () => el.removeEventListener('mousedown', handler);
  }, [disabled, isGenerating, label]);

  const handleClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    console.log('[AIProgressButton] clicked!', { isGenerating, disabled, label });
    if (disabled || isGenerating) {
      console.log('[AIProgressButton] ignoring click - disabled or generating');
      return;
    }
    try {
      onClick();
    } catch (err) {
      console.error('[AIProgressButton] onClick error:', err);
    }
  }, [onClick, isGenerating, disabled, label]);

  const variantStyles: Record<string, React.CSSProperties> = {
    primary: { background: 'var(--color-surface-muted)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border-default)' },
    secondary: { background: 'var(--color-surface-base)', color: 'var(--color-primary-400)', border: '1px solid var(--color-primary-200)' },
    outline: { background: 'transparent', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border-default)' },
  };

  const generatingStyle: React.CSSProperties = isGenerating ? {
    background: 'linear-gradient(90deg, var(--color-primary-500), var(--color-primary-400), var(--color-primary-500))',
    backgroundSize: '200% 100%',
    animation: 'progressShimmer 1.5s linear infinite',
    color: '#ffffff',
    border: '1px solid var(--color-primary-400)',
    pointerEvents: 'auto',
    cursor: 'default',
  } : {};

  const baseStyle: React.CSSProperties = {
    padding: isSm ? '6px 12px' : '8px 16px',
    borderRadius: '8px',
    fontSize: isSm ? '11px' : '14px',
    fontWeight: 500,
    cursor: disabled || isGenerating ? 'default' : 'pointer',
    opacity: disabled || isGenerating ? 0.4 : 1,
    transition: 'all 0.3s ease',
    display: 'inline-flex',
    alignItems: 'center',
    gap: isSm ? '4px' : '6px',
    position: 'relative',
    zIndex: 1,
    userSelect: 'none',
    ...variantStyles[variant],
    ...generatingStyle,
    ...style,
  };

  const isDisabled = disabled || isGenerating;

  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={handleClick}
      disabled={isDisabled}
      className={`${className} ${!isDisabled ? 'card-float-hover' : ''}`}
      style={baseStyle}
    >
      {isGenerating ? (
        <>
          <i className="fas fa-spinner fa-spin" style={{ fontSize: isSm ? '9px' : '12px' }} />
          <span>{generatingLabel || '生成中...'}{showProgress ? ` ${Math.round(progress)}%` : ''}</span>
        </>
      ) : (
        <>
          {icon && <i className={`fas ${icon}`} style={{ fontSize: isSm ? '9px' : '12px' }} />}
          <span>{label}</span>
        </>
      )}
    </button>
  );
};

export default AIProgressButton;
