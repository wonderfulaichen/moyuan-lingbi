import { describe, it, expect, beforeEach } from 'vitest';
import { MemorySearchService, MemoryType, SearchResult, FilterOptions, SortOption } from './MemorySearchService';
import { AtomicMemory } from '../../../shared/types';

describe('MemorySearchService', () => {
  let testMemory: AtomicMemory;

  beforeEach(() => {
    testMemory = {
      version: 1,
      lastUpdated: Date.now(),
      world: {
        rules: ['魔法分为金木水火土五系', '凡界生灵无法飞升'],
        cosmology: '修炼等级：炼气、筑基、金丹、元婴',
        geography: ['青云山脉', '东海仙岛', '西域大漠'],
        history: ['上古神魔大战', '万年前仙门成立'],
      },
      characters: [
        {
          id: 'char-1',
          name: '李云飞',
          identity: '青云门掌门弟子',
          publicIdentity: '凡人家书生',
          personality: ['勇敢', '正直', '重情义'],
          abilities: ['青云剑法', '五行遁术'],
          relationships: [
            { targetId: 'char-2', type: 'ally', description: '师妹', knownTo: [] },
            { targetId: 'char-3', type: 'enemy', description: '魔教少主', knownTo: [] },
          ],
          secrets: ['身具上古血脉'],
          arc: { start: '山村少年', current: '掌门弟子', goal: '拯救苍生' },
        },
        {
          id: 'char-2',
          name: '苏雅',
          identity: '青云门小师妹',
          publicIdentity: '',
          personality: ['温柔', '善良', '机智'],
          abilities: ['医术', '音波功'],
          relationships: [
            { targetId: 'char-1', type: 'family', description: '师兄', knownTo: [] },
          ],
          secrets: [],
          arc: { start: '医女', current: '弟子', goal: '悬壶济世' },
        },
        {
          id: 'char-3',
          name: '夜无影',
          identity: '魔教少主',
          publicIdentity: '富商之子',
          personality: ['冷酷', '狡猾', '野心勃勃'],
          abilities: ['魔功', '易容术'],
          relationships: [],
          secrets: ['实为前朝皇子'],
          arc: { start: '孤儿', current: '少主', goal: '复辟王朝' },
        },
      ],
      plots: [
        {
          id: 'plot-1',
          type: 'main',
          status: 'active',
          description: '李云飞寻找失落的上古神器',
          involvedCharacters: ['char-1', 'char-2', 'char-3'],
          foreshadows: [
            { chapter: 1, hint: '后山发现神秘遗迹', expectedPayoff: '', status: 'planted' },
          ],
        },
        {
          id: 'plot-2',
          type: 'sub',
          status: 'dormant',
          description: '苏雅的身世之谜',
          involvedCharacters: ['char-2'],
          foreshadows: [],
        },
      ],
    };
  });

  describe('searchMemories', () => {
    it('应该搜索到包含关键词的角色', () => {
      const results = MemorySearchService.searchMemories(testMemory, '李云飞');
      expect(results.some(r => r.title === '李云飞')).toBe(true);
    });

    it('应该搜索到包含关键词的地点', () => {
      const results = MemorySearchService.searchMemories(testMemory, '青云');
      expect(results.some(r => r.title === '青云山脉')).toBe(true);
    });

    it('应该搜索到包含关键词的剧情', () => {
      const results = MemorySearchService.searchMemories(testMemory, '上古神器');
      expect(results.some(r => r.type === 'plot')).toBe(true);
    });

    it('应该搜索到包含关键词的力量体系', () => {
      const results = MemorySearchService.searchMemories(testMemory, '修炼');
      expect(results.some(r => r.title === '力量体系')).toBe(true);
    });

    it('空查询应该返回所有结果', () => {
      const results = MemorySearchService.searchMemories(testMemory, '');
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('filterMemories', () => {
    it('应该按类型筛选结果', () => {
      const allResults = MemorySearchService.searchMemories(testMemory, '');
      const filters: FilterOptions = { types: ['character'], onlyFavorites: false };
      const filtered = MemorySearchService.filterMemories(allResults, filters);
      expect(filtered.every(r => r.type === 'character')).toBe(true);
    });

    it('"all"类型应该不筛选结果', () => {
      const allResults = MemorySearchService.searchMemories(testMemory, '');
      const filters: FilterOptions = { types: ['all'], onlyFavorites: false };
      const filtered = MemorySearchService.filterMemories(allResults, filters);
      expect(filtered.length).toEqual(allResults.length);
    });
  });

  describe('sortMemories', () => {
    it('应该按名称排序', () => {
      const results = MemorySearchService.searchMemories(testMemory, '');
      const sorted = MemorySearchService.sortMemories(results, 'name');
      const titles = sorted.map(r => r.title);
      // sortMemories 使用 localeCompare，测试期望也必须用 localeCompare（默认 sort() 对中文与 localeCompare 结果不同）
      expect(titles).toEqual([...titles].sort((a, b) => a.localeCompare(b)));
    });

    it('应该按相关性排序', () => {
      const results = MemorySearchService.searchMemories(testMemory, '李云飞');
      const sorted = MemorySearchService.sortMemories(results, 'relevance');
      expect(sorted[0].title).toBe('李云飞');
    });
  });

  describe('recommendRelatedMemories', () => {
    it('应该推荐与角色相关的其他角色', () => {
      const recommendations = MemorySearchService.recommendRelatedMemories(testMemory, 'char-1');
      expect(recommendations.some(r => r.id === 'char-2')).toBe(true);
    });

    it('应该推荐与剧情相关的角色', () => {
      const recommendations = MemorySearchService.recommendRelatedMemories(testMemory, 'plot-1');
      expect(recommendations.some(r => r.id === 'char-1')).toBe(true);
    });
  });

  describe('toggleFavorite', () => {
    const testProjectId = 'test-project-1';

    it('应该能够收藏和取消收藏', () => {
      const firstResult = MemorySearchService.toggleFavorite(testProjectId, 'character', 'char-1');
      expect(firstResult).toBe(true);

      const secondResult = MemorySearchService.toggleFavorite(testProjectId, 'character', 'char-1');
      expect(secondResult).toBe(false);
    });

    it('应该能够获取收藏列表', () => {
      MemorySearchService.toggleFavorite(testProjectId, 'character', 'char-1');
      MemorySearchService.toggleFavorite(testProjectId, 'plot', 'plot-1');

      const favorites = MemorySearchService.getFavorites(testProjectId);
      expect(favorites.length).toBe(2);
    });
  });
});
