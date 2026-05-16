import React from 'react';
import { Handle, Position } from '@xyflow/react';

export interface PlotNodeData {
  title: string;
  type?: string;
  status?: string;
}

interface PlotNodeProps {
  data: PlotNodeData;
  selected?: boolean;
}

const PLOT_TYPE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  main: { bg: 'rgba(167, 139, 250, 0.15)', text: 'rgb(167, 139, 250)', border: 'rgba(167, 139, 250, 0.5)' },
  sub: { bg: 'rgba(96, 165, 250, 0.15)', text: 'rgb(96, 165, 250)', border: 'rgba(96, 165, 250, 0.5)' },
  romance: { bg: 'rgba(244, 114, 182, 0.15)', text: 'rgb(244, 114, 182)', border: 'rgba(244, 114, 182, 0.5)' },
  mystery: { bg: 'rgba(251, 191, 36, 0.15)', text: 'rgb(251, 191, 36)', border: 'rgba(251, 191, 36, 0.5)' },
};

const PLOT_STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  active: { bg: 'rgba(52, 211, 153, 0.15)', text: 'rgb(52, 211, 153)' },
  resolved: { bg: 'rgba(96, 165, 250, 0.15)', text: 'rgb(96, 165, 250)' },
  dormant: { bg: 'rgba(156, 163, 175, 0.15)', text: 'rgb(156, 163, 175)' },
  planted: { bg: 'rgba(251, 191, 36, 0.15)', text: 'rgb(251, 191, 36)' },
};

const PlotNode: React.FC<PlotNodeProps> = ({ data, selected }) => {
  const typeColor = PLOT_TYPE_COLORS[data.type || 'main'] || PLOT_TYPE_COLORS.main;
  const statusColor = data.status ? PLOT_STATUS_COLORS[data.status] : null;

  return (
    <div
      className={`rounded-2xl shadow-lg border transition-all duration-300 overflow-hidden w-60 ${
        selected
          ? 'ring-2 ring-violet-400 ring-offset-2 ring-offset-transparent'
          : ''
      }`}
      style={{
        backgroundColor: 'var(--color-surface-base)',
        borderColor: typeColor.border,
      }}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="w-3 h-3"
        style={{
          backgroundColor: typeColor.text,
        }}
      />
      
      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{
                backgroundColor: typeColor.bg,
                color: typeColor.text,
              }}
            >
              <i className="fas fa-code-branch text-sm" />
            </div>
            {data.type && (
              <span
                className="px-2 py-0.5 rounded-full text-[10px] font-medium"
                style={{
                  backgroundColor: typeColor.bg,
                  color: typeColor.text,
                }}
              >
                {data.type === 'main' ? '主线' : data.type === 'sub' ? '支线' : data.type === 'romance' ? '感情线' : data.type === 'mystery' ? '悬疑线' : data.type}
              </span>
            )}
          </div>
          {statusColor && (
            <span
              className="px-2 py-0.5 rounded-full text-[10px] font-medium"
              style={{
                backgroundColor: statusColor.bg,
                color: statusColor.text,
              }}
            >
              {data.status === 'active' ? '进行中' : data.status === 'resolved' ? '已解决' : data.status === 'dormant' ? '休眠' : data.status === 'planted' ? '已埋' : data.status}
            </span>
          )}
        </div>

        <h3
          className="font-bold text-sm line-clamp-2 leading-snug"
          style={{ color: 'var(--color-text-primary)' }}
        >
          {data.title || '未命名情节'}
        </h3>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="w-3 h-3"
        style={{
          backgroundColor: typeColor.text,
        }}
      />
    </div>
  );
};

export default PlotNode;
