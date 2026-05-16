import React from 'react';
import { SearchResult } from '../../shared/services/MemorySearchService';

interface MemoryRecommendPanelProps {
  recommendations: SearchResult[];
  currentMemoryId?: string;
  onMemoryClick: (result: SearchResult) => void;
}

const MemoryRecommendPanel: React.FC<MemoryRecommendPanelProps> = ({
  recommendations,
  currentMemoryId,
  onMemoryClick,
}) => {
  if (recommendations.length === 0) {
    return null;
  }

  return (
    <div
      className="glass-card rounded-2xl p-4"
      style={{
        backgroundColor: 'var(--color-surface-base)',
        border: '1px solid var(--color-border-default)',
      }}
    >
      <div className="flex items-center gap-2 mb-4">
        <i className="fas fa-lightbulb text-sm" style={{ color: 'var(--color-amber-300, #fbbf24)' }} />
        <h4 className="text-sm font-bold" style={{ color: 'var(--color-text-primary)' }}>
          相关记忆推荐
        </h4>
      </div>

      <div className="space-y-2">
        {recommendations.map((rec) => (
          <button
            key={rec.id}
            onClick={() => onMemoryClick(rec)}
            className="w-full text-left p-3 rounded-xl transition-all hover:bg-white/5"
            style={{
              backgroundColor: rec.id === currentMemoryId ? 'var(--color-primary-100)' : 'transparent',
              border: rec.id === currentMemoryId ? '1px solid var(--color-primary-300)' : '1px solid transparent',
            }}
          >
            <div className="flex items-center gap-2 mb-1">
              <span
                className="text-xs font-medium"
                style={{ color: 'var(--color-text-primary)' }}
              >
                {rec.title}
              </span>
            </div>
            <p className="text-[10px] line-clamp-2" style={{ color: 'var(--color-text-tertiary)' }}>
              {rec.description}
            </p>
            {rec.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {rec.tags.slice(0, 3).map((tag, i) => (
                  <span
                    key={i}
                    className="text-[8px] px-1.5 py-0.5 rounded-full"
                    style={{
                      backgroundColor: 'var(--color-surface-muted)',
                      color: 'var(--color-text-muted)',
                    }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
};

export default MemoryRecommendPanel;
