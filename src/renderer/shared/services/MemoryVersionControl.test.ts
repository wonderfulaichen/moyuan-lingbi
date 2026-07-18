import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MemoryVersionControl, Version, VersionMetadata, OperationType, DiffChange, DiffChangeType } from './MemoryVersionControl';
import { AtomicMemory, DynamicMemory, VectorMemory } from '../../../shared/types';

describe('MemoryVersionControl', () => {
  const mockProjectId = 'test-project-123';
  const mockElectronAPI = {
    exists: vi.fn(),
    readFile: vi.fn(),
    writeFile: vi.fn(),
  };

  beforeEach(() => {
    vi.resetAllMocks();
    (global as any).window = {
      electronAPI: mockElectronAPI,
    };
  });

  const createMockAtomicMemory = (): AtomicMemory => ({
    version: 1,
    lastUpdated: Date.now(),
    world: {
      rules: ['规则1'],
      cosmology: '力量体系',
      geography: ['地理1'],
      history: ['历史1'],
    },
    characters: [],
    plots: [],
  });

  const createMockDynamicMemory = (): DynamicMemory => ({
    current: {
      chapter: 1,
      scene: '场景1',
      pov: '视角1',
      location: '地点1',
      time: '时间1',
      mood: '氛围1',
    },
    tension: {
      level: 5,
      history: [],
    },
    activeThreads: [],
    characterStates: [],
  });

  const createMockVectors = (): VectorMemory[] => [
    {
      id: 'vec1',
      text: '向量内容',
      type: 'scene',
      chapter: 1,
      characters: [],
      importance: 5,
    },
  ];

  describe('createVersion', () => {
    it('应该创建一个新的版本并保存到文件系统', async () => {
      mockElectronAPI.exists.mockResolvedValue(false);
      mockElectronAPI.writeFile.mockResolvedValue(undefined);

      const version = await MemoryVersionControl.createVersion({
        projectId: mockProjectId,
        operationType: OperationType.ADD_MEMORY,
        summary: '添加了新记忆',
        atomic: createMockAtomicMemory(),
        dynamic: createMockDynamicMemory(),
        vectors: createMockVectors(),
      });

      expect(version).toBeDefined();
      expect(version.id).toBeTruthy();
      expect(version.timestamp).toBeDefined();
      expect(version.metadata.operationType).toBe(OperationType.ADD_MEMORY);
      expect(version.metadata.summary).toBe('添加了新记忆');
    });
  });

  describe('loadVersion', () => {
    it('应该加载指定ID的版本', async () => {
      const mockVersion: Version = {
        id: 'version-1',
        timestamp: Date.now(),
        metadata: {
          operationType: OperationType.UPDATE_MEMORY,
          summary: '测试版本',
          createdAt: Date.now(),
        },
        snapshot: {
          atomic: createMockAtomicMemory(),
          dynamic: createMockDynamicMemory(),
          vectors: createMockVectors(),
        },
      };

      mockElectronAPI.exists.mockResolvedValue(true);
      mockElectronAPI.readFile.mockResolvedValue(JSON.stringify(mockVersion));

      const loadedVersion = await MemoryVersionControl.loadVersion(mockProjectId, 'version-1');

      expect(loadedVersion).toBeDefined();
      expect(loadedVersion.id).toBe('version-1');
    });

    it('应该在版本不存在时返回null', async () => {
      mockElectronAPI.exists.mockResolvedValue(false);

      const loadedVersion = await MemoryVersionControl.loadVersion(mockProjectId, 'non-existent');
      expect(loadedVersion).toBeNull();
    });
  });

  describe('listVersions', () => {
    it('应该按时间倒序列出所有版本', async () => {
      const versionsIndex = [
        { id: 'version-1', timestamp: Date.now() - 2000, operationType: OperationType.ADD_MEMORY, summary: '旧版本' },
        { id: 'version-2', timestamp: Date.now() - 1000, operationType: OperationType.UPDATE_MEMORY, summary: '新版本' },
      ];

      mockElectronAPI.exists.mockResolvedValue(true);
      mockElectronAPI.readFile.mockResolvedValue(JSON.stringify({ versions: versionsIndex }));

      const result = await MemoryVersionControl.listVersions(mockProjectId);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('version-2');
      expect(result[1].id).toBe('version-1');
    });

    it('应该在没有版本时返回空数组', async () => {
      mockElectronAPI.exists.mockResolvedValue(false);

      const result = await MemoryVersionControl.listVersions(mockProjectId);
      expect(result).toEqual([]);
    });
  });

  describe('compareVersions', () => {
    it('应该检测到新增的角色', async () => {
      const oldAtomic = createMockAtomicMemory();
      const newAtomic = createMockAtomicMemory();
      newAtomic.characters.push({
        id: 'char1',
        name: '新角色',
        identity: '主角',
        personality: ['勇敢'],
        abilities: [],
        relationships: [],
        secrets: [],
        arc: { start: '', current: '', goal: '' }
      });

      const oldVersion: Version = {
        id: 'old',
        timestamp: Date.now() - 1000,
        metadata: { operationType: OperationType.ADD_MEMORY, summary: '旧版本', createdAt: Date.now() - 1000 },
        snapshot: { atomic: oldAtomic, dynamic: createMockDynamicMemory(), vectors: createMockVectors() }
      };

      const newVersion: Version = {
        id: 'new',
        timestamp: Date.now(),
        metadata: { operationType: OperationType.ADD_MEMORY, summary: '新版本', createdAt: Date.now() },
        snapshot: { atomic: newAtomic, dynamic: createMockDynamicMemory(), vectors: createMockVectors() }
      };

      const diff = MemoryVersionControl._compareVersions(oldVersion, newVersion);
      expect(diff.length).toBeGreaterThan(0);
      expect(diff.some(d => d.type === DiffChangeType.ADD && d.category === 'atomic.character')).toBe(true);
    });

    it('应该检测到修改的动态记忆', async () => {
      const oldDynamic = createMockDynamicMemory();
      const newDynamic = createMockDynamicMemory();
      newDynamic.current.chapter = 2;

      const oldVersion: Version = {
        id: 'old',
        timestamp: Date.now() - 1000,
        metadata: { operationType: OperationType.ADD_MEMORY, summary: '旧版本', createdAt: Date.now() - 1000 },
        snapshot: { atomic: createMockAtomicMemory(), dynamic: oldDynamic, vectors: createMockVectors() }
      };

      const newVersion: Version = {
        id: 'new',
        timestamp: Date.now(),
        metadata: { operationType: OperationType.ADD_MEMORY, summary: '新版本', createdAt: Date.now() },
        snapshot: { atomic: createMockAtomicMemory(), dynamic: newDynamic, vectors: createMockVectors() }
      };

      const diff = MemoryVersionControl._compareVersions(oldVersion, newVersion);
      expect(diff.some(d => d.type === DiffChangeType.MODIFY && d.category === 'dynamic')).toBe(true);
    });

    it('应该检测到删除的向量记忆', async () => {
      const oldVectors = createMockVectors();
      const newVectors: VectorMemory[] = [];

      const oldVersion: Version = {
        id: 'old',
        timestamp: Date.now() - 1000,
        metadata: { operationType: OperationType.ADD_MEMORY, summary: '旧版本', createdAt: Date.now() - 1000 },
        snapshot: { atomic: createMockAtomicMemory(), dynamic: createMockDynamicMemory(), vectors: oldVectors }
      };

      const newVersion: Version = {
        id: 'new',
        timestamp: Date.now(),
        metadata: { operationType: OperationType.ADD_MEMORY, summary: '新版本', createdAt: Date.now() },
        snapshot: { atomic: createMockAtomicMemory(), dynamic: createMockDynamicMemory(), vectors: newVectors }
      };

      const diff = MemoryVersionControl._compareVersions(oldVersion, newVersion);
      expect(diff.some(d => d.type === DiffChangeType.DELETE && d.category === 'vector')).toBe(true);
    });
  });

  describe('rollbackToVersion', () => {
    it('应该回滚到指定版本并创建新的回滚记录', async () => {
      const targetVersion: Version = {
        id: 'target-version',
        timestamp: Date.now() - 10000,
        metadata: { operationType: OperationType.ADD_MEMORY, summary: '目标版本', createdAt: Date.now() - 10000 },
        snapshot: { atomic: createMockAtomicMemory(), dynamic: createMockDynamicMemory(), vectors: createMockVectors() }
      };

      const versionsIndex = [
        { id: 'latest-version', timestamp: Date.now(), operationType: OperationType.UPDATE_MEMORY, summary: '最新版本' },
        { id: 'target-version', timestamp: Date.now() - 10000, operationType: OperationType.ADD_MEMORY, summary: '目标版本' }
      ];

      mockElectronAPI.exists.mockResolvedValue(true);
      mockElectronAPI.readFile
        .mockResolvedValueOnce(JSON.stringify(targetVersion))
        .mockResolvedValueOnce(JSON.stringify({ versions: versionsIndex }));
      mockElectronAPI.writeFile.mockResolvedValue(undefined);

      const result = await MemoryVersionControl.rollbackToVersion(mockProjectId, 'target-version');

      expect(result).toBeDefined();
      expect(result.metadata.operationType).toBe(OperationType.ROLLBACK);
      expect(result.metadata.summary).toContain('target-version');
    });
  });
});
