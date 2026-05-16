import { describe, it, expect } from 'vitest';
import { MemoryHealthService } from './MemoryHealthService';
import { AtomicMemory } from '../../../shared/types';

describe('MemoryHealthService', () => {
  const createHealthyAtomicMemory = (): AtomicMemory => ({
    version: 1,
    lastUpdated: Date.now(),
    world: {
      rules: ['规则1', '规则2'],
      cosmology: '力量体系',
      geography: ['东域', '西域'],
      history: ['上古纪元'],
    },
    characters: [
      {
        id: 'char1',
        name: '张三',
        identity: '主角',
        personality: ['勇敢'],
        abilities: ['剑术'],
        relationships: [],
        secrets: [],
        arc: { start: '', current: '', goal: '' }
      }
    ],
    plots: [
      {
        id: 'plot1',
        type: 'main',
        status: 'active',
        description: '主线剧情',
        involvedCharacters: ['char1'],
        foreshadows: []
      }
    ],
  });

  const createMemoryWithDuplicates = (): AtomicMemory => ({
    version: 1,
    lastUpdated: Date.now(),
    world: {
      rules: [],
      cosmology: '',
      geography: ['东域', '东域', '西域'],
      history: [],
    },
    characters: [
      {
        id: 'char1',
        name: '张三',
        identity: '主角',
        personality: [],
        abilities: [],
        relationships: [],
        secrets: [],
        arc: { start: '', current: '', goal: '' }
      },
      {
        id: 'char2',
        name: '张三',
        identity: '配角',
        personality: [],
        abilities: [],
        relationships: [],
        secrets: [],
        arc: { start: '', current: '', goal: '' }
      }
    ],
    plots: [
      {
        id: 'plot1',
        type: 'main',
        status: 'active',
        description: '主线剧情',
        involvedCharacters: [],
        foreshadows: []
      },
      {
        id: 'plot2',
        type: 'main',
        status: 'active',
        description: '主线剧情',
        involvedCharacters: [],
        foreshadows: []
      }
    ],
  });

  const createMemoryWithIncompleteData = (): AtomicMemory => ({
    version: 1,
    lastUpdated: Date.now(),
    world: {
      rules: [],
      cosmology: '',
      geography: [],
      history: [],
    },
    characters: [
      {
        id: 'char1',
        name: '',
        identity: '',
        personality: [],
        abilities: [],
        relationships: [],
        secrets: [],
        arc: { start: '', current: '', goal: '' }
      }
    ],
    plots: [],
  });

  const createMemoryWithInconsistentRelations = (): AtomicMemory => ({
    version: 1,
    lastUpdated: Date.now(),
    world: { rules: [], cosmology: '', geography: [], history: [] },
    characters: [
      {
        id: 'char1',
        name: '父亲',
        identity: '',
        personality: [],
        abilities: [],
        relationships: [
          { targetId: 'char2', type: 'family', description: '儿子', knownTo: [] }
        ],
        secrets: [],
        arc: { start: '', current: '', goal: '' }
      },
      {
        id: 'char2',
        name: '儿子',
        identity: '',
        personality: [],
        abilities: [],
        relationships: [
          { targetId: 'char1', type: 'family', description: '父亲', knownTo: [] }
        ],
        secrets: [],
        arc: { start: '', current: '', goal: '' }
      },
      {
        id: 'char3',
        name: '矛盾者',
        identity: '',
        personality: [],
        abilities: [],
        relationships: [
          { targetId: 'char4', type: 'family', description: '父亲', knownTo: [] },
          { targetId: 'char4', type: 'enemy', description: '仇人', knownTo: [] }
        ],
        secrets: [],
        arc: { start: '', current: '', goal: '' }
      },
      {
        id: 'char4',
        name: '被指向者',
        identity: '',
        personality: [],
        abilities: [],
        relationships: [],
        secrets: [],
        arc: { start: '', current: '', goal: '' }
      }
    ],
    plots: [],
  });

  describe('checkDuplicates', () => {
    it('应该检测到重复的角色名称', () => {
      const memory = createMemoryWithDuplicates();
      const issues = MemoryHealthService.checkDuplicates(memory);
      
      expect(issues.some(i => i.type === 'duplicate' && i.relatedId === '张三')).toBe(true);
    });

    it('应该检测到重复的地理名称', () => {
      const memory = createMemoryWithDuplicates();
      const issues = MemoryHealthService.checkDuplicates(memory);
      
      expect(issues.some(i => i.type === 'duplicate' && i.relatedId === '东域')).toBe(true);
    });

    it('应该检测到重复的剧情描述', () => {
      const memory = createMemoryWithDuplicates();
      const issues = MemoryHealthService.checkDuplicates(memory);
      
      expect(issues.some(i => i.type === 'duplicate' && i.relatedId === '主线剧情')).toBe(true);
    });

    it('健康记忆体不应该有重复问题', () => {
      const memory = createHealthyAtomicMemory();
      const issues = MemoryHealthService.checkDuplicates(memory);
      
      expect(issues.filter(i => i.type === 'duplicate').length).toBe(0);
    });
  });

  describe('checkCompleteness', () => {
    it('应该检测到缺少必填字段的角色', () => {
      const memory = createMemoryWithIncompleteData();
      const issues = MemoryHealthService.checkCompleteness(memory);
      
      expect(issues.some(i => i.type === 'incomplete' && i.relatedId === 'char1')).toBe(true);
    });

    it('应该检测到空的剧情列表', () => {
      const memory = createMemoryWithIncompleteData();
      const issues = MemoryHealthService.checkCompleteness(memory);
      
      expect(issues.some(i => i.type === 'incomplete' && i.title.includes('剧情'))).toBe(true);
    });

    it('健康记忆体不应该有完整性问题', () => {
      const memory = createHealthyAtomicMemory();
      const issues = MemoryHealthService.checkCompleteness(memory);
      
      expect(issues.filter(i => i.type === 'incomplete').length).toBe(0);
    });
  });

  describe('checkConsistency', () => {
    it('应该检测到同一角色有多种冲突关系', () => {
      const memory = createMemoryWithInconsistentRelations();
      const issues = MemoryHealthService.checkConsistency(memory);
      
      expect(issues.some(i => i.type === 'consistency' && i.relatedId === 'char3')).toBe(true);
    });

    it('健康记忆体不应该有一致性问题', () => {
      const memory = createHealthyAtomicMemory();
      const issues = MemoryHealthService.checkConsistency(memory);
      
      expect(issues.filter(i => i.type === 'consistency').length).toBe(0);
    });
  });

  describe('runHealthCheck', () => {
    it('健康记忆体应该得高分', () => {
      const memory = createHealthyAtomicMemory();
      const result = MemoryHealthService.runHealthCheck(memory);
      
      expect(result.score).toBeGreaterThan(80);
    });

    it('有问题的记忆体应该得低分', () => {
      const memory = createMemoryWithDuplicates();
      const result = MemoryHealthService.runHealthCheck(memory);
      
      expect(result.score).toBeLessThan(100);
      expect(result.issues.length).toBeGreaterThan(0);
    });

    it('应该包含所有检测到的问题', () => {
      const memory = createMemoryWithDuplicates();
      const result = MemoryHealthService.runHealthCheck(memory);
      
      const duplicates = result.issues.filter(i => i.type === 'duplicate');
      expect(duplicates.length).toBeGreaterThan(0);
    });
  });
});
