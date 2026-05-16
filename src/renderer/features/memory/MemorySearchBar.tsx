import React, { useState, useCallback } from 'react';
import { MemoryType, SortOption } from '../../shared/services/MemorySearchService';

interface MemorySearchBarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  selectedTypes: MemoryType[];
  onTypesChange: (types: MemoryType[]) => void;
  sortOption: SortOption;
  onSortChange: (option: SortOption) => void;
}

const TYPE_LABELS: Record<MemoryType, string> = {
  all: '全部',
  character: '角色',
  plot: '剧情',
  worldRule: '规则',
  worldLocation: '地点',
  worldHistory: '历史',
};

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'relevance', label: '相关性' },
  { value: 'recent', label: '最近更新' },
  { value: 'name', label: '名称' },
];

const MemorySearchBar: React.FC<MemorySearchBarProps> = ({
  searchQuery,
  onSearchChange,
  selectedTypes,
  onTypesChange,
  sortOption,
  onSortChange,
}) => {
  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onSearchChange(e.target.value);
    },
    [onSearchChange]
  );

  const toggleType = useCallback(
    (type: MemoryType) => {
      if (type === 'all') {
        onTypesChange(['all']);
      } else {
        const newTypes = selectedTypes.includes(type)
          ? selectedTypes.filter(t => t !== type)
          : [...selectedTypes.filter(t => t !== 'all'), type];
        onTypesChange(newTypes.length > 0 ? newTypes : ['all']);
      }
    },
    [selectedTypes, onTypesChange]
  );

  return (
    <div
      className="glass-card rounded-2xl p-4 shadow-lg space-y-3"
      style={{
        backgroundColor: 'var(--color-surface-base)',
        border: '1px solid var(--color-border-default)',
      }}
    >
      <div className="flex items-center gap-2">
        <i className="fas fa-search text-sm" style={{ color: 'var(--color-text-muted)' }} />
        <input
          type="text"
          value={searchQuery}
          onChange={handleSearchChange}
          placeholder="搜索角色、剧情、地点..."
          className="flex-1 bg-transparent border-none outline-none text-sm"
          style={{
            color: 'var(--color-text-primary)',
          }}
        />
        {searchQuery && (
          <button
            onClick={() => onSearchChange('')}
            className="p-1 hover:opacity-70 transition-opacity"
          >
            <i className="fas fa-times text-xs" style={{ color: 'var(--color-text-muted)' }} />
          </button>
        )}
      </div>

      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          {Object.entries(TYPE_LABELS).map(([type, label]) => (
            <button
              key={type}
              onClick={() => toggleType(type as MemoryType)}
              className={`px-3 py-1 rounded-full text-xs transition-all ${
                selectedTypes.includes(type as MemoryType)
                  ? ''
                  : 'opacity-50 hover:opacity-70'
              }`}
              style={{
                backgroundColor: selectedTypes.includes(type as MemoryType)
                  ? 'var(--color-primary-200)'
                  : 'var(--color-surface-muted)',
                color: selectedTypes.includes(type as MemoryType)
                  ? 'var(--color-primary-800)'
                  : 'var(--color-text-tertiary)',
                border: '1px solid var(--color-border-default)',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            排序:
          </span>
          <select
            value={sortOption}
            onChange={(e) => onSortChange(e.target.value as SortOption)}
            className="px-2 py-1 rounded-lg text-xs outline-none"
            style={{
              backgroundColor: 'var(--color-surface-muted)',
              color: 'var(--color-text-primary)',
              border: '1px solid var(--color-border-default)',
            }}
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
};

export default MemorySearchBar;
