import React from 'react';
import { Handle, Position } from '@xyflow/react';

export interface CharacterNodeData {
  name: string;
  identity?: string;
  personality?: string[];
  abilities?: string[];
}

interface CharacterNodeProps {
  data: CharacterNodeData;
  selected?: boolean;
}

const CharacterNode: React.FC<CharacterNodeProps> = ({ data, selected }) => {
  return (
    <div
      className={`rounded-2xl shadow-lg border transition-all duration-300 overflow-hidden w-64 ${
        selected
          ? 'ring-2 ring-purple-400 ring-offset-2 ring-offset-transparent'
          : ''
      }`}
      style={{
        backgroundColor: 'var(--color-surface-base)',
        borderColor: 'var(--color-primary-300)',
      }}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="w-3 h-3"
        style={{
          backgroundColor: 'var(--color-primary-400)',
        }}
      />

      <div className="p-4">
        <div className="flex items-center gap-3 mb-3">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold shadow-md"
            style={{
              background: 'linear-gradient(135deg, var(--color-primary-300), var(--color-primary-500))',
              color: '#fff',
            }}
          >
            {data.name?.charAt(0) || '?'}
          </div>
          <div className="flex-1 min-w-0">
            <h3
              className="font-bold text-sm truncate"
              style={{ color: 'var(--color-text-primary)' }}
            >
              {data.name || '未命名角色'}
            </h3>
            {data.identity && (
              <p
                className="text-xs truncate"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                {data.identity}
              </p>
            )}
          </div>
        </div>

        {data.personality && data.personality.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {data.personality.slice(0, 3).map((trait, i) => (
              <span
                key={i}
                className="px-2 py-0.5 rounded-full text-[10px]"
                style={{
                  backgroundColor: 'var(--color-primary-100)',
                  color: 'var(--color-primary-500)',
                }}
              >
                {trait}
              </span>
            ))}
            {data.personality.length > 3 && (
              <span
                className="px-2 py-0.5 rounded-full text-[10px]"
                style={{
                  backgroundColor: 'var(--color-surface-muted)',
                  color: 'var(--color-text-tertiary)',
                }}
              >
                +{data.personality.length - 3}
              </span>
            )}
          </div>
        )}

        {data.abilities && data.abilities.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {data.abilities.slice(0, 2).map((ability, i) => (
              <span
                key={i}
                className="px-2 py-0.5 rounded-full text-[10px]"
                style={{
                  backgroundColor: 'rgba(52, 211, 153, 0.1)',
                  color: 'rgb(52, 211, 153)',
                }}
              >
                {ability}
              </span>
            ))}
          </div>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="w-3 h-3"
        style={{
          backgroundColor: 'var(--color-primary-400)',
        }}
      />
    </div>
  );
};

export default CharacterNode;
