import React, { useState } from 'react';
import { SchemeHistory, InspirationTag } from '../../../../shared/types';

interface HistoryPanelProps {
  title: string;
  icon: string;
  iconColor: string;
  histories: SchemeHistory[];
  onRestore: (history: SchemeHistory) => void;
  onDeselectAll?: (history: SchemeHistory) => void;  // 取消选中该历史的所有标签
  onClear: () => void;
  emptyText: string;
  selectedTagTexts?: string[];                     // 当前已选标签文本列表
  onToggleTag?: (tag: InspirationTag) => void;     // 点击历史标签直接切换选中
}

const HistoryPanel: React.FC<HistoryPanelProps> = ({
  title,
  icon,
  iconColor,
  histories,
  onRestore,
  onDeselectAll,
  onClear,
  emptyText,
  selectedTagTexts,
  onToggleTag,
}) => {
  const [search, setSearch] = useState('');
  const [hoveredEntry, setHoveredEntry] = useState<string | null>(null);

  return (
    <div className="glass-card rounded-xl overflow-hidden animate-fade-in-up mb-4">
      <div className="p-4" style={{ borderBottom: '1px solid var(--color-border-default)' }}>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-bold" style={{ color: 'var(--color-text-secondary)' }}>
            <i className={`fas ${icon} mr-2`} style={{ color: iconColor }}></i>{title}
            <span className="ml-2 text-[10px] font-normal" style={{ color: 'var(--color-text-tertiary)' }}>最多保留50条</span>
          </h4>
          {histories.length > 0 && (
            <button
              onClick={onClear}
              className="text-[10px] transition-colors" style={{ color: '#f87171' }}
              onMouseEnter={(e) => e.currentTarget.style.color = '#ef4444'}
              onMouseLeave={(e) => e.currentTarget.style.color = '#f87171'}
            >
              <i className="fas fa-trash-alt mr-1"></i>清空历史
            </button>
          )}
        </div>
        <div className="relative">
          <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-xs" style={{ color: 'var(--color-text-tertiary)' }}></i>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索历史记录..."
            className="neumorphic-input w-full rounded-lg pl-8 pr-3 py-1.5 text-xs"
          />
        </div>
      </div>
      <div className="p-4 max-h-72 overflow-y-auto">
        {histories.length === 0 ? (
          <p className="text-xs text-center py-4" style={{ color: 'var(--color-text-tertiary)' }}>{emptyText}</p>
        ) : (
          <div className="space-y-2">
            {histories
              .filter(entry =>
                !search ||
                entry.inspiration.toLowerCase().includes(search.toLowerCase()) ||
                entry.tags.some(t => t.text.toLowerCase().includes(search.toLowerCase())) ||
                entry.schemes.some(s => s.title.toLowerCase().includes(search.toLowerCase()))
              )
              .map(entry => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between p-3 rounded-lg transition-colors cursor-pointer group card-float-hover"
                  style={{ backgroundColor: 'var(--color-surface-muted)' }}
                  onClick={() => onRestore(entry)}
                  onMouseEnter={() => setHoveredEntry(entry.id)}
                  onMouseLeave={() => setHoveredEntry(null)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                        {entry.schemes.length > 0 ? `${entry.schemes.length} 个方案` : `${entry.tags.length} 个标签`}
                      </span>
                      <span className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
                        {new Date(entry.createdAt).toLocaleString('zh-CN', {
                          month: '2-digit', day: '2-digit',
                          hour: '2-digit', minute: '2-digit'
                        })}
                      </span>
                      {entry.inspiration && (
                        <span className="text-[10px] truncate max-w-[120px]" style={{ color: 'var(--color-text-tertiary)' }}>
                          "{entry.inspiration.slice(0, 20)}"
                        </span>
                      )}
                    </div>
                    {/* 有方案时优先显示方案卡片标题 */}
                    {entry.schemes.length > 0 ? (
                      <div className="flex gap-1 flex-wrap">
                        {(hoveredEntry === entry.id ? entry.schemes : entry.schemes.slice(0, 3)).map(s => (
                          <span key={s.id} className="text-[10px] px-1.5 py-0.5 rounded" style={{ color: 'var(--color-text-tertiary)', backgroundColor: 'var(--color-surface-muted)' }}>
                            {s.title}
                          </span>
                        ))}
                        {hoveredEntry !== entry.id && entry.schemes.length > 3 && (
                          <span className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>+{entry.schemes.length - 3}</span>
                        )}
                      </div>
                    ) : (
                    <div className="flex gap-1 flex-wrap">
                      {(hoveredEntry === entry.id ? entry.tags : entry.tags.slice(0, 8)).map(tag => {
                        const isSelected = onToggleTag && selectedTagTexts?.includes(tag.text);
                        return (
                          <button
                            key={tag.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (onToggleTag) onToggleTag(tag);
                            }}
                            className={`text-[10px] px-1.5 py-0.5 rounded transition-all hover:scale-105 flex items-center gap-0.5 ${
                              isSelected ? 'ring-1' : ''
                            }`}
                            style={{
                              color: isSelected ? 'var(--color-primary-300)' : 'var(--color-text-tertiary)',
                              backgroundColor: isSelected ? 'var(--color-primary-100)' : 'var(--color-surface-muted)',
                              borderColor: isSelected ? 'var(--color-primary-200)' : 'transparent',
                              outline: isSelected ? '1px solid var(--color-primary-300)' : 'none',
                            }}
                            title={isSelected ? '点击取消选中' : '点击选中此标签'}
                          >
                            {isSelected && <i className="fas fa-check text-[7px]"></i>}
                            {tag.text}
                          </button>
                        );
                      })}
                      {hoveredEntry !== entry.id && entry.tags.length > 8 && (
                        <span className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>+{entry.tags.length - 8}</span>
                      )}
                    </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0 ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => { e.stopPropagation(); onRestore(entry); }}
                      className="w-5 h-5 rounded flex items-center justify-center hover:bg-green-500/20 transition-colors"
                      style={{ color: '#34d399' }}
                      title="全部选中"
                    >
                      <i className="fas fa-check text-[9px]"></i>
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); onDeselectAll?.(entry); }}
                      className="w-5 h-5 rounded flex items-center justify-center hover:bg-red-500/20 transition-colors"
                      style={{ color: '#f87171' }}
                      title="全部取消"
                    >
                      <i className="fas fa-xmark text-[9px]"></i>
                    </button>
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default HistoryPanel;
