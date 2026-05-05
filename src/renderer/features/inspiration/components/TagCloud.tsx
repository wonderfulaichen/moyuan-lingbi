import React from 'react';
import { InspirationTag } from '../../../../shared/types';

interface TagCloudProps {
  tags: InspirationTag[];
  selectedTags: InspirationTag[];
  onToggleTag: (tagId: string) => void;
  onRemoveTag: (tagId: string) => void;
  onAddCustomTag: (text: string) => void;
  isGenerating: boolean;
}

const TagCloud: React.FC<TagCloudProps> = ({
  tags,
  selectedTags,
  onToggleTag,
  onRemoveTag,
  onAddCustomTag,
  isGenerating,
}) => {
  const [customTag, setCustomTag] = React.useState('');

  const handleAddCustomTag = () => {
    if (!customTag.trim()) return;
    onAddCustomTag(customTag.trim());
    setCustomTag('');
  };

  return (
    <div className="glass-card rounded-2xl p-5 mb-4 card-float-hover">
      {/* 已选标签摘要 */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--color-primary-100)' }}>
            <i className="fas fa-tags text-sm" style={{ color: 'var(--color-primary-400)' }}></i>
          </div>
          <h3 className="text-lg font-bold" style={{ color: 'var(--color-text-primary)' }}>选择标签</h3>
          <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
            已选 {selectedTags.length} 个标签
          </span>
        </div>
      </div>

      {/* 标签列表 */}
      <div className="flex flex-wrap gap-2 mb-4">
        {tags.length === 0 ? (
          <p className="text-xs py-4" style={{ color: 'var(--color-text-tertiary)' }}>暂无标签，请先生成标签</p>
        ) : (
          tags.map((tag, i) => (
            <div
              key={tag.id}
              className={`group relative px-3 py-1.5 rounded-full text-xs font-bold cursor-pointer transition-all duration-200 hover:scale-105 animate-fade-in ${
                tag.selected ? 'shadow-sm' : ''
              } ${tag.source === 'user' ? 'ring-1 ring-amber-500/30' : ''}`}
              onClick={() => onToggleTag(tag.id)}
              style={{
                animationDelay: `${i * 30}ms`,
                backgroundColor: tag.selected ? 'var(--color-primary-100)' : 'var(--color-surface-hover)',
                color: tag.selected ? 'var(--color-primary-300)' : 'var(--color-text-secondary)',
                borderColor: tag.selected ? 'var(--color-primary-200)' : 'var(--color-border-default)',
                borderWidth: '1px',
                borderStyle: 'solid',
              }}
            >
              {tag.source === 'user' && (
                <i className="fas fa-pen text-[8px] mr-1 text-amber-400"></i>
              )}
              {tag.text}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveTag(tag.id);
                }}
                className="ml-1.5 opacity-0 group-hover:opacity-100 transition-opacity hover:text-red-400"
                style={{ color: 'var(--color-text-tertiary)' }}
              >
                <i className="fas fa-times text-[8px]"></i>
              </button>
            </div>
          ))
        )}
      </div>

      {/* 自定义标签输入 */}
      <div className="flex gap-2">
        <input
          type="text"
          value={customTag}
          onChange={(e) => setCustomTag(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAddCustomTag()}
          placeholder="输入自定义标签..."
          className="neumorphic-input flex-1 rounded-lg px-3 py-1.5 text-sm"
          disabled={isGenerating}
        />
        <button
          onClick={handleAddCustomTag}
          disabled={!customTag.trim() || isGenerating}
          className="px-3 py-1.5 rounded-lg disabled:opacity-40 transition-colors text-sm card-float-hover"
          style={{
            backgroundColor: 'var(--color-primary-100)',
            color: 'var(--color-primary-400)',
          }}
        >
          <i className="fas fa-plus mr-1"></i>添加
        </button>
      </div>
    </div>
  );
};

export default TagCloud;
