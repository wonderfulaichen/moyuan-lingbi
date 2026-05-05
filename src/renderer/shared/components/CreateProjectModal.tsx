import React, { useState, useEffect, useRef, useCallback } from 'react';

interface CreateProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (title: string) => void;
}

const CreateProjectModal: React.FC<CreateProjectModalProps> = ({
  isOpen,
  onClose,
  onCreate,
}) => {
  const [title, setTitle] = useState('');
  const [isClosing, setIsClosing] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTitle('未命名作品');
      setIsClosing(false);
      setTimeout(() => {
        titleInputRef.current?.focus();
        titleInputRef.current?.select();
      }, 100);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    if (isOpen) window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const handleClose = useCallback(() => {
    setIsClosing(true);
    setTimeout(onClose, 200);
  }, [onClose]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;
    onCreate(trimmedTitle);
    handleClose();
  };

  if (!isOpen) return null;

  return (
    <div
      className={`fixed inset-0 z-[9999] flex items-center justify-center p-4 ${isClosing ? 'animate-fade-out' : 'animate-fade-in'}`}
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}
      onClick={handleClose}
    >
      <div
        className={`w-full max-w-sm ${isClosing ? 'animate-fade-out-scale' : 'animate-fade-in-scale'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border shadow-2xl overflow-hidden"
          style={{
            backgroundColor: 'var(--color-surface-overlay)',
            borderColor: 'var(--color-border-default)',
          }}
        >
          {/* 头部 */}
          <div className="px-6 pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{
                  background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-primary-600))',
                  boxShadow: '0 6px 20px var(--color-primary-100)',
                }}
              >
                <i className="fas fa-pen-fancy text-white text-sm" />
              </div>
              <div>
                <h3 className="text-base font-bold" style={{ color: 'var(--color-text-primary)' }}>
                  新建作品
                </h3>
                <p className="text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>
                  创建后可在灵感萌发中由 AI 生成书名
                </p>
              </div>
            </div>
          </div>

          {/* 名称输入 */}
          <div className="px-6 pb-4">
            <div className="relative">
              <input
                ref={titleInputRef}
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="未命名作品"
                maxLength={30}
                className="w-full rounded-xl px-4 py-2.5 pr-14 text-sm outline-none transition-all duration-200"
                style={{
                  backgroundColor: 'var(--color-surface-muted)',
                  border: '2px solid var(--color-border-default)',
                  color: 'var(--color-text-primary)',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = 'var(--color-primary-400)';
                  e.currentTarget.style.boxShadow = '0 0 0 3px var(--color-primary-100)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'var(--color-border-default)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[9px]" style={{ color: 'var(--color-text-tertiary)' }}>
                {title.length}/30
              </span>
            </div>
          </div>

          {/* 底部按钮 */}
          <div
            className="flex items-center justify-end gap-2 px-6 py-3"
            style={{ borderTop: '1px solid var(--color-border-default)', backgroundColor: 'rgba(0,0,0,0.08)' }}
          >
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 rounded-lg text-xs font-medium transition-all duration-200 hover:bg-black/5 dark:hover:bg-white/5"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              取消
            </button>
            <button
              type="submit"
              disabled={!title.trim()}
              className="px-5 py-2 rounded-lg text-xs font-bold transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                background: title.trim()
                  ? 'linear-gradient(135deg, var(--color-primary-500), var(--color-primary-600))'
                  : 'var(--color-surface-muted)',
                color: title.trim() ? 'white' : 'var(--color-text-tertiary)',
                boxShadow: title.trim() ? '0 4px 14px var(--color-primary-100)' : 'none',
              }}
            >
              <i className="fas fa-plus mr-1.5" />创建
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateProjectModal;
