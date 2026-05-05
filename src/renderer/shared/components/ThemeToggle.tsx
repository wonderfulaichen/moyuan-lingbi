import React, { useState, useRef, useEffect } from 'react';
import { useTheme, THEME_LIST } from '../contexts/ThemeContext';

const ThemeToggle: React.FC = () => {
  const { theme, setTheme, mode, toggleMode } = useTheme();
  const [showPicker, setShowPicker] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭
  useEffect(() => {
    if (!showPicker) return;
    const handleClick = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowPicker(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showPicker]);

  const currentLabel = THEME_LIST.find(t => t.id === theme)?.label || '主题';

  return (
    <div className="flex items-center gap-1.5" ref={pickerRef}>
      {/* 白天/夜晚切换 */}
      <button
        onClick={toggleMode}
        className="relative w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-300 hover:scale-105"
        style={{
          backgroundColor: 'var(--color-surface-hover)',
          border: '1px solid var(--color-border-default)',
        }}
        title={mode === 'dark' ? '切换到白天模式' : '切换到夜晚模式'}
      >
        <i className={`fas ${mode === 'dark' ? 'fa-moon' : 'fa-sun'} text-xs ${
          mode === 'dark' ? 'text-blue-300' : 'text-amber-400'
        }`}></i>
      </button>

      {/* 当前主题色 + 弹出选择器 */}
      <div className="relative">
        <button
          onClick={() => setShowPicker(!showPicker)}
          className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg transition-all duration-200 hover:scale-105"
          style={{
            backgroundColor: 'var(--color-surface-hover)',
            border: '1px solid var(--color-border-default)',
          }}
          title="切换主题色"
        >
          <span
            className="w-4 h-4 rounded-full shrink-0"
            style={{
              background: getColorGradient(theme),
              border: '1px solid var(--color-border-default)',
            }}
          ></span>
          <span className="text-[10px] hidden sm:inline" style={{ color: 'var(--color-text-tertiary)' }}>{currentLabel}</span>
          <i className="fas fa-chevron-down text-[7px]" style={{ color: 'var(--color-text-muted)' }}></i>
        </button>

        {showPicker && (
          <div
            className="absolute right-0 top-full mt-1.5 z-50 w-56 p-2 rounded-xl border shadow-xl backdrop-blur-xl animate-fade-in-scale"
            style={{
              backgroundColor: 'var(--color-surface-overlay)',
              borderColor: 'var(--color-border-default)',
            }}
          >
            <div className="grid grid-cols-4 gap-1.5">
              {THEME_LIST.map((t) => (
                <button
                  key={t.id}
                  onClick={() => { setTheme(t.id); setShowPicker(false); }}
                  className="relative flex flex-col items-center gap-0.5 p-2 rounded-lg transition-all duration-200"
                  style={{
                    backgroundColor: theme === t.id ? 'var(--color-primary-100)' : 'transparent',
                    outline: theme === t.id ? `2px solid var(--color-primary-400)` : 'none',
                    outlineOffset: '-1px',
                  }}
                  title={t.label}
                >
                  <span
                    className="w-6 h-6 rounded-full"
                    style={{
                      background: getColorGradient(t.id),
                      border: '1px solid var(--color-border-default)',
                    }}
                  ></span>
                  <span className="text-[8px] truncate w-full text-center" style={{ color: 'var(--color-text-tertiary)' }}>
                    {t.label}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

function getColorGradient(themeId: string): string {
  const map: Record<string, string> = {
    purple: 'linear-gradient(135deg, #a855f7, #7c3aed)',
    blue: 'linear-gradient(135deg, #60a5fa, #3b82f6)',
    emerald: 'linear-gradient(135deg, #34d399, #059669)',
    amber: 'linear-gradient(135deg, #fbbf24, #d97706)',
    rose: 'linear-gradient(135deg, #fb7185, #e11d48)',
    gray: 'linear-gradient(135deg, #cbd5e1, #64748b)',
    brown: 'linear-gradient(135deg, #d1ae90, #a07a56)',
    jade: 'linear-gradient(135deg, #6ee7b7, #065f46)',
    paper: 'linear-gradient(135deg, #fef3c7, #d4a574)',
    bamboo: 'linear-gradient(135deg, #4ade80, #166534)',
    cinnabar: 'linear-gradient(135deg, #f87171, #b91c1c)',
    indigo: 'linear-gradient(135deg, #818cf8, #4338ca)',
  };
  return map[themeId] || map.purple;
}

export default ThemeToggle;
