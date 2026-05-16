import React, { useState } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { useUIStore } from '../stores/uiStore';

interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  label?: string;
  error?: string;
  hint?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  onRightIconClick?: () => void;
  fullWidth?: boolean;
  value?: string;
  onChange?: (value: string) => void;
}

const Input: React.FC<InputProps> = ({
  label,
  error,
  hint,
  leftIcon,
  rightIcon,
  onRightIconClick,
  fullWidth = true,
  className = '',
  value,
  onChange,
  ...props
}) => {
  const { themeInfo } = useTheme();
  const { animationLevel } = useUIStore();
  const [isFocused, setIsFocused] = useState(false);

  const hasAnimations = animationLevel !== 'none';

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange?.(e.target.value);
  };

  return (
    <div className={`flex flex-col gap-1.5 ${fullWidth ? 'w-full' : ''} ${className}`}>
      {label && (
        <label
          className="text-sm font-medium"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          {label}
        </label>
      )}
      <div className="relative">
        {leftIcon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-text-muted)' }}>
            {leftIcon}
          </div>
        )}
        <input
          value={value}
          onChange={handleChange}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          className={`w-full rounded-xl border bg-transparent px-3 py-2.5 text-sm outline-none transition-all duration-200 ${leftIcon ? 'pl-10' : ''} ${rightIcon ? 'pr-10' : ''}`}
          autoComplete="off"
          style={{
            color: 'var(--color-text-primary)',
            backgroundColor: 'var(--color-surface-muted)',
            borderColor: error 
              ? '#ef4444' 
              : isFocused 
                ? 'var(--color-primary-400)' 
                : 'var(--color-border-default)',
            boxShadow: isFocused 
              ? '0 0 0 4px var(--color-p-alpha-15)' 
              : 'none',
            transition: hasAnimations 
              ? 'border-color 0.2s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.2s cubic-bezier(0.4, 0, 0.2, 1)' 
              : 'none'
          }}
          {...props}
        />
        {rightIcon && onRightIconClick ? (
          <button
            type="button"
            className={`absolute right-3 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors`}
            onClick={onRightIconClick}
            style={{ color: 'var(--color-text-muted)' }}
            aria-label="toggle visibility"
          >
            {rightIcon}
          </button>
        ) : rightIcon ? (
          <div className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-text-muted)' }}>
            {rightIcon}
          </div>
        ) : null}
      </div>
      {error ? (
        <p className="text-xs" style={{ color: '#ef4444' }}>
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          {hint}
        </p>
      ) : null}
    </div>
  );
};

export default Input;
