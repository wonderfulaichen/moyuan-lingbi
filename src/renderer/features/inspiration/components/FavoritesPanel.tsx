import React, { useState } from 'react';
import { NovelScheme, SchemeGroup } from '../../../../shared/types';

interface FavoritesPanelProps {
  favoritedSchemes: NovelScheme[];
  schemeGroups: SchemeGroup[];
  onSelectScheme: (schemeId: string) => void;
  onToggleFavorite: (schemeId: string, e?: React.MouseEvent) => void;
  onCreateGroup: (name: string) => void;
  onDeleteGroup: (groupId: string) => void;
  emptyText?: string;
}

const FavoritesPanel: React.FC<FavoritesPanelProps> = ({
  favoritedSchemes,
  schemeGroups,
  onSelectScheme,
  onToggleFavorite,
  onCreateGroup,
  onDeleteGroup,
  emptyText = '暂无收藏',
}) => {
  const [newGroupName, setNewGroupName] = useState('');

  const handleCreateGroup = () => {
    if (!newGroupName.trim()) return;
    onCreateGroup(newGroupName.trim());
    setNewGroupName('');
  };

  return (
    <div className="space-y-4">
      {/* 收藏面板 */}
      <div className="glass-card rounded-xl overflow-hidden animate-fade-in-up mb-4">
        <div className="p-4" style={{ borderBottom: '1px solid rgba(251,191,36,0.1)' }}>
          <h4 className="text-sm font-bold" style={{ color: 'var(--color-text-secondary)' }}>
            <i className="fas fa-star mr-2" style={{ color: '#f59e0b' }}></i>收藏方案
            <span className="ml-2 text-[10px] font-normal" style={{ color: 'var(--color-text-tertiary)' }}>{favoritedSchemes.length} 个</span>
          </h4>
        </div>
        <div className="p-4 max-h-72 overflow-y-auto">
          {favoritedSchemes.length === 0 ? (
            <p className="text-xs text-center py-4" style={{ color: 'var(--color-text-tertiary)' }}>{emptyText}</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {favoritedSchemes.map(scheme => (
                <div
                  key={scheme.id}
                  onClick={() => onSelectScheme(scheme.id)}
                  className="p-3 rounded-lg transition-colors cursor-pointer card-float-hover"
                  style={{ backgroundColor: 'var(--color-surface-muted)', border: '1px solid rgba(251,191,36,0.1)' }}
                >
                  <div className="flex items-center justify-between mb-1">
                    <h5 className="text-sm font-bold truncate" style={{ color: 'var(--color-text-primary)' }}>{scheme.title}</h5>
                    <button
                      onClick={(e) => onToggleFavorite(scheme.id, e)}
                      className="text-xs" style={{ color: '#f59e0b' }}
                    >
                      <i className="fas fa-star"></i>
                    </button>
                  </div>
                  <p className="text-[10px] line-clamp-2" style={{ color: 'var(--color-text-tertiary)' }}>{scheme.intro}</p>
                  <div className="flex gap-1 mt-1">
                    {scheme.genre && <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ color: 'var(--color-text-tertiary)', backgroundColor: 'var(--color-surface-muted)' }}>{scheme.genre}</span>}
                    {scheme.tone && <span className="text-[10px]" style={{ color: 'var(--color-primary-300)' }}>{scheme.tone}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 分组管理面板 */}
      <div className="glass-card rounded-xl overflow-hidden animate-fade-in-up mb-4">
        <div className="p-4" style={{ borderBottom: '1px solid var(--color-border-default)' }}>
          <h4 className="text-sm font-bold mb-3" style={{ color: 'var(--color-text-secondary)' }}>
            <i className="fas fa-folder mr-2" style={{ color: 'var(--color-primary-300)' }}></i>方案分组
          </h4>
          <div className="flex gap-2">
            <input
              type="text"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateGroup()}
              placeholder="新建分组名称..."
              className="neumorphic-input flex-1 rounded-lg px-3 py-1.5 text-sm"
            />
            <button
              onClick={handleCreateGroup}
              disabled={!newGroupName.trim()}
              className="px-3 py-1.5 rounded-lg disabled:opacity-40 transition-colors text-xs card-float-hover"
              style={{ backgroundColor: 'var(--color-primary-100)', color: 'var(--color-primary-400)' }}
            >
              <i className="fas fa-plus mr-1"></i>创建
            </button>
          </div>
        </div>
        <div className="p-4">
          {schemeGroups.length > 0 ? (
            <div className="space-y-2">
              {schemeGroups.map(group => (
                <div key={group.id} className="flex items-center justify-between p-2.5 rounded-lg transition-colors group" style={{ backgroundColor: 'var(--color-surface-muted)' }}>
                  <div className="flex items-center gap-2">
                    <i className="fas fa-folder-open text-xs" style={{ color: 'var(--color-primary-300)' }}></i>
                    <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>{group.name}</span>
                  </div>
                  <button
                    onClick={() => onDeleteGroup(group.id)}
                    className="text-[10px] opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: '#f87171' }}
                  >
                    <i className="fas fa-trash-alt"></i>
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-center py-4" style={{ color: 'var(--color-text-tertiary)' }}>创建分组来组织你的方案</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default FavoritesPanel;
