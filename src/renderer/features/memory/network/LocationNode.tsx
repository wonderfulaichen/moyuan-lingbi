import React from 'react';
import { Handle, Position } from '@xyflow/react';

export interface LocationNodeData {
  name: string;
  description?: string;
}

interface LocationNodeProps {
  data: LocationNodeData;
  selected?: boolean;
}

const LocationNode: React.FC<LocationNodeProps> = ({ data, selected }) => {
  return (
    <div
      className={`rounded-2xl shadow-lg border transition-all duration-300 overflow-hidden w-56 ${
        selected
          ? 'ring-2 ring-emerald-400 ring-offset-2 ring-offset-transparent'
          : ''
      }`}
      style={{
        backgroundColor: 'var(--color-surface-base)',
        borderColor: 'rgba(52, 211, 153, 0.5)',
      }}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="w-3 h-3"
        style={{
          backgroundColor: 'rgb(52, 211, 153)',
        }}
      />
      
      <div className="p-4">
        <div className="flex items-center gap-3 mb-2">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center text-lg"
            style={{
              backgroundColor: 'rgba(52, 211, 153, 0.15)',
              color: 'rgb(52, 211, 153)',
            }}
          >
            <i className="fas fa-location-dot" />
          </div>
          <div className="flex-1 min-w-0">
            <h3
              className="font-bold text-sm truncate"
              style={{ color: 'var(--color-text-primary)' }}
            >
              {data.name || '未命名地点'}
            </h3>
          </div>
        </div>

        {data.description && (
          <p
            className="text-xs leading-relaxed line-clamp-2"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            {data.description}
          </p>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="w-3 h-3"
        style={{
          backgroundColor: 'rgb(52, 211, 153)',
        }}
      />
    </div>
  );
};

export default LocationNode;
