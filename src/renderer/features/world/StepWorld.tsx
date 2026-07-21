import React, { useState, useCallback } from 'react';
import { Project, ModelConfig, WorldFaction } from '../../../shared/types';
import { useAIGeneration } from '../../shared/hooks/useAIGeneration';
import AIProgressButton from '../../shared/components/AIProgressButton';

// ===== 子组件：关系图大窗口弹窗 =====
interface GraphModalProps {
  isOpen: boolean;
  onClose: () => void;
  factions: WorldFaction[];
  characters: { id: string; name: string; factionId?: string }[];
}

const GraphModal: React.FC<GraphModalProps> = ({ isOpen, onClose, factions, characters }) => {
  if (!isOpen) return null;

  const nodes = [
    ...factions.map(f => ({ id: f.id, label: f.name, type: 'faction' as const, color: '#f59e0b' })),
    ...characters.map(c => ({ id: c.id, label: c.name, type: 'character' as const, color: 'var(--color-primary-300)' })),
  ];
  const links: { source: string; target: string }[] = [];
  characters.forEach(c => {
    if (c.factionId && factions.find(f => f.id === c.factionId)) {
      links.push({ source: c.id, target: c.factionId });
    }
  });

  // 大窗口使用更大的画布
  const nodeCount = nodes.length;
  const baseRadius = Math.max(120, Math.min(350, nodeCount * 35));
  const svgSize = baseRadius * 2 + 200;
  const cx = svgSize / 2;
  const cy = svgSize / 2;
  const radius = baseRadius;

  const nodePositions: Record<string, { x: number; y: number }> = {};
  nodes.forEach((node, i) => {
    const angle = (2 * Math.PI * i) / nodes.length - Math.PI / 2;
    nodePositions[node.id] = {
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
    };
  });

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="relative rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-fade-in"
        style={{
          width: '90vw',
          height: '90vh',
          backgroundColor: 'var(--color-surface-base)',
          border: '1px solid var(--color-border-default)',
        }}
      >
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-4 py-3 border-b shrink-0" style={{ borderColor: 'var(--color-border-default)' }}>
          <h3 className="text-sm font-bold" style={{ color: 'var(--color-text-primary)' }}>
            <i className="fas fa-project-diagram mr-2" style={{ color: 'var(--color-primary-400)' }} />势力-角色关系图谱
          </h3>
          <div className="flex items-center gap-3">
            <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
              共 {nodes.length} 个节点
            </span>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-full flex items-center justify-center border-none cursor-pointer transition-all"
              style={{ background: 'var(--color-surface-muted)', color: 'var(--color-text-muted)' }}
            >
              <i className="fas fa-xmark text-xs" />
            </button>
          </div>
        </div>

        {/* 图谱内容 */}
        <div className="flex-1 overflow-auto p-4">
          <svg
            width={svgSize}
            height={svgSize}
            className="mx-auto"
            style={{ minWidth: svgSize, minHeight: svgSize }}
          >
            {/* 连接线 */}
            {links.map((link, i) => {
              const src = nodePositions[link.source];
              const tgt = nodePositions[link.target];
              if (!src || !tgt) return null;
              return (
                <line
                  key={i}
                  x1={src.x} y1={src.y}
                  x2={tgt.x} y2={tgt.y}
                  stroke="var(--color-border-default)"
                  strokeWidth={2}
                  strokeDasharray="6 3"
                />
              );
            })}
            {/* 节点 */}
            {nodes.map(node => {
              const pos = nodePositions[node.id];
              if (!pos) return null;
              return (
                <g key={node.id}>
                  <circle cx={pos.x} cy={pos.y} r={28} fill={node.color} opacity={0.9} />
                  <text
                    x={pos.x}
                    y={pos.y + 5}
                    textAnchor="middle"
                    fill="white"
                    fontSize="12"
                    fontWeight="bold"
                    style={{ textShadow: '0 1px 3px rgba(0,0,0,0.6)' }}
                  >
                    {node.label.length > 6 ? node.label.slice(0, 6) + '..' : node.label}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        {/* 底部图例 */}
        <div className="flex items-center justify-center gap-6 px-4 py-2 border-t shrink-0" style={{ borderColor: 'var(--color-border-default)' }}>
          <span className="text-[11px]" style={{ color: 'var(--color-primary-300)' }}>
            <i className="fas fa-circle mr-1.5" />角色
          </span>
          <span className="text-[11px]" style={{ color: '#f59e0b' }}>
            <i className="fas fa-circle mr-1.5" />势力
          </span>
        </div>
      </div>
    </div>
  );
};

interface StepWorldProps {
  project: Project;
  onUpdate: (updates: Partial<Project>) => void;
  activeModel: ModelConfig;
  onOpenSettings?: () => void;
}

type EditorType = 'location' | 'faction' | 'rule' | 'timeline' | null;

// ===== 子组件：内联编辑器 =====
interface InlineEditorProps {
  type: 'location' | 'faction' | 'rule';
  onSave: (data: any) => void;
  onCancel: () => void;
  initial?: any;
}

const InlineEditor: React.FC<InlineEditorProps> = ({ type, onSave, onCancel, initial }) => {
  const [name, setName] = useState(initial?.name || '');
  const [description, setDescription] = useState(initial?.description || '');
  const [extra, setExtra] = useState(initial?.type || initial?.ideology || '');

  const labelMap = {
    location: { extraLabel: '类型（如：城市/森林/神殿/秘境）', icon: 'fa-map-marker-alt', color: '#34d399' },
    faction: { extraLabel: '核心理念', icon: 'fa-chess-rook', color: '#f59e0b' },
    rule: { extraLabel: '规则类型（如：魔法/科技/社会）', icon: 'fa-gavel', color: '#22d3ee' },
  };

  const info = labelMap[type];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const baseData: Record<string, string | string[]> = {
      name: name.trim(),
      description: description.trim(),
    };

    if (type === 'location') {
      baseData.type = extra.trim();
      baseData.climate = initial?.climate || '';
      baseData.culture = initial?.culture || '';
      baseData.architecture = initial?.architecture || '';
    } else if (type === 'faction') {
      baseData.ideology = extra.trim();
      baseData.members = initial?.members || [];
      baseData.territory = initial?.territory || '';
      baseData.diplomacy = initial?.diplomacy || '';
    } else if (type === 'rule') {
      baseData.type = extra.trim();
      baseData.principles = initial?.principles || [];
      baseData.limitations = initial?.limitations || [];
    }

    onSave(baseData);
  };

  return (
    <form onSubmit={handleSubmit} className="p-4 rounded-xl animate-fade-in-up"
      style={{ backgroundColor: 'var(--color-surface-muted)', border: '1px solid var(--color-border-default)' }}>
      <div className="flex items-center gap-2 mb-3">
        <i className={`fas ${info.icon} text-xs`} style={{ color: info.color }}></i>
        <span className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
          {initial ? '编辑' : '新建'}
        </span>
      </div>
      <div className="space-y-2.5">
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder={`${type === 'location' ? '地点' : type === 'faction' ? '势力' : '规则'}名称`}
          className="w-full bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] rounded-lg px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-primary-400)] transition-all"
          autoFocus
        />
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="描述"
          rows={2}
          className="w-full bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] rounded-lg px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-primary-400)] transition-all resize-none"
        />
        <input
          value={extra}
          onChange={e => setExtra(e.target.value)}
          placeholder={info.extraLabel}
          className="w-full bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] rounded-lg px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-primary-400)] transition-all"
        />
      </div>
      <div className="flex gap-2 mt-3">
        <button type="submit"
          className="flex-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all bg-gradient-to-r from-[var(--color-primary-500)] to-[var(--color-primary-600)] text-white hover:from-[var(--color-primary-600)] hover:to-[var(--color-primary-600)]">
          <i className="fas fa-check mr-1"></i>保存
        </button>
        <button type="button" onClick={onCancel}
          className="px-3 py-1.5 rounded-lg text-xs transition-all text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]">
          取消
        </button>
      </div>
    </form>
  );
};

// ===== 子组件：简单 SVG 关系图（基于势力-角色关联） =====
interface GraphNode {
  id: string;
  label: string;
  type: 'faction' | 'character';
  color: string;
}

interface GraphLink {
  source: string;
  target: string;
}

const SimpleRelationshipGraph: React.FC<{
  factions: WorldFaction[];
  characters: { id: string; name: string; factionId?: string }[];
}> = ({ factions, characters }) => {
  const nodes: GraphNode[] = [
    ...factions.map(f => ({ id: f.id, label: f.name, type: 'faction' as const, color: '#f59e0b' })),
    ...characters.map(c => ({ id: c.id, label: c.name, type: 'character' as const, color: 'var(--color-primary-300)' })),
  ];
  const links: GraphLink[] = [];
  characters.forEach(c => {
    if (c.factionId && factions.find(f => f.id === c.factionId)) {
      links.push({ source: c.id, target: c.factionId });
    }
  });

  if (nodes.length === 0) return null;

  // 根据节点数量动态计算尺寸
  const nodeCount = nodes.length;
  const baseRadius = Math.max(80, Math.min(200, nodeCount * 25));
  const svgSize = baseRadius * 2 + 120;
  const cx = svgSize / 2;
  const cy = svgSize / 2;
  const radius = baseRadius;

  const nodePositions: Record<string, { x: number; y: number }> = {};
  nodes.forEach((node, i) => {
    const angle = (2 * Math.PI * i) / nodes.length - Math.PI / 2;
    nodePositions[node.id] = {
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
    };
  });

  return (
    <div className="flex flex-col items-center w-full">
      <div className="w-full overflow-auto" style={{ maxHeight: '70vh' }}>
        <svg
          width={svgSize}
          height={svgSize}
          className="mx-auto"
          style={{ minWidth: svgSize, minHeight: svgSize }}
        >
          {/* 连接线 */}
          {links.map((link, i) => {
            const src = nodePositions[link.source];
            const tgt = nodePositions[link.target];
            if (!src || !tgt) return null;
            return (
              <line
                key={i}
                x1={src.x} y1={src.y}
                x2={tgt.x} y2={tgt.y}
                stroke="var(--color-border-default)"
                strokeWidth={1.5}
                strokeDasharray="4 2"
              />
            );
          })}
          {/* 节点 */}
          {nodes.map(node => {
            const pos = nodePositions[node.id];
            if (!pos) return null;
            return (
              <g key={node.id}>
                <circle cx={pos.x} cy={pos.y} r={22} fill={node.color} opacity={0.85} />
                <text
                  x={pos.x}
                  y={pos.y + 5}
                  textAnchor="middle"
                  fill="white"
                  fontSize="10"
                  fontWeight="bold"
                  style={{ textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}
                >
                  {node.label.length > 5 ? node.label.slice(0, 5) + '..' : node.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <div className="flex gap-4 text-[10px] mt-3">
        <span style={{ color: 'var(--color-primary-300)' }}><i className="fas fa-circle mr-1"></i>角色</span>
        <span style={{ color: 'var(--color-chart-2, #f59e0b)' }}><i className="fas fa-circle mr-1"></i>势力</span>
      </div>
    </div>
  );
};

// ===== 主组件 =====
const StepWorld: React.FC<StepWorldProps> = ({ project, onUpdate, activeModel, onOpenSettings }) => {
  const { generate, isGenerating, status, abort } = useAIGeneration();
  const [editing, setEditing] = useState<{ type: EditorType; data?: any; id?: string }>({ type: null });
  const [activeView, setActiveView] = useState<'cards' | 'graph' | 'tree'>('cards');
  const [generatingType, setGeneratingType] = useState<EditorType>(null);
  const [showGraphModal, setShowGraphModal] = useState(false);

  // ---- 保存编辑 ----
  const handleSave = useCallback((type: EditorType, data: any) => {
    if (!type) return;
    const id = editing.id || Date.now().toString();
    const item = { id, ...data };

    switch (type) {
      case 'location': {
        const locations = editing.id
          ? project.locations.map(l => l.id === editing.id ? item : l)
          : [...project.locations, item];
        onUpdate({ locations });
        break;
      }
      case 'faction': {
        const factions = editing.id
          ? project.factions.map(f => f.id === editing.id ? item : f)
          : [...project.factions, item];
        onUpdate({ factions });
        break;
      }
      case 'rule': {
        const ruleSystems = editing.id
          ? project.ruleSystems.map(r => r.id === editing.id ? item : r)
          : [...project.ruleSystems, item];
        onUpdate({ ruleSystems });
        break;
      }
    }
    setEditing({ type: null });
  }, [editing, project, onUpdate]);

  // ---- 删除 ----
  const handleDelete = useCallback((type: EditorType, id: string) => {
    switch (type) {
      case 'location':
        onUpdate({ locations: project.locations.filter(l => l.id !== id) });
        break;
      case 'faction':
        onUpdate({ factions: project.factions.filter(f => f.id !== id) });
        break;
      case 'rule':
        onUpdate({ ruleSystems: project.ruleSystems.filter(r => r.id !== id) });
        break;
    }
  }, [project, onUpdate]);

  // ---- AI 生成（使用 useAIGeneration hook） ----
  const handleAIGenerate = useCallback(async (type: EditorType) => {
    if (!type || !activeModel) return;
    setGeneratingType(type);

    try {
    const taskLabels: Record<string, string> = {
      location: '正在AI生成地点设定...',
      faction: '正在AI生成势力设定...',
      rule: '正在AI生成规则设定...',
    };

    const prompts: Record<string, string> = {
      location: `为奇幻/科幻小说生成一个详细的地点设定，需包含以下字段并以JSON格式返回：
{
  "name": "地点名称",
  "description": "详细描述（100-200字，包含环境氛围、视觉印象、独特之处）",
  "type": "类型（城市/森林/神殿/秘境/废墟/沙漠/海洋/天空城等）",
  "climate": "气候特征（温度范围、天气特点、季节变化）",
  "culture": "文化习俗（居民生活方式、节日庆典、社会等级、禁忌与信仰）",
  "architecture": "建筑风格（材料、色彩、标志性建筑、空间布局特点）"
}
仅返回一个JSON对象，不要其他文字。`,

      faction: `为奇幻/科幻小说生成一个详细的势力组织设定，需包含以下字段并以JSON格式返回：
{
  "name": "势力名称",
  "description": "详细描述（100-200字，包含历史渊源、当前地位、核心理念体现）",
  "ideology": "核心理念（统治哲学、核心价值观、行动准则）",
  "members": ["成员1（职位/角色）", "成员2（职位/角色）", "成员3（职位/角色）"],
  "territory": "势力范围（地理区域、控制据点、资源掌控）",
  "diplomacy": "外交倾向（友好/中立/敌对，与其他势力的关系概述）"
}
仅返回一个JSON对象，不要其他文字。`,

      rule: `为奇幻/科幻小说生成一个详细的规则体系设定，需包含以下字段并以JSON格式返回：
{
  "name": "规则体系名称",
  "description": "详细描述（100-200字，包含体系起源、对世界的影响、普通人的感受）",
  "type": "类型（魔法/科技/社会规则/自然法则/宗教信条等）",
  "principles": ["核心原则1（具体说明）", "核心原则2（具体说明）", "核心原则3（具体说明）"],
  "limitations": ["限制条件1（代价或副作用）", "限制条件2（触发条件或禁忌）"]
}
仅返回一个JSON对象，不要其他文字。`,
      };

      const result = await generate({
        model: activeModel,
        prompt: prompts[type],
        temperature: 0.8,
        label: taskLabels[type] || '正在AI生成世界设定...',
      });

      if (result.content && !result.error) {
        try {
          const jsonMatch = result.content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const data = JSON.parse(jsonMatch[0]);
            const id = Date.now().toString();
            const item = { id, ...data };

            switch (type) {
              case 'location':
                onUpdate({ locations: [...project.locations, item] });
                break;
              case 'faction':
                onUpdate({ factions: [...project.factions, item] });
                break;
              case 'rule':
                onUpdate({ ruleSystems: [...project.ruleSystems, item] });
                break;
            }
          }
        } catch {
          // JSON parse failed — fallback: create with raw content
          const fallback = {
            id: Date.now().toString(),
            name: result.content.slice(0, 40).replace(/[^\w\u4e00-\u9fff\s]/g, '').trim() || `AI生成${type}`,
            description: result.content.slice(0, 200),
            type: '',
            ideology: '',
          };
          const key = type === 'location' ? 'locations' : type === 'faction' ? 'factions' : 'ruleSystems';
          if (key === 'locations') {
            onUpdate({ locations: [...project.locations, fallback] });
          } else if (key === 'factions') {
            onUpdate({ factions: [...project.factions, fallback] });
          } else {
            onUpdate({ ruleSystems: [...project.ruleSystems, fallback] });
          }
        }
      }
    } finally {
      setGeneratingType(null);
    }
  }, [activeModel, project, onUpdate, generate]);

  // ---- 中止 AI 生成 ----
  const handleAbort = useCallback(() => {
    abort();
  }, [abort]);

  // ---- 渲染分类卡片 ----
  const renderSection = (
    type: 'location' | 'faction' | 'rule',
    label: string,
    icon: string,
    color: string,
    items: any[],
    displayFields: string[],
  ) => {
    const isEditing = editing.type === type;

    return (
      <div className="glass-card rounded-2xl p-5 card-float-hover">
        {/* 头部 */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: `${color}15` }}>
              <i className={`fas ${icon} text-sm`} style={{ color }}></i>
            </div>
            <div>
              <h3 className="text-lg font-bold" style={{ color: 'var(--color-text-primary)' }}>{label}</h3>
              <span className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
                {items.length} 项
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <AIProgressButton
              onClick={() => handleAIGenerate(type)}
              isGenerating={generatingType === type}
              progress={status.progress}
              label="AI生成"
              generatingLabel="生成中..."
              icon="fa-wand-magic-sparkles"
              variant="secondary"
            />
            <button
              onClick={() => setEditing({ type, data: null })}
              className="w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:bg-white/10"
              style={{ color: 'var(--color-text-tertiary)' }}
              title={`新建${label}`}
            >
              <i className="fas fa-plus text-xs"></i>
            </button>
          </div>
        </div>

        {/* 内联编辑器 */}
        {isEditing && (
          <div className="mb-4">
            <InlineEditor
              type={type}
              initial={editing.data}
              onSave={(data) => handleSave(type, data)}
              onCancel={() => setEditing({ type: null })}
            />
          </div>
        )}

        {/* 列表 */}
        {items.length === 0 && !isEditing ? (
          <div className="text-center py-8" style={{ color: 'var(--color-text-tertiary)' }}>
            <i className={`fas ${icon} text-3xl mb-3 opacity-30`}></i>
            <p className="text-sm">尚未创建{label}</p>
            <p className="text-xs mt-1 opacity-50">点击"AI生成"一键创建，或手动新建</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-[240px] overflow-y-auto custom-scrollbar pr-1">
            {items.map((item: any) => (
              <div
                key={item.id}
                className="group rounded-xl px-3.5 py-2.5 transition-all duration-200"
                style={{
                  backgroundColor: 'var(--color-surface-muted, rgba(255,255,255,0.04))',
                  border: '1px solid var(--color-border-default, rgba(255,255,255,0.06))',
                }}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <i className={`fas ${icon} text-xs`} style={{ color }}></i>
                      <span className="text-sm font-medium truncate" style={{ color: 'var(--color-text-primary)' }}>
                        {item.name}
                      </span>
                      {displayFields.map(f => item[f] && (
                        <span key={f} className="text-[10px] px-1.5 py-0.5 rounded shrink-0"
                          style={{ color: 'var(--color-text-tertiary)', backgroundColor: 'var(--color-surface-muted)' }}>
                          {Array.isArray(item[f]) ? (item[f] as string[]).slice(0, 2).join(' · ') : item[f]}
                        </span>
                      ))}
                    </div>
                    {item.description && (
                      <p className="text-xs mt-1 line-clamp-2" style={{ color: 'var(--color-text-tertiary)' }}>
                        {item.description}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 ml-2 opacity-0 group-hover:opacity-100 transition-all shrink-0">
                    <button
                      onClick={() => setEditing({ type, data: item, id: item.id })}
                      className="w-6 h-6 rounded-lg flex items-center justify-center hover:bg-white/10 transition-all"
                      style={{ color: 'var(--color-text-tertiary)' }}
                      title="编辑"
                    >
                      <i className="fas fa-pen text-[9px]"></i>
                    </button>
                    <button
                      onClick={() => handleDelete(type, item.id)}
                      className="w-6 h-6 rounded-lg flex items-center justify-center hover:bg-[var(--color-error)]/15 transition-all"
                      style={{ color: 'var(--color-text-tertiary)' }}
                      title="删除"
                    >
                      <i className="fas fa-trash text-[9px]"></i>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="p-8 overflow-y-auto h-full">
      {/* 标题与视图切换 */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-3xl font-black tracking-tight" style={{ color: 'var(--color-text-primary)' }}>
            世界构建
          </h2>
          <p className="mt-2 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            构建你小说世界的地理、势力、规则体系与历史背景
          </p>
        </div>
        <div className="flex items-center gap-1 p-1 rounded-xl" style={{ backgroundColor: 'var(--color-surface-muted, rgba(255,255,255,0.04))' }}>
          <button
            onClick={() => setActiveView('cards')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeView === 'cards'
                ? 'bg-[var(--color-primary-600)]/20 text-[var(--color-primary-300)] border border-[var(--color-primary-300)]'
                : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
            }`}
          >
            <i className="fas fa-th-large mr-1.5"></i>卡片
          </button>
          <button
            onClick={() => setActiveView('graph')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeView === 'graph'
                ? 'bg-[var(--color-primary-600)]/20 text-[var(--color-primary-300)] border border-[var(--color-primary-300)]'
                : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
            }`}
          >
            <i className="fas fa-project-diagram mr-1.5"></i>关系图
          </button>
          <button
            onClick={() => setActiveView('tree')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeView === 'tree'
                ? 'bg-[var(--color-primary-600)]/20 text-[var(--color-primary-300)] border border-[var(--color-primary-300)]'
                : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
            }`}
          >
            <i className="fas fa-sitemap mr-1.5"></i>树状图
          </button>
        </div>
      </div>

      {activeView === 'cards' ? (
        <>
          {/* 卡片网格 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-5xl">
            {project.locations.length > 0 && renderSection('location', '地点管理', 'fa-map-marker-alt', '#34d399', project.locations, ['type', 'climate', 'architecture'])}
            {project.factions.length > 0 && renderSection('faction', '势力阵营', 'fa-chess-rook', '#f59e0b', project.factions, ['ideology', 'territory'])}
            {project.ruleSystems.length > 0 && renderSection('rule', '规则体系', 'fa-gavel', '#22d3ee', project.ruleSystems, ['type'])}
          </div>

          {/* ====== 时间线 & 随机事件生成器 ====== */}
          <div className="mt-8 max-w-5xl">
            <div className="rounded-2xl p-5"
              style={{ backgroundColor: 'var(--color-surface-muted, rgba(255,255,255,0.03))', border: '1px solid var(--color-border-default, rgba(255,255,255,0.06))' }}>
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                  <i className="fas fa-clock-rotate-left mr-2" style={{ color: '#f59e0b' }} />
                  世界时间线 & 剧情转折
                </h4>
                <span className="text-[10px] px-2 py-1 rounded-full"
                  style={{ backgroundColor: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.25)' }}>
                  ⚡ AI 辅助创作
                </span>
              </div>

              <p className="text-[11px] mb-4" style={{ color: 'var(--color-text-muted)' }}>
                使用 AI 生成戏剧性的随机事件或历史转折点，丰富你的世界观叙事。生成的事件可以关联角色和地点，成为故事的重要推动力。
              </p>

              {/* 随机事件生成按钮 */}
              <div className="flex gap-3 flex-wrap mb-4">
                <button
                  onClick={async () => {
                    if (!activeModel?.modelName) { onOpenSettings(); return; }
                    setIsGenerating('timeline');
                    setGenerating(activeModel.name, '生成随机事件...');
                    try {
                      const worldContext = [
                        `地点: ${project.locations.map(l => l.name).join(', ') || '未设定'}`,
                        `势力: ${project.factions.map(f => f.name).join(', ') || '未设定'}`,
                        `规则: ${project.ruleSystems.map(r => r.name).join(', ') || '未设定'}`,
                      ].join('\n');

                      const prompt = `基于以下小说世界设定，生成 3 个意想不到的"随机事件/历史转折点"。每个事件要求：
1. 标题（简短有力）
2. 描述（80-120字，具有戏剧性、能推动故事发展）
3. 时间标记（如："故事开始前100年"、"第三卷中期"等）

以 JSON 数组格式返回：
[{"title": "事件标题", "description": "详细描述", "timestamp": "时间点"}]

世界设定：
${worldContext}

仅返回 JSON 数组，不要其他文字。`;

                      const res = await aiService.generate({ model: activeModel, prompt, temperature: 0.9 });
                      if (res.content && !res.error) {
                        try {
                          const jsonMatch = res.content.match(/\[[\s\S]*\]/);
                          if (jsonMatch) {
                            const events = JSON.parse(jsonMatch[0]);
                            if (Array.isArray(events)) {
                              const newEvents = events.map((ev: any, i: number) => ({
                                id: `event-${Date.now()}-${i}`,
                                title: ev.title || `事件 ${i+1}`,
                                description: ev.description || '',
                                timestamp: ev.timestamp || '未知时间',
                                order: (project.timelineEvents?.length || 0) + i,
                              }));
                              onUpdate({ timelineEvents: [...(project.timelineEvents || []), ...newEvents] });
                            }
                          }
                        } catch { setError('AI 返回格式解析失败'); }
                        setComplete();
                      } else {
                        setError(res.error || '生成失败');
                      }
                    } catch (err: any) {
                      setError(err?.message || '随机事件生成失败');
                    } finally {
                      setIsGenerating(null);
                      resetStatus();
                    }
                  }}
                  disabled={!activeModel?.modelName}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[11px] font-medium transition-all border"
                  style={{
                    background: 'linear-gradient(135deg, rgba(245,158,11,0.15), rgba(245,158,11,0.08))',
                    borderColor: 'rgba(245,158,11,0.35)',
                    color: '#f59e0b',
                    opacity: activeModel?.modelName ? 1 : 0.5,
                  }}
                >
                  <i className="fas fa-bolt" />
                  ⚡ 生成随机事件
                </button>

                <button
                  onClick={() => {
                    const newEvent = {
                      id: `manual-${Date.now()}`,
                      title: '新事件',
                      description: '',
                      timestamp: '待定',
                      order: project.timelineEvents?.length || 0,
                    };
                    onUpdate({ timelineEvents: [...(project.timelineEvents || []), newEvent] });
                  }}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[11px] font-medium transition-all border"
                  style={{
                    backgroundColor: 'var(--color-surface-base)',
                    borderColor: 'var(--color-border-default)',
                    color: 'var(--color-text-secondary)',
                  }}
                >
                  <i className="fas fa-plus" />
                  手动添加事件
                </button>
              </div>

              {/* 时间线事件列表 */}
              {(project.timelineEvents?.length || 0) > 0 ? (
                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                  {project.timelineEvents!.map((event, idx) => (
                    <div key={event.id}
                      className="group rounded-xl p-3.5 transition-all duration-200"
                      style={{
                        backgroundColor: 'var(--color-surface-base, rgba(255,255,255,0.04))',
                        border: '1px solid var(--color-border-default, rgba(255,255,255,0.06))',
                      }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                            style={{
                              background: 'linear-gradient(135deg, rgba(245,158,11,0.2), rgba(245,158,11,0.1))',
                              border: '1px solid rgba(245,158,11,0.25)',
                            }}
                          >
                            <span className="text-xs font-bold" style={{ color: '#f59e0b' }}>{idx + 1}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-sm font-semibold truncate" style={{ color: 'var(--color-text-primary)' }}>
                                {event.title}
                              </span>
                              <span className="text-[9px] px-1.5 py-0.5 rounded shrink-0"
                                style={{
                                  backgroundColor: 'rgba(245,158,11,0.12)',
                                  color: '#f59e0b',
                                  border: '1px solid rgba(245,158,11,0.2)',
                                }}
                              >
                                <i className="fas fa-clock mr-1" style={{ fontSize: '8px' }} />
                                {event.timestamp}
                              </span>
                            </div>
                            {event.description && (
                              <p className="text-xs line-clamp-3" style={{ color: 'var(--color-text-secondary)' }}>
                                {event.description}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all shrink-0">
                          <button
                            onClick={() => {
                              const title = prompt('编辑事件标题:', event.title);
                              if (title !== null) {
                                const updated = project.timelineEvents!.map(e =>
                                  e.id === event.id ? { ...e, title } : e
                                );
                                onUpdate({ timelineEvents: updated });
                              }
                            }}
                            className="w-6 h-6 rounded-lg flex items-center justify-center hover:bg-white/10 transition-all"
                            style={{ color: 'var(--color-text-tertiary)' }}
                            title="编辑标题"
                          >
                            <i className="fas fa-pen text-[9px]"></i>
                          </button>
                          <button
                            onClick={() => {
                              const desc = prompt('编辑事件描述:', event.description);
                              if (desc !== null) {
                                const updated = project.timelineEvents!.map(e =>
                                  e.id === event.id ? { ...e, description: desc } : e
                                );
                                onUpdate({ timelineEvents: updated });
                              }
                            }}
                            className="w-6 h-6 rounded-lg flex items-center justify-center hover:bg-white/10 transition-all"
                            style={{ color: 'var(--color-text-tertiary)' }}
                            title="编辑描述"
                          >
                            <i className="fas fa-align-left text-[9px]"></i>
                          </button>
                          <button
                            onClick={() => {
                              const updated = project.timelineEvents!.filter(e => e.id !== event.id);
                              onUpdate({ timelineEvents: updated });
                            }}
                            className="w-6 h-6 rounded-lg flex items-center justify-center hover:bg-[var(--color-error)]/15 transition-all"
                            style={{ color: 'var(--color-text-tertiary)' }}
                            title="删除事件"
                          >
                            <i className="fas fa-trash-alt text-[9px]"></i>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8" style={{ color: 'var(--color-text-tertiary)' }}>
                  <i className="fas fa-clock-rotate-left text-3xl mb-3 opacity-30"></i>
                  <p className="text-sm">暂无时间线事件</p>
                  <p className="text-xs mt-1 opacity-50">点击上方按钮生成随机事件，或手动添加</p>
                </div>
              )}
            </div>
          </div>

          {/* 快速统计 */}
          {(() => {
            const stats = [
              { label: '地点', count: project.locations.length, icon: 'fa-map-marker-alt', color: '#34d399' },
              { label: '势力', count: project.factions.length, icon: 'fa-chess-rook', color: '#f59e0b' },
              { label: '规则', count: project.ruleSystems.length, icon: 'fa-gavel', color: '#22d3ee' },
              { label: '角色', count: project.characters?.filter(c => c.name !== '新角色' && c.name !== '未命名' && c.name.trim().length > 0).length || 0, icon: 'fa-users', color: 'var(--color-primary-300)' },
            ].filter(s => s.count > 0);
            if (stats.length === 0) return null;
            return (
          <div className="mt-8 max-w-5xl">
            <div className="rounded-2xl p-5"
              style={{ backgroundColor: 'var(--color-surface-muted, rgba(255,255,255,0.03))', border: '1px solid var(--color-border-default, rgba(255,255,255,0.06))' }}>
              <h4 className="text-sm font-semibold mb-3" style={{ color: 'var(--color-text-primary)' }}>
                <i className="fas fa-chart-pie mr-2 text-[var(--color-primary-400)]"></i>世界概览
              </h4>
              <div className="grid grid-cols-4 gap-4">
                {stats.map(stat => (
                  <div key={stat.label} className="text-center">
                    <div className="text-2xl font-black tabular-nums" style={{ color: stat.color }}>
                      {stat.count}
                    </div>
                    <div className="text-[10px] mt-1" style={{ color: 'var(--color-text-tertiary)' }}>
                      <i className={`fas ${stat.icon} mr-1`}></i>{stat.label}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
            );
          })()}
        </>
      ) : activeView === 'graph' ? (
        /* 关系图视图 */
        <div className="max-w-5xl">
          <div className="glass-card rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold" style={{ color: 'var(--color-text-primary)' }}>
                <i className="fas fa-project-diagram mr-2 text-[var(--color-primary-400)]"></i>势力-角色关系图
              </h3>
              <button
                onClick={() => setShowGraphModal(true)}
                className="btn-gradient text-[11px] px-3 py-1.5 rounded-lg"
              >
                <i className="fas fa-expand mr-1.5" />放大查看
              </button>
            </div>
            <SimpleRelationshipGraph
              factions={project.factions}
              characters={project.characters || []}
            />
            <p className="text-xs mt-4 text-center" style={{ color: 'var(--color-text-tertiary)' }}>
              关系图展示势力与角色之间的归属关系。在"角色"页面为角色指定所属势力后，此处自动更新。
            </p>
          </div>
        </div>
      ) : (
        /* 树状图视图 */
        <div className="max-w-5xl">
          {/* 地点树 */}
          {project.locations.length > 0 && (
            <div className="glass-card rounded-2xl p-5 mb-4">
              <h3 className="text-sm font-bold mb-4 flex items-center gap-2" style={{ color: '#34d399' }}>
                <i className="fas fa-map-marker-alt text-xs"></i>
                地点管理
                <span className="text-[10px] font-normal opacity-60">{project.locations.length} 项</span>
              </h3>
              <div className="space-y-2 pl-2" style={{ borderLeft: '2px solid rgba(52,211,153,0.3)' }}>
                {project.locations.map(loc => (
                  <div key={loc.id} className="relative pl-4">
                    <div className="absolute left-0 top-2 w-2 h-2 rounded-full" style={{ backgroundColor: '#34d399' }}></div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>{loc.name}</span>
                      {loc.type && <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ color: 'var(--color-text-tertiary)', backgroundColor: 'var(--color-surface-muted)' }}>{loc.type}</span>}
                    </div>
                    {loc.description && <p className="text-[11px] mt-0.5" style={{ color: 'var(--color-text-tertiary)' }}>{loc.description}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 势力树 */}
          {project.factions.length > 0 && (
            <div className="glass-card rounded-2xl p-5 mb-4">
              <h3 className="text-sm font-bold mb-4 flex items-center gap-2" style={{ color: '#f59e0b' }}>
                <i className="fas fa-chess-rook text-xs"></i>
                势力阵营
                <span className="text-[10px] font-normal opacity-60">{project.factions.length} 项</span>
              </h3>
              <div className="space-y-2 pl-2" style={{ borderLeft: '2px solid rgba(245,158,11,0.3)' }}>
                {project.factions.map(fac => (
                  <div key={fac.id} className="relative pl-4">
                    <div className="absolute left-0 top-2 w-2 h-2 rounded-full" style={{ backgroundColor: '#f59e0b' }}></div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>{fac.name}</span>
                      {fac.ideology && <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ color: 'var(--color-text-tertiary)', backgroundColor: 'var(--color-surface-muted)' }}>{fac.ideology}</span>}
                    </div>
                    {fac.description && <p className="text-[11px] mt-0.5" style={{ color: 'var(--color-text-tertiary)' }}>{fac.description}</p>}
                    {/* 显示归属该势力的角色 */}
                    {(() => {
                      const members = (project.characters || []).filter(c => c.factionId === fac.id && c.name !== '新角色');
                      if (members.length === 0) return null;
                      return (
                        <div className="mt-1.5 pl-3 space-y-1" style={{ borderLeft: '1px dashed rgba(245,158,11,0.2)' }}>
                          {members.map(m => (
                            <div key={m.id} className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>
                              <i className="fas fa-user text-[8px]" style={{ color: 'var(--color-primary-300)' }}></i>
                              {m.name}
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 规则树 */}
          {project.ruleSystems.length > 0 && (
            <div className="glass-card rounded-2xl p-5 mb-4">
              <h3 className="text-sm font-bold mb-4 flex items-center gap-2" style={{ color: '#22d3ee' }}>
                <i className="fas fa-gavel text-xs"></i>
                规则体系
                <span className="text-[10px] font-normal opacity-60">{project.ruleSystems.length} 项</span>
              </h3>
              <div className="space-y-2 pl-2" style={{ borderLeft: '2px solid rgba(34,211,238,0.3)' }}>
                {project.ruleSystems.map(rule => (
                  <div key={rule.id} className="relative pl-4">
                    <div className="absolute left-0 top-2 w-2 h-2 rounded-full" style={{ backgroundColor: '#22d3ee' }}></div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>{rule.name}</span>
                      {rule.type && <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ color: 'var(--color-text-tertiary)', backgroundColor: 'var(--color-surface-muted)' }}>{rule.type}</span>}
                    </div>
                    {rule.description && <p className="text-[11px] mt-0.5" style={{ color: 'var(--color-text-tertiary)' }}>{rule.description}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 无数据提示 */}
          {project.locations.length === 0 && project.factions.length === 0 && project.ruleSystems.length === 0 && (
            <div className="glass-card rounded-2xl p-12 text-center">
              <i className="fas fa-sitemap text-3xl mb-3" style={{ color: 'var(--color-text-muted)', opacity: 0.3 }}></i>
              <p className="font-bold" style={{ color: 'var(--color-text-secondary)' }}>暂无世界数据</p>
              <p className="text-xs mt-2" style={{ color: 'var(--color-text-tertiary)' }}>在卡片视图中创建地点、势力和规则后，此处将自动生成树状结构</p>
            </div>
          )}
        </div>
      )}

      {/* 关系图大窗口弹窗 */}
      <GraphModal
        isOpen={showGraphModal}
        onClose={() => setShowGraphModal(false)}
        factions={project.factions}
        characters={project.characters || []}
      />
    </div>
  );
};

export default StepWorld;
