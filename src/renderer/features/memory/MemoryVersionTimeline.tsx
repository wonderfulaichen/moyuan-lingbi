import React, { useState, useMemo } from 'react';
import { useTheme } from '../../shared/contexts/ThemeContext';
import { useUIStore } from '../../shared/stores/uiStore';
import { Version, DiffChange } from '../../shared/services/MemoryVersionControl';

interface MemoryVersionTimelineProps {
  versions: Version[];
  onSelectVersion: (version: Version) => void;
  onRollback: (versionId: string) => void;
  selectedVersionId?: string;
}

const getVersionTypeColor = (operationType: string) => {
  switch (operationType) {
    case 'add_memory': return '#34d399';
    case 'update_memory': return '#60a5fa';
    case 'delete_memory': return '#ef4444';
    case 'rollback': return '#f59e0b';
    case 'batch_update': return '#a78bfa';
    default: return '#6b7280';
  }
};

const getVersionTypeLabel = (operationType: string) => {
  switch (operationType) {
    case 'add_memory': return '新增';
    case 'update_memory': return '更新';
    case 'delete_memory': return '删除';
    case 'rollback': return '回滚';
    case 'batch_update': return '批量更新';
    default: return '未知';
  }
};

const getVersionTypeIcon = (operationType: string) => {
  switch (operationType) {
    case 'add_memory': return 'fa-plus-circle';
    case 'update_memory': return 'fa-pen-to-square';
    case 'delete_memory': return 'fa-trash';
    case 'rollback': return 'fa-rotate-left';
    case 'batch_update': return 'fa-wand-magic-sparkles';
    default: return 'fa-circle';
  }
};

const formatTimestamp = (timestamp: number) => {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - timestamp;
  
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}天前`;
  
  return date.toLocaleDateString('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const DiffItem = ({ diff, themeInfo }: { diff: DiffChange; themeInfo: any }) => {
  const getDiffColor = (type: string) => {
    switch (type) {
      case 'add': return '#34d399';
      case 'modify': return '#60a5fa';
      case 'delete': return '#ef4444';
      default: return '#6b7280';
    }
  };
  
  const color = getDiffColor(diff.type);
  
  return (
    <div className="flex items-start gap-2 p-2 rounded-lg transition-all" 
      style={{ background: `${color}10`, borderLeft: `3px solid ${color}` }}>
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] px-1.5 py-0.5 rounded font-medium" 
            style={{ background: `${color}20`, color }}>{diff.type === 'add' ? '新增' : diff.type === 'modify' ? '修改' : '删除'}</span>
          <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>{diff.category}</span>
        </div>
        <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>{diff.description}</p>
      </div>
    </div>
  );
};

const VersionCard = ({ 
  version, 
  isSelected, 
  onSelect, 
  onRollback,
  themeInfo,
  hasAnimations
}: { 
  version: Version; 
  isSelected: boolean; 
  onSelect: () => void; 
  onRollback: () => void;
  themeInfo: any;
  hasAnimations: boolean;
}) => {
  const [expanded, setExpanded] = useState(false);
  const color = getVersionTypeColor(version.metadata.operationType);
  
  return (
    <div 
      className={`relative transition-all ${hasAnimations ? (isSelected ? 'scale-105' : 'hover:scale-102') : ''}`}
      style={{
        background: isSelected ? `${color}15` : 'var(--color-surface-muted)',
        border: `1px solid ${isSelected ? color : 'var(--color-border-default)'}`,
        borderRadius: '12px',
        boxShadow: isSelected ? `0 4px 12px ${color}30` : 'none'
      }}
    >
      <button
        onClick={onSelect}
        className="w-full text-left p-4"
      >
        <div className="flex items-start gap-3">
          <div 
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: `${color}20` }}
          >
            <i className={`fas ${getVersionTypeIcon(version.metadata.operationType)}`} style={{ color }} />
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-bold" style={{ color: 'var(--color-text-primary)' }}>
                {getVersionTypeLabel(version.metadata.operationType)}
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: `${color}15`, color }}>
                {color}
              </span>
            </div>
            
            <p className="text-[11px] leading-relaxed mb-2 line-clamp-2" style={{ color: 'var(--color-text-secondary)' }}>
              {version.metadata.summary}
            </p>
            
            <div className="flex items-center gap-3 text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
              <span className="flex items-center gap-1">
                <i className="fa-regular fa-clock text-[8px]" />
                {formatTimestamp(version.timestamp)}
              </span>
              {version.metadata.author && (
                <span className="flex items-center gap-1">
                  <i className="fa-regular fa-user text-[8px]" />
                  {version.metadata.author}
                </span>
              )}
            </div>
          </div>
        </div>
      </button>
      
      {isSelected && (
        <div className="px-4 pb-4 border-t" style={{ borderColor: 'var(--color-border-default)' }}>
          <div className="flex gap-2 mt-3">
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex-1 text-xs py-2 rounded-lg transition-all"
              style={{ 
                background: themeInfo.gradient,
                color: '#fff',
                boxShadow: `0 2px 8px ${color}40`
              }}
            >
              <i className={`fas ${expanded ? 'fa-chevron-up' : 'fa-chevron-down'} mr-1`} />
              {expanded ? '收起详情' : '查看详情'}
            </button>
            
            {version.metadata.operationType !== 'rollback' && (
              <button
                onClick={onRollback}
                className="px-3 text-xs py-2 rounded-lg transition-all"
                style={{ 
                  background: 'var(--color-surface-muted)',
                  color: 'var(--color-text-secondary)',
                  border: '1px solid var(--color-border-default)'
                }}
              >
                <i className="fas fa-rotate-left mr-1" />
                回滚
              </button>
            )}
          </div>
          
          {expanded && (
            <div className="mt-3 space-y-2">
              <h4 className="text-[10px] font-bold" style={{ color: 'var(--color-text-muted)' }}>
                变更内容
              </h4>
              <div className="space-y-2">
                {version.metadata.tags?.map((tag, i) => (
                  <div key={i} className="text-[10px] px-2 py-1 rounded" style={{ background: 'var(--color-surface-muted)', color: 'var(--color-text-secondary)' }}>
                    {tag}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export const MemoryVersionTimeline: React.FC<MemoryVersionTimelineProps> = ({
  versions,
  onSelectVersion,
  onRollback,
  selectedVersionId
}) => {
  const { themeInfo } = useTheme();
  const { animationLevel } = useUIStore();
  const hasAnimations = animationLevel !== 'none';
  
  const [filter, setFilter] = useState<string>('all');
  
  const filteredVersions = useMemo(() => {
    if (filter === 'all') return versions;
    return versions.filter(v => v.metadata.operationType === filter);
  }, [versions, filter]);
  
  if (versions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4" 
          style={{ background: themeInfo.gradient, opacity: 0.3 }}>
          <i className="fas fa-clock-rotate-left text-2xl" style={{ color: themeInfo.primaryColor }} />
        </div>
        <h3 className="text-base font-bold mb-2" style={{ color: 'var(--color-text-secondary)' }}>
          暂无版本记录
        </h3>
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          对记忆体进行增删改操作后会产生版本记录
        </p>
      </div>
    );
  }
  
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 overflow-x-auto pb-2">
        {[
          { key: 'all', label: '全部' },
          { key: 'add_memory', label: '新增' },
          { key: 'update_memory', label: '更新' },
          { key: 'delete_memory', label: '删除' },
          { key: 'rollback', label: '回滚' },
        ].map(item => (
          <button
            key={item.key}
            onClick={() => setFilter(item.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${hasAnimations ? 'hover:scale-105' : ''}`}
            style={filter === item.key 
              ? { background: themeInfo.gradient, color: '#fff', boxShadow: `0 2px 8px ${themeInfo.primaryColor}40` }
              : { background: 'var(--color-surface-muted)', color: 'var(--color-text-tertiary)' }
            }
          >
            {item.label}
          </button>
        ))}
      </div>
      
      <div className="relative">
        <div className="absolute left-5 top-0 bottom-0 w-0.5" style={{ background: 'var(--color-border-default)' }} />
        
        <div className="space-y-3 relative">
          {filteredVersions.map((version, index) => (
            <div key={version.id} className="relative">
              <div 
                className="absolute w-3 h-3 rounded-full -left-[1px] top-4 z-10 transition-all"
                style={{ 
                  background: getVersionTypeColor(version.metadata.operationType),
                  boxShadow: `0 0 8px ${getVersionTypeColor(version.metadata.operationType)}60`
                }}
              />
              
              <VersionCard
                version={version}
                isSelected={selectedVersionId === version.id}
                onSelect={() => onSelectVersion(version)}
                onRollback={() => onRollback(version.id)}
                themeInfo={themeInfo}
                hasAnimations={hasAnimations}
              />
            </div>
          ))}
        </div>
      </div>
      
      {filteredVersions.length === 0 && (
        <div className="text-center py-8">
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            没有找到符合条件的版本记录
          </p>
        </div>
      )}
    </div>
  );
};

export default MemoryVersionTimeline;
