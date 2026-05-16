import React, { useState, useEffect, useCallback } from 'react';
import { inspirationService, Inspiration } from '../../../shared/services/InspirationService';
import { useTheme } from '../../../shared/contexts/ThemeContext';
import { useUIStore } from '../../../shared/stores/uiStore';

interface InspirationPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onAddToEditor?: (text: string) => void;
}

const InspirationPanel: React.FC<InspirationPanelProps> = ({ isOpen, onClose, onAddToEditor }) => {
  const [content, setContent] = useState('');
  const [selectedType, setSelectedType] = useState<Inspiration['type']>('idea');
  const [tags, setTags] = useState<string>('');
  const [showHistory, setShowHistory] = useState(false);
  const [recentInspirations, setRecentInspirations] = useState<Inspiration[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const { themeInfo } = useTheme();
  const { animationLevel } = useUIStore();
  const hasAnimations = animationLevel !== 'none';

  useEffect(() => {
    if (isOpen) {
      setRecentInspirations(inspirationService.getRecentInspirations(20));
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          onClose();
        }
        if (e.key === 'Enter' && e.metaKey) {
          handleSave();
        }
      };

      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, onClose]);

  const handleSave = useCallback(() => {
    if (!content.trim()) return;

    const tagArray = tags
      .split(/[,，、\s]+/)
      .map(t => t.trim())
      .filter(Boolean);

    inspirationService.addInspiration({
      content: content.trim(),
      tags: tagArray,
      type: selectedType,
    });

    setContent('');
    setTags('');
    setSelectedType('idea');
    setRecentInspirations(inspirationService.getRecentInspirations(20));

    if (hasAnimations) {
      const toast = document.createElement('div');
      toast.className = 'fixed bottom-4 right-4 px-4 py-2 rounded-lg shadow-lg z-[1000] animate-fade-in';
      toast.style.background = `linear-gradient(135deg, ${themeInfo.primaryColor}, ${themeInfo.secondaryColor})`;
      toast.style.color = 'var(--color-text-inverse, #fff)';
      toast.textContent = '灵感已保存 ✨';
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 2000);
    }
  }, [content, tags, selectedType, hasAnimations, themeInfo]);

  const handleApply = useCallback((inspiration: Inspiration) => {
    onAddToEditor?.(inspiration.content);
    onClose();
  }, [onAddToEditor, onClose]);

  const handleDelete = useCallback((id: string) => {
    inspirationService.deleteInspiration(id);
    setRecentInspirations(inspirationService.getRecentInspirations(20));
  }, []);

  const filteredInspirations = searchQuery
    ? inspirationService.searchInspirations(searchQuery)
    : recentInspirations;

  const types: Array<{ type: Inspiration['type']; label: string; icon: string }> = [
    { type: 'idea', label: '灵感', icon: 'fa-lightbulb' },
    { type: 'dialogue', label: '对话', icon: 'fa-comment' },
    { type: 'character', label: '角色', icon: 'fa-user' },
    { type: 'plot', label: '情节', icon: 'fa-book-open' },
    { type: 'setting', label: '场景', icon: 'fa-map' },
    { type: 'note', label: '笔记', icon: 'fa-sticky-note' },
  ];

  if (!isOpen) return null;

  return (
    <div
      className={`
        fixed inset-0 z-50 flex items-center justify-center
        ${hasAnimations ? 'animate-fade-in' : ''}
      `}
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.4)' }}
      onClick={onClose}
    >
      <div
        className={`
          w-[480px] rounded-2xl overflow-hidden
          ${hasAnimations ? 'animate-scale-in' : ''}
        `}
        style={{
          background: 'var(--glass-bg)',
          backdropFilter: 'blur(20px)',
          border: `1px solid ${themeInfo.primaryColor}30`,
          boxShadow: `0 25px 50px -12px ${themeInfo.primaryColor}20`,
        }}
        onClick={e => e.stopPropagation()}
      >
        <div
          className="h-1 w-full"
          style={{ background: `linear-gradient(90deg, ${themeInfo.primaryColor}, transparent)` }}
        />

        <div className="p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{
                  background: `linear-gradient(135deg, ${themeInfo.primaryColor}30, ${themeInfo.primaryColor}10)`,
                }}
              >
                <i className="fas fa-lightbulb text-lg" style={{ color: themeInfo.primaryColor }} />
              </div>
              <div>
                <h3 className="font-bold text-lg" style={{ color: 'var(--text-primary)' }}>
                  灵感捕捉
                </h3>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  记录一闪而过的创意
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
              style={{
                background: 'var(--bg-tertiary)',
                color: 'var(--text-muted)',
              }}
            >
              <i className="fas fa-times" />
            </button>
          </div>

          <div className="flex gap-2 mb-3">
            {types.map(t => (
              <button
                key={t.type}
                onClick={() => setSelectedType(t.type)}
                className={`
                  flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all
                  ${selectedType === t.type ? 'ring-1' : ''}
                `}
                style={{
                  background: selectedType === t.type ? `${themeInfo.primaryColor}20` : 'var(--bg-tertiary)',
                  color: selectedType === t.type ? themeInfo.primaryColor : 'var(--text-secondary)',
                  ringColor: selectedType === t.type ? themeInfo.primaryColor : 'transparent',
                }}
              >
                <i className={`fas ${t.icon}`} />
                {t.label}
              </button>
            ))}
          </div>

          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder="输入你的灵感...&#10;&#10;按 Ctrl/Cmd + Enter 快速保存"
            className="w-full h-32 resize-none rounded-xl p-4 text-sm leading-relaxed"
            style={{
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-primary)',
              outline: 'none',
            }}
            autoFocus
          />

          <div className="flex gap-3 mt-3">
            <div className="flex-1">
              <input
                type="text"
                value={tags}
                onChange={e => setTags(e.target.value)}
                placeholder="添加标签（用逗号分隔）"
                className="w-full px-4 py-2 rounded-lg text-sm"
                style={{
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-primary)',
                  outline: 'none',
                }}
              />
            </div>
            <button
              onClick={handleSave}
              disabled={!content.trim()}
              className="px-6 py-2 rounded-lg font-medium transition-all flex items-center gap-2"
              style={{
                background: content.trim()
                  ? `linear-gradient(135deg, ${themeInfo.primaryColor}, ${themeInfo.secondaryColor})`
                  : 'var(--bg-tertiary)',
                color: content.trim() ? 'var(--color-text-inverse, #fff)' : 'var(--text-muted)',
              }}
            >
              <i className="fas fa-save" />
              保存
            </button>
          </div>

          <div className="flex items-center justify-between mt-4 pt-4 border-t" style={{ borderColor: 'var(--border-color)' }}>
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="text-sm flex items-center gap-1.5 transition-colors"
              style={{ color: 'var(--text-secondary)' }}
            >
              <i className="fas fa-history" />
              灵感历史 ({inspirationService.getStats().totalCount})
              <i className={`fas ${showHistory ? 'fa-chevron-up' : 'fa-chevron-down'}`} />
            </button>
            {showHistory && (
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="搜索..."
                className="px-3 py-1 rounded-lg text-xs w-32"
                style={{
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-primary)',
                  outline: 'none',
                }}
              />
            )}
          </div>

          {showHistory && (
            <div
              className={`mt-3 max-h-64 overflow-y-auto space-y-2 rounded-xl p-2
                ${hasAnimations ? 'animate-fade-in' : ''}
              `}
              style={{ background: 'var(--bg-secondary)' }}
            >
              {filteredInspirations.length === 0 ? (
                <div className="text-center py-8 text-sm" style={{ color: 'var(--text-muted)' }}>
                  {searchQuery ? '没有找到匹配的灵感' : '还没有记录任何灵感'}
                </div>
              ) : (
                filteredInspirations.map(insp => (
                  <div
                    key={insp.id}
                    className="p-3 rounded-lg hover:bg-white/5 transition-colors group"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span
                            className="text-xs px-2 py-0.5 rounded-full"
                            style={{
                              background: `${inspirationService.getTypeColor(insp.type)}20`,
                              color: inspirationService.getTypeColor(insp.type),
                            }}
                          >
                            {inspirationService.getTypeLabel(insp.type)}
                          </span>
                          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                            {new Date(insp.createdAt).toLocaleDateString('zh-CN', {
                              month: 'short',
                              day: 'numeric',
                            })}
                          </span>
                        </div>
                        <p
                          className="text-sm line-clamp-2"
                          style={{ color: 'var(--text-secondary)' }}
                        >
                          {insp.content}
                        </p>
                        {insp.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {insp.tags.map(tag => (
                              <span
                                key={tag}
                                className="text-xs px-1.5 py-0.5 rounded"
                                style={{
                                  background: 'var(--bg-tertiary)',
                                  color: 'var(--text-muted)',
                                }}
                              >
                                #{tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => handleApply(insp)}
                          className="w-6 h-6 rounded flex items-center justify-center"
                          style={{
                            background: themeInfo.primaryColor + '20',
                            color: themeInfo.primaryColor,
                          }}
                          title="应用到编辑器"
                        >
                          <i className="fas fa-arrow-right text-xs" />
                        </button>
                        <button
                          onClick={() => handleDelete(insp.id)}
                          className="w-6 h-6 rounded flex items-center justify-center"
                          style={{
                            background: 'var(--color-red-50, rgba(239, 68, 68, 0.1))',
                            color: 'var(--color-red-500, #ef4444)',
                          }}
                          title="删除"
                        >
                          <i className="fas fa-trash text-xs" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default InspirationPanel;
