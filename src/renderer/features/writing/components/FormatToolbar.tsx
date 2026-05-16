import React, { useState } from 'react';
import { useTheme } from '../../../shared/contexts/ThemeContext';
import { useUIStore } from '../../../shared/stores/uiStore';
import { FormatType, SmartFormatOptions } from '../../../shared/hooks/useSmartFormat';

interface FormatToolbarProps {
  onFormat: (formatType: FormatType) => void;
  options: SmartFormatOptions;
  onOptionsChange: (options: Partial<SmartFormatOptions>) => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
}

const FormatToolbar: React.FC<FormatToolbarProps> = ({
  onFormat,
  options,
  onOptionsChange,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
}) => {
  const [showSettings, setShowSettings] = useState(false);
  const { themeInfo } = useTheme();
  const { animationLevel } = useUIStore();
  const hasAnimations = animationLevel !== 'none';

  const formatButtons: Array<{ type: FormatType; icon: string; label: string; shortcut?: string }> = [
    { type: 'bold', icon: 'fa-bold', label: '加粗', shortcut: 'Ctrl+B' },
    { type: 'italic', icon: 'fa-italic', label: '斜体', shortcut: 'Ctrl+I' },
    { type: 'dialogue', icon: 'fa-comment', label: '对话' },
    { type: 'quote', icon: 'fa-quote-left', label: '引用' },
    { type: 'list', icon: 'fa-list', label: '列表' },
    { type: 'heading', icon: 'fa-heading', label: '标题' },
  ];

  const undoRedoButtons = [
    { action: 'undo', icon: 'fa-undo', label: '撤销', shortcut: 'Ctrl+Z', handler: onUndo, disabled: !canUndo },
    { action: 'redo', icon: 'fa-redo', label: '重做', shortcut: 'Ctrl+Y', handler: onRedo, disabled: !canRedo },
  ];

  return (
    <div
      className="flex items-center gap-1 px-3 py-2 rounded-xl"
      style={{
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border-color)',
      }}
    >
      {undoRedoButtons.map((btn) => (
        <button
          key={btn.action}
          onClick={btn.handler}
          disabled={btn.disabled}
          className={`
            w-8 h-8 rounded-lg flex items-center justify-center
            transition-all duration-200
            ${hasAnimations ? 'hover:scale-110' : ''}
            ${btn.disabled ? 'opacity-30 cursor-not-allowed' : ''}
          `}
          style={{
            background: 'transparent',
            color: 'var(--text-secondary)',
          }}
          title={`${btn.label}${btn.shortcut ? ` (${btn.shortcut})` : ''}`}
          onMouseEnter={(e) => {
            if (!btn.disabled) {
              e.currentTarget.style.background = themeInfo.primaryColor + '20';
              e.currentTarget.style.color = themeInfo.primaryColor;
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = 'var(--text-secondary)';
          }}
        >
          <i className={`fas ${btn.icon}`} />
        </button>
      ))}

      <div className="w-px h-6 mx-2" style={{ background: 'var(--border-color)' }} />

      {formatButtons.map((btn) => (
        <button
          key={btn.type}
          onClick={() => onFormat(btn.type)}
          className={`
            w-8 h-8 rounded-lg flex items-center justify-center
            transition-all duration-200
            ${hasAnimations ? 'hover:scale-110' : ''}
          `}
          style={{
            background: 'transparent',
            color: 'var(--text-secondary)',
          }}
          title={`${btn.label}${btn.shortcut ? ` (${btn.shortcut})` : ''}`}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = themeInfo.primaryColor + '20';
            e.currentTarget.style.color = themeInfo.primaryColor;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = 'var(--text-secondary)';
          }}
        >
          <i className={`fas ${btn.icon}`} />
        </button>
      ))}

      <div className="w-px h-6 mx-2" style={{ background: 'var(--border-color)' }} />

      <button
        onClick={() => setShowSettings(!showSettings)}
        className={`
          w-8 h-8 rounded-lg flex items-center justify-center
          transition-all duration-200
          ${hasAnimations ? 'hover:scale-110' : ''}
          ${showSettings ? 'ring-2' : ''}
        `}
        style={{
          background: showSettings ? themeInfo.primaryColor + '20' : 'transparent',
          color: showSettings ? themeInfo.primaryColor : 'var(--text-secondary)',
          ringColor: showSettings ? themeInfo.primaryColor : 'transparent',
        }}
        title="格式化设置"
      >
        <i className="fas fa-sliders" />
      </button>

      {showSettings && (
        <div
          className={`
            absolute top-full right-0 mt-2 w-64 p-4 rounded-xl
            ${hasAnimations ? 'animate-fade-in' : ''}
          `}
          style={{
            background: 'var(--glass-bg)',
            backdropFilter: 'blur(16px)',
            border: `1px solid ${themeInfo.primaryColor}30`,
            zIndex: 100,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <h4
            className="font-medium text-sm mb-3"
            style={{ color: 'var(--text-primary)' }}
          >
            智能格式化设置
          </h4>

          <div className="space-y-3">
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                自动缩进
              </span>
              <button
                onClick={() => onOptionsChange({ autoIndent: !options.autoIndent })}
                className={`
                  w-10 h-5 rounded-full transition-all duration-200
                  relative
                `}
                style={{
                  background: options.autoIndent ? themeInfo.primaryColor : 'var(--bg-tertiary)',
                }}
              >
                <span
                  className={`
                    absolute top-0.5 w-4 h-4 rounded-full bg-white
                    transition-transform duration-200
                    ${options.autoIndent ? 'translate-x-5' : 'translate-x-0.5'}
                  `}
                />
              </button>
            </label>

            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                自动补全
              </span>
              <button
                onClick={() => onOptionsChange({ autoClose: !options.autoClose })}
                className={`
                  w-10 h-5 rounded-full transition-all duration-200
                  relative
                `}
                style={{
                  background: options.autoClose ? themeInfo.primaryColor : 'var(--bg-tertiary)',
                }}
              >
                <span
                  className={`
                    absolute top-0.5 w-4 h-4 rounded-full bg-white
                    transition-transform duration-200
                    ${options.autoClose ? 'translate-x-5' : 'translate-x-0.5'}
                  `}
                />
              </button>
            </label>

            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                中文引号
              </span>
              <button
                onClick={() => onOptionsChange({ smartQuote: !options.smartQuote })}
                className={`
                  w-10 h-5 rounded-full transition-all duration-200
                  relative
                `}
                style={{
                  background: options.smartQuote ? themeInfo.primaryColor : 'var(--bg-tertiary)',
                }}
              >
                <span
                  className={`
                    absolute top-0.5 w-4 h-4 rounded-full bg-white
                    transition-transform duration-200
                    ${options.smartQuote ? 'translate-x-5' : 'translate-x-0.5'}
                  `}
                />
              </button>
            </label>
          </div>

          <p
            className="text-xs mt-3 pt-3"
            style={{
              color: 'var(--text-muted)',
              borderTop: '1px solid var(--border-color)',
            }}
          >
            <i className="fas fa-keyboard mr-1" />
            按 <kbd className="px-1 py-0.5 rounded text-xs" style={{ background: 'var(--bg-tertiary)' }}>Tab</kbd> 插入缩进
          </p>
        </div>
      )}
    </div>
  );
};

export default FormatToolbar;
