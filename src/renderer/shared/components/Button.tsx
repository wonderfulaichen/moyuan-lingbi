import React from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { useUIStore } from '../stores/uiStore';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'warning';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: React.ReactNode;
  isLoading?: boolean;
  fullWidth?: boolean;
}

const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  icon,
  isLoading = false,
  fullWidth = false,
  className = '',
  disabled,
  ...props
}) => {
  const { themeInfo, mode } = useTheme();
  const { animationLevel } = useUIStore();

  // 根据变体确定样式
  const getVariantStyles = () => {
    switch (variant) {
      case 'primary':
        return {
          background: themeInfo.gradient,
          color: mode === 'light' ? '#0f172a' : '#ffffff',
          borderColor: 'transparent',
          hoverShadow: '0 4px 16px var(--color-p-alpha-40)'
        };
      case 'secondary':
        return {
          background: 'var(--color-surface-muted)',
          color: 'var(--color-text-primary)',
          borderColor: 'var(--color-border-default)',
          hoverShadow: '0 2px 8px var(--color-p-alpha-20)'
        };
      case 'ghost':
        return {
          background: 'transparent',
          color: 'var(--color-text-secondary)',
          borderColor: 'transparent',
          hoverShadow: 'none'
        };
      case 'danger':
        return {
          background: 'linear-gradient(135deg, #ef4444, #dc2626)',
          color: '#ffffff',
          borderColor: 'transparent',
          hoverShadow: '0 4px 16px rgba(239, 68, 68, 0.3)'
        };
      case 'success':
        return {
          background: 'linear-gradient(135deg, #10b981, #059669)',
          color: '#ffffff',
          borderColor: 'transparent',
          hoverShadow: '0 4px 16px rgba(16, 185, 129, 0.3)'
        };
      case 'warning':
        return {
          background: 'linear-gradient(135deg, #f59e0b, #d97706)',
          color: '#ffffff',
          borderColor: 'transparent',
          hoverShadow: '0 4px 16px rgba(245, 158, 11, 0.3)'
        };
      default:
        return {
          background: themeInfo.gradient,
          color: mode === 'light' ? '#0f172a' : '#ffffff',
          borderColor: 'transparent',
          hoverShadow: '0 4px 16px var(--color-p-alpha-40)'
        };
    }
  };

  // 根据尺寸确定样式
  const getSizeStyles = () => {
    switch (size) {
      case 'sm':
        return { padding: '0.375rem 0.75rem', fontSize: '0.75rem', gap: '0.375rem' };
      case 'lg':
        return { padding: '0.75rem 1.5rem', fontSize: '1rem', gap: '0.625rem' };
      default:
        return { padding: '0.5rem 1rem', fontSize: '0.875rem', gap: '0.5rem' };
    }
  };

  const variantStyles = getVariantStyles();
  const sizeStyles = getSizeStyles();
  const hasAnimations = animationLevel !== 'none';

  return (
    <button
      disabled={disabled || isLoading}
      className={`inline-flex items-center justify-center rounded-xl border font-medium transition-all duration-200 ${hasAnimations ? 'hover:-translate-y-0.5 active:translate-y-0' : ''} disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none ${fullWidth ? 'w-full' : ''} ${className}`}
      style={{
        ...variantStyles,
        ...sizeStyles,
        gap: sizeStyles.gap,
        boxShadow: variantStyles.hoverShadow,
        transition: hasAnimations 
          ? 'box-shadow 0.2s cubic-bezier(0.4, 0, 0.2, 1), transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)' 
          : 'none'
      }}
      onMouseEnter={(e) => {
        if (hasAnimations && !disabled && !isLoading) {
          e.currentTarget.style.boxShadow = variantStyles.hoverShadow;
        }
      }}
      onMouseLeave={(e) => {
        if (hasAnimations) {
          e.currentTarget.style.boxShadow = 'none';
        }
      }}
      {...props}
    >
      {isLoading ? (
        <>
          <i className="fas fa-spinner fa-spin"></i>
          {children}
        </>
      ) : (
        <>
          {icon}
          {children}
        </>
      )}
    </button>
  );
};

export default Button;
