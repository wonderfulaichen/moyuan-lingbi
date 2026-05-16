import { AtomicMemory } from '../../../shared/types';

export enum MemoryNetworkNodeType {
  CHARACTER = 'character',
  LOCATION = 'location',
  ITEM = 'item',
  PLOT = 'plot',
}

export enum RelationshipType {
  FAMILY = 'family',
  FRIEND = 'friend',
  ROMANCE = 'romance',
  ENEMY = 'enemy',
  ALLY = 'ally',
  NEUTRAL = 'neutral',
  MASTER = 'master',
  DISCIPLE = 'disciple',
  OTHER = 'other',
  INVOLVED = 'involved',
}

export interface MemoryNetworkNode {
  id: string;
  type: MemoryNetworkNodeType;
  data: any;
  position?: { x: number; y: number };
}

export interface MemoryNetworkEdge {
  id: string;
  source: string;
  target: string;
  type: RelationshipType;
  data: any;
}

export interface MemoryNetwork {
  nodes: MemoryNetworkNode[];
  edges: MemoryNetworkEdge[];
}

export const MemoryNetworkService = {
  extractNodesFromMemory(atomic: AtomicMemory): MemoryNetworkNode[] {
    const nodes: MemoryNetworkNode[] = [];

    atomic.characters.forEach((char) => {
      nodes.push({
        id: `char-${char.id}`,
        type: MemoryNetworkNodeType.CHARACTER,
        data: {
          id: char.id,
          name: char.name,
          identity: char.identity,
          personality: char.personality,
          abilities: char.abilities,
        },
      });
    });

    atomic.world.geography.forEach((geo, index) => {
      nodes.push({
        id: `loc-${index}`,
        type: MemoryNetworkNodeType.LOCATION,
        data: {
          name: geo,
          description: geo,
        },
      });
    });

    atomic.plots.forEach((plot) => {
      nodes.push({
        id: `plot-${plot.id}`,
        type: MemoryNetworkNodeType.PLOT,
        data: {
          id: plot.id,
          type: plot.type,
          title: plot.description,
          status: plot.status,
        },
      });
    });

    return nodes;
  },

  extractEdgesFromMemory(atomic: AtomicMemory): MemoryNetworkEdge[] {
    const edges: MemoryNetworkEdge[] = [];
    let edgeIdCounter = 0;

    const relationshipMap: Record<string, RelationshipType> = {
      family: RelationshipType.FAMILY,
      ally: RelationshipType.ALLY,
      enemy: RelationshipType.ENEMY,
      neutral: RelationshipType.NEUTRAL,
      master: RelationshipType.MASTER,
      disciple: RelationshipType.DISCIPLE,
    };

    atomic.characters.forEach((char) => {
      char.relationships.forEach((rel) => {
        edges.push({
          id: `edge-${edgeIdCounter++}`,
          source: `char-${char.id}`,
          target: `char-${rel.targetId}`,
          type: relationshipMap[rel.type] || RelationshipType.OTHER,
          data: {
            description: rel.description,
          },
        });
      });
    });

    atomic.plots.forEach((plot) => {
      plot.involvedCharacters.forEach((charId) => {
        edges.push({
          id: `edge-${edgeIdCounter++}`,
          source: `plot-${plot.id}`,
          target: `char-${charId}`,
          type: RelationshipType.INVOLVED,
          data: {
            description: '参与剧情',
          },
        });
      });
    });

    return edges;
  },

  buildNetwork(atomic: AtomicMemory): MemoryNetwork {
    return {
      nodes: this.extractNodesFromMemory(atomic),
      edges: this.extractEdgesFromMemory(atomic),
    };
  },
};
