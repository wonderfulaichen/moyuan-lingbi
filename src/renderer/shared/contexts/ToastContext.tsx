import React, { createContext, useContext, useState, useCallback, useRef } from 'react';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
}

interface ToastContextType {
  toasts: Toast[];
  showToast: (message: string, type?: ToastType, duration?: number) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType>({
  toasts: [],
  showToast: () => {},
  removeToast: () => {},
});

export const useToast = () => useContext(ToastContext);

const ICONS: Record<ToastType, string> = {
  success: 'fa-check-circle',
  error: 'fa-circle-exclamation',
  info: 'fa-circle-info',
  warning: 'fa-triangle-exclamation',
};

const COLORS: Record<ToastType, { bg: string; border: string; icon: string }> = {
  success: { bg: 'rgba(52,211,153,0.1)', border: 'rgba(52,211,153,0.2)', icon: '#34d399' },
  error: { bg: 'rgba(248,113,113,0.1)', border: 'rgba(248,113,113,0.2)', icon: '#f87171' },
  info: { bg: 'rgba(96,165,250,0.1)', border: 'rgba(96,165,250,0.2)', icon: '#60a5fa' },
  warning: { bg: 'rgba(251,191,36,0.1)', border: 'rgba(251,191,36,0.2)', icon: '#fbbf24' },
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const showToast = useCallback((message: string, type: ToastType = 'info', duration = 4000) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
    setToasts(prev => [...prev.slice(-4), { id, type, message, duration }]);
    const timer = setTimeout(() => removeToast(id), duration);
    timersRef.current.set(id, timer);
  }, [removeToast]);

  return (
    <ToastContext.Provider value={{ toasts, showToast, removeToast }}>
      {children}
      {/* Toast 容器 */}
      <div className="fixed top-4 right-4 z-[99999] flex flex-col gap-2 pointer-events-none">
        {toasts.map((toast) => {
          const style = COLORS[toast.type];
          return (
            <div
              key={toast.id}
              className="pointer-events-auto rounded-xl px-4 py-3 shadow-xl backdrop-blur-xl border text-sm max-w-xs animate-slide-in-right"
              style={{
                backgroundColor: style.bg,
                borderColor: style.border,
              }}
            >
              <div className="flex items-center gap-2.5">
                <i className={`fas ${ICONS[toast.type]}`} style={{ color: style.icon, fontSize: '14px' }}></i>
                <span className="flex-1 text-xs leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                  {toast.message}
                </span>
                <button
                  onClick={() => removeToast(toast.id)}
                  className="text-gray-500 hover:text-gray-300 transition-colors shrink-0"
                >
                  <i className="fas fa-xmark text-[10px]"></i>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};

export default ToastContext;
