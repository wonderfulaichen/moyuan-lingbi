import React from 'react';
import { SearchResult, MemoryType } from '../../shared/services/MemorySearchService';

interface MemorySearchResultsProps {
  results: SearchResult[];
  searchQuery: string;
  onResultClick: (result: SearchResult) => void;
  onToggleFavorite: (projectId: string, type: MemoryType, id: string) => void;
  projectId?: string;
}

const TYPE_COLORS: Record<MemoryType, { bg: string; text: string; icon: string }> = {
  character: { bg: 'rgba(167, 139, 250, 0.15)', text: '#a78bfa', icon: 'fa-user' },
  plot: { bg: 'rgba(96, 165, 250, 0.15)', text: '#60a5fa', icon: 'fa-code-branch' },
  worldRule: { bg: 'rgba(52, 211, 153, 0.15)', text: '#34d399', icon: 'fa-ruler' },
  worldLocation: { bg: 'rgba(251, 191, 36, 0.15)', text: '#fbbf24', icon: 'fa-mountain' },
  worldHistory: { bg: 'rgba(248, 113, 113, 0.15)', text: '#f87171', icon: 'fa-clock' },
  all: { bg: 'rgba(156, 163, 175, 0.15)', text: '#9ca3af', icon: 'fa-search' },
};

const TYPE_LABELS: Record<MemoryType, string> = {
  all: '全部',
  character: '角色',
  plot: '剧情',
  worldRule: '规则',
  worldLocation: '地点',
  worldHistory: '历史',
};

const highlightText = (text: string, query: string) => {
  if (!query.trim()) return text;
  
  const parts: React.ReactNode[] = [];
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  
  let lastIndex = 0;
  let index = lowerText.indexOf(lowerQuery);
  
  while (index !== -1) {
    parts.push(text.slice(lastIndex, index));
    parts.push(
      <mark
        key={index}
        className="px-0.5 rounded"
        style={{ backgroundColor: 'rgba(251, 191, 36, 0.3)' }}
      >
        {text.slice(index, index + query.length)}
      </mark>
    );
    lastIndex = index + query.length;
    index = lowerText.indexOf(lowerQuery, lastIndex);
  }
  
  parts.push(text.slice(lastIndex));
  return parts;
};

const MemorySearchResults: React.FC<MemorySearchResultsProps> = ({
  results,
  searchQuery,
  onResultClick,
  onToggleFavorite,
  projectId,
}) => {
  if (results.length === 0) {
    return (
      <div
        className="glass-card rounded-2xl p-8 text-center"
        style={{
          backgroundColor: 'var(--color-surface-base)',
          border: '1px solid var(--color-border-default)',
        }}
      >
        <i className="fas fa-search text-4xl mb-4 opacity-20" style={{ color: 'var(--color-text-muted)' }} />
        <p className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
          未找到匹配的记忆
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {results.map((result) => {
        const config = TYPE_COLORS[result.type];
        return (
          <div
            key={result.id}
            className="glass-card rounded-2xl p-4 cursor-pointer transition-all hover:scale-[1.01]"
            style={{
              backgroundColor: 'var(--color-surface-base)',
              border: '1px solid var(--color-border-default)',
            }}
            onClick={() => onResultClick(result)}
          >
            <div className="flex items-start gap-4">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{ backgroundColor: config.bg }}
              >
                <i className={`fas ${config.icon}`} style={{ color: config.text }} />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-3 mb-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className="font-bold text-sm truncate"
                      style={{ color: 'var(--color-text-primary)' }}
                    >
                      {highlightText(result.title, searchQuery)}
                    </span>
                    <span
                      className="text-[10px] px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: config.bg, color: config.text }}
                    >
                      {TYPE_LABELS[result.type]}
                    </span>
                  </div>

                  {projectId && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleFavorite(projectId, result.type, result.id);
                      }}
                      className="p-1 hover:opacity-70 transition-opacity"
                    >
                      <i
                        className={`fas ${result.isFavorite ? 'fa-star' : 'fa-star-o'}`}
                        style={{
                          color: result.isFavorite ? '#fbbf24' : 'var(--color-text-muted)',
                        }}
                      />
                    </button>
                  )}
                </div>

                {result.description && (
                  <p
                    className="text-xs mb-2 line-clamp-2"
                    style={{ color: 'var(--color-text-secondary)' }}
                  >
                    {highlightText(result.description, searchQuery)}
                  </p>
                )}

                {result.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {result.tags.map((tag, i) => (
                      <span
                        key={i}
                        className="text-[10px] px-2 py-0.5 rounded-full"
                        style={{
                          backgroundColor: 'var(--color-surface-muted)',
                          color: 'var(--color-text-tertiary)',
                        }}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default MemorySearchResults;
