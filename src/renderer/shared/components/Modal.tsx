import React, { useState, useEffect, useRef } from 'react';

// ========== 通用模态框容器 ==========

interface ModalOverlayProps {
  children: React.ReactNode;
  onClose: () => void;
  maxWidth?: string;
}

export const ModalOverlay: React.FC<ModalOverlayProps> = ({ children, onClose, maxWidth = 'max-w-md' }) => {
  const [isClosing, setIsClosing] = useState(false);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => onClose(), 200);
  };

  return (
    <div
      className={`fixed inset-0 flex items-center justify-center z-50 ${isClosing ? 'animate-fade-out' : 'animate-fade-in'}`}
      style={{ background: 'var(--color-surface-base, rgba(0,0,0,0.6))', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', overscrollBehavior: 'contain' }}
      onClick={handleClose}
    >
      <div
        className={`${maxWidth} w-full mx-4 ${isClosing ? 'animate-fade-out-scale' : 'animate-fade-in-scale'}`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
};

// ========== 输入弹窗（替代prompt）==========

interface InputModalProps {
  title: string;
  message?: string;
  placeholder?: string;
  defaultValue?: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}

export const InputModal: React.FC<InputModalProps> = ({
  title,
  message,
  placeholder = '',
  defaultValue = '',
  confirmText = '确认',
  cancelText = '取消',
  onConfirm,
  onCancel,
}) => {
  const [value, setValue] = useState(defaultValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // 自动聚焦
    setTimeout(() => inputRef.current?.select(), 50);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (value.trim()) {
      onConfirm(value.trim());
    }
  };

  return (
    <ModalOverlay onClose={onCancel}>
      <form onSubmit={handleSubmit} className="glass-card rounded-2xl overflow-hidden">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center"
              style={{ background: 'var(--color-primary-100)' }}>
              <i className="fas fa-pen text-sm" style={{ color: 'var(--color-primary-400)' }}></i>
            </div>
            <h3 className="text-lg font-bold" style={{ color: 'var(--color-text-primary)' }}>{title}</h3>
          </div>
          {message && <p className="text-sm mb-4" style={{ color: 'var(--color-text-secondary)' }}>{message}</p>}
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder}
            className="w-full neumorphic-input rounded-xl px-4 py-3"
            autoFocus
          />
        </div>
        <div className="flex gap-3 justify-end px-6 py-4" style={{ background: 'rgba(0,0,0,0.2)', borderTop: '1px solid var(--color-border-default)' }}>
          <button
            type="button"
            onClick={onCancel}
            className="px-5 py-2 transition-colors text-sm font-medium"
            style={{ color: 'var(--color-text-secondary)' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-text-primary)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-secondary)')}
          >
            {cancelText}
          </button>
          <button
            type="submit"
            disabled={!value.trim()}
            className="card-float-hover px-5 py-2 text-white rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-all text-sm font-medium shadow-lg"
            style={{ background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-primary-600))' }}
          >
            {confirmText}
          </button>
        </div>
      </form>
    </ModalOverlay>
  );
};

// ========== 确认弹窗（替代confirm）==========

interface ConfirmModalProps {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'default';
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  title,
  message,
  confirmText = '确认',
  cancelText = '取消',
  variant = 'default',
  onConfirm,
  onCancel,
}) => {
  const variantStyles = {
    danger: {
      icon: 'fa-exclamation-triangle',
      iconBg: 'bg-red-900/30',
      iconColor: 'text-red-400',
      btnBg: 'bg-red-600 hover:bg-red-700',
    },
    warning: {
      icon: 'fa-exclamation-circle',
      iconBg: 'bg-amber-900/30',
      iconColor: 'text-amber-400',
      btnBg: 'bg-amber-600 hover:bg-amber-700',
    },
    default: {
      icon: 'fa-question-circle',
      iconBg: 'bg-[var(--color-primary-100)]',
      iconColor: 'text-[var(--color-primary-400)]',
      btnBg: 'bg-[var(--color-primary-400)] hover:bg-[var(--color-primary-600)]',
    },
  };

  const style = variantStyles[variant];

  return (
    <ModalOverlay onClose={onCancel}>
      <div className="glass-card rounded-2xl overflow-hidden">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className={`w-9 h-9 rounded-full ${style.iconBg} flex items-center justify-center`}>
              <i className={`fas ${style.icon} ${style.iconColor} text-sm`}></i>
            </div>
            <h3 className="text-lg font-bold" style={{ color: 'var(--color-text-primary)' }}>{title}</h3>
          </div>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>{message}</p>
        </div>
        <div className="flex gap-3 justify-end px-6 py-4" style={{ background: 'rgba(0,0,0,0.2)', borderTop: '1px solid var(--color-border-default)' }}>
          <button
            onClick={onCancel}
            className="px-5 py-2 transition-colors text-sm font-medium"
            style={{ color: 'var(--color-text-secondary)' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-text-primary)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-secondary)')}
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className={`card-float-hover px-5 py-2 text-white rounded-lg transition-all text-sm font-medium shadow-lg ${style.btnBg}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
};
