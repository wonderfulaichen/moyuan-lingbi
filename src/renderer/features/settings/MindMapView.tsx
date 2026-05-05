import React, { useMemo, useCallback } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  Node,
  Edge,
  NodeProps,
  Handle,
  Position,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { BubbleFolder as BubbleFolderType, ContentCard } from '../../../shared/types';

// ===== 节点颜色 =====
const COLORS = ['#34d399', 'var(--color-primary-300)', '#60a5fa', '#f59e0b', '#f87171', '#22d3ee', '#f472b6'];

// ===== 自定义节点组件 =====
interface FolderData { label: string; count: number; color: string; isRoot: boolean }
interface FileData { label: string }

const FolderNode: React.FC<NodeProps> = ({ data }) => {
  const d = data as unknown as FolderData;
  return (
  <div
    className="rounded-xl px-4 py-2.5 shadow-lg transition-all hover:scale-105"
    style={{
      backgroundColor: `${d.color}18`,
      border: `1.5px solid ${d.color}50`,
      minWidth: 90,
    }}
  >
    <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
    <div className="flex items-center gap-2">
      <i className={`fas ${d.isRoot ? 'fa-folder-open' : 'fa-folder'} text-xs`} style={{ color: d.color }}></i>
      <span className="text-xs font-semibold whitespace-nowrap" style={{ color: 'var(--color-text-primary)' }}>{d.label}</span>
      {d.count > 0 && (
        <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: `${d.color}25`, color: d.color }}>
          {d.count}
        </span>
      )}
    </div>
    <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
  </div>
);
};

const FileNode: React.FC<NodeProps> = ({ data }) => {
  const d = data as unknown as FileData;
  return (
  <div
    className="rounded-lg px-3 py-1.5 shadow transition-all hover:scale-105"
    style={{
      backgroundColor: 'var(--color-surface-hover)',
      border: '1px solid var(--color-border-default)',
    }}
  >
    <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
    <div className="flex items-center gap-1.5">
      <i className="fas fa-file-lines text-[8px]" style={{ color: 'var(--color-text-tertiary)' }}></i>
      <span className="text-[10px] whitespace-nowrap" style={{ color: 'var(--color-text-tertiary)' }}>{d.label}</span>
    </div>
    <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
  </div>
);
};

const nodeTypes = {
  folder: FolderNode,
  file: FileNode,
} as any;

// ===== 计算树布局 =====
interface LayoutNode {
  id: string;
  label: string;
  type: 'folder' | 'file';
  color: string;
  isRoot: boolean;
  count: number;
  children: LayoutNode[];
  x: number;
  y: number;
}

const NODE_W = 150;
const NODE_H = 44;
const H_GAP = 60;
const V_GAP = 12;

function buildTree(folder: BubbleFolderType): LayoutNode {
  const build = (node: BubbleFolderType, depth: number): LayoutNode => {
    const nodeCards = (node.contentCards || []).filter(c => c.isFavorited);
    const children = node.children || [];
    return {
      id: node.id,
      label: node.name,
      type: 'folder',
      color: COLORS[depth % COLORS.length],
      isRoot: depth === 0,
      count: nodeCards.length,
      children: [
        ...nodeCards.map((card, _ci) => ({
          id: card.id,
          label: card.title,
          type: 'file' as const,
          color: COLORS[depth % COLORS.length],
          isRoot: false,
          count: 0,
          children: [] as LayoutNode[],
          x: 0,
          y: 0,
        })),
        ...children.map(child => build(child, depth + 1)),
      ],
      x: 0,
      y: 0,
    };
  };
  return build(folder, 0);
}

function calcLayout(node: LayoutNode, x: number, yStart: number): number {
  node.x = x;
  node.y = yStart;

  if (node.children.length === 0) {
    return yStart + NODE_H;
  }

  let childY = yStart;
  for (const child of node.children) {
    const h = calcLayout(child, x + NODE_W + H_GAP, childY);
    childY = h;
  }

  // 居中父节点在子节点中间
  const firstChildY = node.children[0].y;
  const lastChildY = node.children[node.children.length - 1].y + NODE_H;
  node.y = firstChildY + (lastChildY - firstChildY) / 2 - NODE_H / 2;

  return childY;
}

interface MindMapViewProps {
  folder: BubbleFolderType;
  onSelectFolder: (id: string) => void;
}

const MindMapView: React.FC<MindMapViewProps> = ({ folder, onSelectFolder }) => {
  const { nodes: initialNodes, edges: initialEdges } = useMemo(() => {
    const tree = buildTree(folder);
    calcLayout(tree, 20, 20);

    const nodes: Node[] = [];
    const edges: Edge[] = [];

    const flatten = (node: LayoutNode, parentId?: string) => {
      if (node.type === 'folder') {
        nodes.push({
          id: node.id,
          type: 'folder',
          position: { x: node.x, y: node.y },
          data: { label: node.label, count: node.count, color: node.color, isRoot: node.isRoot },
        });
      } else {
        nodes.push({
          id: node.id,
          type: 'file',
          position: { x: node.x, y: node.y },
          data: { label: node.label },
        });
      }
      if (parentId) {
        edges.push({
          id: `e-${parentId}-${node.id}`,
          source: parentId,
          target: node.id,
          type: 'smoothstep',
          animated: false,
          style: { stroke: 'var(--color-border-default)', strokeWidth: 1.5 },
          markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--color-text-tertiary)', width: 12, height: 12 },
        });
      }
      const currentNode = node;
      if (currentNode.children) {
        for (const child of currentNode.children) {
          flatten(child, node.id);
        }
      }
    };

    flatten(tree);
    return { nodes, edges };
  }, [folder]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const onNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
    if (node.type === 'folder' && node.id !== folder.id) {
      onSelectFolder(node.id);
    }
  }, [folder.id, onSelectFolder]);

  return (
    <div className="h-full w-full rounded-2xl overflow-hidden" style={{ minHeight: 400 }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        minZoom={0.3}
        maxZoom={2}
        panOnDrag
        selectNodesOnDrag={false}
      >
        <Background color="var(--color-border-default)" gap={24} />
        <Controls
          className="!bg-transparent !border-none"
          style={{
            '--xy-controls-button-bg': 'var(--color-surface-muted)',
            '--xy-controls-button-color': 'var(--color-text-secondary)',
            '--xy-controls-button-hover-bg': 'var(--color-surface-hover)',
          } as React.CSSProperties}
        />
        <MiniMap
          nodeColor={(node) => {
            if (node.type === 'folder') return ((node as any).data?.color) || 'var(--color-primary-300)';
            return 'var(--color-text-tertiary)';
          }}
          maskColor="var(--color-surface-overlay)"
          style={{ backgroundColor: 'var(--color-surface-muted)' }}
        />
      </ReactFlow>
    </div>
  );
};

export default MindMapView;
