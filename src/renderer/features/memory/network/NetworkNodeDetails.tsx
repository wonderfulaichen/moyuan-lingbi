import React from 'react';
import { Node, Edge } from '@xyflow/react';
import { CharacterNodeData } from './CharacterNode';
import { LocationNodeData } from './LocationNode';
import { PlotNodeData } from './PlotNode';
import { RELATIONSHIP_COLORS, RELATIONSHIP_LABELS } from '../../../shared/constants/relationshipColors';

type CustomNodeData = CharacterNodeData | LocationNodeData | PlotNodeData;

interface NetworkNodeDetailsProps {
  selectedNode: Node | null;
  edges: Edge[];
  allNodes: Node[];
  onSelectNode: (nodeId: string) => void;
  onClose: () => void;
}

const NetworkNodeDetails: React.FC<NetworkNodeDetailsProps> = ({
  selectedNode,
  edges,
  allNodes,
  onSelectNode,
  onClose,
}) => {
  if (!selectedNode) return null;

  const nodeData = selectedNode.data as CustomNodeData;
  const outgoingEdges = edges.filter((e) => e.source === selectedNode.id);
  const incomingEdges = edges.filter((e) => e.target === selectedNode.id);

  const getNodeById = (id: string) => allNodes.find((n) => n.id === id);

  return (
    <div
      className="glass-card rounded-2xl shadow-lg overflow-hidden flex flex-col h-full"
      style={{
        backgroundColor: 'var(--color-surface-base)',
        border: '1px solid var(--color-border-default)',
      }}
    >
      <div
        className="p-4 border-b flex items-center justify-between"
        style={{ borderColor: 'var(--color-border-default)' }}
      >
        <h3 className="font-bold text-sm" style={{ color: 'var(--color-text-primary)' }}>
          <i className="fas fa-info-circle mr-2" style={{ color: 'var(--color-primary-400)' }} />
          节点详情
        </h3>
        <button
          onClick={onClose}
          className="p-1 hover:opacity-70 transition-opacity"
        >
          <i className="fas fa-times" style={{ color: 'var(--color-text-muted)' }} />
        </button>
      </div>

      <div className="p-4 overflow-y-auto flex-1">
        <div className="mb-4">
          {selectedNode.type === 'character' && (
            <div className="flex items-center gap-3 mb-3">
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center text-xl font-bold shadow-md"
                style={{
                  background: 'linear-gradient(135deg, var(--color-primary-300), var(--color-primary-500))',
                  color: '#fff',
                }}
              >
                {nodeData.name?.charAt(0) || '?'}
              </div>
              <div className="flex-1">
                <h4 className="font-bold text-base" style={{ color: 'var(--color-text-primary)' }}>
                  {nodeData.name || '未命名'}
                </h4>
                {'identity' in nodeData && nodeData.identity && (
                  <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                    {nodeData.identity}
                  </p>
                )}
              </div>
            </div>
          )}

          {selectedNode.type === 'plot' && (
            <div className="mb-3">
              <div className="flex items-center gap-2 mb-2">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center"
                  style={{
                    backgroundColor: 'rgba(167, 139, 250, 0.15)',
                    color: '#a78bfa',
                  }}
                >
                  <i className="fas fa-code-branch" />
                </div>
                <h4 className="font-bold text-base" style={{ color: 'var(--color-text-primary)' }}>
                  {'title' in nodeData ? nodeData.title : '未命名'}
                </h4>
              </div>
            </div>
          )}

          {selectedNode.type === 'location' && (
            <div className="flex items-center gap-3 mb-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center text-lg"
                style={{
                  backgroundColor: 'rgba(52, 211, 153, 0.15)',
                  color: '#34d399',
                }}
              >
                <i className="fas fa-location-dot" />
              </div>
              <h4 className="font-bold text-base" style={{ color: 'var(--color-text-primary)' }}>
                {nodeData.name || '未命名'}
              </h4>
            </div>
          )}
        </div>

        {'personality' in nodeData && nodeData.personality && nodeData.personality.length > 0 && (
          <div className="mb-4">
            <h5 className="text-xs font-medium mb-2" style={{ color: 'var(--color-text-tertiary)' }}>
              性格特点
            </h5>
            <div className="flex flex-wrap gap-1">
              {(nodeData.personality as string[]).map((trait: string, i: number) => (
                <span
                  key={i}
                  className="px-2 py-1 rounded-full text-xs"
                  style={{
                    backgroundColor: 'var(--color-primary-100)',
                    color: 'var(--color-primary-500)',
                  }}
                >
                  {trait}
                </span>
              ))}
            </div>
          </div>
        )}

        {'abilities' in nodeData && nodeData.abilities && nodeData.abilities.length > 0 && (
          <div className="mb-4">
            <h5 className="text-xs font-medium mb-2" style={{ color: 'var(--color-text-tertiary)' }}>
              能力
            </h5>
            <div className="flex flex-wrap gap-1">
              {(nodeData.abilities as string[]).map((ability: string, i: number) => (
                <span
                  key={i}
                  className="px-2 py-1 rounded-full text-xs"
                  style={{
                    backgroundColor: 'rgba(52, 211, 153, 0.1)',
                    color: '#34d399',
                  }}
                >
                  {ability}
                </span>
              ))}
            </div>
          </div>
        )}

        {(outgoingEdges.length > 0 || incomingEdges.length > 0) && (
          <div className="space-y-4">
            {outgoingEdges.length > 0 && (
              <div>
                <h5 className="text-xs font-medium mb-2" style={{ color: 'var(--color-text-tertiary)' }}>
                  关系（出）
                </h5>
                <div className="space-y-2">
                  {outgoingEdges.map((edge) => {
                    const targetNode = getNodeById(edge.target);
                    return (
                      <div
                        key={edge.id}
                        className="flex items-center gap-2 p-2 rounded-xl cursor-pointer hover:opacity-80 transition-opacity"
                        style={{
                          backgroundColor: 'var(--color-surface-muted)',
                        }}
                        onClick={() => targetNode && onSelectNode(targetNode.id)}
                      >
                        <div
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: RELATIONSHIP_COLORS[edge.type as string] || '#6b7280' }}
                        />
                        <span
                          className="text-xs px-2 py-0.5 rounded-full"
                          style={{
                            backgroundColor: `${RELATIONSHIP_COLORS[edge.type as string] || '#6b7280'}20`,
                            color: RELATIONSHIP_COLORS[edge.type as string] || '#6b7280',
                          }}
                        >
                          {RELATIONSHIP_LABELS[edge.type as string] || edge.type}
                        </span>
                        <span className="text-xs truncate flex-1" style={{ color: 'var(--color-text-secondary)' }}>
                          {(targetNode?.data as CustomNodeData).name || (targetNode?.data as CustomNodeData).title || '未知'}
                        </span>
                        <i className="fas fa-arrow-right text-xs" style={{ color: 'var(--color-text-muted)' }} />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {incomingEdges.length > 0 && (
              <div>
                <h5 className="text-xs font-medium mb-2" style={{ color: 'var(--color-text-tertiary)' }}>
                  关系（入）
                </h5>
                <div className="space-y-2">
                  {incomingEdges.map((edge) => {
                    const sourceNode = getNodeById(edge.source);
                    return (
                      <div
                        key={edge.id}
                        className="flex items-center gap-2 p-2 rounded-xl cursor-pointer hover:opacity-80 transition-opacity"
                        style={{
                          backgroundColor: 'var(--color-surface-muted)',
                        }}
                        onClick={() => sourceNode && onSelectNode(sourceNode.id)}
                      >
                        <i className="fas fa-arrow-left text-xs" style={{ color: 'var(--color-text-muted)' }} />
                        <span className="text-xs truncate flex-1" style={{ color: 'var(--color-text-secondary)' }}>
                          {sourceNode?.data.name || sourceNode?.data.title || '未知'}
                        </span>
                        <span
                          className="text-xs px-2 py-0.5 rounded-full"
                          style={{
                            backgroundColor: `${RELATIONSHIP_COLORS[edge.type as string] || '#6b7280'}20`,
                            color: RELATIONSHIP_COLORS[edge.type as string] || '#6b7280',
                          }}
                        >
                          {RELATIONSHIP_LABELS[edge.type as string] || edge.type}
                        </span>
                        <div
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: RELATIONSHIP_COLORS[edge.type as string] || '#6b7280' }}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default NetworkNodeDetails;
