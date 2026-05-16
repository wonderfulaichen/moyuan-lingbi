import { describe, it, expect } from 'vitest';
import {
  MemoryNetworkService,
  MemoryNetworkNodeType,
  RelationshipType,
} from './MemoryNetworkService';
import { AtomicMemory } from '../../../shared/types';

describe('MemoryNetworkService', () => {
  const createMockAtomicMemory = (): AtomicMemory => ({
    version: 1,
    lastUpdated: Date.now(),
    world: {
      rules: ['规则1'],
      cosmology: '力量体系',
      geography: ['东域大陆', '西域秘境', '南海诸岛'],
      history: ['上古纪元', '中古纪元', '近代纪元'],
    },
    characters: [
      {
        id: 'char-1',
        name: '张三',
        identity: '主角',
        personality: ['勇敢', '正直'],
        abilities: ['剑术', '医术'],
        relationships: [
          { targetId: 'char-2', type: 'ally', description: '挚友', knownTo: [] },
          { targetId: 'char-3', type: 'enemy', description: '宿敌', knownTo: [] },
        ],
        secrets: [],
        arc: { start: '', current: '', goal: '' },
      },
      {
        id: 'char-2',
        name: '李四',
        identity: '配角',
        personality: ['机智'],
        abilities: ['谋略'],
        relationships: [
          { targetId: 'char-1', type: 'family', description: '义兄', knownTo: [] },
        ],
        secrets: [],
        arc: { start: '', current: '', goal: '' },
      },
      {
        id: 'char-3',
        name: '王五',
        identity: '反派',
        personality: ['阴险'],
        abilities: ['毒术'],
        relationships: [],
        secrets: [],
        arc: { start: '', current: '', goal: '' },
      },
    ],
    plots: [
      {
        id: 'plot-1',
        type: 'main',
        status: 'active',
        description: '寻找失落的宝藏',
        involvedCharacters: ['char-1', 'char-2'],
        foreshadows: [],
      },
      {
        id: 'plot-2',
        type: 'romance',
        status: 'dormant',
        description: '感情线',
        involvedCharacters: ['char-1'],
        foreshadows: [],
      },
    ],
  });

  describe('extractNodesFromMemory', () => {
    it('应该从原子记忆中提取所有角色节点', () => {
      const atomic = createMockAtomicMemory();
      const nodes = MemoryNetworkService.extractNodesFromMemory(atomic);

      const characterNodes = nodes.filter(
        (n) => n.type === MemoryNetworkNodeType.CHARACTER
      );
      expect(characterNodes).toHaveLength(3);
      expect(characterNodes[0].id).toBe('char-char-1');
      expect(characterNodes[0].data.name).toBe('张三');
    });

    it('应该从原子记忆中提取所有地点节点', () => {
      const atomic = createMockAtomicMemory();
      const nodes = MemoryNetworkService.extractNodesFromMemory(atomic);

      const locationNodes = nodes.filter(
        (n) => n.type === MemoryNetworkNodeType.LOCATION
      );
      expect(locationNodes).toHaveLength(3);
      expect(locationNodes[0].id).toBe('loc-0');
      expect(locationNodes[0].data.name).toBe('东域大陆');
    });

    it('应该从原子记忆中提取所有剧情节点', () => {
      const atomic = createMockAtomicMemory();
      const nodes = MemoryNetworkService.extractNodesFromMemory(atomic);

      const plotNodes = nodes.filter(
        (n) => n.type === MemoryNetworkNodeType.PLOT
      );
      expect(plotNodes).toHaveLength(2);
      expect(plotNodes[0].id).toBe('plot-plot-1');
      expect(plotNodes[0].data.title).toBe('寻找失落的宝藏');
    });

    it('应该返回所有类型的节点', () => {
      const atomic = createMockAtomicMemory();
      const nodes = MemoryNetworkService.extractNodesFromMemory(atomic);

      expect(nodes.length).toBeGreaterThan(0);
      const types = new Set(nodes.map((n) => n.type));
      expect(types.has(MemoryNetworkNodeType.CHARACTER)).toBe(true);
      expect(types.has(MemoryNetworkNodeType.LOCATION)).toBe(true);
      expect(types.has(MemoryNetworkNodeType.PLOT)).toBe(true);
    });
  });

  describe('extractEdgesFromMemory', () => {
    it('应该从角色关系中提取边', () => {
      const atomic = createMockAtomicMemory();
      const edges = MemoryNetworkService.extractEdgesFromMemory(atomic);

      const relationshipEdges = edges.filter(
        (e) => e.source.startsWith('char-') && e.target.startsWith('char-')
      );
      expect(relationshipEdges.length).toBeGreaterThan(0);
      expect(relationshipEdges[0].type).toBe(RelationshipType.ALLY);
    });

    it('应该从剧情涉及角色中提取边', () => {
      const atomic = createMockAtomicMemory();
      const edges = MemoryNetworkService.extractEdgesFromMemory(atomic);

      const plotEdges = edges.filter(
        (e) =>
          (e.source.startsWith('plot-') && e.target.startsWith('char-')) ||
          (e.source.startsWith('char-') && e.target.startsWith('plot-'))
      );
      expect(plotEdges.length).toBeGreaterThan(0);
    });

    it('每个边应该有唯一的ID', () => {
      const atomic = createMockAtomicMemory();
      const edges = MemoryNetworkService.extractEdgesFromMemory(atomic);

      const ids = new Set(edges.map((e) => e.id));
      expect(ids.size).toBe(edges.length);
    });
  });

  describe('buildNetwork', () => {
    it('应该同时返回节点和边', () => {
      const atomic = createMockAtomicMemory();
      const network = MemoryNetworkService.buildNetwork(atomic);

      expect(network.nodes).toBeDefined();
      expect(network.edges).toBeDefined();
      expect(network.nodes.length).toBeGreaterThan(0);
    });
  });
});
