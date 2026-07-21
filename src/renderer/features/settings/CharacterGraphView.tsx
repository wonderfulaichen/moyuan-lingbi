import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ContentCard } from '../../../shared/types';
import { ROLE_COLORS, getRoleColor } from '../../shared/constants/roleColors';

interface ParsedCharacter {
  id: string;
  name: string;
  role: string;
  gender: string;
  content: string;
  relationships: string;
}

function extractRealNameFromContent(content: string, fileTitle: string): string {
  const shortTitle = fileTitle.replace(/^[【\[［]\d+[/／]\d+[】\]］]\s*[：:]\s*/).trim();
  if (shortTitle.length >= 2 && shortTitle.length <= 15 && !/^(?:一、|二、|三、|##\s*)/.test(shortTitle)) {
    return shortTitle;
  }

  const bracketName = content.match(/【([^】]{2,10})】/);
  if (bracketName && !/^(?:角色类型|主角|女主|反派|配角)$/.test(bracketName[1])) {
    return bracketName[1];
  }

  const h2Match = content.match(/^#{1,3}\s+(.+)$/m);
  if (h2Match) {
    let name = h2Match[1].trim();
    name = name.replace(/^[【\[［]\d+[/／]\d+[】\]］]\s*[：:]\s*创建\s*(?:角色|人物|档案)?\s*(?:主角|后母|伪圣子|小师弟|死对头|药峰之主|之主)?[：:\s]*/, '');
    name = name.replace(/^【[^】]*】\s*/, '').replace(/[（(][^）)]*[）)]/g, '').trim();
    if (name.length >= 2 && name.length <= 15 && !/[【】\[\]()#]/.test(name) && !/^(?:一、|二、|三、|基础信息)$/.test(name)) return name;
  }

  return fileTitle;
}

function extractRelationships(content: string): string {
  const patterns = [
    /##\s*[^\n]*与其他角色[^\n]*的关系\s*\n([\s\S]*?)(?=##|\Z)/i,
    /##\s*[^\n]*关系(?:网络|图谱|表)\s*\n([\s\S]*?)(?=##|\Z)/i,
    /\|[^\n]*角色[^\n]*\|[^\n]*关系[^\n]*\|[^\n]*\|\n((?:\|.*\|.*\|.*\|\n?)+)/i,
    /^\s*[-*]\s*\*\*与其他角色的?\s*(?:关系|社交)[^\n]*\*\*[：:]\s*\n([\s\S]*?)(?=\n\s*[-*]|\n\n|\Z)/im,
  ];
  for (const p of patterns) {
    const m = content.match(p);
    if (m) return m[1].trim();
  }
  return content;
}

function parseCardToCharacter(card: ContentCard, allCardTitles: string[]): ParsedCharacter {
  const text = `${card.title} ${card.tagText} ${card.content}`;

  let role = '配角';
  const rolePattern = /【\s*角色类型\s*[：:]\s*(主角|女主|反派配角|反派|配角)\s*】/;
  const match = text.match(rolePattern);
  if (match) {
    role = match[1];
  }

  let gender = '';
  if (/男[主人角]/.test(text) || /性别[：:]\s*男/.test(text)) gender = '男';
  else if (/女[主人角]/.test(text) || /性别[：:]\s*女/.test(text)) gender = '女';

  const realName = extractRealNameFromContent(card.content || '', card.title);
  const relText = extractRelationships(card.content || '');

  return { id: card.id, name: realName, role, gender, content: card.content, relationships: relText };
}

interface GraphNode {
  id: string;
  name: string;
  description: string;
  x: number;
  y: number;
  color: string;
  size: number;
  data: ParsedCharacter;
}

interface GraphLink {
  id: string;
  source: string;
  target: string;
  label: string;
}

interface CharacterGraphViewProps {
  cards: ContentCard[];
  isModal?: boolean;
}

const CharacterGraphView: React.FC<CharacterGraphViewProps> = ({ cards, isModal = false }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [nodePositions, setNodePositions] = useState<Record<string, { x: number; y: number }>>({});
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);

  const dragRef = useRef<{ nodeId: string; startMouseX: number; startMouseY: number; startNodeX: number; startNodeY: number; hasMoved: boolean } | null>(null);
  const dimensionsRef = useRef(dimensions);
  dimensionsRef.current = dimensions;
  const nodePositionsRef = useRef(nodePositions);
  nodePositionsRef.current = nodePositions;

  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setDimensions({ width: rect.width || 800, height: rect.height || 600 });
      }
    };
    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  const { nodes, links } = useMemo(() => {
    const allTitles = cards.map(c => c.title);
    const chars = cards.map(c => parseCardToCharacter(c, allTitles));

    const cx = dimensions.width / 2;
    const cy = dimensions.height / 2;

    const nodeList: GraphNode[] = chars.map((c, i) => {
      const angle = (i / Math.max(chars.length, 1)) * 2 * Math.PI - Math.PI / 2;
      const radius = Math.min(dimensions.width, dimensions.height) * 0.32;
      return {
        id: c.id,
        name: c.name,
        description: `${c.role}${c.gender ? `（${c.gender}）` : ''}`,
        x: nodePositions[c.id]?.x ?? cx + radius * Math.cos(angle),
        y: nodePositions[c.id]?.y ?? cy + radius * Math.sin(angle),
        color: getRoleColor(c.role),
        size: c.role.includes('主') || c.role.includes('女') ? 36 : 28,
        data: c,
      };
    });

    const linkList: GraphLink[] = [];
    const relKeywords = ['友', '敌', '恋', '师', '徒', '亲', '兄', '弟', '姐', '妹', '夫', '妻', '同', '盟', '仇', '属', '主', '仆', '搭档', '对手', '宿敌', '挚友', '爱人', '追求者', '单恋', '恩人', '仇人'];
    const seenPairs = new Set<string>();

    chars.forEach(c => {
      chars.filter(o => o.id !== c.id).forEach(other => {
        const pairKey = [c.id, other.id].sort().join('-');
        if (seenPairs.has(pairKey)) return;

        let label = '';
        let found = false;
        const searchIn = c.relationships || `${c.name} ${c.content}`;

        if (searchIn.includes(other.name)) {
          found = true;
          const idx = searchIn.indexOf(other.name);
          if (idx >= 0) {
            const before = searchIn.slice(Math.max(0, idx - 10), idx);
            for (const kw of relKeywords) { if (before.includes(kw)) { label = kw; break; } }
            if (!label) {
              const after = searchIn.slice(idx + other.name.length, idx + other.name.length + 10);
              for (const kw of relKeywords) { if (after.includes(kw)) { label = kw; break; } }
            }
          }
        }

        if (!found && c.content.includes(other.name)) {
          found = true;
          label = '关联';
        }

        if (found) {
          seenPairs.add(pairKey);
          linkList.push({ id: `link-${pairKey}`, source: c.id, target: other.id, label: label || '关联' });
        }
      });
    });

    return { nodes: nodeList, links: linkList };
  }, [cards, dimensions, nodePositions]);

  useEffect(() => {
    if (nodes.length === 0) return;
    let animId: number;
    let iter = 0;
    const maxIter = 80;

    const step = () => {
      if (iter >= maxIter) return;
      iter++;
      const dims = dimensionsRef.current;
      const cx = dims.width / 2;
      const cy = dims.height / 2;

      setNodePositions(prev => {
        const pos = { ...prev };
        const k = 0.04;
        const repulse = 12000;
        const minDist = 140;
        const dragId = dragRef.current?.nodeId ?? null;

        nodes.forEach(n => {
          if (dragId === n.id) return;
          let fx = 0, fy = 0;
          const x = pos[n.id]?.x ?? n.x;
          const y = pos[n.id]?.y ?? n.y;

          fx += (cx - x) * k * 0.06;
          fy += (cy - y) * k * 0.06;

          nodes.forEach(o => {
            if (o.id === n.id) return;
            const ox = pos[o.id]?.x ?? o.x;
            const oy = pos[o.id]?.y ?? o.y;
            const dx = x - ox, dy = y - oy;
            const d = Math.sqrt(dx * dx + dy * dy) || 1;
            const f = repulse / (d * d);
            const hardRepulse = d < minDist ? (minDist - d) * 0.15 : 0;
            fx += (dx / d) * (f + hardRepulse);
            fy += (dy / d) * (f + hardRepulse);
          });

          links.forEach(l => {
            if (l.source !== n.id && l.target !== n.id) return;
            const otherId = l.source === n.id ? l.target : l.source;
            const other = nodes.find(nn => nn.id === otherId);
            if (!other) return;
            const ox = pos[otherId]?.x ?? other.x;
            const oy = pos[otherId]?.y ?? other.y;
            const dx = ox - x, dy = oy - y;
            const d = Math.sqrt(dx * dx + dy * dy) || 1;
            const targetDist = 180;
            const spring = (d - targetDist) * k * 0.3;
            fx += (dx / d) * spring;
            fy += (dy / d) * spring;
          });

          const margin = 80;
          pos[n.id] = {
            x: Math.max(margin, Math.min(dims.width - margin, x + fx)),
            y: Math.max(margin, Math.min(dims.height - margin, y + fy)),
          };
        });
        return pos;
      });
      animId = requestAnimationFrame(step);
    };

    const t = setTimeout(step, 150);
    return () => { clearTimeout(t); cancelAnimationFrame(animId); };
  }, [nodes.length]);

  const getNodePos = useCallback((id: string) => nodePositions[id] ?? nodes.find(n => n.id === id), [nodePositions, nodes]);

  const selectedNode = useMemo(() => nodes.find(n => n.id === selectedNodeId) ?? null, [selectedNodeId, nodes]);

  const relatedData = useMemo(() => {
    if (!selectedNodeId) return { nodeIds: new Set<string>(), linkIds: new Set<string>() };
    const ns = new Set<string>([selectedNodeId]);
    const ls = new Set<string>();
    links.forEach(l => {
      if (l.source === selectedNodeId) { ns.add(l.target); ls.add(l.id); }
      else if (l.target === selectedNodeId) { ns.add(l.source); ls.add(l.id); }
    });
    return { nodeIds: ns, linkIds: ls };
  }, [selectedNodeId, links]);

  const handleMouseDown = useCallback((e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation();
    e.preventDefault();
    const el = e.currentTarget as SVGGElement;
    const st = window.getComputedStyle(el);
    const m = st.transform.match(/matrix\(([^,]+),\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^)]+)\)/);
    let startX = dimensionsRef.current.width / 2;
    let startY = dimensionsRef.current.height / 2;
    if (m) { startX = parseFloat(m[5]); startY = parseFloat(m[6]); }
    dragRef.current = { nodeId, startMouseX: e.clientX, startMouseY: e.clientY, startNodeX: startX, startNodeY: startY, hasMoved: false };
    setDraggingId(nodeId);
  }, []);

  useEffect(() => {
    const handleGlobalMove = (e: MouseEvent) => {
      const drag = dragRef.current;
      if (!drag || !svgRef.current) return;
      drag.hasMoved = true;
      const dims = dimensionsRef.current;
      const dx = e.clientX - drag.startMouseX;
      const dy = e.clientY - drag.startMouseY;
      const margin = 50;
      const newX = Math.max(margin, Math.min(dims.width - margin, drag.startNodeX + dx));
      const newY = Math.max(margin, Math.min(dims.height - margin, drag.startNodeY + dy));
      const g = svgRef.current.querySelector(`g[data-node-id="${drag.nodeId}"]`) as SVGGElement | null;
      if (g) { g.style.transform = `translate(${newX}px,${newY}px)`; }

      const connectedLinks = svgRef.current.querySelectorAll(`g[data-link-id]`);
      connectedLinks.forEach((lg) => {
        const linkEl = lg as SVGGElement;
        const linkId = linkEl.getAttribute('data-link-id') || '';
        const link = links.find(l => l.id === linkId);
        if (!link || (link.source !== drag.nodeId && link.target !== drag.nodeId)) return;
        const otherId = link.source === drag.nodeId ? link.target : link.source;
        const otherG = svgRef.current!.querySelector(`g[data-node-id="${otherId}"]`) as SVGGElement | null;
        if (!otherG) return;
        const otherSt = window.getComputedStyle(otherG);
        const om = otherSt.transform.match(/matrix\(([^,]+),\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^)]+)\)/);
        if (!om) return;
        const ox = parseFloat(om[5]), oy = parseFloat(om[6]);
        const line = linkEl.querySelector('line');
        const text = linkEl.querySelector('text');
        if (line) {
          if (link.source === drag.nodeId) { line.setAttribute('x1', String(newX)); line.setAttribute('y1', String(newY)); line.setAttribute('x2', String(ox)); line.setAttribute('y2', String(oy)); }
          else { line.setAttribute('x1', String(ox)); line.setAttribute('y1', String(oy)); line.setAttribute('x2', String(newX)); line.setAttribute('y2', String(newY)); }
        }
        if (text) { text.setAttribute('x', String((newX + ox) / 2)); text.setAttribute('y', String((newY + oy) / 2)); }
      });
    };

    const handleGlobalUp = () => {
      const drag = dragRef.current;
      if (!drag) return;
      const g = svgRef.current?.querySelector(`g[data-node-id="${drag.nodeId}"]`) as SVGGElement | null;
      let finalX = drag.startNodeX;
      let finalY = drag.startNodeY;
      if (g) {
        const st = window.getComputedStyle(g);
        const m = st.transform.match(/matrix\(([^,]+),\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^)]+)\)/);
        if (m) { finalX = parseFloat(m[5]); finalY = parseFloat(m[6]); }
      }
      setNodePositions(prev => ({ ...prev, [drag.nodeId]: { x: finalX, y: finalY } }));
      if (drag.hasMoved) {
        setSelectedNodeId(drag.nodeId);
      } else {
        setSelectedNodeId(prev => prev === drag.nodeId ? null : drag.nodeId);
      }
      dragRef.current = null;
      setDraggingId(null);
    };

    window.addEventListener('mousemove', handleGlobalMove);
    window.addEventListener('mouseup', handleGlobalUp);
    return () => {
      window.removeEventListener('mousemove', handleGlobalMove);
      window.removeEventListener('mouseup', handleGlobalUp);
    };
  }, [links]);

  if (cards.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center">
        <i className="fas fa-users text-5xl mb-4" style={{ color: 'var(--color-text-muted)', opacity: 0.2 }}></i>
        <p className="text-sm font-bold mb-1" style={{ color: 'var(--color-text-secondary)' }}>暂无角色数据</p>
        <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>在 AI 生成中创建角色后即可查看关系图谱</p>
      </div>
    );
  }

  return (
    <div className={isModal ? 'h-full w-full relative flex' : 'h-full w-full rounded-2xl relative flex'} style={{ minHeight: isModal ? undefined : 400, overflow: 'hidden' }}>
      {/* 绘图区域 */}
      <div ref={containerRef} className="flex-1 relative" style={{ backgroundColor: 'var(--color-surface-base)', overflow: 'hidden' }}>
        <svg ref={svgRef} className="w-full h-full cursor-grab active:cursor-grabbing">
          <defs>
            <filter id="cg-glow"><feGaussianBlur stdDeviation="3" result="c"/><feMerge><feMergeNode in="c"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
          </defs>

          {/* 连线 */}
          {links.map(link => {
            const s = getNodePos(link.source), t = getNodePos(link.target);
            if (!s || !t) return null;
            const isRel = relatedData.linkIds.has(link.id);
            const dimmed = !draggingId && !!selectedNodeId && !isRel;
            return (
              <g key={link.id} data-link-id={link.id}>
                <line x1={s.x} y1={s.y} x2={t.x} y2={t.y}
                  stroke={isRel ? 'var(--color-primary-400)' : 'var(--color-primary-200)'}
                  strokeWidth={isRel ? 2.5 : 1.5}
                  opacity={dimmed ? 0.15 : isRel ? 1 : 0.55} />
                <text x={(s.x + t.x) / 2} y={(s.y + t.y) / 2}
                  fill="var(--color-text-secondary)" fontSize="10" textAnchor="middle" fontWeight="500"
                  opacity={dimmed ? 0.1 : 0.85}>{link.label}</text>
              </g>
            );
          })}

          {/* 节点 */}
          {nodes.map(node => {
            const pos = getNodePos(node.id);
            if (!pos) return null;
            const sel = selectedNodeId === node.id || draggingId === node.id;
            const rel = relatedData.nodeIds.has(node.id);
            const dimmed = !draggingId && !!selectedNodeId && !rel;
            const sz = sel ? node.size * 1.25 : node.size;

            return (
              <g key={node.id} data-node-id={node.id}
                className={`cursor-pointer ${draggingId === node.id ? 'cursor-grabbing' : ''}`}
                onMouseDown={(e) => handleMouseDown(e, node.id)}
                style={{ opacity: dimmed ? 0.15 : 1, pointerEvents: draggingId && draggingId !== node.id ? 'none' : 'auto', transform: `translate(${pos.x}px,${pos.y}px)` }}>

                {sel && <circle r={sz + 10} fill={node.color} opacity={0.25} filter="url(#cg-glow)" />}
                <circle r={sz} fill={node.color} className="transition-all" />
                <circle r={sz * 0.72} fill="var(--color-surface-base)" />
                <text dy=".12em" textAnchor="middle" fill="white" fontSize={sz * 0.45} className="select-none pointer-events-none">❤</text>

                <text y={sz + 16} textAnchor="middle" fill="var(--color-text-primary)" fontSize="12" fontWeight="bold" className="select-none pointer-events-none">{node.name}</text>
                <text y={sz + 30} textAnchor="middle" fill="var(--color-primary-400)" fontSize="10" fontWeight="500" className="select-none pointer-events-none">{node.description}</text>
              </g>
            );
          })}
        </svg>

        {/* 图例 */}
        <div className="absolute px-3 py-2.5 rounded-xl text-[10px] font-medium" style={{ bottom: 10, left: 10, backgroundColor: 'var(--color-surface-base)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.15)', boxShadow: '0 4px 16px rgba(0,0,0,0.25)', color: 'var(--color-text-primary)' }}>
          <div className="mb-1.5 text-[9px]" style={{ color: 'var(--color-text-muted)', fontWeight: 600 }}>角色</div>
          {Object.entries(ROLE_COLORS).map(([k, v]) => (
            <div key={k} className="flex items-center gap-2 mb-1"><span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: v }}></span><span>{k}</span></div>
          ))}
        </div>

        {!isModal && (
          <button
            onClick={() => setShowModal(true)}
            className="absolute px-2.5 py-1 rounded-md text-[10px] font-medium transition-all border-none cursor-pointer"
            style={{ top: 6, right: 6, backgroundColor: 'rgba(99,102,241,0.9)', color: '#fff' }}
          >
            <i className="fas fa-expand mr-1" />放大
          </button>
        )}
      </div>

      {/* 右侧详情面板 */}
      {selectedNode && (
        <div className="w-72 shrink-0 flex flex-col animate-in slide-in-from-right duration-300 overflow-hidden"
          style={{ backgroundColor: 'var(--color-surface-base)', borderLeft: '1px solid rgba(255,255,255,0.12)', boxShadow: '-2px 0 12px rgba(0,0,0,0.2)' }}>
          <div className="p-5 shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.12)' }}>
            <div className="flex items-center gap-2.5 mb-3">
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: selectedNode.color }}></span>
              <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>角色</span>
            </div>
            <h3 className="text-xl font-black" style={{ color: 'var(--color-text-primary)' }}>{selectedNode.name}</h3>
            <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>{selectedNode.data.role}{selectedNode.data.gender ? `（${selectedNode.data.gender}）` : ''}</p>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-5 custom-scrollbar">
            <div>
              <h4 className="text-[10px] font-bold uppercase mb-2" style={{ color: 'var(--color-text-muted)' }}>性格特征</h4>
              <p className="text-xs leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--color-text-secondary)' }}>
                {selectedNode.data.content || '未设置'}
              </p>
            </div>

            <div>
              <h4 className="text-[10px] font-bold uppercase mb-2" style={{ color: 'var(--color-text-muted)' }}>关系网络</h4>
              <p className="text-xs leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--color-text-secondary)' }}>
                {links.filter(l => l.source === selectedNode.id || l.target === selectedNode.id).map(l => {
                  const otherId = l.source === selectedNode.id ? l.target : l.source;
                  const other = nodes.find(n => n.id === otherId);
                  return other ? `${other.name}：${l.label}` : '';
                }).join('；') || '暂无关系'}
              </p>
            </div>

            <div>
              <h4 className="text-[10px] font-bold uppercase mb-2" style={{ color: 'var(--color-text-muted)' }}>
                相关节点 ({relatedData.nodeIds.size - 1})
              </h4>
              <div className="space-y-1.5">
                {Array.from(relatedData.nodeIds).filter(id => id !== selectedNode.id).map(nid => {
                  const n = nodes.find(nn => nn.id === nid);
                  if (!n) return null;
                  return (
                    <div key={nid} onClick={() => setSelectedNodeId(nid)}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-all"
                      style={{ backgroundColor: 'var(--color-surface-hover)', border: '1px solid transparent' }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'transparent'; }}>
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: n.color }}></span>
                      <span className="text-xs truncate" style={{ color: 'var(--color-text-secondary)' }}>{n.name}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="p-5 shrink-0" style={{ borderTop: '1px solid rgba(255,255,255,0.12)' }}>
            <button onClick={() => setSelectedNodeId(null)}
              className="w-full py-2.5 rounded-xl text-xs font-bold transition-all"
              style={{
                background: 'var(--color-surface-hover)',
                border: '1px solid rgba(255,255,255,0.12)',
                color: 'var(--color-text-secondary)',
              }}>
              关闭详情
            </button>
          </div>
        </div>
      )}

      {createPortal(showModal && (
        <>
          <div
            className="fixed inset-0 z-[99999]"
            style={{ backgroundColor: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)' }}
            onClick={() => setShowModal(false)}
          />
          <div
            className="fixed z-[100000] rounded-3xl shadow-2xl flex flex-col animate-fade-in overflow-hidden"
            style={{
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: '82vw',
              height: '82vh',
              maxWidth: 1200,
              maxHeight: 800,
              backgroundColor: 'var(--color-surface-base)',
              border: '1px solid rgba(255,255,255,0.12)',
              boxShadow: '0 30px 90px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)',
            }}
          >
            <div className="flex items-center justify-between px-5 py-3 border-b shrink-0" style={{ borderColor: 'rgba(255,255,255,0.12)', background: 'var(--color-surface-hover)' }}>
              <div className="flex items-center gap-2.5">
                <span className="px-2 py-0.5 rounded text-[10px] font-medium" style={{ background: 'var(--color-primary-100)', color: 'var(--color-primary-500)' }}>
                  关系图谱
                </span>
                <span className="text-[13px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>角色关系图谱</span>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center cursor-pointer transition-all"
                style={{ background: 'var(--color-surface-hover)', color: 'var(--color-text-muted)', border: '1px solid transparent' }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'; e.currentTarget.style.background = 'rgba(239,68,68,0.15)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.background = 'var(--color-surface-hover)'; }}
              >
                <i className="fas fa-times text-sm" />
              </button>
            </div>

            <div className="flex-1 overflow-hidden" style={{ minHeight: 0, background: 'var(--color-surface-base)' }}>
              <CharacterGraphView cards={cards} isModal={true} />
            </div>

            <div className="px-5 py-2.5 border-t text-[11px] text-center" style={{ borderColor: 'rgba(255,255,255,0.12)', color: 'var(--color-text-muted)', background: 'var(--color-surface-hover)' }}>
              点击节点查看详情 · 拖动节点调整位置 · 点击空白处关闭
            </div>
          </div>
        </>
      ), document.body)}
    </div>
  );
};

export default CharacterGraphView;
