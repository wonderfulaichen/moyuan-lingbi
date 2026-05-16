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
import { PromptComposer } from '../../../shared/prompts';
import AIProgressButton from '../../shared/components/AIProgressButton';
import MindMapView from './MindMapView';
import CharacterGraphView from './CharacterGraphView';

interface DeletedCard extends ContentCard {
  deletedAt: string;
  folderId: string;
  folderName: string;
  folderType: string;
}

interface DeletedFolder {
  id: string;
  name: string;
  icon: string;
  color: string;
  type: BubbleFolderType['type'];
  parentId: string;
  parentName: string;
  parentType: string;
  vfileId: string | null;
  children: BubbleFolderType[];
  contentCards?: ContentCard[];
  deletedAt: string;
}

// 回收站 key 按项目隔离，避免多项目数据混淆
const getRecycleBinKey = (projectId: string) => `recycle_bin_${projectId}`;
const getRecycleFolderKey = (projectId: string) => `recycle_folder_${projectId}`;

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
  showHistory?: boolean;
  onToggleHistory?: () => void;
}

// ========== 常量映射 ==========

const TYPE_LABELS: Record<string, string> = {
  'world': '世界观',
  'characters': '角色',
  'timeline': '时间线',
  'outline': '大纲',
  'detailed_outline': '细纲',
  'chapters': '章节',
  'custom': '自定义',
};

const TYPE_ICONS: Record<string, string> = {
  'world': 'fa-globe',
  'characters': 'fa-users',
  'timeline': 'fa-timeline',
  'outline': 'fa-sitemap',
  'detailed_outline': 'fa-list-check',
  'chapters': 'fa-book',
  'custom': 'fa-folder',
};

const FOLDER_ICON_COLORS: Record<string, string> = {
  'world': 'text-emerald-400',
  'characters': 'text-blue-400',
  'timeline': 'text-amber-400',
  'outline': 'text-violet-400',
  'detailed_outline': 'text-cyan-400',
  'chapters': 'text-pink-400',
  'custom': 'text-rose-400',
};

const FOLDER_BG_GRADIENTS: Record<string, string> = {
  'world': 'from-emerald-600/20 to-emerald-900/20',
  'characters': 'from-blue-600/20 to-blue-900/20',
  'timeline': 'from-amber-600/20 to-amber-900/20',
  'outline': 'from-violet-600/20 to-violet-900/20',
  'detailed_outline': 'from-cyan-600/20 to-cyan-900/20',
  'chapters': 'from-pink-600/20 to-pink-900/20',
  'custom': 'from-rose-600/20 to-rose-900/20',
};

function vFileToCard(vf: { id: string; name: string; content: string; metadata: { tags?: string[]; favorited?: boolean; batchId?: string | null; lastIndexedAt?: number; timeTag?: string }; createdAt: number; updatedAt: number }): ContentCard {
  return {
    id: vf.id,
    tagText: (vf.metadata.timeTag as string) || '',
    title: vf.name,
    content: vf.content || '',
    isFavorited: vf.metadata.favorited !== false,
    batchId: (vf.metadata.batchId as string) || `vf-${vf.id}`,
    createdAt: vf.createdAt,
    updatedAt: vf.updatedAt,
    lastIndexedAt: vf.metadata.lastIndexedAt,
  };
}

// ========== 图表子组件 ==========

/** 简单关系图（角色-势力关系） */
const SimpleRelationshipGraph: React.FC<{
  factions: WorldFaction[];
  characters: { id: string; name: string; factionId?: string }[];
}> = ({ factions, characters }) => {
  const nodes: { id: string; label: string; type: 'faction' | 'character'; color: string }[] = [
    ...factions.map(f => ({ id: f.id, label: f.name, type: 'faction' as const, color: 'var(--color-amber-400, #f59e0b)' })),
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
        <div className="fixed inset-0 z-[99999]" style={{ backgroundColor: 'var(--color-surface-base, rgba(0,0,0,0.55))', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }} onClick={() => setPreviewEvent(null)} />
        <div
          className="fixed z-[100000] rounded-2xl shadow-2xl flex flex-col animate-fade-in overflow-hidden"
          style={{
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 'min(680px, 85vw)',
            maxHeight: '75vh',
            backgroundColor: 'var(--color-surface-base)',
            border: '1px solid var(--color-border-default)',
            boxShadow: '0 25px 70px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.05)',
          }}
        >
          <div className="flex items-center justify-between px-5 py-3 border-b shrink-0" style={{ borderColor: 'var(--color-border-default)', background: 'var(--color-surface-hover)' }}>
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
  onDelete: () => void;
}

const CardPreviewModal: React.FC<CardPreviewModalProps> = ({ card, onClose, onEdit, onDelete }) => {
  return (
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center p-4 sm:p-6"
      onClick={onClose}
      style={{ backgroundColor: 'var(--color-surface-base, rgba(0,0,0,0.55))', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }}
    >
      <div
        className="relative w-[90vw] max-w-4xl h-[85vh] overflow-hidden rounded-2xl shadow-2xl border border-[var(--color-primary-200)] flex flex-col animate-fade-in-scale"
        style={{ backgroundColor: 'var(--color-surface-overlay, rgba(10,10,20,0.98))', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--color-primary-100)] shrink-0">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <i className="fas fa-tag text-[var(--color-primary-400)] text-xs"></i>
            <h3 className="text-sm font-bold text-[var(--color-text-primary)] truncate">{card.title}</h3>
            {card.lastIndexedAt ? (
              <span className="text-[9px] px-2 py-0.5 rounded-full shrink-0 flex items-center gap-1"
                style={{ backgroundColor: 'var(--color-p-alpha-15)', color: 'var(--color-accent-emerald)', border: '1px solid var(--color-accent-emerald)' }}
                title={`记忆体已索引 · ${new Date(card.lastIndexedAt).toLocaleTimeString('zh-CN')}`}>
                <i className="fas fa-brain text-[8px]"></i>已索引
              </span>
            ) : (
              <span className="text-[9px] px-2 py-0.5 rounded-full shrink-0 flex items-center gap-1"
                style={{ backgroundColor: 'var(--color-p-alpha-10)', color: 'var(--color-text-muted)', border: '1px dashed var(--color-border-default)' }}
                title="尚未写入记忆体">
                <i className="fas fa-brain text-[8px]"></i>待索引
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {card.content && (
              <span className="text-[10px] text-[var(--color-text-muted)] mr-1" title="字数统计">
                <i className="fas fa-font mr-0.5"></i>{card.content.length.toLocaleString()} 字
              </span>
            )}
            <button onClick={onEdit}
              className="px-4 py-2 text-xs font-medium rounded-lg transition-all hover:scale-[1.03]"
              style={{ background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-primary-600))', color: 'var(--color-text-primary)' }}
              title="编辑">
              <i className="fas fa-pen text-xs"></i>
            </button>
            <button onClick={onDelete}
              className="px-4 py-2 text-xs font-medium rounded-lg transition-all hover:scale-[1.03]"
              style={{ backgroundColor: 'rgba(220, 50, 50, 0.15)', color: 'var(--color-red-400)' }}
              title="删除">
              <i className="fas fa-trash text-xs"></i>
            </button>
            <div className="w-px h-4 bg-white/10 mx-1"></div>
            <button onClick={onClose}
              className="px-4 py-2 text-xs font-medium rounded-lg transition-all hover:scale-[1.03]"
              style={{ backgroundColor: 'var(--color-surface-hover)', color: 'var(--color-text-muted)' }}
              title="关闭">
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
                <div className="inline-block text-[10px] px-2 py-0.5 rounded-full bg-[var(--color-primary-900)]/30 text-[var(--color-primary-300)] border border-[var(--color-primary-900)]/20">
                  <i className="fas fa-tag mr-1"></i>{card.tagText}
                </div>
              )}

              {/* 主要内容 */}
              <div className="text-sm leading-relaxed text-[var(--color-text-primary)] whitespace-pre-wrap">
                {card.content}
              </div>

              {/* 元数据 */}
              <div className="pt-3 border-t border-[var(--color-primary-100)] flex items-center gap-3 text-[10px] text-[var(--color-text-tertiary)]">
                <span><i className="fas fa-font mr-0.5"></i>{card.content.length.toLocaleString()} 字</span>
                {card.createdAt && (
                  <span>创建: {new Date(card.createdAt).toLocaleDateString('zh-CN')}</span>
                )}
                {card.updatedAt && (
                  <span>更新: {new Date(card.updatedAt).toLocaleDateString('zh-CN')}</span>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-[var(--color-text-tertiary)]">
              <i className="fas fa-file-pen text-3xl mb-3 text-[var(--color-primary-500)]/30"></i>
              <p className="text-sm">暂无内容</p>
              <button onClick={onEdit} className="mt-3 px-4 py-1.5 text-xs bg-[var(--color-primary-500)]/30 hover:bg-[var(--color-primary-500)]/50 text-[var(--color-primary-200)] rounded-lg transition-all">
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
  onPermanentDelete?: (cardId: string) => void;
  isSelected?: boolean;
  isMultiSelect?: boolean;
  onToggleSelect?: (cardId: string) => void;
  onDragStart?: (e: React.DragEvent, cardId: string) => void;
  onDragOver?: (e: React.DragEvent, cardId: string) => void;
  onDrop?: (e: React.DragEvent, cardId: string) => void;
  draggable?: boolean;
  folderType?: string;
}

const ContentCardItem: React.FC<ContentCardProps> = ({
  card, onUpdate, onDelete, onPermanentDelete,
  isSelected, isMultiSelect, onToggleSelect,
  onDragStart, onDragOver, onDrop, draggable,
  folderType,
}) => {
  const [showEditor, setShowEditor] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showDeleteOptions, setShowDeleteOptions] = useState(false);
  const [previewCard, setPreviewCard] = useState<ContentCard | null>(null);

  const handleEditorSave = (title: string, content: string, tagText?: string) => {
    const updates: Partial<ContentCard> = { title, content, updatedAt: Date.now() };
    if (tagText) updates.tagText = tagText;
    onUpdate(card.id, updates);
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowDeleteOptions(true);
  };

  return (
    <>
    <div
      className={`glass-card rounded-xl overflow-hidden transition-all duration-300 cursor-pointer hover:shadow-lg ${isSelected ? 'card-selected-glow' : ''}`}
      style={{
        borderLeft: `3px solid ${card.isFavorited ? 'var(--color-primary-400)' : 'transparent'}`,
        ...(isSelected ? { borderColor: 'var(--color-primary-400)' } : {}),
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
              {isSelected && <i className="fas fa-check text-[8px]" style={{ color: 'var(--color-text-primary)' }}></i>}
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
          {card.lastIndexedAt ? (
            <span className="text-[8px] px-1.5 py-0.5 rounded-full shrink-0 flex items-center gap-0.5"
              style={{ backgroundColor: 'var(--color-emerald-50)', color: 'var(--color-emerald-400)', border: '1px solid var(--color-emerald-200)' }}
              title={`记忆体已索引 · ${new Date(card.lastIndexedAt).toLocaleTimeString('zh-CN')}`}>
              <i className="fas fa-brain text-[7px]"></i>已索引
            </span>
          ) : (
            <span className="text-[8px] px-1.5 py-0.5 rounded-full shrink-0 flex items-center gap-0.5"
              style={{ backgroundColor: 'transparent', color: 'var(--color-text-muted)', opacity: 0.5, border: '1px dashed var(--color-border-default)' }}
              title="尚未写入记忆体">
              <i className="fas fa-brain text-[7px]"></i>待索引
            </span>
          )}
        </div>
        <div className={`flex items-center gap-2 transition-opacity duration-200 ${isHovered ? 'opacity-100' : 'opacity-0'}`}>
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

    {/* 删除选项弹窗 */}
    {createPortal(showDeleteOptions && (
      <div
        className="fixed inset-0 z-[99999] flex items-center justify-center p-4"
        onClick={() => setShowDeleteOptions(false)}
        style={{ backgroundColor: 'var(--color-surface-base, rgba(0,0,0,0.6))' }}
      >
        <div
          className="relative w-full max-w-sm rounded-2xl shadow-2xl border overflow-hidden animate-fade-in-scale"
          style={{
            backgroundColor: 'var(--color-surface-overlay)',
            borderColor: 'var(--color-border-default)'
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* 头部 */}
          <div className="flex items-center gap-3 px-5 py-4 border-b" style={{ borderColor: 'var(--color-border-default)' }}>
            <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: 'var(--color-primary-100)' }}>
              <i className="fas fa-trash text-sm" style={{ color: 'var(--color-primary-400)' }}></i>
            </div>
            <div>
              <h3 className="text-sm font-bold" style={{ color: 'var(--color-text-primary)' }}>删除文件</h3>
              <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>「{card.title}」</p>
            </div>
          </div>

          {/* 选项 */}
          <div className="p-4 space-y-2">
            <button
              onClick={() => { setShowDeleteOptions(false); onDelete(card.id); }}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-left hover:scale-[1.02]"
              style={{
                backgroundColor: 'var(--color-surface-muted)',
                border: '1px solid var(--color-border-default)'
              }}
            >
              <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: 'var(--color-primary-100)' }}>
                <i className="fas fa-trash-can text-xs" style={{ color: 'var(--color-primary-400)' }}></i>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>删除到回收站</div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>文件将被移入回收站，可随时恢复</div>
              </div>
              <i className="fas fa-chevron-right text-xs" style={{ color: 'var(--color-text-muted)' }}></i>
            </button>

            <button
              onClick={() => {
                setShowDeleteOptions(false);
                if (onPermanentDelete) {
                  setShowDeleteConfirm(true);
                } else {
                  // 如果没有提供 onPermanentDelete，直接走删除流程
                  onDelete(card.id);
                }
              }}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-left hover:scale-[1.02]"
              style={{
                backgroundColor: 'var(--color-surface-muted)',
                border: '1px solid var(--color-border-default)'
              }}
            >
              <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: 'var(--color-red-50, #fef2f2)' }}>
                <i className="fas fa-fire text-xs" style={{ color: 'var(--color-red-500, #ef4444)' }}></i>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium" style={{ color: 'var(--color-red-500, #ef4444)' }}>彻底删除</div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>文件将被永久删除，不可恢复</div>
              </div>
              <i className="fas fa-chevron-right text-xs" style={{ color: 'var(--color-text-muted)' }}></i>
            </button>
          </div>

          {/* 取消按钮 */}
          <div className="px-4 pb-4">
            <button
              onClick={() => setShowDeleteOptions(false)}
              className="w-full py-2.5 rounded-xl text-xs font-medium transition-all"
              style={{
                color: 'var(--color-text-muted)',
                backgroundColor: 'var(--color-surface-hover)',
                border: '1px solid var(--color-border-default)'
              }}
            >
              取消
            </button>
          </div>
        </div>
      </div>
    ), document.body)}

    {/* 彻底删除确认弹窗 */}
    {createPortal(showDeleteConfirm && (
      <ConfirmModal
        title="彻底删除文件"
        message={`确定要彻底删除「${card.title}」吗？此操作将永久删除文件，不可恢复！`}
        variant="danger"
        confirmText="彻底删除"
        onConfirm={() => {
          setShowDeleteConfirm(false);
          if (onPermanentDelete) {
            onPermanentDelete(card.id);
          } else {
            onDelete(card.id);
          }
        }}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    ), document.body)}

    {createPortal(previewCard && (
      <>
        <div className="fixed inset-0 z-[99999]" style={{ backgroundColor: 'var(--color-surface-base, rgba(0,0,0,0.55))', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }} onClick={() => setPreviewCard(null)} />
        <div className="fixed inset-0 z-[100000] flex items-center justify-center" onClick={() => setPreviewCard(null)}>
          <div
            className="relative w-[90vw] max-w-4xl h-[85vh] border border-[var(--color-primary-200)] rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-fade-in-scale"
            style={{
              backgroundColor: 'var(--color-surface-overlay, rgba(10,10,20,0.98))',
              backdropFilter: 'blur(24px)',
              WebkitBackdropFilter: 'blur(24px)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-3 border-b border-[var(--color-primary-100)] shrink-0">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <i className="fas fa-tag text-sm" style={{ color: 'var(--color-primary-400)' }}></i>
                <span className="text-sm font-bold truncate" style={{ color: 'var(--color-text-primary)' }}>{previewCard.title}</span>
                {previewCard.tagText && previewCard.tagText !== previewCard.title && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full shrink-0" style={{ background: 'var(--color-primary-100)', color: 'var(--color-primary-300)' }}>
                    {previewCard.tagText}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={(e) => { e.stopPropagation(); setPreviewCard(null); setShowEditor(true); }}
                  className="px-4 py-2 text-xs font-medium rounded-lg transition-all hover:scale-[1.03]"
                  style={{ background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-primary-600))', color: 'var(--color-text-primary)' }}
                  title="编辑">
                  <i className="fas fa-pen text-xs" />
                </button>
                <button onClick={() => setPreviewCard(null)}
                  className="px-4 py-2 text-xs font-medium rounded-lg transition-all hover:scale-[1.03]"
                  style={{ backgroundColor: 'var(--color-surface-hover)', color: 'var(--color-text-muted)' }}>
                  <i className="fas fa-xmark text-sm" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar" style={{ minHeight: 0 }}>
              <div className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--color-text-secondary)' }}>
                {previewCard.content || <span style={{ color: 'var(--color-text-muted)' }}>暂无内容</span>}
              </div>
            </div>
            {/* 底部状态栏 */}
            {previewCard.content && (
              <div className="flex items-center justify-between px-6 py-2 border-t border-[var(--color-primary-100)] shrink-0 text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                <div className="flex items-center gap-3">
                  <span><i className="fas fa-font mr-1 text-[10px]"></i>{previewCard.content.length.toLocaleString()} 字</span>
                  <span><i className="fas fa-align-left mr-1 text-[10px]"></i>{previewCard.content.split(/\n+/).filter(Boolean).length.toLocaleString()} 段</span>
                </div>
                <span>只读</span>
              </div>
            )}
          </div>
        </div>
      </>
    ), document.body)}

    {showEditor && (
        <CardEditorModal
          card={card}
          folderType={folderType}
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
  folderType?: string;
  onClose: () => void;
  onSave: (title: string, content: string, tagText?: string) => void;
  onDelete: () => void;
}

const CardEditorModal: React.FC<CardEditorModalProps> = ({ card, folderType, onClose, onSave, onDelete }) => {
  const showTimeTag = folderType !== 'detailed_outline' && folderType !== 'outline' && folderType !== 'world';
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
      style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--color-surface-base, rgba(0,0,0,0.55))', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', animation: isClosing ? undefined : 'fadeIn 0.2s ease-out' }}
      onClick={isClosing ? undefined : handleClose}>
      <div
        className={`relative w-[90vw] max-w-4xl h-[85vh] border border-[var(--color-primary-200)] rounded-2xl shadow-2xl flex flex-col overflow-hidden ${isClosing ? '' : 'animate-fade-in-scale'}`}
        style={{ backgroundColor: 'var(--color-surface-overlay, rgba(10,10,20,0.98))', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)' }}
        onClick={(e) => e.stopPropagation()}>
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-[var(--color-primary-100)] shrink-0">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <i className="fas fa-file-lines text-sm" style={{ color: 'var(--color-primary-400)' }}></i>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="flex-1 bg-transparent text-lg font-bold focus:outline-none min-w-0"
              style={{ color: 'var(--color-text-primary)' }}
              placeholder="文件标题"
            />
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleSave}
              className="px-4 py-2 text-xs font-medium rounded-lg transition-all hover:scale-[1.03]"
              style={{ background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-primary-600))', color: 'var(--color-text-primary)' }}>
              <i className="fas fa-check mr-1"></i>保存
            </button>
            <button onClick={handleDeleteAndClose}
              className="px-4 py-2 text-xs font-medium rounded-lg transition-all hover:scale-[1.03]"
              style={{ backgroundColor: 'rgba(220, 50, 50, 0.15)', color: 'var(--color-red-400)' }}
              title="删除">
              <i className="fas fa-trash text-xs"></i>
            </button>
            <button onClick={handleClose}
              className="px-4 py-2 text-xs font-medium rounded-lg transition-all hover:scale-[1.03]"
              style={{ backgroundColor: 'var(--color-surface-hover)', color: 'var(--color-text-muted)' }}>
              <i className="fas fa-xmark text-sm"></i>
            </button>
          </div>
        </div>
        {/* 时间标签栏（仅在需要时显示） */}
        {showTimeTag && (
          <div className="flex items-center gap-2 px-6 py-2 border-b border-[var(--color-primary-100)] shrink-0" style={{ background: 'var(--color-surface-muted)' }}>
            <i className="fas fa-clock text-[10px]" style={{ color: 'var(--color-primary-300)' }}></i>
            <input
              value={tagText}
              onChange={(e) => setTagText(e.target.value)}
              className="bg-transparent text-xs focus:outline-none flex-1"
              style={{ color: 'var(--color-text-tertiary)' }}
              placeholder="小说内时间（如：太古纪元）"
              title="设置此事件在小说中的时间"
            />
          </div>
        )}
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
        {/* 底部状态栏 */}
        <div className="flex items-center justify-between px-6 py-2 border-t border-[var(--color-primary-100)] shrink-0 text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
          <div className="flex items-center gap-3">
            <span><i className="fas fa-font mr-1 text-[10px]"></i>{content.length.toLocaleString()} 字</span>
            <span><i className="fas fa-align-left mr-1 text-[10px]"></i>{content.split(/\n+/).filter(Boolean).length.toLocaleString()} 段</span>
          </div>
          <span>{content.length > 0 ? '已编辑' : '未编辑'}</span>
        </div>
      </div>
    </div>,
    document.body
  );
};

// ========== 模块级变量（跨组件挂载/卸载保持） ==========
let activeButtonTaskId: string | null = null;
let activeAbortController: AbortController | null = null;

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
  showHistory = false,
  onToggleHistory,
}) => {
  const { setStatusMessage, setComplete, setProgress, setError: setAIError, addTask, setTokenUsage, setActiveTask, status, setGenerating } = useAIStatus();
  const { showToast } = useToast();
  const [inspiration, setInspiration] = useState(folder.prompt || '');
  const VALID_TAG_COUNTS = [3, 5, 8, 10, 15, 20];
  const [tagCount, setTagCountRaw] = useState(5);
  const setTagCount = useCallback((value: number) => {
    const validValue = VALID_TAG_COUNTS.includes(value) ? value : 5;
    if (validValue !== value) {
      console.warn(`[BubbleFolderContent] Invalid tagCount: ${value}, fallback to 5`);
    }
    setTagCountRaw(validValue);
  }, []);

  // 细纲生成配置：卷数和每卷章数
  const VALID_VOLUME_COUNTS = [1, 2, 3, 5, 10];
  const VALID_CHAPTERS_PER_VOLUME = [5, 10, 15, 20, 30, 50];
  const [volumeCount, setVolumeCount] = useState(3);
  const [chaptersPerVolume, setChaptersPerVolume] = useState(10);
  // 章节生成配置：直接按章数生成
  const VALID_CHAPTER_COUNTS = [5, 10, 15, 20, 30, 50, 80, 100];
  const [chapterCount, setChapterCount] = useState(10);
  const [localIsGenerating, setLocalIsGenerating] = useState(false);
  // 仅使用本地状态控制按钮，完全绕过全局 context/store，防止全局状态卡死按钮
  const isGenerating = localIsGenerating;
  const [generatingProgress, setGeneratingProgress] = useState(0);
  const [newSubFolderName, setNewSubFolderName] = useState('');
  const [showSubFolderInput, setShowSubFolderInput] = useState(false);
  const [showNewMenu, setShowNewMenu] = useState(false);
  const newMenuRef = useRef<HTMLDivElement>(null);
  const [folderView, setFolderView] = useState<'grid' | 'tree' | 'graph'>('grid');
  const [activeView, setActiveView] = useState<'generate' | 'cards'>('generate');
  const [hasNewContent, setHasNewContent] = useState(false);
  const [contentView, setContentView] = useState<'grid' | 'timeline'>('grid');
  const [cardSearchText, setCardSearchText] = useState('');
  const [selectedCardIds, setSelectedCardIds] = useState<Set<string>>(new Set());
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  const [dragCardId, setDragCardId] = useState<string | null>(null);
  const [deletedCards, setDeletedCards] = useState<DeletedCard[]>(() => {
    try {
      const saved = localStorage.getItem(getRecycleBinKey(project.id));
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [deletedFolders, setDeletedFolders] = useState<DeletedFolder[]>(() => {
    try {
      const saved = localStorage.getItem(getRecycleFolderKey(project.id));
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [showClearRecycleConfirm, setShowClearRecycleConfirm] = useState(false);
  const [showPermanentDeleteConfirm, setShowPermanentDeleteConfirm] = useState<string | null>(null);
  const [contextMenuFolder, setContextMenuFolder] = useState<BubbleFolderType | null>(null);
  const [contextMenuPos, setContextMenuPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [showDeleteFolderConfirm, setShowDeleteFolderConfirm] = useState(false);
  const [deletingFolderId, setDeletingFolderId] = useState<string | null>(null);
  const [showFolderDeleteOptions, setShowFolderDeleteOptions] = useState(false);
  const [recycleFilter, setRecycleFilter] = useState<'all' | 'file' | 'folder'>('all');
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dsVersion, setDsVersion] = useState(0);

  // 辅助函数：在文件夹树中查找指定 ID 的文件夹
  const findFolderInList = useCallback((folderList: BubbleFolderType[], folderId: string): BubbleFolderType | undefined => {
    for (const f of folderList) {
      if (f.id === folderId) return f;
      if (f.children) {
        const found = findFolderInList(f.children, folderId);
        if (found) return found;
      }
    }
    return undefined;
  }, []);

  useEffect(() => {
    return dataService.subscribe(() => setDsVersion(v => v + 1));
  }, []);

  useEffect(() => {
    localStorage.setItem(getRecycleBinKey(project.id), JSON.stringify(deletedCards));
  }, [deletedCards, project.id]);

  useEffect(() => {
    localStorage.setItem(getRecycleFolderKey(project.id), JSON.stringify(deletedFolders));
  }, [deletedFolders, project.id]);

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
      // 过滤掉子文件夹节点（type='folder'），只保留文件节点
      const fileVFiles = vfiles.filter(vf => vf.type === 'file');
      if (fileVFiles.length > 0) return fileVFiles.map(vFileToCard);
    }
    return folder.contentCards || [];
  }, [folder.vfileId, folder.contentCards, dsVersion]);
  const [generatingCardTitle, setGeneratingCardTitle] = useState<string | null>(null);
  const [generatingLabel, setGeneratingLabel] = useState('生成中...');
  const handleGenerateTags = async () => {
    console.log('>>> handleGenerateTags called!', { activeModel, modelName: activeModel?.modelName, hasSetLocal: true });
    // 立即设置本地状态，确保UI有反馈
    setLocalIsGenerating(true);
    setGeneratingProgress(5);
    
    if (!activeModel || !activeModel.modelName) {
      console.log('>>> No active model, showing toast');
      showToast('请先在设置中配置AI模型', 'warning');
      onOpenSettings();
      setLocalIsGenerating(false);
      setGeneratingProgress(0);
      return;
    }
    
    setProgress(5);
    const taskId = `task_${Date.now()}`;
    const abortController = new AbortController();
    activeButtonTaskId = taskId;
    activeAbortController = abortController;
    setGenerating(activeModel.modelName, '正在生成...', 'generate-cards');
    setActiveTask(taskId);

    addTask({ id: taskId, type: 'generate-cards', modelName: activeModel.modelName, status: 'running', statusMessage: '正在生成...', progress: 5, tokenUsage: null, error: null });

    const isSingleFileFolder = folder.type === 'world' || folder.type === 'outline' || folder.type === 'detailed_outline';
    const schemeContext = selectedScheme ? `\n已选创作方案：「${selectedScheme.title}」(${selectedScheme.genre})` : '';
    const userContext = inspiration.trim() ? `\n用户灵感：${inspiration}` : '';

    try {
      if (isSingleFileFolder) {
        await handleGenerateSingleText(taskId, schemeContext, userContext, abortController);
      } else {
        await handleGenerateMultipleFiles(taskId, schemeContext, userContext, abortController);
      }
      setGeneratingProgress(100);
      setProgress(100);
      setHasNewContent(true);
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        setAIError(err.message);
      }
      setGeneratingProgress(0);
      setProgress(0);
    } finally {
      activeButtonTaskId = null;
      activeAbortController = null;
      setGeneratingCardTitle(null);
      setGeneratingLabel('生成中...');
      setComplete();
      setLocalIsGenerating(false);
    }
  };

  const handleTimelineGenerate = useCallback(async () => {
    await handleGenerateTags();
  }, [handleGenerateTags]);

  const handleGenerateSingleText = useCallback(async (taskId: string, schemeCtx: string, userCtx: string, abortController: AbortController) => {
    setStatusMessage(`正在撰写完整的${folder.name}...`);

    const taskIdMap: Record<string, 'world-build' | 'char-overview' | 'timeline-frame' | 'outline-gen' | 'outline-detailed' | 'chapter-split'> = {
      world: 'world-build',
      characters: 'char-overview',
      timeline: 'timeline-frame',
      outline: 'outline-gen',
      detailed_outline: 'outline-detailed',
      chapters: 'chapter-split',
    };
    const taskKey = taskIdMap[folder.type] || 'world-build';
    let prompt = PromptComposer.composeForButton({
      taskId: taskKey,
      agentId: folder.type === 'characters' ? 'agent-character' : folder.type === 'world' ? 'agent-worldbuilder' : undefined,
      formatId: folder.type === 'characters' ? 'character-card' : undefined,
    }) + `${schemeCtx}${userCtx}`;

    // 细纲/章节：在提示词中加入结构要求
    if (folder.type === 'detailed_outline') {
      prompt += `\n\n**结构要求**：请生成${volumeCount}卷细纲，每卷约${chaptersPerVolume}章。使用"第X卷"和"第Y章"的格式组织内容。`;
    } else if (folder.type === 'chapters') {
      prompt += `\n\n**结构要求**：请生成${chapterCount}章正文内容。使用"第Y章"的格式组织内容，不需要分卷。`;
    }
    let fullContent = '';
    let round = 0;
    const maxRounds = 3;

    while (round < maxRounds) {
      if (abortController.signal.aborted) {
        throw new Error('AbortError');
      }
      round++;
      const label = round === 1 ? `生成中...` : `生成中... (续写${round - 1})`;
      setGeneratingLabel(label);
      setStatusMessage(round === 1 ? `正在撰写完整的${folder.name}设定（第1段）...` : `正在续写${folder.name}设定（第${round}段）...`);
      setGeneratingProgress(Math.min(30 + (round - 1) * 25, 95));
      setProgress(Math.min(30 + (round - 1) * 25, 95));

      const currentPrompt = round === 1
        ? prompt
        : `${prompt}\n\n--- 已生成内容（请直接接着写，不要重复，不要加任何前缀标题） ---\n\n${fullContent.slice(-800)}\n\n请继续撰写上述内容的后续部分。注意保持文风一致、逻辑连贯。`;

      const result = await aiService.generateWithContext({
        model: activeModel!,
        prompt: currentPrompt,
        maxTokens: round === 1 ? 4000 : 3000,
        signal: abortController.signal,
      }, undefined, `${taskId}-r${round}`);

      if (result.error) { 
        setAIError(result.error); 
        setComplete();
        return; 
      }
      if (!result.content) break;

      fullContent += (round > 1 && !fullContent.endsWith('\n') ? '\n' : '') + result.content;
      if (result.tokens) setTokenUsage(result.tokens);

      if (result.finishReason !== 'length') break;
    }

    if (fullContent) {
      fullContent = fullContent
        .replace(/\n*[>＞]\s*⚠?\s*一致性检查[^\n]*\n*/g, '')
        .replace(/\n*[>＞]\s*✓?\s*(通过|未发现|检查完成)[^\n]*\n*/g, '')
        .replace(/\n*【一致性检查】[\s\S]*$/g, '')
        .replace(/\n*>\s*⚠\s*一致性[^\n]*\n*/g, '')
        .trim();

      // 细纲类型：按卷拆分创建文件
      if (folder.type === 'detailed_outline') {
        const volumeRegex = /^(\s*#*\s*)第\s*([0-9一二三四五六七八九十百]+)\s*卷[:：]?\s*(.+)/i;
        const lines = fullContent.split('\n');
        const volumes: { name: string; content: string }[] = [];
        let currentVolumeName: string | null = null;
        let currentLines: string[] = [];
        const flushVolume = () => {
          if (currentVolumeName && currentLines.length > 0) {
            volumes.push({ name: currentVolumeName, content: currentLines.join('\n').trim() });
          }
        };
        for (const line of lines) {
          const match = line.match(volumeRegex);
          if (match) {
            flushVolume();
            const volNum = match[2];
            const volTitle = match[3].trim().replace(/[#*]/g, '').trim();
            currentVolumeName = `第${volNum}卷${volTitle ? ' · ' + volTitle : ''}`;
            currentLines = [line];
            continue;
          }
          if (currentVolumeName) {
            currentLines.push(line);
          }
        }
        flushVolume();
        // 如果没解析到卷，整体作为一份文件
        if (volumes.length === 0) {
          volumes.push({ name: '细纲', content: fullContent.trim() });
        }
        for (const vol of volumes) {
          dataService.createFile(folder.vfileId || null, {
            name: vol.name,
            type: 'file',
            content: vol.content,
            metadata: { favorited: true, aiGenerated: true },
          });
        }
      } else {
        const fileNameMap: Record<string, string> = {
          world: '世界观文档',
          outline: '大纲文档',
          chapters: '章节',
        };
        dataService.createFile(folder.vfileId || null, {
          name: fileNameMap[folder.type] || folder.name,
          type: 'file',
          content: fullContent.trim(),
          metadata: { favorited: true, aiGenerated: true },
        });
      }
    }
    setGeneratingProgress(100);
    setProgress(100);
    onUpdateFolder(folder.id, { prompt: inspiration });
  }, [activeModel, folder, inspiration, selectedScheme, volumeCount, chaptersPerVolume, chapterCount, onUpdateFolder, setStatusMessage, setProgress, setAIError, setTokenUsage]);

  const handleGenerateMultipleFiles = useCallback(async (taskId: string, schemeCtx: string, userCtx: string, abortController: AbortController) => {
    setStatusMessage('正在生成标题列表...');

    const titlePromptChars = PromptComposer.resolveTaskPrompt('char-overview', { tagCount: String(tagCount) })?.split('\n')[0]
      ? `你是一位资深的人物设计师。用户正在构建小说的角色体系，需要生成${tagCount}个核心角色的名字。${schemeCtx}${userCtx}

**要求：**
- 每个名字是一个完整的角色姓名（如"林墨渊"、"苏清歌"），不是抽象词
- 包含主角1-2人、重要配角2-3人、关键反派1-2人
- 名字要有文学感，符合小说风格
- 角色之间要有关系张力（如师徒、宿敌、青梅竹马等暗示）

请直接输出姓名，每行一个，不要编号、不要前缀。`
      : '';

    const titlePromptTimeline = `你是一位擅长叙事的时间线规划师。用户正在构建小说的时间线，需要生成${tagCount}个关键时间节点。${schemeCtx}${userCtx}

**输出格式（每行一个，严格按此格式）：**
时间标记 | 事件名称

**要求：**
- "时间标记"是事件在小说中的具体时间点（如"大婚三日后"、"楚离归宗后三个月"、"太古纪元"、"灵力觉醒当日"）
- "事件名称"是节点的名称（如"问心路·剑心独行"、"花都之变"、"决战苍穹"）
- 按时间先后顺序排列
- 节点要有叙事节奏感（铺垫→冲突→转折→高潮）
- 长篇小说时间跨度大，时间标记要具体、有层次感（不要全是"某日"）

**示例：**
大婚三日后 | 问心路·剑心独行
楚离归宗后三个月 | 药峰试炼·暗流涌动

请直接输出，每行一个，不要编号、不要额外解释。`;

    const defaultTitlePrompt = `你是一位经验丰富的小说世界设定规划师。用户正在构建小说的"${folder.name}"子内容，需要生成多个具体的设定项。${schemeCtx}${userCtx}

请按照以下步骤进行：
1. 先理解"${folder.name}"下应该包含哪些具体的子项
2. 将这些子项精炼为${tagCount}个精准的标题

**要求：**
- 每个标题是一个精准的词语或短语（2-8个字），代表一个可以独立展开的设定方向
- 标题之间要有清晰的区分度，不要重复或高度相似
- 标题应具有创作拓展性

请直接输出标题，每行一个，不要编号、不要前缀、不要额外解释。`;

    const titlePrompts: Record<string, string> = {
      characters: titlePromptChars,
      timeline: titlePromptTimeline,
    };

    const contentFnChars = (cardTitle: string) => PromptComposer.composeForButton({
      taskId: 'char-single',
      agentId: 'agent-character',
      formatId: 'character-card',
      templateVars: { cardTitle, schemeCtx, userCtx },
    });

    const contentFnTimeline = (cardTitle: string) => PromptComposer.composeForButton({
      taskId: 'timeline-event',
      formatId: 'timeline-event',
      templateVars: { cardTitle, schemeCtx, userCtx },
    });

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

    const contentPrompts: Record<string, (cardTitle: string) => string> = {
      characters: contentFnChars,
      timeline: contentFnTimeline,
    };

    const titlePrompt = titlePrompts[folder.type] || defaultTitlePrompt;
    const contentFn = contentPrompts[folder.type] || defaultContentFn;

    if (abortController.signal.aborted) {
      throw new Error('AbortError');
    }
    const titleResult = await aiService.generateWithContext({
      model: activeModel!,
      prompt: titlePrompt,
      maxTokens: 500,
      signal: abortController.signal,
    }, undefined, `${taskId}-title`);

    if (titleResult.error) { 
      setAIError(titleResult.error); 
      setComplete();
      return; 
    }

    // 解析标题行：时间标记 | 事件名称
    const titleLines = titleResult.content
      .split('\n')
      .map(t => t.replace(/^[\d\.\-\*\s]+/, '').trim())
      .filter(t => t.length > 0 && t.length < 80);

    if (titleLines.length === 0) {
      setAIError('未能生成有效标题，请重试');
      setComplete();
      return;
    }
    if (titleResult.tokens) setTokenUsage(titleResult.tokens);

    // 时间线类型：解析 "时间标记 | 事件名称" 格式
    const isTimelineFolder = folder.type === 'timeline';
    const parsedTitles: { timeTag: string; eventName: string }[] = titleLines.map(line => {
      if (isTimelineFolder) {
        const parts = line.split('|').map(p => p.trim());
        if (parts.length >= 2) {
          return { timeTag: parts[0], eventName: parts.slice(1).join(' | ') };
        }
      }
      return { timeTag: '', eventName: line };
    });

    const batchId = `batch-${Date.now()}`;
    const parentVfId = folder.vfileId || null;
    const initialCardIds: string[] = [];
    for (const item of parsedTitles) {
      const vf = dataService.createFile(parentVfId, {
        name: item.eventName,
        type: 'file',
        content: '',
        metadata: { favorited: true, batchId, aiGenerated: true, timeTag: item.timeTag },
      });
      initialCardIds.push(vf.id);
    }
    onUpdateFolder(folder.id, { prompt: inspiration });

    for (let i = 0; i < parsedTitles.length; i++) {
      if (abortController.signal.aborted) {
        throw new Error('AbortError');
      }
      const { timeTag: initialTimeTag, eventName: cardTitle } = parsedTitles[i];
      const cardId = initialCardIds[i];
      setGeneratingCardTitle(cardTitle);
      setGeneratingLabel(`生成中... ${i + 1}/${parsedTitles.length}`);
      setStatusMessage(`正在生成「${cardTitle}」的内容...`);
      setProgress(Math.round(10 + (i / parsedTitles.length) * 80));

      try {
        let cardContent = '';
        let round = 0;
        const maxRounds = 3;

        while (round < maxRounds) {
          if (abortController.signal.aborted) {
            throw new Error('AbortError');
          }
          round++;
          if (round > 1) {
            setStatusMessage(`正在续写「${cardTitle}」（第${round}段）...`);
            setGeneratingLabel(`生成中... ${i + 1}/${parsedTitles.length} (续写)`);
          }

          const contentResult = await aiService.generateWithContext({
            model: activeModel!,
            prompt: round === 1
              ? contentFn(cardTitle)
              : `${contentFn(cardTitle)}\n\n--- 已生成内容（请直接接着写，不要重复，不要加任何前缀标题） ---\n\n${cardContent.slice(-500)}\n\n请继续撰写上述内容的后续部分。注意保持文风一致、逻辑连贯。`,
            maxTokens: 2000,
            systemPrompt: folder.type === 'characters' ? PromptComposer.resolveAgentSystemPrompt('agent-character') : undefined,
            signal: abortController.signal,
          }, (stream) => {
            if (stream.content) {
              cardContent = stream.content;
              try {
                dataService.updateFile(cardId, { content: cardContent });
              } catch (saveErr) {
                console.error(`保存卡片 "${cardTitle}" 内容失败:`, saveErr);
              }
            }
          }, `${taskId}-content-${cardId}-r${round}`);

          if (contentResult.error || !contentResult.content) break;

          cardContent = contentResult.content;
          if (contentResult.tokens) setTokenUsage(contentResult.tokens);

          if (contentResult.finishReason !== 'length') break;
        }

        if (cardContent) {
          // 提取 **【时间标记】** 后面的时间
          let finalTimeTag = initialTimeTag;
          const timeMatch = cardContent.match(/\*\*【时间标记】\*\*\s*(.+)/);
          if (timeMatch) {
            finalTimeTag = timeMatch[1].trim();
          }
          try {
            dataService.updateFile(cardId, {
              content: cardContent,
              metadata: { timeTag: finalTimeTag },
            });
          } catch (saveErr) {
            console.error(`最终保存卡片 "${cardTitle}" 失败:`, saveErr);
          }
        }
      } catch (err) {
        console.error(`生成卡片 "${cardTitle}" 失败:`, err);
        setAIError(err instanceof Error ? err.message : '生成失败');
      }

    }
  }, [activeModel, folder, inspiration, selectedScheme, tagCount, onUpdateFolder, setStatusMessage, setProgress, setAIError, setTokenUsage]);

  // ========== 手动创建空卡片 ==========
  const handleManualCreateCard = useCallback(() => {
    const title = inspiration.trim() || `新文件_${Date.now()}`;
    if (folder.vfileId) {
      dataService.createFile(folder.vfileId, {
        name: title,
        type: 'file',
        content: '',
        metadata: { favorited: true, batchId: `batch-${Date.now()}` },
      });
    } else {
      // 兼容旧数据：使用 contentCards
      const newCard: ContentCard = {
        id: `card-${Date.now()}`,
        title,
        content: '',
        tagText: '',
        isFavorited: true,
        batchId: `batch-${Date.now()}`,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      onUpdateFolder(folder.id, {
        contentCards: [...(folder.contentCards || []), newCard]
      });
    }
  }, [folder, inspiration, onUpdateFolder]);

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
    if (folder.vfileId) {
      dataService.createFile(folder.vfileId, {
        name: text.trim(),
        type: 'file',
        content: '',
        metadata: { favorited: false, batchId: `batch-${Date.now()}` },
      });
    } else {
      // 兼容旧数据：使用 contentCards
      const newCard: ContentCard = {
        id: `card-${Date.now()}`,
        title: text.trim(),
        content: '',
        tagText: text.trim(),
        isFavorited: false,
        batchId: `batch-${Date.now()}`,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      onUpdateFolder(folder.id, {
        contentCards: [...(folder.contentCards || []), newCard]
      });
    }
    onUpdateFolder(folder.id, {
      generatedTags: [...(folder.generatedTags || []), newTag],
    });
  }, [folder, onUpdateFolder]);

  // ========== 内容卡片操作 ==========
  const handleUpdateCard = useCallback((cardId: string, updates: Partial<ContentCard>) => {
    // 优先使用 VFile 系统
    const vf = dataService.getFile(cardId);
    if (vf) {
      if ('content' in updates) {
        dataService.updateFile(cardId, { content: updates.content || '' });
      }
      if ('title' in updates) {
        dataService.updateFile(cardId, { name: updates.title || '' });
      }
      if ('isFavorited' in updates) {
        dataService.updateFile(cardId, { metadata: { ...vf.metadata, favorited: updates.isFavorited } });
      }
    } else if (folder.contentCards) {
      // 兼容旧数据：回退到 contentCards
      const updatedCards = folder.contentCards.map(c =>
        c.id === cardId ? { ...c, ...updates, updatedAt: Date.now() } : c
      );
      onUpdateFolder(folder.id, { contentCards: updatedCards });
    }
  }, [folder.id, folder.contentCards, onUpdateFolder]);

  const handleDeleteCard = useCallback((cardId: string) => {
    // 优先从 VFile 系统获取
    const vf = dataService.getFile(cardId);
    if (vf) {
      const card: DeletedCard = {
        id: vf.id,
        title: vf.name,
        content: vf.content || '',
        tagText: '',
        folderId: folder.id,
        folderName: folder.name,
        folderType: folder.type,
        createdAt: typeof vf.createdAt === 'number' ? vf.createdAt : Date.now(),
        updatedAt: Date.now(),
        order: 0,
        deletedAt: new Date().toISOString()
      };
      setDeletedCards(prev => [...prev, card]);
      dataService.deleteFile(cardId);
      return;
    }

    // 兼容旧数据：从 contentCards 中删除
    if (folder.contentCards) {
      const card = folder.contentCards.find(c => c.id === cardId);
      if (card) {
        const deletedCard: DeletedCard = {
          ...card,
          folderId: folder.id,
          folderName: folder.name,
          folderType: folder.type,
          deletedAt: new Date().toISOString()
        };
        setDeletedCards(prev => [...prev, deletedCard]);
        const updatedCards = folder.contentCards.filter(c => c.id !== cardId);
        onUpdateFolder(folder.id, { contentCards: updatedCards });
      }
    }
  }, [folder.id, folder.name, folder.type, folder.contentCards, onUpdateFolder]);

  const handlePermanentDeleteCard = useCallback((cardId: string) => {
    // 直接从 VFile 系统删除，不进入回收站
    const vf = dataService.getFile(cardId);
    if (vf) {
      dataService.deleteFile(cardId);
      return;
    }

    // 兼容旧数据：从 contentCards 中直接删除
    if (folder.contentCards) {
      const updatedCards = folder.contentCards.filter(c => c.id !== cardId);
      onUpdateFolder(folder.id, { contentCards: updatedCards });
    }
  }, [folder.id, folder.contentCards, onUpdateFolder]);

  const handleBatchDeleteCards = useCallback(() => {
    if (selectedCardIds.size === 0) return;

    const newDeletedCards: DeletedCard[] = [];
    const remainingCardIds = new Set(selectedCardIds);

    selectedCardIds.forEach(id => {
      try {
        const vf = dataService.getFile(id);
        if (vf) {
          newDeletedCards.push({
            id: vf.id,
            title: vf.name,
            content: vf.content || '',
            tagText: '',
            folderId: folder.id,
            createdAt: typeof vf.createdAt === 'number' ? vf.createdAt : Date.now(),
            updatedAt: Date.now(),
            order: 0,
            deletedAt: new Date().toISOString()
          });
          dataService.deleteFile(id);
          remainingCardIds.delete(id);
        }
      } catch {}
    });

    // 兼容旧数据：处理 contentCards 中的卡片
    if (folder.contentCards && remainingCardIds.size > 0) {
      const remainingCards = folder.contentCards.filter(c => {
        if (remainingCardIds.has(c.id)) {
          newDeletedCards.push({
            ...c,
            folderId: folder.id,
            deletedAt: new Date().toISOString()
          });
          return false;
        }
        return true;
      });
      onUpdateFolder(folder.id, { contentCards: remainingCards });
    }

    setDeletedCards(prev => [...prev, ...newDeletedCards]);
    setSelectedCardIds(new Set());
    setIsMultiSelectMode(false);
  }, [selectedCardIds, folder.id, folder.contentCards, onUpdateFolder]);

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
      // 子文件夹继承父文件夹的类型，保持类型一致性
      onCreateSubFolder(folder.id, newSubFolderName.trim(), folder.type);
    }
    setNewSubFolderName('');
    setShowSubFolderInput(false);
  }, [newSubFolderName, folder, onCreateSubFolder]);

  const handleRenameSubFolder = useCallback(() => {
    if (!renamingFolderId || !renameValue.trim()) return;
    const targetChild = (folder.children || []).find(c => c.id === renamingFolderId);
    if (!targetChild) return;
    const updatedChildren = (folder.children || []).map(c =>
      c.id === renamingFolderId ? { ...c, name: renameValue.trim() } : c
    );
    onUpdateFolder(folder.id, { children: updatedChildren });
    if (targetChild.vfileId) {
      dataService.updateFile(targetChild.vfileId, { name: renameValue.trim() });
    }
    setRenamingFolderId(null);
    setRenameValue('');
  }, [renamingFolderId, renameValue, folder, onUpdateFolder]);

  const handleDeleteSubFolder = useCallback(() => {
    if (!deletingFolderId) return;
    const targetChild = (folder.children || []).find(c => c.id === deletingFolderId);
    if (!targetChild) return;
    const updatedChildren = (folder.children || []).filter(c => c.id !== deletingFolderId);
    onUpdateFolder(folder.id, { children: updatedChildren });

    // 将子文件夹放入回收站
    const deletedFolder: DeletedFolder = {
      id: targetChild.id,
      name: targetChild.name,
      icon: targetChild.icon || 'fa-folder',
      color: targetChild.color || 'custom',
      type: targetChild.type,
      parentId: folder.id,
      parentName: folder.name,
      parentType: folder.type,
      vfileId: targetChild.vfileId || null,
      children: targetChild.children || [],
      contentCards: targetChild.contentCards,
      deletedAt: new Date().toISOString(),
    };
    setDeletedFolders(prev => [...prev, deletedFolder]);

    if (targetChild.vfileId) {
      dataService.deleteFile(targetChild.vfileId);
    }
    setShowDeleteFolderConfirm(false);
    setDeletingFolderId(null);
  }, [deletingFolderId, folder, onUpdateFolder, setDeletedFolders]);

  const handleSubFolderContextMenu = useCallback((e: React.MouseEvent, child: BubbleFolderType) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenuFolder(child);
    setContextMenuPos({ x: e.clientX, y: e.clientY });
  }, []);

  const handleSubFolderLongPress = useCallback((child: BubbleFolderType) => {
    setContextMenuFolder(child);
    const rect = (document.activeElement as HTMLElement)?.getBoundingClientRect();
    setContextMenuPos({ x: rect ? rect.left + rect.width / 2 : window.innerWidth / 2, y: rect ? rect.top : window.innerHeight / 3 });
  }, []);

  const [longPressFolderId, setLongPressFolderId] = useState<string | null>(null);

  const startLongPress = useCallback((e: React.TouchEvent, child: BubbleFolderType) => {
    setLongPressFolderId(child.id);
    longPressTimerRef.current = setTimeout(() => {
      setLongPressFolderId(null);
      handleSubFolderLongPress(child);
    }, 500);
  }, [handleSubFolderLongPress]);

  const endLongPress = useCallback(() => {
    setLongPressFolderId(null);
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!renamingFolderId) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setRenamingFolderId(null); setRenameValue(''); }
    };
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest(`#rename-input-${renamingFolderId}`)) return;
      if (renameValue.trim()) handleRenameSubFolder();
      else { setRenamingFolderId(null); setRenameValue(''); }
    };
    document.addEventListener('keydown', handleKeyDown);
    let clickHandlerAttached = false;
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
      clickHandlerAttached = true;
    }, 50);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (clickHandlerAttached) {
        document.removeEventListener('mousedown', handleClickOutside);
      }
      clearTimeout(timer);
    };
  }, [renamingFolderId, renameValue, handleRenameSubFolder]);

  // 点击外部关闭新建菜单
  useEffect(() => {
    if (!showNewMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (newMenuRef.current && !newMenuRef.current.contains(e.target as Node)) {
        setShowNewMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showNewMenu]);

  // ========== 中止生成 ==========
  const handleAbort = useCallback(() => {
    if (activeAbortController) {
      activeAbortController.abort();
      activeAbortController = null;
    }
    aiService.abortAll();
    activeButtonTaskId = null;
    setGeneratingProgress(0);
    setProgress(0);
    setComplete();
    setLocalIsGenerating(false);
  }, [setComplete, setProgress, setLocalIsGenerating]);

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
            {/* 回收站按钮 - 常驻 */}
            {onToggleHistory && (
              <button
                onClick={() => {
                  if (!showHistory) {
                    setActiveView('cards');
                  }
                  onToggleHistory();
                }}
                className="px-3 py-1.5 rounded-lg text-xs transition-all flex items-center gap-1.5"
                style={{
                  backgroundColor: showHistory ? 'var(--color-primary-100)' : undefined,
                  color: showHistory ? 'var(--color-primary-300)' : 'var(--color-text-tertiary)',
                  border: `1px solid ${showHistory ? 'var(--color-primary-200)' : 'var(--color-border-default)'}`
                }}
              >
                <i className="fas fa-history" />
                回收站
              </button>
            )}
            {/* 视图切换标签 */}
            {[
              { id: 'generate' as const, label: 'AI生成', icon: 'fa-wand-magic-sparkles' },
              { id: 'cards' as const, label: `${folder.name}(${favoriteCards.length})`, icon: 'fa-folder-open' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveView(tab.id);
                  if (tab.id === 'cards') setHasNewContent(false);
                  if (showHistory) onToggleHistory?.();
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200`}
                style={activeView === tab.id ? {
                  background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-primary-600))',
                  color: 'var(--color-text-inverse)',
                } : { color: 'var(--color-text-muted)' }}
              >
                <i className={`fas ${tab.icon} text-[10px]`}></i>
                {tab.label}
                {hasNewContent && tab.id === 'cards' && (
                  <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--color-primary-400)' }}></span>
                )}
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
        {/* 合并：使用信息 + AI生成内容 */}
        <div className="glass-card rounded-2xl p-4">
          {/* 头部信息栏：方案 + 导入 */}
          <div className="flex flex-wrap items-center gap-2 mb-3">
            {/* 关联灵感方案 */}
            {selectedScheme ? (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px]" style={{ background: 'var(--color-surface-hover)' }}>
                <i className="fas fa-lightbulb" style={{ color: 'var(--color-primary-400)' }}></i>
                <span className="font-medium" style={{ color: 'var(--color-primary-300)' }}>{selectedScheme.title}</span>
                <span className="px-1.5 py-0.5 rounded-full" style={{ background: 'var(--color-primary-500)', color: 'var(--color-primary-50)' }}>
                  {selectedScheme.genre}
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px]" style={{ background: 'var(--color-surface-hover)' }}>
                <i className="fas fa-circle-exclamation text-amber-400"></i>
                <span style={{ color: 'var(--color-text-tertiary)' }}>
                  {project.novelSchemes.length > 0 ? '请在灵感萌发中选择方案' : '尚未创建灵感方案'}
                </span>
              </div>
            )}
            {/* 导入文件 */}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] transition-all"
              style={{ border: '1px dashed var(--color-border-default)', color: 'var(--color-text-secondary)' }}
            >
              <i className="fas fa-file-import" style={{ color: 'var(--color-primary-400)' }}></i>
              导入文件
            </button>
            <input ref={fileInputRef} type="file" multiple accept=".txt,.md,.json,.csv" onChange={handleFileImport} className="hidden" />
            {knowledgeItems.length > 0 && (
              <span className="text-[9px]" style={{ color: 'var(--color-text-muted)' }}>
                已导入 {knowledgeItems.length} 个文件
              </span>
            )}
          </div>

          {/* AI生成内容 */}
          <h3 className="text-xs font-bold mb-3 flex items-center gap-2" style={{ color: 'var(--color-text-secondary)' }}>
            <i className="fas fa-wand-magic-sparkles text-[10px]" style={{ color: 'var(--color-primary-400)' }}></i>
            AI 生成内容
          </h3>
          {(() => {
            const isSingleFile = folder.type === 'world' || folder.type === 'outline' || folder.type === 'detailed_outline' || folder.type === 'chapters';
            const buttonLabels: Record<string, string> = {
              world: '生成世界观文档',
              outline: '生成大纲文档',
              detailed_outline: '生成细纲',
              chapters: '生成章节',
            };
            const placeholders: Record<string, string> = {
              world: '选填：输入世界观灵感描述（如世界类型、核心设定、风格方向等），留空则根据创作方案自动生成完整的世界观文档',
              outline: '选填：输入大纲灵感描述（如故事主线、核心冲突、情节走向等），留空则根据创作方案自动生成完整的大纲文档',
              detailed_outline: '选填：输入细纲灵感描述（如章节安排、情节详略、节奏控制等），留空则根据创作方案自动生成细纲',
              chapters: '选填：输入章节灵感描述（如开篇风格、叙事视角、章节节奏等），留空则根据创作方案自动生成章节',
              characters: '选填：输入灵感描述，留空则根据选定的创作方案+文件夹名自动生成角色卡片',
              timeline: '选填：输入灵感描述，留空则根据选定的创作方案+文件夹名自动生成时间线节点',
            };
            const hints: Record<string, string> = {
              world: '将生成 1 份完整的世界观文档（800-1500字，含地理/势力/规则/历史）',
              outline: '将生成 1 份完整的大纲文档（800-1500字，含主线/支线/高潮/结局）',
              detailed_outline: `将生成 ${volumeCount} 卷细纲，每卷约 ${chaptersPerVolume} 章`,
              chapters: `将生成 ${chapterCount} 章正文内容`,
              characters: `将生成 ${tagCount} 个角色卡片`,
              timeline: `将生成 ${tagCount} 个时间线节点`,
            };

            return (
              <div className="flex flex-col gap-3">
                <textarea
                  value={inspiration}
                  onChange={(e) => setInspiration(e.target.value)}
                  placeholder={placeholders[folder.type] || placeholders.world}
                  className="w-full neumorphic-input rounded-xl px-4 py-3 text-sm h-28 resize-none focus:outline-none transition-all"
                  style={{ color: 'var(--color-text-primary)' }}
                />
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                      {hints[folder.type] || hints.world}
                    </span>
                    {!isSingleFile && tagCount >= 15 && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-900/20 text-amber-400" title="生成大量内容可能消耗较多token">
                        <i className="fas fa-triangle-exclamation mr-0.5"></i>大量
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {/* 细纲：卷数和每卷章数选择器 */}
                    {folder.type === 'detailed_outline' && (
                      <>
                        <div className="flex items-center gap-1">
                          <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>卷数</span>
                          <select
                            value={volumeCount}
                            onChange={(e) => setVolumeCount(Number(e.target.value))}
                            className="neumorphic-input rounded-lg px-2 py-1.5 text-xs appearance-none cursor-pointer"
                            style={{ color: 'var(--color-text-secondary)' }}
                          >
                            {VALID_VOLUME_COUNTS.map(n => (
                              <option key={n} value={n}>{n}</option>
                            ))}
                          </select>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>每卷章数</span>
                          <select
                            value={chaptersPerVolume}
                            onChange={(e) => setChaptersPerVolume(Number(e.target.value))}
                            className="neumorphic-input rounded-lg px-2 py-1.5 text-xs appearance-none cursor-pointer"
                            style={{ color: 'var(--color-text-secondary)' }}
                          >
                            {VALID_CHAPTERS_PER_VOLUME.map(n => (
                              <option key={n} value={n}>{n}</option>
                            ))}
                          </select>
                        </div>
                      </>
                    )}
                    {/* 章节：直接按章数选择 */}
                    {folder.type === 'chapters' && (
                      <div className="flex items-center gap-1">
                        <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>章数</span>
                        <select
                          value={chapterCount}
                          onChange={(e) => setChapterCount(Number(e.target.value))}
                          className="neumorphic-input rounded-lg px-2 py-1.5 text-xs appearance-none cursor-pointer"
                          style={{ color: 'var(--color-text-secondary)' }}
                        >
                          {VALID_CHAPTER_COUNTS.map(n => (
                            <option key={n} value={n}>{n}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    {/* 角色/时间线：数量选择器 */}
                    {!isSingleFile && folder.type !== 'detailed_outline' && folder.type !== 'chapters' && (
                      <select
                        value={tagCount}
                        onChange={(e) => setTagCount(Number(e.target.value))}
                        className="neumorphic-input rounded-lg px-2 py-1.5 text-xs appearance-none cursor-pointer"
                        style={{ color: 'var(--color-text-secondary)' }}
                      >
                        {VALID_TAG_COUNTS.map(n => (
                          <option key={n} value={n}>{n}</option>
                        ))}
                      </select>
                    )}
                    <AIProgressButton
                      onClick={handleGenerateTags}
                      isGenerating={isGenerating}
                      progress={status.progress}
                      label={buttonLabels[folder.type] || 'AI生成'}
                      generatingLabel={generatingLabel}
                      icon={isSingleFile ? 'fa-globe' : 'fa-magic'}
                    />
                    {isGenerating && (
                      <button onClick={handleAbort} className="px-4 py-2 rounded-lg text-sm transition-all whitespace-nowrap"
                        style={{ color: 'var(--color-text-muted)' }}>
                        <i className="fas fa-stop text-sm mr-1.5"></i>中止
                      </button>
                    )}
                    <button
                      onClick={handleManualCreateCard}
                      disabled={isGenerating}
                      className="px-4 py-2 rounded-lg transition-all text-sm font-medium card-float-hover disabled:opacity-40 whitespace-nowrap"
                      style={{ border: '1px dashed var(--color-border-default)', color: 'var(--color-text-secondary)' }}
                    >
                      <i className="fas fa-plus text-sm mr-1.5"></i>手动创建
                    </button>
                  </div>
                </div>
              </div>
            );
          })()}
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
                          folderType={folder.type}
                          onUpdate={handleUpdateCard}
                          onDelete={handleDeleteCard}
                          onPermanentDelete={handlePermanentDeleteCard}
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
                  currentView === 'grid' ? '' : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]'
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
                    currentView === 'timeline' ? '' : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]'
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
                    currentView === 'tree' ? '' : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]'
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
                    currentView === 'graph' ? '' : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]'
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
              <div className="relative" ref={newMenuRef}>
                <button
                  onClick={() => setShowNewMenu(!showNewMenu)}
                  className="px-3 py-1.5 rounded-xl transition-all duration-300 text-xs font-medium card-float-hover btn-gradient-hover glow-theme"
                  style={{ background: 'linear-gradient(135deg, var(--color-primary-400), var(--color-primary-500))', color: 'var(--color-text-primary)' }}
                >
                  <i className="fas fa-plus mr-1.5"></i>新建
                  <i className={`fas fa-chevron-down ml-1.5 text-[9px] transition-transform ${showNewMenu ? 'rotate-180' : ''}`}></i>
                </button>
                {showNewMenu && (
                  <div className="absolute right-0 top-full mt-1.5 py-1.5 rounded-xl shadow-2xl border z-50 min-w-[160px] animate-fade-in-down"
                    style={{
                      backgroundColor: 'var(--color-surface-overlay, rgba(20,20,35,0.97))',
                      backdropFilter: 'blur(20px)',
                      border: '1px solid var(--color-border-default)',
                    }}>
                    <button
                      onClick={() => { setShowNewMenu(false); setShowSubFolderInput(true); }}
                      className="w-full px-4 py-2.5 text-left text-sm flex items-center gap-3 hover:bg-white/5 transition-colors"
                      style={{ color: 'var(--color-text-primary)' }}
                    >
                      <i className="fas fa-folder-plus w-4 text-xs" style={{ color: 'var(--color-primary-400)' }}></i>
                      新建子文件夹
                    </button>
                    <button
                      onClick={() => { setShowNewMenu(false); handleManualCreateCard(); }}
                      className="w-full px-4 py-2.5 text-left text-sm flex items-center gap-3 hover:bg-white/5 transition-colors"
                      style={{ color: 'var(--color-text-primary)' }}
                    >
                      <i className="fas fa-file-circle-plus w-4 text-xs" style={{ color: 'var(--color-primary-400)' }}></i>
                      新建文件
                    </button>
                  </div>
                )}
              </div>
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
                className="px-3 py-1.5 rounded-lg text-xs btn-gradient-hover glow-theme"
                style={{ background: 'linear-gradient(135deg, var(--color-primary-400), var(--color-primary-500))', color: 'var(--color-text-primary)' }}>
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

        {/* 回收站面板 - 独立于视图模式，始终全屏显示 */}
        {showHistory && (
          <div className="glass-card rounded-2xl p-6 mb-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg flex items-center gap-2" style={{ color: 'var(--color-text-primary)' }}>
                <i className="fas fa-trash" style={{ color: 'var(--color-primary-400)' }}></i>
                回收站
              </h3>
              <div className="flex items-center gap-2">
                {/* 筛选标签 */}
                {(deletedCards.length > 0 || deletedFolders.length > 0) && (
                  <div className="flex items-center gap-1 p-0.5 rounded-lg" style={{ background: 'var(--color-surface-muted)', border: '1px solid var(--color-border-default)' }}>
                    {[
                      { key: 'all', label: '全部', count: deletedCards.length + deletedFolders.length },
                      { key: 'file', label: '文件', count: deletedCards.length },
                      { key: 'folder', label: '文件夹', count: deletedFolders.length },
                    ].map((tab) => (
                      <button
                        key={tab.key}
                        onClick={() => setRecycleFilter(tab.key as 'all' | 'file' | 'folder')}
                        className="px-2.5 py-1 rounded-md text-[10px] font-medium transition-all"
                        style={{
                          background: recycleFilter === tab.key ? 'var(--color-primary-100)' : 'transparent',
                          color: recycleFilter === tab.key ? 'var(--color-primary-400)' : 'var(--color-text-muted)',
                        }}
                      >
                        {tab.label} ({tab.count})
                      </button>
                    ))}
                  </div>
                )}
                {(deletedCards.length > 0 || deletedFolders.length > 0) && (
                  <button
                    onClick={() => setShowClearRecycleConfirm(true)}
                    className="px-3 py-1.5 rounded-lg text-xs transition-all flex items-center gap-1.5"
                    style={{
                      color: 'var(--color-red-500, #ef4444)',
                      border: '1px solid var(--color-red-200, #fecaca)',
                      backgroundColor: 'var(--color-red-50, #fef2f2)'
                    }}
                  >
                    <i className="fas fa-trash-alt"></i>
                    清空回收站
                  </button>
                )}
              </div>
            </div>
            {deletedCards.length === 0 && deletedFolders.length === 0 ? (
              <div className="text-center py-8">
                <i className="fas fa-trash text-5xl mb-4 opacity-20" style={{ color: 'var(--color-text-muted)' }} />
                <p className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
                  回收站为空
                </p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[400px] overflow-y-auto">
                {/* 已删除文件夹 */}
                {(recycleFilter === 'all' || recycleFilter === 'folder') && deletedFolders.map((df, index) => (
                  <div
                    key={df.id}
                    className="flex items-center justify-between p-3 rounded-xl transition-all"
                    style={{
                      background: 'var(--color-surface-muted)',
                      border: '1px solid var(--color-border-default)',
                      animationDelay: `${index * 50}ms`
                    }}
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 bg-gradient-to-br ${FOLDER_BG_GRADIENTS[df.type] || FOLDER_BG_GRADIENTS.custom}`}>
                        <i className={`fas ${TYPE_ICONS[df.type] || 'fa-folder'} text-xs ${FOLDER_ICON_COLORS[df.type] || 'text-rose-400'}`}></i>
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="font-medium text-sm truncate" style={{ color: 'var(--color-text-primary)' }}>
                          {df.name}
                        </h4>
                        <p className="text-xs truncate mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                          文件夹 · 包含 {df.children.length} 个子项
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] px-2 py-0.5 rounded" style={{ background: 'var(--color-primary-100)', color: 'var(--color-primary-400)' }}>
                            <i className={`fas ${TYPE_ICONS[df.parentType] || 'fa-folder'} mr-1`}></i>
                            {df.parentName}
                          </span>
                          <span className="text-[10px] flex items-center gap-1" style={{ color: 'var(--color-text-muted)' }}>
                            <i className="fas fa-clock"></i>
                            删除于 {new Date(df.deletedAt).toLocaleString('zh-CN')}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-3">
                      <button
                        onClick={() => {
                          // 恢复子文件夹到原父文件夹
                          const targetFolder = findFolderInList(project.folders || [], df.parentId);
                          if (targetFolder) {
                            const restoredFolder: BubbleFolderType = {
                              id: df.id,
                              name: df.name,
                              icon: df.icon,
                              color: df.color,
                              type: df.type,
                              parentId: df.parentId,
                              vfileId: df.vfileId || undefined,
                              children: df.children,
                              contentCards: df.contentCards,
                            };
                            onUpdateFolder(targetFolder.id, {
                              children: [...(targetFolder.children || []), restoredFolder]
                            });
                            // 恢复 VFile 节点
                            if (df.vfileId) {
                              const parentVfileId = targetFolder.vfileId || null;
                              dataService.createFile(parentVfileId, {
                                name: df.name,
                                type: 'folder',
                                metadata: { tags: [df.type], cardType: 'folder' }
                              });
                            }
                            console.log('[回收站恢复] 已恢复文件夹:', df.name);
                          }
                          setDeletedFolders(prev => prev.filter(f => f.id !== df.id));
                        }}
                        className="px-3 py-1.5 rounded-lg text-xs transition-all flex items-center gap-1.5"
                        style={{
                          color: 'var(--color-green-500, #22c55e)',
                          border: '1px solid var(--color-green-200, #bbf7d0)',
                          backgroundColor: 'var(--color-green-50, #f0fdf4)'
                        }}
                      >
                        <i className="fas fa-undo"></i>
                        恢复
                      </button>
                      <button
                        onClick={() => {
                          if (df.vfileId) {
                            dataService.deleteFile(df.vfileId);
                          }
                          setDeletedFolders(prev => prev.filter(f => f.id !== df.id));
                        }}
                        className="px-3 py-1.5 rounded-lg text-xs transition-all flex items-center gap-1.5"
                        style={{
                          color: 'var(--color-red-500, #ef4444)',
                          border: '1px solid var(--color-red-200, #fecaca)',
                          backgroundColor: 'var(--color-red-50, #fef2f2)'
                        }}
                      >
                        <i className="fas fa-times"></i>
                        彻底删除
                      </button>
                    </div>
                  </div>
                ))}
                {/* 已删除文件 */}
                {(recycleFilter === 'all' || recycleFilter === 'file') && deletedCards.map((card, index) => (
                  <div
                    key={card.id}
                    className="flex items-center justify-between p-3 rounded-xl transition-all"
                    style={{
                      background: 'var(--color-surface-muted)',
                      border: '1px solid var(--color-border-default)',
                      animationDelay: `${(deletedFolders.length + index) * 50}ms`
                    }}
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                        style={{ background: 'var(--color-primary-100)' }}>
                        <i className="fas fa-file-lines text-xs" style={{ color: 'var(--color-primary-400)' }}></i>
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="font-medium text-sm truncate" style={{ color: 'var(--color-text-primary)' }}>
                          {card.title}
                        </h4>
                        <p className="text-xs truncate mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                          {(card.content || '').substring(0, 60)}...
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] px-2 py-0.5 rounded" style={{ background: 'var(--color-primary-100)', color: 'var(--color-primary-400)' }}>
                            <i className={`fas ${TYPE_ICONS[card.folderType] || 'fa-folder'} mr-1`}></i>
                            {card.folderName}
                          </span>
                          <span className="text-[10px] flex items-center gap-1" style={{ color: 'var(--color-text-muted)' }}>
                            <i className="fas fa-clock"></i>
                            删除于 {new Date(card.deletedAt).toLocaleString('zh-CN')}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-3">
                      <button
                        onClick={() => {
                          // 恢复到原文件夹的 VFile 系统
                          const targetFolder = findFolderInList(project.folders || [], card.folderId);
                          if (targetFolder?.vfileId) {
                            const result = dataService.createFile(targetFolder.vfileId, {
                              name: card.title,
                              type: 'file',
                              content: card.content || '',
                              metadata: { favorited: true, batchId: `batch-${Date.now()}` }
                            });
                            console.log('[回收站恢复] 已恢复到 VFile:', result.id, '内容长度:', (card.content || '').length);
                          } else if (targetFolder?.contentCards) {
                            // 兼容旧数据：恢复到 contentCards
                            const restoredCard: ContentCard = {
                              id: `card-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                              title: card.title,
                              content: card.content || '',
                              tagText: card.tagText || card.title,
                              isFavorited: true,
                              batchId: `batch-${Date.now()}`,
                              createdAt: Date.now(),
                              updatedAt: Date.now()
                            };
                            onUpdateFolder(targetFolder.id, {
                              contentCards: [...targetFolder.contentCards, restoredCard]
                            });
                            console.log('[回收站恢复] 已恢复到 contentCards:', restoredCard.id);
                          }
                          setDeletedCards(prev => prev.filter(c => c.id !== card.id));
                        }}
                        className="px-3 py-1.5 rounded-lg text-xs transition-all flex items-center gap-1.5"
                        style={{
                          color: 'var(--color-green-500, #22c55e)',
                          border: '1px solid var(--color-green-200, #bbf7d0)',
                          backgroundColor: 'var(--color-green-50, #f0fdf4)'
                        }}
                      >
                        <i className="fas fa-undo"></i>
                        恢复
                      </button>
                      <button
                        onClick={() => setShowPermanentDeleteConfirm(card.id)}
                        className="px-3 py-1.5 rounded-lg text-xs transition-all flex items-center gap-1.5"
                        style={{
                          color: 'var(--color-red-500, #ef4444)',
                          border: '1px solid var(--color-red-200, #fecaca)',
                          backgroundColor: 'var(--color-red-50, #fef2f2)'
                        }}
                      >
                        <i className="fas fa-times"></i>
                        彻底删除
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 清空回收站确认弹窗 */}
        {createPortal(showClearRecycleConfirm && (
          <ConfirmModal
            title="清空回收站"
            message="确定要清空回收站吗？此操作将永久删除所有已删除文件和文件夹，不可恢复！"
            variant="danger"
            confirmText="清空回收站"
            onConfirm={() => {
              setShowClearRecycleConfirm(false);
              // 彻底删除所有文件夹的 VFile 节点
              deletedFolders.forEach(df => {
                if (df.vfileId) {
                  dataService.deleteFile(df.vfileId);
                }
              });
              setDeletedCards([]);
              setDeletedFolders([]);
            }}
            onCancel={() => setShowClearRecycleConfirm(false)}
          />
        ), document.body)}

        {/* 彻底删除确认弹窗 */}
        {createPortal(showPermanentDeleteConfirm && (
          <ConfirmModal
            title="彻底删除文件"
            message={`确定要彻底删除此文件吗？此操作将永久删除，不可恢复！`}
            variant="danger"
            confirmText="彻底删除"
            onConfirm={() => {
              if (showPermanentDeleteConfirm) {
                setDeletedCards(prev => prev.filter(c => c.id !== showPermanentDeleteConfirm));
              }
              setShowPermanentDeleteConfirm(null);
            }}
            onCancel={() => setShowPermanentDeleteConfirm(null)}
          />
        ), document.body)}

        {/* 内容区 - 非回收站模式下显示 */}
        {!showHistory && (
          <>
            {currentView === 'grid' ? (
              <>
                {/* 子文件夹卡片 */}
                {!isTimeline && children.length > 0 && (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
                    {children.map((child, index) => (
                      <div
                        key={child.id}
                        className={`glass-card rounded-xl p-4 card-float-hover cursor-pointer transition-all duration-300 relative group ${renamingFolderId === child.id ? 'ring-2 ring-purple-500/50' : ''} ${longPressFolderId === child.id ? 'scale-95 ring-2 ring-primary-400/50' : ''}`}
                        style={{ animationDelay: `${index * 50}ms` }}
                        onClick={() => { if (renamingFolderId !== child.id) onSelectFolder?.(child.id); }}
                        onContextMenu={(e) => handleSubFolderContextMenu(e, child)}
                        onTouchStart={(e) => startLongPress(e, child)}
                        onTouchEnd={endLongPress}
                        onTouchMove={endLongPress}
                      >
                        {renamingFolderId === child.id ? (
                          <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                            <input
                              id={`rename-input-${child.id}`}
                              autoFocus
                              value={renameValue}
                              onChange={e => setRenameValue(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') { e.preventDefault(); handleRenameSubFolder(); }
                                if (e.key === 'Escape') { e.preventDefault(); setRenamingFolderId(null); setRenameValue(''); }
                              }}
                              className="flex-1 bg-transparent text-sm font-medium border border-purple-500/50 rounded px-2 py-1 focus:outline-none focus:border-purple-400 min-w-0"
                              style={{ color: 'var(--color-text-primary)' }}
                            />
                            <button
                              onMouseDown={e => { e.preventDefault(); setRenamingFolderId(null); setRenameValue(''); }}
                              className="w-6 h-6 flex items-center justify-center rounded-md shrink-0 transition-colors"
                              style={{ color: 'var(--color-text-muted)' }}
                              title="取消"
                            >
                              <i className="fas fa-xmark text-xs"></i>
                            </button>
                            <button
                              onMouseDown={e => { e.preventDefault(); handleRenameSubFolder(); }}
                              className="w-6 h-6 flex items-center justify-center rounded-md shrink-0 transition-colors"
                              style={{ color: 'var(--color-primary-400)' }}
                              title="确认"
                            >
                              <i className="fas fa-check text-xs"></i>
                            </button>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-center gap-3">
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center bg-gradient-to-br ${FOLDER_BG_GRADIENTS[child.type] || FOLDER_BG_GRADIENTS.custom}`}>
                                <i className={`fas ${TYPE_ICONS[child.type] || 'fa-folder'} text-xs ${FOLDER_ICON_COLORS[child.type] || 'text-rose-400'}`}></i>
                              </div>
                              <span className="text-sm font-medium truncate" style={{ color: 'var(--color-text-primary)' }}>{child.name}</span>
                            </div>
                            <i className="fas fa-ellipsis-v absolute top-2 right-2 text-[10px] opacity-0 group-hover:opacity-40 transition-opacity" style={{ color: 'var(--color-text-muted)' }}></i>
                          </>
                        )}
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
                ) : (
                  <div className="flex-1">
                    {filteredFiles.length > 0 && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {filteredFiles.map((card, index) => (
                          <div key={card.id}
                            className={`animate-card-enter relative ${dragCardId === card.id ? 'opacity-40 scale-95' : ''}`}
                            style={{ animationDelay: `${index * 40}ms` }}
                            onDragOver={handleDragOver}>
                            <ContentCardItem
                              card={card}
                              folderType={folder.type}
                              onUpdate={handleUpdateCard}
                              onDelete={handleDeleteCard}
                              onPermanentDelete={handlePermanentDeleteCard}
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
                    )}
                  </div>
                )}
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
            </>
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
  return (
    <>
      {renderGenerateMode()}

      {createPortal(contextMenuFolder && (
        <div
          className="fixed inset-0 z-[99998]"
          onClick={() => setContextMenuFolder(null)}
          style={{ backgroundColor: 'var(--color-surface-muted, rgba(0,0,0,0.15))' }}
        />
      ), document.body)}
      {createPortal(contextMenuFolder && (
        <div
          className="fixed z-[99999] py-2 rounded-xl shadow-2xl border min-w-[160px] animate-fade-in"
          onClick={e => e.stopPropagation()}
          style={{
            left: Math.min(contextMenuPos.x, window.innerWidth - 180),
            top: Math.min(contextMenuPos.y, window.innerHeight - 120),
            backgroundColor: 'var(--color-surface-overlay, rgba(20,20,35,0.97))',
            backdropFilter: 'blur(20px)',
            border: '1px solid var(--color-border-default)',
          }}
        >
          <button
            onClick={() => {
              if (!contextMenuFolder) return;
              setRenamingFolderId(contextMenuFolder.id);
              setRenameValue(contextMenuFolder.name);
              setContextMenuFolder(null);
            }}
            className="w-full px-4 py-2.5 text-left text-sm flex items-center gap-3 hover:bg-white/5 transition-colors"
            style={{ color: 'var(--color-text-primary)' }}
          >
            <i className="fas fa-pen-to-square w-4 text-xs" style={{ color: 'var(--color-primary-400)' }}></i>
            重命名
          </button>
          <button
            onClick={() => {
              if (!contextMenuFolder) return;
              setDeletingFolderId(contextMenuFolder.id);
              setShowFolderDeleteOptions(true);
              setContextMenuFolder(null);
            }}
            className="w-full px-4 py-2.5 text-left text-sm flex items-center gap-3 hover:bg-red-500/10 transition-colors"
            style={{ color: 'var(--color-red-500, #ef4444)' }}
          >
            <i className="fas fa-trash-can w-4 text-xs"></i>
            删除文件夹
          </button>
        </div>
      ), document.body)}

      {/* 文件夹删除选项弹窗 */}
      {createPortal(showFolderDeleteOptions && deletingFolderId && (() => {
        const target = (folder.children || []).find(c => c.id === deletingFolderId);
        if (!target) return null;
        return (
          <div
            className="fixed inset-0 z-[99999] flex items-center justify-center p-4"
            onClick={() => { setShowFolderDeleteOptions(false); setDeletingFolderId(null); }}
            style={{ backgroundColor: 'var(--color-surface-base, rgba(0,0,0,0.6))' }}
          >
            <div
              className="relative w-full max-w-sm rounded-2xl shadow-2xl border overflow-hidden animate-fade-in-scale"
              style={{
                backgroundColor: 'var(--color-surface-overlay)',
                borderColor: 'var(--color-border-default)'
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* 头部 */}
              <div className="flex items-center gap-3 px-5 py-4 border-b" style={{ borderColor: 'var(--color-border-default)' }}>
                <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: 'var(--color-primary-100)' }}>
                  <i className="fas fa-trash text-sm" style={{ color: 'var(--color-primary-400)' }}></i>
                </div>
                <div>
                  <h3 className="text-sm font-bold" style={{ color: 'var(--color-text-primary)' }}>删除文件夹</h3>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>「{target.name}」</p>
                </div>
              </div>

              {/* 选项 */}
              <div className="p-4 space-y-2">
                <button
                  onClick={() => { setShowFolderDeleteOptions(false); handleDeleteSubFolder(); }}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-left hover:scale-[1.02]"
                  style={{
                    backgroundColor: 'var(--color-surface-muted)',
                    border: '1px solid var(--color-border-default)'
                  }}
                >
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: 'var(--color-primary-100)' }}>
                    <i className="fas fa-trash-can text-xs" style={{ color: 'var(--color-primary-400)' }}></i>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>删除到回收站</div>
                    <div className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>文件夹将被移入回收站，可随时恢复</div>
                  </div>
                  <i className="fas fa-chevron-right text-xs" style={{ color: 'var(--color-text-muted)' }}></i>
                </button>

                <button
                  onClick={() => {
                    setShowFolderDeleteOptions(false);
                    setShowDeleteFolderConfirm(true);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-left hover:scale-[1.02]"
                  style={{
                    backgroundColor: 'var(--color-surface-muted)',
                    border: '1px solid var(--color-border-default)'
                  }}
                >
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: 'var(--color-red-50, #fef2f2)' }}>
                    <i className="fas fa-fire text-xs" style={{ color: 'var(--color-red-500, #ef4444)' }}></i>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium" style={{ color: 'var(--color-red-500, #ef4444)' }}>彻底删除</div>
                    <div className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>文件夹将被永久删除，不可恢复</div>
                  </div>
                  <i className="fas fa-chevron-right text-xs" style={{ color: 'var(--color-text-muted)' }}></i>
                </button>
              </div>

              {/* 取消按钮 */}
              <div className="px-4 pb-4">
                <button
                  onClick={() => { setShowFolderDeleteOptions(false); setDeletingFolderId(null); }}
                  className="w-full py-2.5 rounded-xl text-xs font-medium transition-all"
                  style={{
                    color: 'var(--color-text-muted)',
                    backgroundColor: 'var(--color-surface-muted)',
                    border: '1px solid var(--color-border-default)'
                  }}
                >
                  取消
                </button>
              </div>
            </div>
          </div>
        );
      })(), document.body)}

      {/* 文件夹彻底删除确认弹窗 */}
      {createPortal(showDeleteFolderConfirm && deletingFolderId && (() => {
        const target = (folder.children || []).find(c => c.id === deletingFolderId);
        if (!target) return null;
        return (
          <ConfirmModal
            title="彻底删除文件夹"
            message={`确定要彻底删除文件夹「${target.name}」吗？此操作将永久删除文件夹及其所有内容，不可恢复！`}
            variant="danger"
            confirmText="彻底删除"
            onConfirm={() => {
              const updatedChildren = (folder.children || []).filter(c => c.id !== deletingFolderId);
              onUpdateFolder(folder.id, { children: updatedChildren });
              if (target.vfileId) {
                dataService.deleteFile(target.vfileId);
              }
              setShowDeleteFolderConfirm(false);
              setDeletingFolderId(null);
            }}
            onCancel={() => { setShowDeleteFolderConfirm(false); setDeletingFolderId(null); }}
          />
        );
      })(), document.body)}
    </>
  );
};

export default BubbleFolderContent;
