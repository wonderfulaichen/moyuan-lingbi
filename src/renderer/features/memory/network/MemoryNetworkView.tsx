import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  useNodesState,
  useEdgesState,
  Controls,
  Background,
  MiniMap,
  Edge,
  Connection,
  MarkerType,
  Panel,
  Node,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { nodeTypes } from './nodeTypes';
import NetworkFilterPanel from './NetworkFilterPanel';
import NetworkSearchBar from './NetworkSearchBar';
import NetworkLayoutControls from './NetworkLayoutControls';
import NetworkNodeDetails from './NetworkNodeDetails';
import { MemoryNetworkService, MemoryNetworkNodeType, RelationshipType } from '../../../shared/services/MemoryNetworkService';
import { dataService } from '../../../shared/services/DataService';
import { memoryBankService } from '../../../shared/services/MemoryBankService';
import { useTheme } from '../../../shared/contexts/ThemeContext';
import { useUIStore } from '../../../shared/stores/uiStore';
import { RELATIONSHIP_COLORS, RELATIONSHIP_LABELS } from '../../../shared/constants/relationshipColors';

interface MemoryNetworkViewProps {
  projectId: string;
}

const getLayoutedNodes = (nodes: any[], edges: any[]) => {
  const width = 800;
  const height = 600;
  const centerX = width / 2;
  const centerY = height / 2;

  const characterNodes = nodes.filter((n) => n.type === 'character');
  const plotNodes = nodes.filter((n) => n.type === 'plot');
  const locationNodes = nodes.filter((n) => n.type === 'location');

  const result: any[] = [];

  const characterRadius = 200;
  characterNodes.forEach((node, i) => {
    const angle = (i / characterNodes.length) * 2 * Math.PI - Math.PI / 2;
    result.push({
      ...node,
      position: {
        x: centerX + characterRadius * Math.cos(angle) - 128,
        y: centerY + characterRadius * Math.sin(angle) - 60,
      },
    });
  });

  const plotRadius = 350;
  plotNodes.forEach((node, i) => {
    const angle = (i / plotNodes.length) * 2 * Math.PI - Math.PI / 2;
    result.push({
      ...node,
      position: {
        x: centerX + plotRadius * Math.cos(angle) - 120,
        y: centerY + plotRadius * Math.sin(angle) - 55,
      },
    });
  });

  const locationRadius = 100;
  locationNodes.forEach((node, i) => {
    const angle = (i / locationNodes.length) * 2 * Math.PI - Math.PI / 2;
    result.push({
      ...node,
      position: {
        x: centerX + locationRadius * Math.cos(angle) - 112,
        y: centerY + locationRadius * Math.sin(angle) - 45,
      },
    });
  });

  if (result.length === 0) {
    return nodes.map((node) => ({
      ...node,
      position: { x: centerX - 100, y: centerY - 50 },
    }));
  }

  return result;
};

const MemoryNetworkViewContent: React.FC<MemoryNetworkViewProps> = ({ projectId }) => {
  const { themeInfo } = useTheme();
  const { animationLevel } = useUIStore();
  const hasAnimations = animationLevel !== 'none';
  
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [originalNodes, setOriginalNodes] = useState<Node[]>([]);
  const [originalEdges, setOriginalEdges] = useState<Edge[]>([]);
  const [filters, setFilters] = useState({ character: true, plot: true, location: true });
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const { fitView, getNode, setCenter } = useReactFlow();

  const loadNetworkData = useCallback(async () => {
    try {
      setLoading(true);
      const atomic = await memoryBankService.loadAtomicMemory(projectId);
      
      if (!atomic) {
        setNodes([]);
        setOriginalNodes([]);
        setEdges([]);
        setOriginalEdges([]);
        return;
      }

      const network = MemoryNetworkService.buildNetwork(atomic);

      const flowNodes = network.nodes.map((node) => ({
        id: node.id,
        type: node.type,
        data: node.data,
        position: node.position || { x: 0, y: 0 },
      }));

      const flowEdges = network.edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: 'smoothstep',
        animated: true,
        style: {
          stroke: RELATIONSHIP_COLORS[edge.type] || '#6b7280',
          strokeWidth: 2,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: RELATIONSHIP_COLORS[edge.type] || '#6b7280',
        },
        label: RELATIONSHIP_LABELS[edge.type] || edge.type,
        labelStyle: {
          fill: 'var(--color-text-secondary)',
          fontSize: 10,
        },
        data: edge.data,
      }));

      const layoutedNodes = getLayoutedNodes(flowNodes, flowEdges);

      setNodes(layoutedNodes);
      setOriginalNodes(layoutedNodes);
      setEdges(flowEdges);
      setOriginalEdges(flowEdges);
    } catch (error) {
      console.error('Failed to load memory network:', error);
    } finally {
      setLoading(false);
    }
  }, [projectId, setNodes, setEdges]);

  useEffect(() => {
    loadNetworkData();
  }, [loadNetworkData]);

  // 应用筛选和搜索
  useEffect(() => {
    if (originalNodes.length === 0) return;

    let filteredNodes = [...originalNodes];
    let filteredEdges = [...originalEdges];

    // 应用类型筛选
    filteredNodes = filteredNodes.filter((node) => {
      if (node.type === 'character') return filters.character;
      if (node.type === 'plot') return filters.plot;
      if (node.type === 'location') return filters.location;
      return true;
    });

    // 应用搜索和高亮
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filteredNodes = filteredNodes.map((node) => {
        const name = String(node.data.name || node.data.title || '').toLowerCase();
        const matches = name.includes(query);
        return {
          ...node,
          style: {
            ...node.style,
            opacity: matches ? 1 : 0.3,
          },
        };
      });

      // 隐藏连接的边也隐藏
      const visibleNodeIds = new Set(filteredNodes.filter((n) => !n.style || n.style.opacity !== 0.3).map((n) => n.id));
      filteredEdges = filteredEdges.map((edge) => ({
        ...edge,
        style: {
          ...edge.style,
          opacity: visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target) ? 1 : 0.3,
        },
      }));
    }

    setNodes(filteredNodes);
    setEdges(filteredEdges);
  }, [originalNodes, originalEdges, filters, searchQuery, setNodes, setEdges]);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge({ ...params, animated: true }, eds)),
    [setEdges]
  );

  const onInit = useCallback((instance: any) => {
    setReactFlowInstance(instance);
    instance.fitView({ padding: 0.2 });
  }, []);

  const handleResetLayout = useCallback(() => {
    if (originalNodes.length > 0) {
      const layoutedNodes = getLayoutedNodes(originalNodes, originalEdges);
      setNodes(layoutedNodes);
      fitView({ padding: 0.2 });
    }
  }, [originalNodes, originalEdges, setNodes, fitView]);

  const handleNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNode(node);
    // 居中显示节点
    if (node.position) {
      setCenter(node.position.x + (node.width || 0) / 2, node.position.y + (node.height || 0) / 2, { zoom: 1.5, duration: 500 });
    }
  }, [setCenter]);

  const handleSelectNode = useCallback((nodeId: string) => {
    const node = getNode(nodeId);
    if (node) {
      setSelectedNode(node);
      if (node.position) {
        setCenter(node.position.x + (node.width || 0) / 2, node.position.y + (node.height || 0) / 2, { zoom: 1.5, duration: 500 });
      }
    }
  }, [getNode, setCenter]);

  const nodeCounts = useMemo(() => {
    return {
      character: originalNodes.filter((n) => n.type === 'character').length,
      plot: originalNodes.filter((n) => n.type === 'plot').length,
      location: originalNodes.filter((n) => n.type === 'location').length,
      total: originalNodes.length,
    };
  }, [originalNodes]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <i className="fas fa-spinner fa-spin text-3xl mb-4" style={{ color: 'var(--color-primary-400)' }} />
          <p style={{ color: 'var(--color-text-secondary)' }}>加载记忆网络...</p>
        </div>
      </div>
    );
  }

  if (nodes.length === 0 && originalNodes.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center glass-card rounded-2xl p-8">
          <i className="fas fa-project-diagram text-5xl mb-4 opacity-20" style={{ color: 'var(--color-text-muted)' }} />
          <h3 className="font-bold text-lg mb-2" style={{ color: 'var(--color-text-primary)' }}>暂无记忆网络</h3>
          <p className="text-sm mb-4" style={{ color: 'var(--color-text-secondary)' }}>
            添加角色、地点和情节后，记忆网络将自动生成
          </p>
          <button
            onClick={loadNetworkData}
            className="px-4 py-2 rounded-xl text-sm font-medium transition-all"
            style={{
              backgroundColor: 'var(--color-primary-100)',
              color: 'var(--color-primary-500)',
            }}
          >
            <i className="fas fa-refresh mr-2" />
            刷新
          </button>
        </div>
      </div>
    );
  }

  return (
    <div ref={reactFlowWrapper} className="w-full h-full flex">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onInit={onInit}
        onNodeClick={handleNodeClick}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        style={{
          backgroundColor: 'var(--color-surface-base)',
        }}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          color="var(--color-border-default)"
          gap={20}
        />
        <Controls
          style={{
            backgroundColor: 'var(--color-surface-base)',
            borderColor: 'var(--color-border-default)',
            borderRadius: '12px',
          }}
        />
        <MiniMap
          nodeColor={(node) => {
            switch (node.type) {
              case 'character':
                return 'var(--color-primary-400)';
              case 'plot':
                return '#a78bfa';
              case 'location':
                return '#34d399';
              default:
                return '#6b7280';
            }
          }}
          style={{
            backgroundColor: 'var(--color-surface-base)',
            borderColor: 'var(--color-border-default)',
            borderRadius: '12px',
          }}
        />
        <Panel position="top-left" className="m-4 space-y-4">
          <div
            className="glass-card rounded-2xl p-4 shadow-lg"
            style={{
              backgroundColor: 'var(--color-surface-base)',
              border: '1px solid var(--color-border-default)',
            }}
          >
            <h3 className="font-bold text-sm mb-3" style={{ color: 'var(--color-text-primary)' }}>
              <i className="fas fa-project-diagram mr-2" style={{ color: 'var(--color-primary-400)' }} />
              记忆网络
            </h3>
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between gap-4">
                <span style={{ color: 'var(--color-text-secondary)' }}>
                  <i className="fas fa-user mr-1" style={{ color: 'var(--color-primary-400)' }} />
                  角色
                </span>
                <span className="font-bold" style={{ color: 'var(--color-text-primary)' }}>
                  {nodeCounts.character}
                </span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span style={{ color: 'var(--color-text-secondary)' }}>
                  <i className="fas fa-code-branch mr-1" style={{ color: 'var(--color-violet-400, #a78bfa)' }} />
                  情节
                </span>
                <span className="font-bold" style={{ color: 'var(--color-text-primary)' }}>
                  {nodeCounts.plot}
                </span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span style={{ color: 'var(--color-text-secondary)' }}>
                  <i className="fas fa-location-dot mr-1" style={{ color: 'var(--color-green-400, #34d399)' }} />
                  地点
                </span>
                <span className="font-bold" style={{ color: 'var(--color-text-primary)' }}>
                  {nodeCounts.location}
                </span>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t" style={{ borderColor: 'var(--color-border-default)' }}>
              <button
                onClick={loadNetworkData}
                className="w-full px-3 py-2 rounded-xl text-xs font-medium transition-all hover:opacity-80"
                style={{
                  backgroundColor: 'var(--color-primary-100)',
                  color: 'var(--color-primary-500)',
                }}
              >
                <i className="fas fa-refresh mr-1" />
                刷新网络
              </button>
            </div>
          </div>
          
          <NetworkFilterPanel filters={filters} onFilterChange={setFilters} />
          
          <NetworkLayoutControls onResetLayout={handleResetLayout} />
        </Panel>
        
        <Panel position="top-center" className="m-4">
          <NetworkSearchBar searchQuery={searchQuery} onSearchChange={setSearchQuery} />
        </Panel>
      </ReactFlow>
      
      {selectedNode && (
        <div className="w-80 border-l" style={{ borderColor: 'var(--color-border-default)' }}>
          <NetworkNodeDetails
            selectedNode={selectedNode}
            edges={edges}
            allNodes={nodes}
            onSelectNode={handleSelectNode}
            onClose={() => setSelectedNode(null)}
          />
        </div>
      )}
    </div>
  );
};

const MemoryNetworkView: React.FC<MemoryNetworkViewProps> = (props) => {
  return (
    <ReactFlowProvider>
      <MemoryNetworkViewContent {...props} />
    </ReactFlowProvider>
  );
};

export default MemoryNetworkView;
