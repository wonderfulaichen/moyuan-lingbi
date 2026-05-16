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
        aria-label={mode === 'dark' ? '切换到白天模式' : '切换到夜晚模式'}
      >
        <i className={`fas ${mode === 'dark' ? 'fa-moon' : 'fa-sun'} text-xs`}
          style={{ color: mode === 'dark' ? 'var(--color-blue-300)' : 'var(--color-amber-400)' }}
        ></i>
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
    purple: 'linear-gradient(135deg, #9b59b6, #7d3c98)',
    blue: 'linear-gradient(135deg, #3498db, #2980b9)',
    emerald: 'linear-gradient(135deg, #27ae60, #1e8449)',
    amber: 'linear-gradient(135deg, #e67e22, #d35400)',
    rose: 'linear-gradient(135deg, #e91e63, #c2185b)',
    gray: 'linear-gradient(135deg, #95a5a6, #7f8c8d)',
    brown: 'linear-gradient(135deg, #8d6e63, #6d4c41)',
    teal: 'linear-gradient(135deg, #16a085, #117a65)',
    paper: 'linear-gradient(135deg, #f1c40f, #d4ac0d)',
    bamboo: 'linear-gradient(135deg, #7cb342, #558b2f)',
    cinnabar: 'linear-gradient(135deg, #e74c3c, #c0392b)',
    indigo: 'linear-gradient(135deg, #5d6d7e, #34495e)',
  };
  return map[themeId] || map.purple;
}

export default ThemeToggle;
