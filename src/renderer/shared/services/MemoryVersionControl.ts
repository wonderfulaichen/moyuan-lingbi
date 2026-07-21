import { AtomicMemory, DynamicMemory, VectorMemory } from '../../../shared/types';

export enum OperationType {
  ADD_MEMORY = 'add_memory',
  UPDATE_MEMORY = 'update_memory',
  DELETE_MEMORY = 'delete_memory',
  ROLLBACK = 'rollback',
  BATCH_UPDATE = 'batch_update',
}

export enum DiffChangeType {
  ADD = 'add',
  MODIFY = 'modify',
  DELETE = 'delete',
}

export interface DiffChange {
  type: DiffChangeType;
  category: string;
  itemId?: string;
  oldValue?: any;
  newValue?: any;
  description: string;
}

export interface VersionMetadata {
  operationType: OperationType;
  summary: string;
  createdAt: number;
  author?: string;
  tags?: string[];
}

export interface MemorySnapshot {
  atomic: AtomicMemory;
  dynamic: DynamicMemory;
  vectors: VectorMemory[];
}

export interface Version {
  id: string;
  timestamp: number;
  metadata: VersionMetadata;
  snapshot: MemorySnapshot;
}

interface VersionIndexEntry {
  id: string;
  timestamp: number;
  operationType: OperationType;
  summary: string;
}

interface VersionIndex {
  versions: VersionIndexEntry[];
}

const MEMORY_BANK_DIR = 'memory-bank';
const VERSIONS_DIR = 'versions';
const INDEX_FILE = 'index.json';

function getProjectMemoryPath(projectId: string): string {
  return joinPath(MEMORY_BANK_DIR, projectId);
}

function createDefaultAtomicMemory(): any {
  return {
    version: 1,
    lastUpdated: Date.now(),
    world: { rules: [], cosmology: '', geography: [], history: [] },
    characters: [],
    plots: [],
  };
}

function createDefaultDynamicMemory(): any {
  return {
    current: { chapter: 0, scene: '', pov: '', location: '', time: '', mood: '' },
    tension: { level: 0, history: [] },
    activeThreads: [],
    characterStates: [],
  };
}

function generateVersionId(): string {
  return `version-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function joinPath(...parts: string[]): string {
  return parts.join('/').replace(/\/+/g, '/');
}

function getProjectVersionsPath(projectId: string): string {
  return joinPath(MEMORY_BANK_DIR, projectId, VERSIONS_DIR);
}

function getVersionFilePath(projectId: string, versionId: string): string {
  return joinPath(getProjectVersionsPath(projectId), `${versionId}.json`);
}

function getIndexFilePath(projectId: string): string {
  return joinPath(getProjectVersionsPath(projectId), INDEX_FILE);
}

async function ensureDirectoryExists(dirPath: string): Promise<void> {
  try {
    if (window.electronAPI) {
      const exists = await window.electronAPI.exists(dirPath);
      if (!exists) {
        const parts = dirPath.split('/');
        let current = '';
        for (const part of parts) {
          current = current ? `${current}/${part}` : part;
          if (current) {
            const currentExists = await window.electronAPI.exists(current);
            if (!currentExists) {
              try {
                await window.electronAPI.writeFile(`${current}/.mkdir-marker`, '');
              } catch {
              }
            }
          }
        }
      }
    }
    // 浏览器模式不需要创建目录，直接跳过
  } catch (error) {
    console.error(`[MemoryVersionControl] 创建目录失败 (${dirPath}):`, error);
  }
}

async function readJsonFile<T>(filePath: string, defaultValue: T): Promise<T> {
  try {
    if (window.electronAPI) {
      const exists = await window.electronAPI.exists(filePath);
      if (exists) {
        const data = await window.electronAPI.readFile(filePath);
        return JSON.parse(data) as T;
      }
    } else {
      // 使用 localStorage fallback
      const stored = localStorage.getItem(`versionControl:${filePath}`);
      if (stored) {
        return JSON.parse(stored) as T;
      }
    }
  } catch (error) {
    console.error(`[MemoryVersionControl] 读取文件失败 (${filePath}):`, error);
  }
  return defaultValue;
}

async function writeJsonFile<T>(filePath: string, data: T): Promise<void> {
  try {
    if (window.electronAPI) {
      await window.electronAPI.writeFile(filePath, JSON.stringify(data, null, 2));
    } else {
      // 使用 localStorage fallback
      localStorage.setItem(`versionControl:${filePath}`, JSON.stringify(data));
    }
  } catch (error) {
    console.error(`[MemoryVersionControl] 写入文件失败 (${filePath}):`, error);
  }
}

export const MemoryVersionControl = {
  async createVersion(options: {
    projectId: string;
    operationType: OperationType;
    summary: string;
    atomic: AtomicMemory;
    dynamic: DynamicMemory;
    vectors: VectorMemory[];
    author?: string;
    tags?: string[];
  }): Promise<Version> {
    const { projectId, operationType, summary, atomic, dynamic, vectors, author, tags } = options;
    const timestamp = Date.now();
    const versionId = generateVersionId();

    const version: Version = {
      id: versionId,
      timestamp,
      metadata: {
        operationType,
        summary,
        createdAt: timestamp,
        author,
        tags,
      },
      snapshot: {
        atomic,
        dynamic,
        vectors,
      },
    };

    const versionsPath = getProjectVersionsPath(projectId);
    await ensureDirectoryExists(versionsPath);

    const versionFilePath = getVersionFilePath(projectId, versionId);
    await writeJsonFile(versionFilePath, version);

    const indexFilePath = getIndexFilePath(projectId);
    const index = await readJsonFile<VersionIndex>(indexFilePath, { versions: [] });
    index.versions.unshift({
      id: versionId,
      timestamp,
      operationType,
      summary,
    });
    await writeJsonFile(indexFilePath, index);

    return version;
  },

  async loadVersion(projectId: string, versionId: string): Promise<Version | null> {
    const versionFilePath = getVersionFilePath(projectId, versionId);
    if (window.electronAPI) {
      const exists = await window.electronAPI.exists(versionFilePath);
      if (!exists) {
        return null;
      }
    }
    return await readJsonFile<Version>(versionFilePath, null);
  },

  async listVersions(projectId: string): Promise<VersionIndexEntry[]> {
    const indexFilePath = getIndexFilePath(projectId);
    const index = await readJsonFile<VersionIndex>(indexFilePath, { versions: [] });
    return index.versions.sort((a, b) => b.timestamp - a.timestamp);
  },

  async deleteVersion(projectId: string, versionId: string): Promise<boolean> {
    try {
      const indexFilePath = getIndexFilePath(projectId);
      const index = await readJsonFile<VersionIndex>(indexFilePath, { versions: [] });
      const versionIndex = index.versions.findIndex(v => v.id === versionId);
      if (versionIndex === -1) {
        return false;
      }
      index.versions.splice(versionIndex, 1);
      await writeJsonFile(indexFilePath, index);

      const versionFilePath = getVersionFilePath(projectId, versionId);
      // 显式守卫：浏览器模式下 electronAPI 不存在，跳过文件删除
      // （index 已通过 writeJsonFile 的 localStorage fallback 正确更新）
      if (window.electronAPI) {
        const exists = await window.electronAPI.exists(versionFilePath);
        if (exists) {
          try {
            // 使用 unlink 真正删除文件，而非 writeFile(path, '') 留下空文件
            await window.electronAPI.unlink(versionFilePath);
          } catch (error) {
            console.warn(`[MemoryVersionControl] 删除版本文件失败 (${versionFilePath}):`, error);
          }
        }
      }
      return true;
    } catch (error) {
      console.error(`[MemoryVersionControl] 删除版本失败 (${versionId}):`, error);
      return false;
    }
  },

  async compareVersions(
    projectId: string,
    versionId1: string,
    versionId2: string
  ): Promise<DiffChange[]> {
    const v1 = await this.loadVersion(projectId, versionId1);
    const v2 = await this.loadVersion(projectId, versionId2);
    
    if (!v1 || !v2) {
      throw new Error('版本不存在');
    }
    
    return this._compareVersions(v1, v2);
  },

  _compareVersions(oldVersion: Version, newVersion: Version): DiffChange[] {
    const changes: DiffChange[] = [];

    // 比较原子记忆 - 角色
    const oldChars = oldVersion.snapshot.atomic.characters;
    const newChars = newVersion.snapshot.atomic.characters;

    const oldCharIds = new Set(oldChars.map(c => c.id));
    const newCharIds = new Set(newChars.map(c => c.id));

    // 新增角色
    for (const char of newChars) {
      if (!oldCharIds.has(char.id)) {
        changes.push({
          type: DiffChangeType.ADD,
          category: 'atomic.character',
          itemId: char.id,
          newValue: char,
          description: `新增角色: ${char.name}`,
        });
      }
    }

    // 删除角色
    for (const char of oldChars) {
      if (!newCharIds.has(char.id)) {
        changes.push({
          type: DiffChangeType.DELETE,
          category: 'atomic.character',
          itemId: char.id,
          oldValue: char,
          description: `删除角色: ${char.name}`,
        });
      }
    }

    // 修改角色
    for (const newChar of newChars) {
      const oldChar = oldChars.find(c => c.id === newChar.id);
      if (oldChar && JSON.stringify(oldChar) !== JSON.stringify(newChar)) {
        changes.push({
          type: DiffChangeType.MODIFY,
          category: 'atomic.character',
          itemId: newChar.id,
          oldValue: oldChar,
          newValue: newChar,
          description: `修改角色: ${newChar.name}`,
        });
      }
    }

    // 比较原子记忆 - 世界观
    if (JSON.stringify(oldVersion.snapshot.atomic.world) !== JSON.stringify(newVersion.snapshot.atomic.world)) {
      changes.push({
        type: DiffChangeType.MODIFY,
        category: 'atomic.world',
        oldValue: oldVersion.snapshot.atomic.world,
        newValue: newVersion.snapshot.atomic.world,
        description: '修改世界观设定',
      });
    }

    // 比较原子记忆 - 剧情
    const oldPlots = oldVersion.snapshot.atomic.plots;
    const newPlots = newVersion.snapshot.atomic.plots;
    const oldPlotIds = new Set(oldPlots.map(p => p.id));
    const newPlotIds = new Set(newPlots.map(p => p.id));

    for (const plot of newPlots) {
      if (!oldPlotIds.has(plot.id)) {
        changes.push({
          type: DiffChangeType.ADD,
          category: 'atomic.plot',
          itemId: plot.id,
          newValue: plot,
          description: `新增剧情: ${plot.type}`,
        });
      }
    }

    for (const plot of oldPlots) {
      if (!newPlotIds.has(plot.id)) {
        changes.push({
          type: DiffChangeType.DELETE,
          category: 'atomic.plot',
          itemId: plot.id,
          oldValue: plot,
          description: `删除剧情: ${plot.type}`,
        });
      }
    }

    for (const newPlot of newPlots) {
      const oldPlot = oldPlots.find(p => p.id === newPlot.id);
      if (oldPlot && JSON.stringify(oldPlot) !== JSON.stringify(newPlot)) {
        changes.push({
          type: DiffChangeType.MODIFY,
          category: 'atomic.plot',
          itemId: newPlot.id,
          oldValue: oldPlot,
          newValue: newPlot,
          description: `修改剧情: ${newPlot.type}`,
        });
      }
    }

    // 比较动态记忆
    if (JSON.stringify(oldVersion.snapshot.dynamic) !== JSON.stringify(newVersion.snapshot.dynamic)) {
      changes.push({
        type: DiffChangeType.MODIFY,
        category: 'dynamic',
        oldValue: oldVersion.snapshot.dynamic,
        newValue: newVersion.snapshot.dynamic,
        description: '修改动态记忆',
      });
    }

    // 比较向量记忆
    const oldVecIds = new Set(oldVersion.snapshot.vectors.map(v => v.id));
    const newVecIds = new Set(newVersion.snapshot.vectors.map(v => v.id));

    for (const vec of newVersion.snapshot.vectors) {
      if (!oldVecIds.has(vec.id)) {
        changes.push({
          type: DiffChangeType.ADD,
          category: 'vector',
          itemId: vec.id,
          newValue: vec,
          description: `新增向量记忆: ${vec.type}`,
        });
      }
    }

    for (const vec of oldVersion.snapshot.vectors) {
      if (!newVecIds.has(vec.id)) {
        changes.push({
          type: DiffChangeType.DELETE,
          category: 'vector',
          itemId: vec.id,
          oldValue: vec,
          description: `删除向量记忆: ${vec.type}`,
        });
      }
    }

    return changes;
  },

  async rollbackToVersion(projectId: string, targetVersionId: string): Promise<Version> {
    const targetVersion = await this.loadVersion(projectId, targetVersionId);
    if (!targetVersion) {
      throw new Error(`版本 ${targetVersionId} 不存在`);
    }

    // 先保存当前状态为备份版本
    await this.createVersionFromMemoryBank({
      projectId,
      operationType: OperationType.UPDATE_MEMORY,
      summary: '回滚前备份',
    });

    // 恢复目标版本到文件系统
    const atomicPath = joinPath(getProjectMemoryPath(projectId), 'atomic.json');
    await writeJsonFile(atomicPath, targetVersion.snapshot.atomic);
    
    const dynamicPath = joinPath(getProjectMemoryPath(projectId), 'dynamic.json');
    await writeJsonFile(dynamicPath, targetVersion.snapshot.dynamic);
    
    const vectorsPath = joinPath(getProjectMemoryPath(projectId), 'vectors.json');
    await writeJsonFile(vectorsPath, targetVersion.snapshot.vectors);

    // 创建回滚记录版本
    return await this.createVersion({
      projectId,
      operationType: OperationType.ROLLBACK,
      summary: `回滚到版本: ${targetVersionId}`,
      atomic: targetVersion.snapshot.atomic,
      dynamic: targetVersion.snapshot.dynamic,
      vectors: targetVersion.snapshot.vectors,
    });
  },

  async createVersionFromMemoryBank(options: {
    projectId: string;
    operationType: OperationType;
    summary: string;
    author?: string;
  }): Promise<Version> {
    // 直接读取文件，避免循环依赖
    const atomicPath = joinPath(getProjectMemoryPath(options.projectId), 'atomic.json');
    const atomic = await readJsonFile(atomicPath, createDefaultAtomicMemory());
    
    const dynamicPath = joinPath(getProjectMemoryPath(options.projectId), 'dynamic.json');
    const dynamic = await readJsonFile(dynamicPath, createDefaultDynamicMemory());
    
    const vectorsPath = joinPath(getProjectMemoryPath(options.projectId), 'vectors.json');
    const vectors = await readJsonFile(vectorsPath, []);

    return await this.createVersion({
      projectId: options.projectId,
      operationType: options.operationType,
      summary: options.summary,
      atomic,
      dynamic,
      vectors,
      author: options.author,
    });
  },
};
