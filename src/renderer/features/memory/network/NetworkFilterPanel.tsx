import React from 'react';

interface NetworkFilterPanelProps {
  filters: { character: boolean; plot: boolean; location: boolean };
  onFilterChange: (filters: { character: boolean; plot: boolean; location: boolean }) => void;
}

const NetworkFilterPanel: React.FC<NetworkFilterPanelProps> = ({ filters, onFilterChange }) => {
  const handleToggle = (type: keyof typeof filters) => {
    onFilterChange({ ...filters, [type]: !filters[type] });
  };

  return (
    <div
      className="glass-card rounded-2xl p-4 shadow-lg"
      style={{
        backgroundColor: 'var(--color-surface-base)',
        border: '1px solid var(--color-border-default)',
      }}
    >
      <h3 className="font-bold text-sm mb-3" style={{ color: 'var(--color-text-primary)' }}>
        <i className="fas fa-filter mr-2" style={{ color: 'var(--color-primary-400)' }} />
        节点筛选
      </h3>
      <div className="space-y-2">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={filters.character}
            onChange={() => handleToggle('character')}
            className="w-4 h-4 rounded border-2 cursor-pointer accent-purple-500"
            style={{
              borderColor: 'var(--color-primary-400)',
            }}
          />
          <span className="text-xs flex items-center gap-1" style={{ color: 'var(--color-text-secondary)' }}>
            <i className="fas fa-user" style={{ color: 'var(--color-primary-400)' }} />
            角色
          </span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={filters.plot}
            onChange={() => handleToggle('plot')}
            className="w-4 h-4 rounded border-2 cursor-pointer accent-violet-500"
            style={{
              borderColor: 'var(--color-violet-400, #a78bfa)',
            }}
          />
          <span className="text-xs flex items-center gap-1" style={{ color: 'var(--color-text-secondary)' }}>
            <i className="fas fa-code-branch" style={{ color: 'var(--color-violet-400, #a78bfa)' }} />
            情节
          </span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={filters.location}
            onChange={() => handleToggle('location')}
            className="w-4 h-4 rounded border-2 cursor-pointer accent-emerald-500"
            style={{
              borderColor: 'var(--color-green-400, #34d399)',
            }}
          />
          <span className="text-xs flex items-center gap-1" style={{ color: 'var(--color-text-secondary)' }}>
            <i className="fas fa-location-dot" style={{ color: 'var(--color-green-400, #34d399)' }} />
            地点
          </span>
        </label>
      </div>
    </div>
  );
};

export default NetworkFilterPanel;
