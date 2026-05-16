import React, { useState, useCallback } from 'react';

interface NetworkSearchBarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

const NetworkSearchBar: React.FC<NetworkSearchBarProps> = ({ searchQuery, onSearchChange }) => {
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onSearchChange(e.target.value);
    },
    [onSearchChange]
  );

  return (
    <div
      className="glass-card rounded-2xl p-3 shadow-lg"
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
          onChange={handleChange}
          placeholder="搜索节点..."
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
    </div>
  );
};

export default NetworkSearchBar;
