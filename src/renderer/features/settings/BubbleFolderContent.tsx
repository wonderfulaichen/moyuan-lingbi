import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useToast } from '../../shared/contexts/ToastContext';
import { ConfirmModal } from '../../shared/components/Modal';
import {
  BubbleFolder as BubbleFolderType,
  InspirationTag,
  NovelScheme,
  Project,
  ModelConfig,
  PromptTemplate,
  WorldLocation,
  WorldFaction,
  Character,
  TimelineEvent,
  ContentCard,
  KnowledgeItem,
} from '../../../shared/types';
import { aiService } from '../../shared/services/aiService';
import { dataService } from '../../shared/services/DataService';
import { useAIStatus } from '../../shared/contexts/AIStatusContext';
import AIProgressButton from '../../shared/components/AIProgressButton';
import MindMapView from './MindMapView';
import CharacterGraphView from './CharacterGraphView';

interface BubbleFolderContentProps {
  folder: BubbleFolderType;
  project: Project;
  prompts: PromptTemplate[];
  activeModel: ModelConfig;
  onUpdate: (updates: Partial<Project>) => void;
  onOpenSettings: () => void;
  onUpdateFolder: (folderId: string, updates: Partial<BubbleFolderType>) => void;
  onCreateSubFolder?: (parentId: string, name: string, type: BubbleFolderType['type']) => void;
  onSelectFolder?: (folderId: string) => void;
}

// ========== 常量映射 ==========

const TYPE_LABELS: Record<string, string> = {
  'world': '世界观',
  'characters': '角色',
  'timeline': '时间线',
  'custom': '自定义',
};

const TYPE_ICONS: Record<string, string> = {
  'world': 'fa-globe',
  'characters': 'fa-users',
  'timeline': 'fa-timeline',
  'custom': 'fa-folder',
};

const FOLDER_ICON_COLORS: Record<string, string> = {
  'world': 'text-emerald-400',
  'characters': 'text-blue-400',
  'timeline': 'text-amber-400',
  'custom': 'text-rose-400',
};

const FOLDER_BG_GRADIENTS: Record<string, string> = {
  'world': 'from-emerald-600/20 to-emerald-900/20',
  'characters': 'from-blue-600/20 to-blue-900/20',
  'timeline': 'from-amber-600/20 to-amber-900/20',
  'custom': 'from-rose-600/20 to-rose-900/20',
};

function vFileToCard(vf: { id: string; name: string; content: string; metadata: { tags?: string[]; favorited?: boolean; batchId?: string | null }; createdAt: number; updatedAt: number }): ContentCard {
  return {
    id: vf.id,
    tagText: vf.name,
    title: vf.name,
    content: vf.content || '',
    isFavorited: vf.metadata.favorited !== false,
    batchId: (vf.metadata.batchId as string) || `vf-${vf.id}`,
    createdAt: vf.createdAt,
    updatedAt: vf.updatedAt,
  };
}

// ========== 图表子组件 ==========

/** 简单关系图（角色-势力关系） */
const SimpleRelationshipGraph: React.FC<{
  factions: WorldFaction[];
  characters: { id: string; name: string; factionId?: string }[];
}> = ({ factions, characters }) => {
  const nodes: { id: string; label: string; type: 'faction' | 'character'; color: string }[] = [
    ...factions.map(f => ({ id: f.id, label: f.name, type: 'faction' as const, color: '#f59e0b' })),
    ...characters.map(c => ({ id: c.id, label: c.name, type: 'character' as const, color: 'var(--color-primary-300)' })),
  ];
  const links: { source: string; target: string }[] = [];
  characters.forEach(c => {
    if (c.factionId && factions.find(f => f.id === c.factionId)) {
      links.push({ source: c.id, target: c.factionId });
    }
  });

  if (nodes.length === 0) return null;

  const cx = 150, cy = 120, radius = 80;
  const nodePositions: Record<string, { x: number; y: number }> = {};
  nodes.forEach((node, i) => {
    const angle = (2 * Math.PI * i) / nodes.length - Math.PI / 2;
    nodePositions[node.id] = {
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
    };
  });

  return (
    <div className="flex flex-col items-center">
      <svg width="300" height="240" className="overflow-visible">
        {links.map((link, i) => {
          const src = nodePositions[link.source];
          const tgt = nodePositions[link.target];
          if (!src || !tgt) return null;
          return (
            <line key={i} x1={src.x} y1={src.y} x2={tgt.x} y2={tgt.y}
              stroke="var(--color-border-default)" strokeWidth={1.5} strokeDasharray="4 2" />
          );
        })}
        {nodes.map(node => {
          const pos = nodePositions[node.id];
          if (!pos) return null;
          return (
            <g key={node.id}>
              <circle cx={pos.x} cy={pos.y} r={18} fill={node.color} opacity={0.8} />
              <text x={pos.x} y={pos.y + 4} textAnchor="middle" fill="var(--color-text-primary)" fontSize="8" fontWeight="bold">
                {node.label.length > 4 ? node.label.slice(0, 4) + '..' : node.label}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="flex gap-4 text-[10px] mt-2">
        <span style={{ color: 'var(--color-primary-300)' }}><i className="fas fa-circle mr-1"></i>角色</span>
        <span style={{ color: 'var(--color-chart-2, #f59e0b)' }}><i className="fas fa-circle mr-1"></i>势力</span>
      </div>
    </div>
  );
};

/** 事件时间轴图表 - 垂直时间线样式 */
const TimelineChart: React.FC<{ events: TimelineEvent[] }> = ({ events }) => {
  if (events.length === 0) return null;
  const sorted = [...events].sort((a, b) => a.order - b.order);
  const [previewEvent, setPreviewEvent] = useState<TimelineEvent | null>(null);
  const DESC_MAX = 80;

  const centerX = 50; // percentage

  return (
    <>
    <div className="relative py-6" style={{ maxHeight: 'calc(100vh - 280px)', overflowY: 'auto' }}>
      {sorted.map((event, idx) => {
        const isLeft = idx % 2 === 0;
        const dotColors = [
          '#f59e0b', '#34d399', '#60a5fa', 'var(--color-primary-300)',
          '#f472b6', '#22d3ee', '#fb923c', '#f87171',
        ];
        const dotColor = dotColors[idx % dotColors.length];

        return (
          <div key={event.id} className="relative">
            {/* 连线 */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 0 }}>
              <line
                x1={isLeft ? '90%' : '10%'}
                y1="28"
                x2="50%"
                y2="28"
                stroke="var(--color-border-default)"
                strokeWidth={1.5}
                strokeDasharray={idx % 3 === 0 ? 'none' : '4 3'}
              />
            </svg>

            <div className={`flex items-start gap-4 ${isLeft ? 'flex-row' : 'flex-row-reverse'}`}>
              {/* 卡片内容 */}
              <div className={`w-[calc(50%-40px)] ${isLeft ? '' : 'text-right'}`}>
                <div
                  className="rounded-xl p-4 transition-all duration-200 hover:scale-[1.02] cursor-pointer"
                  style={{
                    backgroundColor: 'var(--color-surface-card)',
                    border: `1px solid ${dotColor}30`,
                    boxShadow: `0 2px 12px ${dotColor}10`,
                  }}
                  onClick={() => setPreviewEvent(event)}
                >
                  <div className="flex items-center gap-2 mb-1.5 justify-between">
                    <span
                      className="text-[10px] font-medium px-2 py-0.5 rounded-full"
                      style={{
                        backgroundColor: `${dotColor}20`,
                        color: dotColor,
                      }}
                    >
                      <i className="fas fa-clock mr-1"></i>
                      {event.timestamp || `事件 #${event.order + 1}`}
                    </span>
                    <span className="text-[9px]" style={{ color: 'var(--color-text-muted)' }}>
                      第 {event.order + 1} 幕
                    </span>
                  </div>
                  <h4 className="text-sm font-bold mb-1" style={{ color: 'var(--color-text-primary)' }}>
                    {event.title}
                  </h4>
                  {event.description && (
                    <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-tertiary)' }}>
                      {event.description.length <= DESC_MAX
                        ? event.description
                        : event.description.slice(0, DESC_MAX) + '...'}
                    </p>
                  )}
                  {event.relatedCharacterIds && event.relatedCharacterIds.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {event.relatedCharacterIds.map((ch, ci) => (
                        <span key={ci}
                          className="text-[8px] px-1.5 py-0.5 rounded-full"
                          style={{ backgroundColor: 'var(--color-surface-hover)', color: 'var(--color-text-muted)' }}
                        >
                          <i className="fas fa-user text-[6px] mr-0.5"></i>{ch}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* 中央圆点 */}
              <div className="shrink-0 relative" style={{ zIndex: 1, marginTop: 20 }}>
                <div
                  className="w-4 h-4 rounded-full border-2 animate-glow-breathing"
                  style={{
                    backgroundColor: `${dotColor}40`,
                    borderColor: dotColor,
                    boxShadow: `0 0 8px ${dotColor}40`,
                  }}
                />
              </div>

              {/* 右侧占位（保证左右对称） */}
              <div className="w-[calc(50%-40px)]" />
            </div>
          </div>
        );
      })}
    </div>

    {createPortal(previewEvent && (
      <>
        <div className="fixed inset-0 z-[99999]" style={{ backgroundColor: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)' }} onClick={() => setPreviewEvent(null)} />
        <div
          className="fixed z-[100000] rounded-2xl shadow-2xl flex flex-col animate-fade-in overflow-hidden"
          style={{
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 'min(680px, 85vw)',
            maxHeight: '75vh',
            backgroundColor: 'var(--color-surface-base)',
            border: '1px solid rgba(255,255,255,0.12)',
            boxShadow: '0 25px 70px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.06)',
          }}
        >
          <div className="flex items-center justify-between px-5 py-3 border-b shrink-0" style={{ borderColor: 'rgba(255,255,255,0.12)', background: 'var(--color-surface-hover)' }}>
            <div className="flex items-center gap-2.5">
              <span className="px-2 py-0.5 rounded text-[10px] font-medium" style={{ background: 'var(--color-primary-100)', color: 'var(--color-primary-500)' }}>
                时间线事件
              </span>
              <span className="text-[13px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>{previewEvent.title}</span>
            </div>
            <button onClick={() => setPreviewEvent(null)} className="w-8 h-8 rounded-full flex items-center justify-center cursor-pointer transition-all" style={{ background: 'var(--color-surface-hover)', color: 'var(--color-text-muted)', border: '1px solid transparent' }}>
              <i className="fas fa-times text-sm" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-6 custom-scrollbar" style={{ minHeight: 0 }}>
            <div className="space-y-4">
              <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                <span className="px-2 py-0.5 rounded-full font-medium" style={{ background: 'var(--color-primary-100)', color: 'var(--color-primary-500)' }}>
                  <i className="fas fa-clock mr-1"></i>{previewEvent.timestamp || `第 ${previewEvent.order + 1} 幕`}
                </span>
                <span>第 {previewEvent.order + 1} 幕</span>
              </div>
              <div className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--color-text-secondary)' }}>
                {previewEvent.description}
              </div>
              {previewEvent.relatedCharacterIds && previewEvent.relatedCharacterIds.length > 0 && (
                <div>
                  <div className="text-[10px] font-bold uppercase mb-2" style={{ color: 'var(--color-text-muted)' }}>相关角色</div>
                  <div className="flex flex-wrap gap-1.5">
                    {previewEvent.relatedCharacterIds.map((ch, ci) => (
                      <span key={ci} className="text-[11px] px-2.5 py-1 rounded-lg" style={{ backgroundColor: 'var(--color-surface-hover)', color: 'var(--color-text-secondary)' }}>
                        <i className="fas fa-user mr-1 text-[9px]"></i>{ch}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </>
    ), document.body)}
    </>
  );
};

/** 统计卡片图 */
const StatsChart: React.FC<{
  data: { label: string; value: number; color: string; icon: string }[];
}> = ({ data }) => {
  const maxVal = Math.max(...data.map(d => d.value), 1);
  if (data.length === 0) return <div className="text-[11px] text-center py-4" style={{ color: 'var(--color-text-muted)' }}>暂无数据</div>;
  return (
    <div className="space-y-2.5">
      {data.map((item, i) => (
        <div key={i}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs flex items-center gap-1.5" style={{ color: 'var(--color-text-secondary)' }}>
              <i className={`fas ${item.icon} text-[10px]`} style={{ color: item.color }}></i>
              {item.label}
            </span>
            <span className="text-xs font-bold tabular-nums" style={{ color: item.color }}>{item.value}</span>
          </div>
          <div className="w-full h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--color-surface-hover)' }}>
            <div className="h-full rounded-full transition-all duration-500"
              style={{ width: `${(item.value / maxVal) * 100}%`, backgroundColor: item.color }} />
          </div>
        </div>
      ))}
    </div>
  );
};

/** 地域图（简易 - 按类型统计地点） */
const RegionChart: React.FC<{ locations: WorldLocation[] }> = ({ locations }) => {
  const typeCounts: Record<string, number> = {};
  locations.forEach(loc => {
    const t = loc.type || '未知';
    typeCounts[t] = (typeCounts[t] || 0) + 1;
  });
  const types = Object.entries(typeCounts);
  if (types.length === 0) return null;
  const colors = ['var(--color-chart-1)', 'var(--color-chart-2)', 'var(--color-chart-3)', 'var(--color-chart-4)', 'var(--color-chart-5)', 'var(--color-chart-6)'];
  const total = types.reduce((s, [, v]) => s + v, 0);
  let cumulativeAngle = -Math.PI / 2;

  const svgCx = 100, svgCy = 100, svgR = 80;

  return (
    <div className="flex flex-col items-center">
      <svg width="200" height="200" viewBox="0 0 200 200">
        {types.map(([, count], i) => {
          const angle = (count / total) * 2 * Math.PI;
          const startAngle = cumulativeAngle;
          const endAngle = cumulativeAngle + angle;
          cumulativeAngle = endAngle;
          const x1 = svgCx + svgR * Math.cos(startAngle);
          const y1 = svgCy + svgR * Math.sin(startAngle);
          const x2 = svgCx + svgR * Math.cos(endAngle);
          const y2 = svgCy + svgR * Math.sin(endAngle);
          const largeArcFlag = angle > Math.PI ? 1 : 0;
          return (
            <path key={i}
              d={`M ${svgCx} ${svgCy} L ${x1} ${y1} A ${svgR} ${svgR} 0 ${largeArcFlag} 1 ${x2} ${y2} Z`}
              fill={colors[i % colors.length]}
              opacity={0.7}
              stroke="var(--color-border-default)"
              strokeWidth={1}
            />
          );
        })}
        <circle cx={svgCx} cy={svgCy} r={35} fill="var(--color-surface-base)" />
        <text x={svgCx} y={svgCy - 4} textAnchor="middle" fill="var(--color-text-primary)" fontSize="14" fontWeight="bold">{total}</text>
        <text x={svgCx} y={svgCy + 12} textAnchor="middle" fill="var(--color-text-tertiary)" fontSize="8">地点</text>
      </svg>
      <div className="flex flex-wrap gap-2 mt-2 justify-center">
        {types.map(([type, count], i) => (
          <span key={type} className="text-[10px] flex items-center gap-1" style={{ color: colors[i % colors.length] }}>
            <i className="fas fa-circle text-[6px]"></i>{type}({count})
          </span>
        ))}
      </div>
    </div>
  );
};

// ========== 卡片预览弹窗 ==========

interface CardPreviewModalProps {
  card: ContentCard;
  onClose: () => void;
  onEdit: () => void;
  onToggleFavorite: (e: React.MouseEvent) => void;
  onDelete: () => void;
}

const CardPreviewModal: React.FC<CardPreviewModalProps> = ({ card, onClose, onEdit, onToggleFavorite, onDelete }) => {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
      onClick={onClose}
      style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
    >
      <div
        className="relative w-full max-w-lg max-h-[80vh] overflow-hidden rounded-2xl shadow-2xl border border-purple-900/20 backdrop-blur-xl flex flex-col animate-fade-in-scale"
        style={{ backgroundColor: 'var(--color-surface-overlay, rgba(10,10,20,0.95))' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-purple-900/10 shrink-0">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <i className="fas fa-tag text-purple-400 text-xs"></i>
            <h3 className="text-sm font-bold text-gray-100 truncate">{card.title}</h3>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button onClick={onToggleFavorite} className="p-1.5 rounded-lg hover:bg-white/5 transition-colors" title={card.isFavorited ? '取消收藏' : '收藏'}>
              <i className={`fas fa-star text-xs ${card.isFavorited ? 'text-amber-400' : 'text-gray-500'}`}></i>
            </button>
            <button onClick={onEdit} className="p-1.5 rounded-lg hover:bg-white/5 transition-colors text-gray-400 hover:text-purple-300" title="编辑">
              <i className="fas fa-pen text-xs"></i>
            </button>
            <button onClick={onDelete} className="p-1.5 rounded-lg hover:bg-white/5 transition-colors text-gray-500 hover:text-red-400" title="删除">
              <i className="fas fa-trash text-xs"></i>
            </button>
            <div className="w-px h-4 bg-white/10 mx-1"></div>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/5 transition-colors text-gray-500 hover:text-gray-300" title="关闭">
              <i className="fas fa-xmark text-sm"></i>
            </button>
          </div>
        </div>

        {/* 内容体 */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {card.content ? (
            <div className="space-y-3">
              {/* 标签信息 */}
              {card.tagText && (
                <div className="inline-block text-[10px] px-2 py-0.5 rounded-full bg-purple-900/30 text-purple-300 border border-purple-900/20">
                  <i className="fas fa-tag mr-1"></i>{card.tagText}
                </div>
              )}

              {/* 主要内容 */}
              <div className="text-sm leading-relaxed text-gray-200 whitespace-pre-wrap">
                {card.content}
              </div>

              {/* 元数据 */}
              <div className="pt-3 border-t border-purple-900/10 flex items-center gap-3 text-[10px] text-gray-500">
                {card.createdAt && (
                  <span>创建: {new Date(card.createdAt).toLocaleDateString('zh-CN')}</span>
                )}
                {card.updatedAt && (
                  <span>更新: {new Date(card.updatedAt).toLocaleDateString('zh-CN')}</span>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-gray-500">
              <i className="fas fa-file-pen text-3xl mb-3 text-purple-500/30"></i>
              <p className="text-sm">暂无内容</p>
              <button onClick={onEdit} className="mt-3 px-4 py-1.5 text-xs bg-purple-600/30 hover:bg-purple-600/50 text-purple-200 rounded-lg transition-all">
                <i className="fas fa-plus mr-1"></i>添加内容
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ========== 内容卡片组件 ==========

interface ContentCardProps {
  card: ContentCard;
  onUpdate: (cardId: string, updates: Partial<ContentCard>) => void;
  onDelete: (cardId: string) => void;
  isSelected?: boolean;
  isMultiSelect?: boolean;
  onToggleSelect?: (cardId: string) => void;
  onDragStart?: (e: React.DragEvent, cardId: string) => void;
  onDragOver?: (e: React.DragEvent, cardId: string) => void;
  onDrop?: (e: React.DragEvent, cardId: string) => void;
  draggable?: boolean;
}

const ContentCardItem: React.FC<ContentCardProps> = ({
  card, onUpdate, onDelete,
  isSelected, isMultiSelect, onToggleSelect,
  onDragStart, onDragOver, onDrop, draggable,
}) => {
  const [showEditor, setShowEditor] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [previewCard, setPreviewCard] = useState<ContentCard | null>(null);

  const handleToggleFavorite = (e: React.MouseEvent) => {
    e.stopPropagation();
    onUpdate(card.id, { isFavorited: !card.isFavorited });
  };

  const handleEditorSave = (title: string, content: string, tagText?: string) => {
    onUpdate(card.id, { title, content, tagText: tagText || title, updatedAt: Date.now() });
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowDeleteConfirm(true);
  };

  return (
    <>
    <div
      className={`glass-card rounded-xl overflow-hidden transition-all duration-300 cursor-pointer hover:shadow-lg ${isSelected ? '' : ''}`}
      style={{
        borderLeft: `3px solid ${card.isFavorited ? 'var(--color-primary-400)' : 'transparent'}`,
        ...(isSelected ? { boxShadow: '0 0 0 2px var(--color-primary-400)' } : {}),
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={() => setPreviewCard(card)}
      draggable={draggable}
      onDragStart={(e) => onDragStart?.(e, card.id)}
      onDragOver={(e) => onDragOver?.(e, card.id)}
      onDrop={(e) => onDrop?.(e, card.id)}
    >
      {/* 卡片头部 */}
      <div className="flex items-center justify-between px-4 py-2.5" style={{ borderBottom: '1px solid var(--color-border-default)' }}>
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {/* 多选勾选 */}
          {isMultiSelect && (
            <button
              onClick={(e) => { e.stopPropagation(); onToggleSelect?.(card.id); }}
              className={`w-4 h-4 rounded flex items-center justify-center shrink-0 transition-all border ${
                isSelected ? 'border-solid' : 'border-gray-600 hover:border-gray-400'
              }`}
              style={{
                backgroundColor: isSelected ? 'var(--color-primary-500)' : 'transparent',
                borderColor: isSelected ? 'var(--color-primary-400)' : undefined,
              }}
            >
              {isSelected && <i className="fas fa-check text-[8px] text-white"></i>}
            </button>
          )}
          {/* 拖拽手柄 */}
          {draggable && (
            <i className="fas fa-grip-vertical text-[10px] cursor-grab opacity-40 hover:opacity-70 shrink-0" style={{ color: 'var(--color-text-muted)' }}></i>
          )}
          <i className="fas fa-tag text-[10px]" style={{ color: 'var(--color-primary-400)' }}></i>
          <span className="text-sm font-bold truncate" style={{ color: 'var(--color-text-primary)' }}>{card.title}</span>
          {card.tagText && card.tagText !== card.title && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full shrink-0"
              style={{ backgroundColor: 'var(--color-primary-100)', color: 'var(--color-primary-300)' }}>
              <i className="fas fa-clock mr-0.5"></i>{card.tagText}
            </span>
          )}
        </div>
        <div className={`flex items-center gap-2 transition-opacity duration-200 ${isHovered ? 'opacity-100' : 'opacity-0'}`}>
          <button onClick={handleToggleFavorite} className="p-1.5 rounded-lg transition-colors hover:bg-white/10"
            title={card.isFavorited ? '取消收藏' : '收藏'}>
            <i className={`fas fa-star ${card.isFavorited ? 'text-amber-400' : ''}`}
              style={!card.isFavorited ? { color: 'var(--color-text-muted)' } : {}}></i>
          </button>
          <button onClick={(e) => { e.stopPropagation(); setShowEditor(true); }} className="p-1.5 rounded-lg transition-colors hover:bg-white/10"
            title="编辑">
            <i className="fas fa-pen" style={{ color: 'var(--color-text-muted)' }}></i>
          </button>
          <button onClick={handleDeleteClick} className="p-1.5 rounded-lg transition-colors hover:bg-white/10"
            title="删除">
            <i className="fas fa-trash" style={{ color: 'var(--color-text-muted)' }}></i>
          </button>
        </div>
      </div>

      {/* 卡片内容预览 */}
      <div className="px-4 py-3">
        {card.content ? (
          <p
            className="text-xs leading-relaxed"
            style={{
              color: 'var(--color-text-tertiary)',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {card.content}
          </p>
        ) : (
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            <i className="fas fa-pen-to-square mr-1"></i>点击编辑内容
          </p>
        )}
      </div>
    </div>

    {/* 删除确认弹窗 */}
    {showDeleteConfirm && (
      <ConfirmModal
        title="删除文件"
        message={`确定要删除「${card.title}」吗？此操作不可撤销。`}
        variant="danger"
        confirmText="删除"
        onConfirm={() => { setShowDeleteConfirm(false); onDelete(card.id); }}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    )}

    {createPortal(previewCard && (
      <>
        <div className="fixed inset-0 z-[99999]" style={{ backgroundColor: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)' }} onClick={() => setPreviewCard(null)} />
        <div
          className="fixed z-[100000] rounded-2xl shadow-2xl flex flex-col animate-fade-in overflow-hidden"
          style={{
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 'min(720px, 88vw)',
            maxHeight: '80vh',
            backgroundColor: 'var(--color-surface-base)',
            border: '1px solid rgba(255,255,255,0.12)',
            boxShadow: '0 25px 70px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.06)',
          }}
        >
          <div className="flex items-center justify-between px-5 py-3 border-b shrink-0" style={{ borderColor: 'rgba(255,255,255,0.12)', background: 'var(--color-surface-hover)' }}>
            <div className="flex items-center gap-2.5">
              <i className="fas fa-tag text-sm" style={{ color: 'var(--color-primary-400)' }}></i>
              <span className="text-[13px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>{previewCard.title}</span>
              {previewCard.tagText && previewCard.tagText !== previewCard.title && (
                <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'var(--color-primary-100)', color: 'var(--color-primary-300)' }}>
                  {previewCard.tagText}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={(e) => { e.stopPropagation(); setPreviewCard(null); setShowEditor(true); }} className="w-8 h-8 rounded-full flex items-center justify-center cursor-pointer transition-all" style={{ background: 'var(--color-surface-hover)', color: 'var(--color-text-muted)', border: '1px solid transparent' }} title="编辑">
                <i className="fas fa-pen text-xs" />
              </button>
              <button onClick={() => setPreviewCard(null)} className="w-8 h-8 rounded-full flex items-center justify-center cursor-pointer transition-all" style={{ background: 'var(--color-surface-hover)', color: 'var(--color-text-muted)', border: '1px solid transparent' }}>
                <i className="fas fa-times text-sm" />
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-6 custom-scrollbar" style={{ minHeight: 0 }}>
            <div className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--color-text-secondary)' }}>
              {previewCard.content || <span style={{ color: 'var(--color-text-muted)' }}>暂无内容</span>}
            </div>
          </div>
        </div>
      </>
    ), document.body)}

    {showEditor && (
        <CardEditorModal
          card={card}
          onClose={() => setShowEditor(false)}
          onSave={handleEditorSave}
          onDelete={() => { setShowEditor(false); onDelete(card.id); }}
        />
      )}
    </>
  );
};

// ========== 全屏卡片编辑模态框 ==========
interface CardEditorModalProps {
  card: ContentCard;
  onClose: () => void;
  onSave: (title: string, content: string, tagText?: string) => void;
  onDelete: () => void;
}

const CardEditorModal: React.FC<CardEditorModalProps> = ({ card, onClose, onSave, onDelete }) => {
  const [title, setTitle] = useState(card.title);
  const [content, setContent] = useState(card.content);
  const [tagText, setTagText] = useState(card.tagText || '');
  const [isClosing, setIsClosing] = useState(false);

  const handleClose = useCallback(() => {
    setIsClosing(true);
    setTimeout(() => onClose(), 200);
  }, [onClose]);

  const handleSave = () => {
    onSave(title, content, tagText || title);
    handleClose();
  };

  const handleDeleteAndClose = () => {
    setIsClosing(true);
    setTimeout(() => onDelete(), 200);
  };

  return createPortal(
    <div
      className={`z-[10000] ${isClosing ? 'animate-fade-out' : ''}`}
      style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.6)', animation: isClosing ? undefined : 'fadeIn 0.2s ease-out' }}
      onClick={isClosing ? undefined : handleClose}>
      <div
        className={`relative w-[90vw] max-w-4xl h-[85vh] border border-purple-900/30 rounded-2xl shadow-2xl flex flex-col overflow-hidden ${isClosing ? '' : 'animate-fade-in-scale'}`}
        style={{ backgroundColor: 'var(--color-surface-overlay, rgba(10,10,20,0.98))', backdropFilter: 'blur(24px)' }}
        onClick={(e) => e.stopPropagation()}>
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-purple-900/20 shrink-0">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <i className="fas fa-file-lines text-sm" style={{ color: 'var(--color-primary-400)' }}></i>
            <div className="flex-1 min-w-0 flex items-center gap-3">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="flex-1 bg-transparent text-lg font-bold focus:outline-none min-w-0"
                style={{ color: 'var(--color-text-primary)' }}
                placeholder="文件标题"
              />
              <div className="flex items-center gap-1.5 shrink-0">
                <i className="fas fa-clock text-[10px]" style={{ color: 'var(--color-primary-300)' }}></i>
                <input
                  value={tagText}
                  onChange={(e) => setTagText(e.target.value)}
                  className="bg-transparent text-xs focus:outline-none w-28 text-center border-b border-dashed"
                  style={{ color: 'var(--color-text-tertiary)', borderColor: 'var(--color-border-default)' }}
                  placeholder="小说内时间（如：太古纪元）"
                  title="设置此事件在小说中的时间"
                />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleSave}
              className="px-4 py-2 text-xs font-medium text-white rounded-lg transition-all hover:scale-105"
              style={{ background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-primary-600))' }}>
              <i className="fas fa-check mr-1"></i>保存
            </button>
            <button onClick={handleDeleteAndClose}
              className="px-3 py-2 text-xs font-medium text-red-400 rounded-lg hover:bg-red-900/20 transition-all">
              <i className="fas fa-trash mr-1"></i>删除
            </button>
            <button onClick={handleClose}
              className="p-2 rounded-lg hover:bg-white/5 transition-all"
              style={{ color: 'var(--color-text-muted)' }}>
              <i className="fas fa-xmark text-sm"></i>
            </button>
          </div>
        </div>
        {/* 内容编辑区 */}
        <div className="flex-1 p-6 overflow-hidden">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="w-full h-full neumorphic-input rounded-xl p-5 text-sm leading-relaxed resize-none focus:outline-none transition-all"
            style={{ color: 'var(--color-text-secondary)' }}
            placeholder="输入详细设定内容..."
          />
        </div>
      </div>
    </div>,
    document.body
  );
};

// ========== 主组件 ==========

const BubbleFolderContent: React.FC<BubbleFolderContentProps> = ({
  folder,
  project,
  prompts,
  activeModel,
  onUpdate,
  onOpenSettings,
  onUpdateFolder,
  onCreateSubFolder,
  onSelectFolder,
}) => {
  const { setGenerating, setStatusMessage, setComplete, setError: setAIError, addTask, setTokenUsage, status } = useAIStatus();
  const { showToast } = useToast();
  const [inspiration, setInspiration] = useState(folder.prompt || '');
  const [tagCount, setTagCount] = useState(5);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatingProgress, setGeneratingProgress] = useState(0);
  const [newSubFolderName, setNewSubFolderName] = useState('');
  const [showSubFolderInput, setShowSubFolderInput] = useState(false);
  const [folderView, setFolderView] = useState<'grid' | 'tree' | 'graph'>('grid');
  const [activeView, setActiveView] = useState<'generate' | 'cards'>('generate');
  const [contentView, setContentView] = useState<'grid' | 'timeline'>('grid');
  const [cardSearchText, setCardSearchText] = useState('');
  const [selectedCardIds, setSelectedCardIds] = useState<Set<string>>(new Set());
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  const [dragCardId, setDragCardId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dsVersion, setDsVersion] = useState(0);

  useEffect(() => {
    return dataService.subscribe(() => setDsVersion(v => v + 1));
  }, []);

  // 实时同步 inspiration 到 folder.prompt（防抖），解决切换页面内容残留的问题
  const promptTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (promptTimerRef.current) clearTimeout(promptTimerRef.current);
    promptTimerRef.current = setTimeout(() => {
      if (folder.prompt !== inspiration) {
        onUpdateFolder(folder.id, { prompt: inspiration });
      }
    }, 500);
    return () => { if (promptTimerRef.current) clearTimeout(promptTimerRef.current); };
  }, [inspiration, folder.id, folder.prompt, onUpdateFolder]);

  // 切换文件夹时重置 inspiration
  useEffect(() => {
    setInspiration(folder.prompt || '');
  }, [folder.id, folder.prompt]);

  // 获取关联的灵感方案
  const selectedScheme = folder.selectedSchemeId
    ? project.novelSchemes.find(s => s.id === folder.selectedSchemeId)
    : project.novelSchemes.find(s => s.selected);

  const cards = useMemo(() => {
    if (folder.vfileId) {
      const vfiles = dataService.getChildren(folder.vfileId);
      if (vfiles.length > 0) return vfiles.map(vFileToCard);
    }
    return folder.contentCards || [];
  }, [folder.vfileId, folder.contentCards, dsVersion]);
  const [generatingCardTitle, setGeneratingCardTitle] = useState<string | null>(null);
  const handleGenerateTags = useCallback(async () => {
    if (!activeModel || !activeModel.modelName) {
      showToast('请先在设置中配置AI模型', 'warning');
      onOpenSettings();
      return;
    }
    setIsGenerating(true);
    setGeneratingProgress(5);
    const taskId = addTask({ id: `task_${Date.now()}`, type: 'generate-cards', modelName: activeModel.modelName, status: 'running', statusMessage: '正在生成...', progress: 5, tokenUsage: null, error: null });
    setGenerating(activeModel.modelName, '正在生成...', 'generate-cards');

    const isWorldFolder = folder.type === 'world';
    const schemeContext = selectedScheme ? `\n已选创作方案：「${selectedScheme.title}」(${selectedScheme.genre})` : '';
    const userContext = inspiration.trim() ? `\n用户灵感：${inspiration}` : '';

    try {
      if (isWorldFolder) {
        await handleGenerateSingleText(taskId, schemeContext, userContext);
      } else {
        await handleGenerateMultipleFiles(taskId, schemeContext, userContext);
      }
      setGeneratingProgress(100);
    } catch (err) {
      setAIError(err instanceof Error ? err.message : '生成失败');
      setGeneratingProgress(0);
    } finally {
      setIsGenerating(false);
      setGeneratingCardTitle(null);
      setComplete();
    }
  }, [activeModel, inspiration, tagCount, folder, onOpenSettings, onUpdateFolder, setGenerating, setStatusMessage, setComplete, setAIError, addTask, setTokenUsage]);

  const handleGenerateSingleText = useCallback(async (taskId: string, schemeCtx: string, userCtx: string) => {
    setStatusMessage(`正在撰写完整的${folder.name}设定...`);
    const typePrompts: Record<string, string> = {
      world: `你是一位资深的世界观架构师。用户正在构建小说的完整世界观设定。

**任务：** 撰写一份完整、详实、自洽的世界观描述文档。这是一份"总纲式"的设定，不是碎片化的条目。

**必须包含以下章节（每个章节都要有实质内容，不要空泛）：**

## 一、世界概貌
- 世界的基本形态（大陆/星球/位面）、整体规模
- 主要地理区域概述（至少3个有特色的区域）
- 气候与自然环境特征
- 这个世界的独特之处（让它与众不同的核心设定）

## 二、势力格局
- 至少3-4个主要势力/国家/组织
- 每个势力的：名称、核心理念/信仰、大致疆域、与其他势力的关系
- 势力之间的主要矛盾和平衡

## 三、规则体系
- 力量体系（修炼/魔法/科技/异能等）的核心原理
- 等级或层次划分（如果有）
- 规则的限制和代价（力量不是无限的）

## 四、历史与文化
- 关键历史事件（塑造当前格局的大事件）
- 文化特色、社会结构
- 与故事主线相关的背景铺垫

**写作要求：**
- 总字数800-1500字，内容丰满扎实
- 具体可感知，用具体的地名、人名、事件名，不要用"某个地方""某种力量"
- 各部分之间逻辑自洽，前后呼应
- 语言风格统一，有文学质感
- 直接输出正文，不要输出标题外的任何说明文字`,
      characters: `你是一位资深的人物设计师。用户正在构建小说的角色体系。

**任务：** 撰写一份完整的角色体系总览文档，涵盖主要角色群像。

**必须包含以下章节：**

## 一、主角阵营
- 主角的姓名、核心性格（3-5个关键词）、外在特征
- 背景故事（身世、成长经历、关键转折点）
- 核心动机和目标
- 性格中的矛盾点和成长空间

## 二、重要配角（至少3-4人）
- 每人的：姓名、身份定位、与主角的关系
- 性格特点（一句话概括+细节支撑）
- 在剧情中的作用

## 三、对立阵营
- 主要反派的动机和行事逻辑（不是为坏而坏）
- 反派与主角的根本冲突是什么

## 四、人物关系网络
- 人物之间错综复杂的关系（盟友/敌人/暧昧/师徒/血缘等）
- 这些关系如何推动剧情发展

**写作要求：**
- 总字数600-1200字
- 人物要有血有肉，避免脸谱化
- 通过细节展现人物性格（如习惯动作、口头禅、标志性物品）
- 直接输出正文`,
      timeline: `你是一位擅长叙事的时间线规划师。用户正在构建小说的时间线框架。

**任务：** 撰写一份完整的故事时间线文档。

**必须包含以下章节：**

## 一、远古背景（故事开始前）
- 世界/社会的起源性事件
- 塑造当前格局的历史大事件（至少2-3件）
- 这些事件对当今的影响

## 二、故事开端
- 主角出场前的状态
- 引发故事的契机/突发事件
- 初始冲突的种子

## 三、关键转折节点（至少4-5个）
- 每个节点的：时间标记、发生了什么、为什么重要
- 节点之间的因果链
- 角色在每个节点的变化

## 四、高潮与结局走向
- 最终冲突的预兆
- 可能的结局方向（不必确定唯一结局，但要有逻辑支撑）

**写作要求：**
- 总字数600-1000字
- 时间线要有节奏感（张弛有度）
- 事件之间环环相扣，不要孤立罗列
- 为后续创作留出拓展空间
- 直接输出正文`,
    };

    const prompt = (typePrompts[folder.type] || typePrompts.world) + `${schemeCtx}${userCtx}`;
    let fullContent = '';
    let round = 0;
    const maxRounds = 3;

    while (round < maxRounds) {
      round++;
      setStatusMessage(round === 1 ? `正在撰写完整的${folder.name}设定（第1段）...` : `正在续写${folder.name}设定（第${round}段）...`);
      setGeneratingProgress(Math.min(30 + (round - 1) * 25, 95));

      const currentPrompt = round === 1
        ? prompt
        : `${prompt}\n\n--- 已生成内容（请直接接着写，不要重复，不要加任何前缀标题） ---\n\n${fullContent.slice(-800)}\n\n请继续撰写上述内容的后续部分。注意保持文风一致、逻辑连贯。`;

      const result = await aiService.generateWithContext({
        model: activeModel!,
        prompt: currentPrompt,
        maxTokens: round === 1 ? 4000 : 3000,
      }, undefined, taskId);

      if (result.error) { setAIError(result.error); return; }
      if (!result.content) break;

      fullContent += (round > 1 && !fullContent.endsWith('\n') ? '\n' : '') + result.content;
      if (result.tokens) setTokenUsage(result.tokens);

      if (result.finishReason !== 'length') break;
    }

    if (fullContent) {
      dataService.createFile(folder.vfileId || null, {
        name: folder.name + '-总纲',
        type: 'file',
        content: fullContent.trim(),
        metadata: { favorited: true, aiGenerated: true },
      });
    }
    setGeneratingProgress(100);
    onUpdateFolder(folder.id, { prompt: inspiration });
  }, [activeModel, folder, inspiration, selectedScheme, onUpdateFolder, setStatusMessage, setAIError, setTokenUsage]);

  const handleGenerateMultipleFiles = useCallback(async (taskId: string, schemeCtx: string, userCtx: string) => {
    setGenerating(activeModel?.modelName || '', '正在生成...', 'generate-cards');

    const titlePrompts: Record<string, string> = {
      characters: `你是一位资深的人物设计师。用户正在构建小说的角色体系，需要生成${tagCount}个核心角色的名字。${schemeCtx}${userCtx}

**要求：**
- 每个名字是一个完整的角色姓名（如"林墨渊"、"苏清歌"），不是抽象词
- 包含主角1-2人、重要配角2-3人、关键反派1-2人
- 名字要有文学感，符合小说风格
- 角色之间要有关系张力（如师徒、宿敌、青梅竹马等暗示）

请直接输出姓名，每行一个，不要编号、不要前缀。`,
      timeline: `你是一位擅长叙事的时间线规划师。用户正在构建小说的时间线，需要生成${tagCount}个关键时间节点。${schemeCtx}${userCtx}

**要求：**
- 每个标题是一个时间节点名称（如"开篇·灵力觉醒"、"转折·花都之变"、"高潮·决战苍穹"）
- 按时间顺序排列：从故事开端到高潮结局
- 节点要有叙事节奏感（铺垫→冲突→转折→高潮）
- 标题要能让人一眼看出这个节点的重要性

请直接输出时间节点名称，每行一个，不要编号。`,
    };

    const contentPrompts: Record<string, (cardTitle: string) => string> = {
      characters: (cardTitle) => `你是一位专业的人物设定撰稿人。请为角色「${cardTitle}」撰写一份完整的人物卡片。

参考信息：${schemeCtx}${userCtx}

**必须包含以下内容（用清晰的段落或列表呈现）：**

### 基本信息
- 姓名、年龄、身份定位

### 外在特征
- 外貌描述（发型、身形、标志性特征、穿着风格）

### 性格内核
- 3-5个性格关键词 + 每个关键词的具体表现细节
- 性格中的矛盾点（如外表冷漠内心温柔）

### 背景故事
- 身世背景、成长经历中的关键事件
- 塑造其当前性格的根源

### 动机与目标
- 这个角色最想要什么？为什么？
- 内心最深处的恐惧是什么？

### 人际关系
- 与其他主要角色的关系（盟友/敌人/暧昧/血缘等）
- 在剧情中的核心作用

**写作要求：**
- 总字数250-400字
- 人物要立体有血有肉，避免脸谱化
- 用具体细节展现性格（习惯动作、口头禅、标志性物品）
- 直接输出正文，不要额外说明`,
      timeline: (cardTitle) => `你是一位专业的叙事撰稿人。请为时间线节点「${cardTitle}」撰写一份详细的事件描述。

参考信息：${schemeCtx}${userCtx}

**必须包含以下内容：**

### 时间标记
- 这个事件发生在故事的哪个阶段？（开端/发展/转折/高潮/结局）

### 事件概述
- 一句话概括发生了什么

### 详细经过
- 事件的起因（为什么会发生）
- 关键过程和冲突（具体描写，不要笼统）
- 事件的直接结果

### 人物影响
- 主要角色在这个事件中的变化（认知、能力、关系等）
- 对后续剧情的推动作用

### 隐藏伏笔
- 这个事件埋下了哪些后续会引爆的线索？

**写作要求：**
- 总字数200-350字
- 有画面感和戏剧张力
- 与前后事件逻辑连贯
- 直接输出正文`,
    };

    const defaultTitlePrompt = `你是一位经验丰富的小说世界设定规划师。用户正在构建小说的"${folder.name}"子内容，需要生成多个具体的设定项。${schemeCtx}${userCtx}

请按照以下步骤进行：
1. 先理解"${folder.name}"下应该包含哪些具体的子项
2. 将这些子项精炼为${tagCount}个精准的标题

**要求：**
- 每个标题是一个精准的词语或短语（2-8个字），代表一个可以独立展开的设定方向
- 标题之间要有清晰的区分度，不要重复或高度相似
- 标题应具有创作拓展性

请直接输出标题，每行一个，不要编号、不要前缀、不要额外解释。`;

    const defaultContentFn = (cardTitle: string) => `你是一位专业的小说设定撰稿人。用户正在构建小说的"${folder.name}"设定，请为「${cardTitle}」撰写一份详实的设定描述。

参考信息：${schemeCtx}${userCtx}

**写作要求：**
1. 内容具体可感知，使用具体描述而非笼统概括
2. 注意逻辑自洽，细节间不矛盾
3. 字数控制在150-300字之间
4. 针对不同类型采用适合的写法：
   - 地名/地点：地理位置、环境特征、文化氛围、在故事中的功能
   - 势力/组织：组织形式、核心理念、成员特点、与其他势力的关系
   - 角色：性格特质、外在特征、背景故事、动机目标
   - 规则/设定：规则内容、运作方式、对世界的影响
   - 事件：起因、经过、结果、影响

请直接输出描述内容，不要前缀、不要标题、不要格式标记。`;

    const titlePrompt = titlePrompts[folder.type] || defaultTitlePrompt;
    const contentFn = contentPrompts[folder.type] || defaultContentFn;

    const titleResult = await aiService.generateWithContext({
      model: activeModel!,
      prompt: titlePrompt,
      maxTokens: 500,
    }, undefined, taskId);

    if (titleResult.error) { setAIError(titleResult.error); return; }

    const titles = titleResult.content
      .split('\n')
      .map(t => t.replace(/^[\d\.\-\*\s]+/, '').trim())
      .filter(t => t.length > 0 && t.length < 50);

    if (titles.length === 0) { setAIError('未能生成有效标题，请重试'); return; }
    if (titleResult.tokens) setTokenUsage(titleResult.tokens);

    const batchId = `batch-${Date.now()}`;
    const parentVfId = folder.vfileId || null;
    const initialCardIds: string[] = [];
    for (const title of titles) {
      const vf = dataService.createFile(parentVfId, {
        name: title,
        type: 'file',
        content: '',
        metadata: { favorited: true, batchId, aiGenerated: true },
      });
      initialCardIds.push(vf.id);
    }
    onUpdateFolder(folder.id, { prompt: inspiration });
    setGeneratingProgress(30);

    let completedCount = 0;
    for (let i = 0; i < titles.length; i++) {
      const cardTitle = titles[i];
      const cardId = initialCardIds[i];
      setGeneratingCardTitle(cardTitle);
      setStatusMessage(`正在生成「${cardTitle}」的内容...`);

      try {
        const contentResult = await aiService.generateWithContext({
          model: activeModel!,
          prompt: contentFn(cardTitle),
          maxTokens: 800,
        }, undefined, `content-${cardId}`);

        if (!contentResult.error && contentResult.content) {
          dataService.updateFile(cardId, { content: contentResult.content });
          if (contentResult.tokens) setTokenUsage(contentResult.tokens);
        }
      } catch {}

      completedCount++;
      setGeneratingProgress(30 + Math.round((completedCount / titles.length) * 65));
    }
  }, [activeModel, folder, inspiration, selectedScheme, tagCount, onUpdateFolder, setGenerating, setStatusMessage, setAIError, setTokenUsage]);

  // ========== 手动创建空卡片 ==========
  const handleManualCreateCard = useCallback(() => {
    const title = inspiration.trim() || `新文件_${Date.now()}`;
    dataService.createFile(folder.vfileId || null, {
      name: title,
      type: 'file',
      content: '',
      metadata: { favorited: true, batchId: `batch-${Date.now()}` },
    });
  }, [folder]);

  // ========== 标签操作 ==========
  const handleToggleTag = useCallback((tagId: string) => {
    const tags = folder.generatedTags || [];
    const tag = tags.find(t => t.id === tagId);
    const updatedTags = tags.map(t =>
      t.id === tagId ? { ...t, selected: !t.selected } : t
    );
    onUpdateFolder(folder.id, { generatedTags: updatedTags });
    if (tag && folder.vfileId) {
      const children = dataService.getChildren(folder.vfileId);
      children.filter(c => c.name === tag.text).forEach(c => {
        dataService.updateFile(c.id, { metadata: { ...c.metadata, favorited: !c.metadata.favorited } });
      });
    }
  }, [folder, onUpdateFolder]);

  const handleRemoveTag = useCallback((tagId: string) => {
    const tags = (folder.generatedTags || []).filter(t => t.id !== tagId);
    onUpdateFolder(folder.id, { generatedTags: tags });
  }, [folder, onUpdateFolder]);

  const handleAddCustomTag = useCallback((text: string) => {
    if (!text.trim()) return;
    const newTag: InspirationTag = {
      id: `tag_${Date.now()}`,
      text: text.trim(),
      selected: false,
      source: 'user' as const,
    };
    dataService.createFile(folder.vfileId || null, {
      name: text.trim(),
      type: 'file',
      content: '',
      metadata: { favorited: false, batchId: `batch-${Date.now()}` },
    });
    onUpdateFolder(folder.id, {
      generatedTags: [...(folder.generatedTags || []), newTag],
    });
  }, [folder, onUpdateFolder]);

  // ========== 内容卡片操作 ==========
  const handleUpdateCard = useCallback((cardId: string, updates: Partial<ContentCard>) => {
    if ('content' in updates) {
      dataService.updateFile(cardId, { content: updates.content || '' });
    }
    if ('isFavorited' in updates) {
      const vf = dataService.getFile(cardId);
      if (vf) dataService.updateFile(cardId, { metadata: { ...vf.metadata, favorited: updates.isFavorited } });
    }
  }, []);

  const handleDeleteCard = useCallback((cardId: string) => {
    const vf = dataService.getFile(cardId);
    const cardName = vf?.name || '';
    dataService.deleteFile(cardId);
    if (cardName) {
      const tags = (folder.generatedTags || []).filter(t => t.text !== cardName);
      onUpdateFolder(folder.id, { generatedTags: tags });
    }
  }, [folder, onUpdateFolder]);

  const handleBatchDeleteCards = useCallback(() => {
    if (selectedCardIds.size === 0) return;
    selectedCardIds.forEach(id => { try { dataService.deleteFile(id); } catch {} });
    setSelectedCardIds(new Set());
    setIsMultiSelectMode(false);
  }, [selectedCardIds]);

  const handleToggleCardSelect = useCallback((cardId: string) => {
    setSelectedCardIds(prev => {
      const next = new Set(prev);
      if (next.has(cardId)) next.delete(cardId); else next.add(cardId);
      return next;
    });
  }, []);

  const handleSelectAllCards = useCallback((cardIds: string[]) => {
    setSelectedCardIds(new Set(cardIds));
  }, []);

  const handleDragStart = useCallback((e: React.DragEvent, cardId: string) => {
    setDragCardId(cardId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', cardId);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDropOnCard = useCallback((e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!dragCardId || dragCardId === targetId) { setDragCardId(null); return; }
    if (folder.vfileId) {
      const parent = dataService.getFile(folder.vfileId);
      if (parent) {
        const children = [...(parent.childrenIds || [])];
        const fromIdx = children.indexOf(dragCardId);
        const toIdx = children.indexOf(targetId);
        if (fromIdx >= 0 && toIdx >= 0) {
          const [moved] = children.splice(fromIdx, 1);
          children.splice(toIdx, 0, moved);
          dataService.updateFile(folder.vfileId, {} as any);
          dataService.reorderChildren(folder.vfileId, children);
        }
      }
    }
    setDragCardId(null);
  }, [dragCardId, folder]);

  // ========== 知识文件导入 ==========
  const handleFileImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const content = ev.target?.result as string;
        const newItem: KnowledgeItem = {
          id: `ki_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          name: file.name,
          content,
          type: file.type || 'text/plain',
          size: file.size,
          addedAt: Date.now(),
          category: 'inspiration',
        };
        onUpdateFolder(folder.id, {
          knowledgeInputs: [...(folder.knowledgeInputs || []), newItem],
        });
      };
      reader.readAsText(file);
    });
    e.target.value = '';
  }, [folder, onUpdateFolder]);

  const handleRemoveKnowledge = useCallback((itemId: string) => {
    const items = (folder.knowledgeInputs || []).filter(k => k.id !== itemId);
    onUpdateFolder(folder.id, { knowledgeInputs: items });
  }, [folder, onUpdateFolder]);

  // ========== 子文件夹操作 ==========
  const handleCreateSubFolder = useCallback(() => {
    if (!newSubFolderName.trim()) return;
    if (onCreateSubFolder) {
      onCreateSubFolder(folder.id, newSubFolderName.trim(), 'custom');
    }
    setNewSubFolderName('');
    setShowSubFolderInput(false);
  }, [newSubFolderName, folder, onCreateSubFolder]);

  // ========== 中止生成 ==========
  const handleAbort = useCallback(() => {
    aiService.abort();
    setIsGenerating(false);
    setGeneratingProgress(0);
    setComplete();
  }, [setComplete]);

  // ========== 获取文件夹数据 ==========
  const getFolderData = () => {
    switch (folder.type) {
      case 'world':
        return { locations: project.locations, factions: project.factions, ruleSystems: project.ruleSystems };
      case 'characters':
        return { characters: project.characters };
      case 'timeline':
        return { events: project.timelineEvents };
      default:
        return {};
    }
  };


  // (模式选择和文件夹模式已合并到下方"某某文件夹"标签页中)

  // ========== 渲染：生成模式 ==========
  const renderGenerateMode = () => {
    const tags = folder.generatedTags || [];
    const favoriteCards = cards.filter(c => c.isFavorited);
    const knowledgeItems = folder.knowledgeInputs || [];

    return (
      <div className="flex flex-col h-full overflow-hidden">
        {/* 顶部导航栏 */}
        <div className="flex items-center justify-between px-5 py-3 shrink-0" style={{ borderBottom: '1px solid var(--color-border-default)' }}>
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center bg-gradient-to-br ${FOLDER_BG_GRADIENTS[folder.type] || FOLDER_BG_GRADIENTS.custom}`}>
              <i className={`fas ${TYPE_ICONS[folder.type] || 'fa-folder'} text-xs ${FOLDER_ICON_COLORS[folder.type] || 'text-rose-400'}`}></i>
            </div>
            <div>
              <h2 className="text-base font-bold" style={{ color: 'var(--color-text-primary)' }}>{folder.name}</h2>
              <p className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>生成模式 · {TYPE_LABELS[folder.type] || '自定义'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* 视图切换标签 */}
            {[
              { id: 'generate' as const, label: 'AI生成', icon: 'fa-wand-magic-sparkles' },
              { id: 'cards' as const, label: `${folder.name}(${favoriteCards.length})`, icon: 'fa-folder-open' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveView(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
                  activeView === tab.id
                    ? 'text-white'
                    : ''
                }`}
                style={activeView === tab.id ? {
                  background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-primary-600))',
                } : { color: 'var(--color-text-muted)' }}
              >
                <i className={`fas ${tab.icon} text-[10px]`}></i>
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* 内容区域 */}
        <div className="flex-1 overflow-y-auto">
          {activeView === 'generate' && renderGenerateTab(tags, cards, knowledgeItems)}
          {activeView === 'cards' && renderCardsTab(cards)}
        </div>
      </div>
    );
  };

  // ========== 渲染：生成标签页（重构：配置→选标签→生成卡片）==========
  const renderGenerateTab = (tags: InspirationTag[], cards: ContentCard[], knowledgeItems: KnowledgeItem[]) => {
    const selectedTags = tags.filter(t => t.selected);

    return (
      <div className="p-5 space-y-4 animate-fade-in">
        {/* 1. 使用信息区 */}
        <div className="glass-card rounded-2xl p-4">
          <h3 className="text-xs font-bold mb-3 flex items-center gap-2" style={{ color: 'var(--color-text-secondary)' }}>
            <i className="fas fa-info-circle text-[10px]" style={{ color: 'var(--color-primary-400)' }}></i>
            使用信息
          </h3>
          <div className="mb-2">
            <label className="text-[9px] font-medium mb-1 block" style={{ color: 'var(--color-text-muted)' }}>关联灵感方案</label>
            {selectedScheme ? (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: 'var(--color-surface-hover)' }}>
                <i className="fas fa-lightbulb text-[10px]" style={{ color: 'var(--color-primary-400)' }}></i>
                <span className="text-xs font-medium flex-1" style={{ color: 'var(--color-primary-300)' }}>{selectedScheme.title}</span>
                <span className="text-[9px] px-2 py-0.5 rounded-full" style={{ background: 'var(--color-primary-500)', color: 'var(--color-primary-50)' }}>
                  {selectedScheme.genre}
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: 'var(--color-surface-hover)' }}>
                <i className="fas fa-circle-exclamation text-[10px] text-amber-400"></i>
                <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                  {project.novelSchemes.length > 0 ? '请在灵感萌发中选择方案' : '尚未创建灵感方案'}
                </span>
              </div>
            )}
          </div>
          <div>
            <label className="text-[9px] font-medium mb-1 block" style={{ color: 'var(--color-text-muted)' }}>知识输入</label>
            <div className="flex items-center gap-2">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-3 py-1.5 rounded-lg text-xs transition-all"
                style={{ border: '1px dashed var(--color-border-default)', color: 'var(--color-text-secondary)' }}
              >
                <i className="fas fa-file-import mr-1.5" style={{ color: 'var(--color-primary-400)' }}></i>
                导入文件
              </button>
              <input ref={fileInputRef} type="file" multiple accept=".txt,.md,.json,.csv" onChange={handleFileImport} className="hidden" />
              {knowledgeItems.length > 0 && (
                <span className="text-[9px]" style={{ color: 'var(--color-text-muted)' }}>
                  已导入 {knowledgeItems.length} 个文件
                </span>
              )}
            </div>
          </div>
        </div>

        {/* 2. 生成配置（AI生成 + 手动创建） */}
        <div className="glass-card rounded-2xl p-4">
          <h3 className="text-xs font-bold mb-3 flex items-center gap-2" style={{ color: 'var(--color-text-secondary)' }}>
            <i className="fas fa-wand-magic-sparkles text-[10px]" style={{ color: 'var(--color-primary-400)' }}></i>
            AI 生成内容
          </h3>
          {folder.type === 'world' ? (
            <div className="flex flex-col gap-3">
              <textarea
                value={inspiration}
                onChange={(e) => setInspiration(e.target.value)}
                placeholder={`选填：输入世界观灵感描述（如世界类型、核心设定、风格方向等），留空则根据创作方案自动生成完整的世界观总纲`}
                className="w-full neumorphic-input rounded-xl px-4 py-3 text-sm h-28 resize-none focus:outline-none transition-all"
                style={{ color: 'var(--color-text-primary)' }}
              />
              <div className="flex items-center justify-between">
                <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                  将生成 1 份完整的世界观总纲文档（800-1500字，含地理/势力/规则/历史）
                </span>
                <div className="flex items-center gap-2">
                  <AIProgressButton
                    onClick={handleGenerateTags}
                    isGenerating={isGenerating}
                    progress={status.progress}
                    label="生成世界观总纲"
                    generatingLabel="生成中..."
                    icon="fa-globe"
                  />
                  {isGenerating && (
                    <button onClick={handleAbort} className="px-3 py-1 text-xs rounded-lg transition-all"
                      style={{ color: 'var(--color-text-muted)' }}>
                      <i className="fas fa-stop mr-1"></i>中止
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex gap-3 mb-3">
              <textarea
                value={inspiration}
                onChange={(e) => setInspiration(e.target.value)}
                placeholder={`选填：输入灵感描述，留空则根据选定的创作方案+文件夹名自动生成`}
                className="flex-1 neumorphic-input rounded-xl px-4 py-3 text-sm h-20 resize-none focus:outline-none transition-all"
                style={{ color: 'var(--color-text-primary)' }}
              />
              <div className="flex flex-col items-end gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>数量</span>
                  <select
                    value={tagCount}
                    onChange={(e) => setTagCount(Number(e.target.value))}
                    className="neumorphic-input rounded-lg px-2 py-1.5 text-xs appearance-none cursor-pointer"
                    style={{ color: 'var(--color-text-secondary)' }}
                  >
                    {[3, 5, 8, 10, 15, 20].map(n => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </div>
                <AIProgressButton
                  onClick={handleGenerateTags}
                  isGenerating={isGenerating}
                  progress={status.progress}
                  label="AI生成"
                  generatingLabel="生成中..."
                  icon="fa-magic"
                />
                {isGenerating && (
                  <button onClick={handleAbort} className="px-3 py-1 text-xs rounded-lg transition-all"
                    style={{ color: 'var(--color-text-muted)' }}>
                    <i className="fas fa-stop mr-1"></i>中止
                  </button>
                )}
                {/* 手动创建卡片按钮 */}
                <button
                  onClick={handleManualCreateCard}
                  disabled={isGenerating}
                  className="px-4 py-2 rounded-xl transition-all text-sm font-medium card-float-hover disabled:opacity-40"
                  style={{ border: '1px dashed var(--color-border-default)', color: 'var(--color-text-secondary)' }}
                >
                  <i className="fas fa-plus mr-1.5"></i>手动创建
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 4. 卡片列表（按批次分组） */}
        {cards.length > 0 && (
          <div className="glass-card rounded-2xl p-4">
            <h3 className="text-xs font-bold mb-3 flex items-center gap-2" style={{ color: 'var(--color-text-secondary)' }}>
              <i className="fas fa-folder-open text-[10px]" style={{ color: 'var(--color-primary-400)' }}></i>
              {folder.name} · 共 {cards.filter(c => c.isFavorited).length} 个文件
            </h3>
            {(() => {
              // 按批次分组
              const grouped: { batchId: string; time: number; cards: ContentCard[] }[] = [];
              const batchMap = new Map<string, ContentCard[]>();
              cards.forEach(c => {
                const key = c.batchId || `legacy-${c.createdAt}`;
                if (!batchMap.has(key)) batchMap.set(key, []);
                batchMap.get(key)!.push(c);
              });
              batchMap.forEach((batchCards, batchId) => {
                const firstTime = Math.min(...batchCards.map(c => c.createdAt));
                grouped.push({ batchId, time: firstTime, cards: batchCards });
              });
              grouped.sort((a, b) => b.time - a.time);
              return grouped.map((group, gi) => (
                <div key={group.batchId} className="mb-4 last:mb-0">
                  <div className="flex items-center gap-2 mb-2 px-1">
                    <span className="text-[9px] font-medium px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: 'var(--color-primary-100)', color: 'var(--color-primary-400)' }}>
                      <i className="fas fa-clock text-[7px] mr-1"></i>
                      {new Date(group.time).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span className="text-[9px]" style={{ color: 'var(--color-text-muted)' }}>
                      {group.cards.length} 个卡片
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {group.cards.map((card, index) => (
                      <div key={card.id} className="relative animate-card-enter" style={{ animationDelay: `${index * 40}ms` }}>
                        <ContentCardItem
                          card={card}
                          onUpdate={handleUpdateCard}
                          onDelete={handleDeleteCard}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ));
            })()}
          </div>
        )}
      </div>
    );
  };

  // ========== 渲染：文件夹内容标签页（只显示已收藏=此层级文件） ==========
  const renderCardsTab = (cards: ContentCard[]) => {
    let folderFiles = cards.filter(c => c.isFavorited);
    const isTimeline = folder.type === 'timeline';
    const isCharacters = folder.type === 'characters';
    const children = folder.children || [];
    const currentView = isTimeline ? contentView : (folderView as string);
    const setView = (v: 'grid' | 'tree' | 'timeline' | 'graph') => {
      if (isTimeline) setContentView(v as 'grid' | 'timeline');
      else setFolderView(v as 'grid' | 'tree' | 'graph');
    };

    // 搜索过滤
    const filteredFiles = cardSearchText.trim()
      ? folderFiles.filter(c =>
          c.title.toLowerCase().includes(cardSearchText.trim().toLowerCase()) ||
          (c.content && c.content.toLowerCase().includes(cardSearchText.trim().toLowerCase()))
        )
      : folderFiles;

    return (
      <div className="p-5 animate-fade-in overflow-y-auto h-full flex flex-col">
        {/* 标题栏 + 工具栏 */}
        <div className="flex items-center justify-between mb-4 shrink-0">
          <div>
            <h3 className="text-lg font-bold flex items-center gap-2" style={{ color: 'var(--color-text-primary)' }}>
              <i className={`fas ${TYPE_ICONS[folder.type] || 'fa-folder'} ${FOLDER_ICON_COLORS[folder.type] || 'text-rose-400'}`}></i>
              {folder.name}
            </h3>
            <p className="text-xs mt-1" style={{ color: 'var(--color-text-tertiary)' }}>
              子文件夹 {children.length} · 文件 {filteredFiles.length}{cardSearchText.trim() ? ` / ${folderFiles.length}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* 搜索框 */}
            <div className="relative">
              <i className="fas fa-search absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px]" style={{ color: 'var(--color-text-muted)' }}></i>
              <input
                type="text"
                value={cardSearchText}
                onChange={(e) => setCardSearchText(e.target.value)}
                placeholder="搜索文件..."
                className="w-40 pl-7 pr-3 py-1.5 rounded-lg text-xs outline-none transition-all"
                style={{
                  backgroundColor: 'var(--color-surface-muted)',
                  color: 'var(--color-text-secondary)',
                  border: '1px solid var(--color-border-default)',
                }}
              />
              {cardSearchText && (
                <button onClick={() => setCardSearchText('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-white/10"
                  style={{ color: 'var(--color-text-muted)' }}>
                  <i className="fas fa-times text-[9px]"></i>
                </button>
              )}
            </div>

            {/* 多选模式切换 */}
            <button
              onClick={() => { setIsMultiSelectMode(!isMultiSelectMode); setSelectedCardIds(new Set()); }}
              className={`px-2.5 py-1.5 rounded-lg text-[10px] font-medium transition-all ${
                isMultiSelectMode ? '' : ''
              }`}
              style={isMultiSelectMode ? {
                color: 'var(--color-primary-300)',
                backgroundColor: 'var(--color-primary-100)',
                border: '1px solid var(--color-primary-300)',
              } : { color: 'var(--color-text-muted)', backgroundColor: 'var(--color-surface-muted)' }}
              title={isMultiSelectMode ? '退出多选' : '多选'}
            >
              <i className={`fas ${isMultiSelectMode ? 'fa-check-double' : 'fa-square-check'} mr-1`}></i>
              {isMultiSelectMode ? `${selectedCardIds.size}项` : '多选'}
            </button>

            <div className="flex items-center gap-1 p-0.5 rounded-lg" style={{ backgroundColor: 'var(--color-surface-muted)' }}>
              <button
                onClick={() => setView('grid')}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-medium transition-all ${
                  currentView === 'grid' ? '' : 'text-gray-500 hover:text-gray-300'
                }`}
                style={currentView === 'grid' ? {
                  color: 'var(--color-primary-300)',
                  backgroundColor: 'var(--color-primary-100)',
                  border: '1px solid var(--color-primary-300)',
                } : {}}
              >
                <i className="fas fa-th-large mr-1"></i>网格
              </button>
              {isTimeline ? (
                <button
                  onClick={() => setView('timeline')}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-medium transition-all ${
                    currentView === 'timeline' ? '' : 'text-gray-500 hover:text-gray-300'
                  }`}
                  style={currentView === 'timeline' ? {
                    color: 'var(--color-primary-300)',
                    backgroundColor: 'var(--color-primary-100)',
                    border: '1px solid var(--color-primary-300)',
                  } : {}}
                >
                  <i className="fas fa-timeline mr-1"></i>时间轴
                </button>
              ) : (
                <button
                  onClick={() => setView('tree')}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-medium transition-all ${
                    currentView === 'tree' ? '' : 'text-gray-500 hover:text-gray-300'
                  }`}
                  style={currentView === 'tree' ? {
                    color: 'var(--color-primary-300)',
                    backgroundColor: 'var(--color-primary-100)',
                    border: '1px solid var(--color-primary-300)',
                  } : {}}
                >
                  <i className="fas fa-sitemap mr-1"></i>树状图
                </button>
              )}
              {isCharacters && (
                <button
                  onClick={() => setView('graph')}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-medium transition-all ${
                    currentView === 'graph' ? '' : 'text-gray-500 hover:text-gray-300'
                  }`}
                  style={currentView === 'graph' ? {
                    color: 'var(--color-primary-300)',
                    backgroundColor: 'var(--color-primary-100)',
                    border: '1px solid var(--color-primary-300)',
                  } : {}}
                >
                  <i className="fas fa-diagram-project mr-1"></i>关系图谱
                </button>
              )}
            </div>
            {!isTimeline && (
              <button
                onClick={() => setShowSubFolderInput(true)}
                className="px-3 py-1.5 text-white rounded-xl transition-all duration-300 text-xs font-medium card-float-hover"
                style={{ background: 'linear-gradient(135deg, var(--color-primary-400), var(--color-primary-500))' }}
              >
                <i className="fas fa-plus mr-1.5"></i>新建子文件夹
              </button>
            )}
          </div>
        </div>

        {/* 新建子文件夹输入 */}
        {showSubFolderInput && !isTimeline && (
          <div className="glass-card rounded-xl p-4 mb-4 animate-fade-in-down">
            <div className="flex items-center gap-3">
              <i className="fas fa-folder-plus text-sm" style={{ color: 'var(--color-primary-400)' }}></i>
              <input
                type="text"
                value={newSubFolderName}
                onChange={(e) => setNewSubFolderName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreateSubFolder(); }}
                placeholder="输入子文件夹名称..."
                className="flex-1 bg-transparent text-sm focus:outline-none border-b border-transparent focus:border-theme-active"
                style={{ color: 'var(--color-text-primary)' }}
                autoFocus
              />
              <button onClick={handleCreateSubFolder}
                className="px-3 py-1.5 text-white rounded-lg text-xs"
                style={{ background: 'linear-gradient(135deg, var(--color-primary-400), var(--color-primary-500))' }}>
                创建
              </button>
              <button onClick={() => { setShowSubFolderInput(false); setNewSubFolderName(''); }}
                className="px-3 py-1.5 rounded-lg text-xs"
                style={{ color: 'var(--color-text-muted)' }}>
                取消
              </button>
            </div>
          </div>
        )}

        {/* 批量操作栏（多选模式激活时显示） */}
        {isMultiSelectMode && selectedCardIds.size > 0 && (
          <div className="flex items-center justify-between px-3 py-2 rounded-xl mb-3 shrink-0 animate-fade-in"
            style={{ backgroundColor: 'var(--color-primary-100)', border: '1px solid var(--color-primary-200)' }}>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium" style={{ color: 'var(--color-primary-400)' }}>
                已选 {selectedCardIds.size} 项
              </span>
              <button onClick={() => handleSelectAllCards(filteredFiles.map(c => c.id))}
                className="text-[10px] px-2 py-0.5 rounded hover:bg-white/10 transition-colors"
                style={{ color: 'var(--color-text-secondary)' }}>
                全选
              </button>
              <button onClick={() => setSelectedCardIds(new Set())}
                className="text-[10px] px-2 py-0.5 rounded hover:bg-white/10 transition-colors"
                style={{ color: 'var(--color-text-secondary)' }}>
                取消
              </button>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={handleBatchDeleteCards}
                className="px-3 py-1 text-xs rounded-lg text-red-400 hover:bg-red-900/20 transition-all flex items-center gap-1">
                <i className="fas fa-trash text-[10px]"></i>批量删除
              </button>
            </div>
          </div>
        )}

        {/* 内容区 */}
        {currentView === 'grid' ? (
          <>
            {/* 子文件夹卡片 */}
            {!isTimeline && children.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
                {children.map((child, index) => (
                  <div
                    key={child.id}
                    className="glass-card rounded-xl p-4 card-float-hover cursor-pointer transition-all duration-300"
                    style={{ animationDelay: `${index * 50}ms` }}
                    onClick={() => onSelectFolder?.(child.id)}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center bg-gradient-to-br ${FOLDER_BG_GRADIENTS[child.type] || FOLDER_BG_GRADIENTS.custom}`}>
                        <i className={`fas ${TYPE_ICONS[child.type] || 'fa-folder'} text-xs ${FOLDER_ICON_COLORS[child.type] || 'text-rose-400'}`}></i>
                      </div>
                      <span className="text-sm font-medium truncate" style={{ color: 'var(--color-text-primary)' }}>{child.name}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* 文件卡片 */}
            {filteredFiles.length === 0 && children.length === 0 ? (
              <div className="glass-card rounded-2xl p-16 text-center flex-1">
                <i className="fas fa-folder-open text-5xl mb-4" style={{ color: 'var(--color-text-muted)', opacity: 0.3 }}></i>
                <p className="font-bold" style={{ color: 'var(--color-text-secondary)' }}>{cardSearchText.trim() ? '未找到匹配的文件' : (isTimeline ? '暂无时间线事件' : '此文件夹为空')}</p>
                <p className="text-xs mt-2" style={{ color: 'var(--color-text-tertiary)' }}>{cardSearchText.trim() ? '尝试其他关键词' : '在"AI生成"中创建内容后收藏即可出现在这里'}</p>
              </div>
            ) : filteredFiles.length > 0 ? (
              <div className="flex-1">
                <h3 className="text-sm font-bold mb-3 flex items-center gap-2" style={{ color: 'var(--color-text-secondary)' }}>
                  <i className="fas fa-file-lines text-xs" style={{ color: 'var(--color-primary-400)' }}></i>
                  文件 ({filteredFiles.length})
                  {!isMultiSelectMode && (
                    <button onClick={() => setIsMultiSelectMode(true)}
                      className="ml-auto text-[10px] px-2 py-0.5 rounded hover:bg-white/10 transition-colors normal-case font-normal"
                      style={{ color: 'var(--color-text-muted)' }}>
                      <i className="fas fa-grip-vertical mr-1"></i>拖拽排序
                    </button>
                  )}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {filteredFiles.map((card, index) => (
                    <div key={card.id}
                      className={`animate-card-enter relative ${dragCardId === card.id ? 'opacity-40 scale-95' : ''}`}
                      style={{ animationDelay: `${index * 40}ms` }}
                      onDragOver={handleDragOver}>
                      <ContentCardItem
                        card={card}
                        onUpdate={handleUpdateCard}
                        onDelete={handleDeleteCard}
                        isSelected={selectedCardIds.has(card.id)}
                        isMultiSelect={isMultiSelectMode}
                        onToggleSelect={handleToggleCardSelect}
                        draggable={!isMultiSelectMode}
                        onDragStart={handleDragStart}
                        onDrop={handleDropOnCard}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </>
        ) : isTimeline ? (
          /* 时间线 - 时间轴图表 */
          <div className="glass-card rounded-2xl p-6 flex-1" style={{ minHeight: 400 }}>
            <TimelineAxisView cards={filteredFiles} />
          </div>
        ) : currentView === 'graph' && isCharacters ? (
          /* 角色关系图谱 */
          <div className="glass-card rounded-2xl p-4 flex-1 relative" style={{ height: 'calc(100vh - 240px)', minHeight: 400 }}>
            <h3 className="text-sm font-bold mb-3 flex items-center gap-2" style={{ color: 'var(--color-text-secondary)' }}>
              <i className="fas fa-diagram-project text-xs" style={{ color: 'var(--color-primary-400)' }}></i>
              角色关系图谱
            </h3>
            <CharacterGraphView cards={filteredFiles} />
          </div>
        ) : (
          /* 可拖拽思维导图视图 */
          <div className="glass-card rounded-2xl p-4 flex-1" style={{ height: 'calc(100vh - 240px)', minHeight: 400 }}>
            <h3 className="text-sm font-bold mb-3 flex items-center gap-2" style={{ color: 'var(--color-text-secondary)' }}>
              <i className="fas fa-sitemap text-xs" style={{ color: 'var(--color-primary-400)' }}></i>
              {folder.name} - 思维导图
            </h3>
            <MindMapView folder={folder} onSelectFolder={onSelectFolder} />
          </div>
        )}
      </div>
    );
  };

  // ========== 时间轴视图组件（内嵌，使用当前文件夹的卡片数据） ==========
  const TimelineAxisView: React.FC<{ cards: ContentCard[] }> = ({ cards }) => {
    const events: TimelineEvent[] = cards.map((card, idx) => ({
      id: card.id,
      title: card.title,
      description: card.content || '',
      timestamp: card.tagText || `事件 ${idx + 1}`,
      order: idx,
    }));

    return <TimelineChart events={events} />;
  };

  // ========== 主渲染逻辑 ==========
  // 直接进入生成模式，文件夹模式的内容合并到"某某文件夹"标签页
  return renderGenerateMode();
};

export default BubbleFolderContent;
