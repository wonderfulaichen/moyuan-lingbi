import React from 'react';
import { NovelScheme, SchemeGroup } from '../../../../shared/types';
import { useTheme } from '../../../shared/contexts/ThemeContext';
import { useUIStore } from '../../../shared/stores/uiStore';

interface SchemeCardProps {
  scheme: NovelScheme;
  index: number;
  layout: 'grid' | 'list';
  schemeGroups: SchemeGroup[];
  onSelect: (schemeId: string) => void;
  onToggleFavorite: (schemeId: string, e?: React.MouseEvent) => void;
  onAssignGroup: (schemeId: string, groupId: string | null) => void;
  onView: (scheme: NovelScheme) => void;
}

const SchemeCard: React.FC<SchemeCardProps> = ({
  scheme,
  index,
  layout,
  schemeGroups,
  onSelect,
  onToggleFavorite,
  onAssignGroup,
  onView,
}) => {
  const { themeInfo } = useTheme();
  const { animationLevel } = useUIStore();
  const hasAnimations = animationLevel !== 'none';

  // 为不同方案分配装饰性颜色
  const getAccentColor = () => {
    const colors = [
      { bg: 'rgba(168, 85, 247, 0.12)', color: 'rgb(168, 85, 247)' },
      { bg: 'rgba(59, 130, 246, 0.12)', color: 'rgb(59, 130, 246)' },
      { bg: 'rgba(16, 185, 129, 0.12)', color: 'rgb(16, 185, 129)' },
      { bg: 'rgba(245, 158, 11, 0.12)', color: 'rgb(245, 158, 11)' },
      { bg: 'rgba(239, 68, 68, 0.12)', color: 'rgb(239, 68, 68)' },
    ];
    return colors[index % colors.length];
  };

  const accentColor = getAccentColor();

  if (layout === 'grid') {
    return (
      <div
        key={scheme.id}
        className={`scheme-card relative rounded-2xl border-2 transition-all duration-300 group animate-card-enter overflow-hidden ${
          scheme.selected ? 'shadow-lg' : 'shadow-sm'
        } ${hasAnimations ? 'hover:-translate-y-1' : ''}`}
        style={{
          animationDelay: `${index * 80}ms`,
          backgroundColor: scheme.selected ? 'var(--color-primary-100)' : 'var(--color-surface-elevated)',
          borderColor: scheme.selected ? 'var(--color-primary-300)' : 'var(--color-border-default)',
          boxShadow: scheme.selected ? '0 8px 32px var(--color-primary-100)' : undefined,
        }}
      >
        {/* ═══ 顶部装饰条 ═══ */}
        <div
          className="h-1 w-full"
          style={{
            background: scheme.selected ? themeInfo.gradient : accentColor.bg,
            transition: 'height 0.3s ease',
          }}
        />

        {/* ═══ 顶部：勾选区域 ═══ */}
        <div
          onClick={() => onSelect(scheme.id)}
          className="cursor-pointer px-5 pt-4 pb-3 transition-colors duration-200 scheme-card-hover-zone"
        >
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2.5">
              {/* 选择指示器 — 始终可见 */}
              <div
                className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition-all duration-300 ${
                  scheme.selected ? 'scale-100' : 'scale-100 group-hover:scale-110'
                }`}
                style={{
                  backgroundColor: scheme.selected ? 'var(--color-primary-500)' : 'var(--color-surface-muted)',
                  border: scheme.selected
                    ? '2px solid var(--color-primary-500)'
                    : '2px solid var(--color-border-default)',
                  boxShadow: scheme.selected ? '0 0 0 3px var(--color-primary-100)' : undefined,
                }}
              >
                {scheme.selected ? (
                  <i className="fas fa-check text-white text-[9px] animate-fade-in-scale" />
                ) : (
                  <div className="w-1.5 h-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                    style={{ backgroundColor: 'var(--color-text-tertiary)' }} />
                )}
              </div>

              <span className="text-xs font-bold px-2 py-0.5 rounded" 
                style={{ 
                  color: scheme.selected ? 'var(--color-primary-400)' : accentColor.color,
                  backgroundColor: scheme.selected ? 'var(--color-primary-100)' : accentColor.bg,
                }}>
                方案 {index + 1}
              </span>
            </div>

            {/* 收藏按钮 — 始终可见 */}
            <button
              onClick={(e) => onToggleFavorite(scheme.id, e)}
              className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all duration-200 hover:scale-110 ${
                scheme.favorited ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
              }`}
              style={{
                backgroundColor: scheme.favorited ? 'var(--color-amber-50, rgba(251,191,36,0.15))' : 'var(--color-surface-muted)',
                color: scheme.favorited ? 'var(--color-amber-400, #f59e0b)' : 'var(--color-text-tertiary)',
              }}
              title={scheme.favorited ? '取消收藏' : '收藏'}
            >
              <i className={`fas fa-star text-xs ${scheme.favorited ? 'animate-float' : ''}`} />
            </button>
          </div>

          <div className="flex items-center gap-2 mb-2 flex-wrap">
            {scheme.genre && (
              <span className="text-[10px] px-2 py-0.5 rounded font-medium" style={{ color: 'var(--color-text-primary)', backgroundColor: 'var(--color-surface-hover)' }}>
                {scheme.genre}
              </span>
            )}
            {scheme.groupId && (
              <span className="text-[10px] px-2 py-0.5 rounded font-medium" style={{ color: 'var(--color-text-primary)', backgroundColor: 'var(--color-surface-hover)' }}>
                {schemeGroups.find(g => g.id === scheme.groupId)?.name || '未分组'}
              </span>
            )}
          </div>

          <h4 className="text-xl font-black mb-2 pr-2 flex items-center gap-2" style={{ color: 'var(--color-text-primary)' }}>
            <i className="fas fa-book text-xs" style={{ color: 'var(--color-primary-400)' }} />
            {scheme.title}
          </h4>

          {scheme.tone && (
            <div className="mb-1">
              <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--color-text-secondary)' }}>基调</span>
              <p className="text-sm font-medium" style={{ color: 'var(--color-primary-500)' }}>{scheme.tone}</p>
            </div>
          )}
        </div>

        {/* ═══ 分隔线 ═══ */}
        <div className="px-5">
          <div className="border-t transition-colors duration-200" style={{ borderColor: 'var(--color-border-default)' }} />
        </div>

        {/* ═══ 底部：预览区域 ═══ */}
        <div
          onClick={() => onView(scheme)}
          className="cursor-pointer px-5 pt-3 pb-4 transition-colors duration-200 scheme-card-hover-zone"
        >
          <p className="text-sm leading-relaxed mb-3 line-clamp-4" style={{ color: 'var(--color-text-secondary)' }}>{scheme.intro}</p>

          {scheme.coreConflict && (
            <div className="mb-2 px-3 py-2 rounded-lg transition-colors duration-200" style={{ backgroundColor: 'var(--color-surface-muted)', border: '1px solid var(--color-border-default)' }}>
              <span className="text-[10px] uppercase tracking-wider font-bold" style={{ color: 'var(--color-text-secondary)' }}>⚡ 核心冲突</span>
              <p className="text-xs mt-0.5 line-clamp-2" style={{ color: 'var(--color-text-tertiary)' }}>{scheme.coreConflict}</p>
            </div>
          )}

          {scheme.highlights && (
            <div className="px-3 py-2 rounded-lg transition-colors duration-200" style={{ backgroundColor: 'var(--color-surface-muted)', border: '1px solid var(--color-border-default)' }}>
              <span className="text-[10px] uppercase tracking-wider font-bold" style={{ color: 'var(--color-text-secondary)' }}>✨ 亮点</span>
              <p className="text-xs mt-0.5 line-clamp-2" style={{ color: 'var(--color-text-tertiary)' }}>{scheme.highlights}</p>
            </div>
          )}

          {/* 预览提示 */}
          <div className="flex items-center justify-end mt-3 opacity-0 group-hover:opacity-100 transition-all duration-200 translate-y-1 group-hover:translate-y-0">
            <span className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg"
              style={{ color: 'var(--color-primary-400)', backgroundColor: 'var(--color-primary-100)' }}>
              <i className="fas fa-eye text-[9px]" />
              点击预览详情
            </span>
          </div>
        </div>

        {/* ═══ 底部分组选择 ═══ */}
        {schemeGroups.length > 0 && (
          <div className="px-5 pb-3 opacity-0 group-hover:opacity-100 transition-all duration-200 translate-y-1 group-hover:translate-y-0">
            <select
              value={scheme.groupId || ''}
              onChange={(e) => {
                e.stopPropagation();
                onAssignGroup(scheme.id, e.target.value || null);
              }}
              onClick={(e) => e.stopPropagation()}
              className="neumorphic-input w-full rounded-lg px-2 py-1 text-[10px]"
            >
              <option value="">未分组</option>
              {schemeGroups.map(g => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      key={scheme.id}
      className={`scheme-card relative rounded-xl border-2 transition-all duration-300 group animate-card-enter overflow-hidden ${
        scheme.selected ? 'shadow-md' : 'shadow-sm'
      }`}
      style={{
        animationDelay: `${index * 60}ms`,
        backgroundColor: scheme.selected ? 'var(--color-primary-100)' : 'var(--color-surface-elevated)',
        borderColor: scheme.selected ? 'var(--color-primary-300)' : 'var(--color-border-default)',
      }}
    >
      <div className="flex">
        {/* ═══ 顶部左侧：勾选区域 ═══ */}
        <div
          onClick={() => onSelect(scheme.id)}
          className="cursor-pointer px-4 pt-4 pb-3 flex-1 min-w-0 transition-colors duration-200 scheme-card-hover-zone"
        >
          <div className="flex gap-4">
            <div className="shrink-0 flex flex-col items-center justify-center gap-1.5">
              {/* 选择指示器 */}
              <div
                className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition-all duration-300 ${
                  scheme.selected ? 'scale-100' : 'group-hover:scale-110'
                }`}
                style={{
                  backgroundColor: scheme.selected ? 'var(--color-primary-500)' : 'var(--color-surface-muted)',
                  border: scheme.selected
                    ? '2px solid var(--color-primary-500)'
                    : '2px solid var(--color-border-default)',
                  boxShadow: scheme.selected ? '0 0 0 3px var(--color-primary-100)' : undefined,
                }}
              >
                {scheme.selected ? (
                  <i className="fas fa-check text-white text-[9px] animate-fade-in-scale" />
                ) : (
                  <div className="w-1.5 h-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                    style={{ backgroundColor: 'var(--color-text-tertiary)' }} />
                )}
              </div>
              <span className="text-2xl font-black" style={{ color: scheme.selected ? 'var(--color-primary-400)' : 'var(--color-text-tertiary)', opacity: scheme.selected ? 1 : 0.3 }}>{String(index + 1).padStart(2, '0')}</span>
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h4 className="text-lg font-bold truncate" style={{ color: 'var(--color-text-primary)' }}>{scheme.title}</h4>
                {scheme.favorited && (
                  <i className="fas fa-star text-amber-400 text-xs shrink-0 animate-float" />
                )}
                {scheme.genre && (
                  <span className="text-[10px] px-2 py-0.5 rounded shrink-0 font-medium" style={{ color: 'var(--color-text-primary)', backgroundColor: 'var(--color-surface-hover)' }}>{scheme.genre}</span>
                )}
              </div>
            </div>

            <div className="shrink-0 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-all duration-200 translate-x-1 group-hover:translate-x-0">
              <button
                onClick={(e) => { e.stopPropagation(); onToggleFavorite(scheme.id, e); }}
                className="w-7 h-7 rounded-lg flex items-center justify-center transition-all duration-200 hover:scale-110"
                style={{
                  backgroundColor: scheme.favorited ? 'var(--color-amber-50, rgba(251,191,36,0.15))' : 'var(--color-surface-muted)',
                  color: scheme.favorited ? 'var(--color-amber-400, #f59e0b)' : 'var(--color-text-tertiary)',
                }}
              >
                <i className="fas fa-star text-xs" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ 分隔线 ═══ */}
      <div className="px-4">
        <div className="border-t transition-colors duration-200" style={{ borderColor: 'var(--color-border-default)' }} />
      </div>

      {/* ═══ 底部：预览区域 ═══ */}
      <div
        onClick={() => onView(scheme)}
        className="cursor-pointer px-4 pt-3 pb-4 transition-colors duration-200 scheme-card-hover-zone"
      >
        <p className="text-sm line-clamp-2 mb-2" style={{ color: 'var(--color-text-secondary)' }}>{scheme.intro}</p>
        <div className="flex items-center justify-between gap-3">
          <div className="flex gap-3 text-xs">
            {scheme.tone && <span style={{ color: 'var(--color-primary-500)' }}><i className="fas fa-music mr-1" />{scheme.tone}</span>}
            {scheme.coreConflict && <span style={{ color: 'var(--color-red-500, #ef4444)' }}><i className="fas fa-bolt mr-1" />{scheme.coreConflict.slice(0, 30)}...</span>}
          </div>
          <span className="inline-flex items-center gap-1 text-[10px] opacity-0 group-hover:opacity-100 transition-all duration-200 translate-x-1 group-hover:translate-x-0"
            style={{ color: 'var(--color-primary-400)' }}>
            <i className="fas fa-eye text-[9px]" />
            预览
          </span>
        </div>
      </div>
    </div>
  );
};

export default SchemeCard;
