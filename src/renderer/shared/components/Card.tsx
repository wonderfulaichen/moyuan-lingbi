import React from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { useUIStore } from '../stores/uiStore';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  headerAction?: React.ReactNode;
  footer?: React.ReactNode;
  bordered?: boolean;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  hoverable?: boolean;
  glassEffect?: boolean;
}

const Card: React.FC<CardProps> = ({
  children,
  title,
  subtitle,
  headerAction,
  footer,
  bordered = true,
  padding = 'md',
  hoverable = false,
  glassEffect = true,
  className = '',
  ...props
}) => {
  const { themeInfo } = useTheme();
  const { animationLevel } = useUIStore();

  const getPadding = () => {
    switch (padding) {
      case 'none': return 'p-0';
      case 'sm': return 'p-3';
      case 'lg': return 'p-6';
      default: return 'p-4';
    }
  };

  const hasAnimations = animationLevel !== 'none';

  return (
    <div
      className={`rounded-xl transition-all duration-300 ${getPadding()} ${hoverable && hasAnimations ? 'hover:-translate-y-1 cursor-pointer' : ''} ${className}`}
      style={{
        background: glassEffect ? 'var(--color-surface-card)' : 'var(--color-surface-elevated)',
        border: bordered ? '1px solid var(--color-border-default)' : 'none',
        boxShadow: hoverable ? 'var(--shadow-card)' : 'none',
        backdropFilter: glassEffect ? 'blur(12px)' : 'none',
        transition: hasAnimations ? 'box-shadow 0.3s cubic-bezier(0.4, 0, 0.2, 1), transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)' : 'none'
      }}
      {...props}
    >
      {(title || headerAction) && (
        <div className="flex items-start justify-between mb-4">
          <div>
            {title && (
              <h3 className="text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                {title}
              </h3>
            )}
            {subtitle && (
              <p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>
                {subtitle}
              </p>
            )}
          </div>
          {headerAction && <div className="flex items-center gap-2">{headerAction}</div>}
        </div>
      )}

      <div>{children}</div>

      {footer && (
        <div className="mt-4 pt-4 border-t" style={{ borderColor: 'var(--color-border-default)' }}>
          {footer}
        </div>
      )}
    </div>
  );
};

export default Card;
