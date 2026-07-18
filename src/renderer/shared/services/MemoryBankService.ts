import { MemoryBank, AtomicMemory, DynamicMemory, VectorMemory, Project, ModelConfig } from '../../../shared/types';
import { MemoryVersionControl, OperationType } from './MemoryVersionControl';
import { dataService } from './DataService';
import { aiService } from './aiService';

const MEMORY_BANK_DIR = 'memory-bank';
let versionControlEnabled = true; // 默认启用版本控制

export function enableVersionControl(enabled: boolean): void {
  versionControlEnabled = enabled;
}

export function isVersionControlEnabled(): boolean {
  return versionControlEnabled;
}

async function createVersionIfEnabled(
  projectId: string,
  operationType: OperationType,
  summary: string,
): Promise<void> {
  if (!versionControlEnabled) return;
  try {
    await MemoryVersionControl.createVersionFromMemoryBank({
      projectId,
      operationType,
      summary,
    });
  } catch (error) {
    console.error('[MemoryBankService] 创建版本失败:', error);
  }
}

function joinPath(...parts: string[]): string {
  return parts.join('/').replace(/\/+/g, '/');
}

function getProjectMemoryPath(projectId: string): string {
  return joinPath(MEMORY_BANK_DIR, projectId);
}

function createDefaultAtomicMemory(): AtomicMemory {
  return {
    version: 1,
    lastUpdated: Date.now(),
    world: {
      rules: [],
      cosmology: '',
      geography: [],
      history: [],
    },
    characters: [],
    plots: [],
  };
}

function createDefaultDynamicMemory(): DynamicMemory {
  return {
    current: {
      chapter: 0,
      scene: '',
      pov: '',
      location: '',
      time: '',
      mood: '',
    },
    tension: {
      level: 0,
      history: [],
    },
    activeThreads: [],
    characterStates: [],
  };
}

async function ensureDirectoryExists(dirPath: string): Promise<void> {
  try {
    if (!window.electronAPI) {
      console.warn('[MemoryBank] electronAPI 不可用，跳过目录创建');
      return;
    }
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
  } catch (error) {
    console.error(`[MemoryBank] 创建目录失败 (${dirPath}):`, error);
  }
}

async function readJsonFile<T>(filePath: string, defaultValue: T): Promise<T> {
  try {
    if (!window.electronAPI) {
      console.warn('[MemoryBank] electronAPI 不可用，使用 localStorage fallback');
      const key = `memorybank_${filePath.replace(/[\/\\]/g, '_')}`;
      const stored = localStorage.getItem(key);
      return stored ? JSON.parse(stored) as T : defaultValue;
    }
    const exists = await window.electronAPI.exists(filePath);
    if (exists) {
      const data = await window.electronAPI.readFile(filePath);
      return JSON.parse(data) as T;
    }
  } catch (error) {
    console.error(`[MemoryBank] 读取文件失败 (${filePath}):`, error);
  }
  return defaultValue;
}

async function writeJsonFile<T>(filePath: string, data: T): Promise<void> {
  try {
    if (!window.electronAPI) {
      console.warn('[MemoryBank] electronAPI 不可用，使用 localStorage fallback');
      const key = `memorybank_${filePath.replace(/[\/\\]/g, '_')}`;
      localStorage.setItem(key, JSON.stringify(data, null, 2));
      return;
    }
    await window.electronAPI.writeFile(filePath, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error(`[MemoryBank] 写入文件失败 (${filePath}):`, error);
  }
}

// 同步版本的接口，用于快速获取上下文
let cachedAtomicMemory: AtomicMemory | null = null;
let cachedDynamicMemory: DynamicMemory | null = null;
let lastSyncProjectId: string | null = null;

function isMemoryBankEnabled(projectId: string): boolean {
  const project = dataService.getActiveProject();
  return project?.id === projectId && project?.memoryBankEnabled !== false;
}

export const memoryBankService = {

  isEnabled(projectId: string): boolean {
    return isMemoryBankEnabled(projectId);
  },

  async initMemoryBank(projectId: string): Promise<MemoryBank> {
    if (!isMemoryBankEnabled(projectId)) {
      console.log('[MemoryBank] 记忆体功能已关闭');
      return {
        projectId,
        atomic: createDefaultAtomicMemory(),
        dynamic: createDefaultDynamicMemory(),
        vectors: [],
        lastMaintained: 0,
        maintenanceLog: [],
      };
    }

    const memoryPath = getProjectMemoryPath(projectId);
    await ensureDirectoryExists(memoryPath);

    const atomic = await this.loadAtomicMemory(projectId);
    const dynamic = await this.loadDynamicMemory(projectId);
    const vectors = await this.loadVectors(projectId);

    return {
      projectId,
      atomic,
      dynamic,
      vectors,
      lastMaintained: 0,
      maintenanceLog: [],
    };
  },

  async loadAtomicMemory(projectId: string): Promise<AtomicMemory> {
    if (!isMemoryBankEnabled(projectId)) {
      return createDefaultAtomicMemory();
    }

    const filePath = joinPath(getProjectMemoryPath(projectId), 'atomic.json');
    let atomic = await readJsonFile(filePath, createDefaultAtomicMemory());
    
    try {
      const characterFolderId = dataService.getRootFolderIdByType('characters', projectId);
      if (characterFolderId) {
        const characterFiles = dataService.getChildren(characterFolderId, projectId);
        if (characterFiles && characterFiles.length > 0) {
          const currentFileIds = new Set(characterFiles.filter(vf => vf.type === 'file').map(vf => vf.id));
          const existingIds = new Set(atomic.characters.map(c => c.id).filter(id => id));
          
          characterFiles.forEach(vf => {
            if (vf.type === 'file') {
              const existingIdx = atomic.characters.findIndex(c => c.id === vf.id);
              const parsed = this.parseCharacterContent(vf.content || '');
              
              if (existingIdx >= 0) {
                atomic.characters[existingIdx].name = vf.name;
                if (vf.content && (!atomic.characters[existingIdx].identity || atomic.characters[existingIdx].identity.length < 20)) {
                  atomic.characters[existingIdx].identity = parsed.identity || vf.content.substring(0, 100);
                }
                if (parsed.personality && parsed.personality.length > 0) {
                  parsed.personality.forEach(p => {
                    if (!atomic.characters[existingIdx].personality.includes(p)) {
                      atomic.characters[existingIdx].personality.push(p);
                    }
                  });
                }
                if (parsed.abilities && parsed.abilities.length > 0) {
                  parsed.abilities.forEach(a => {
                    if (!atomic.characters[existingIdx].abilities.includes(a)) {
                      atomic.characters[existingIdx].abilities.push(a);
                    }
                  });
                }
                if (parsed.secrets && parsed.secrets.length > 0) {
                  parsed.secrets.forEach(s => {
                    if (!atomic.characters[existingIdx].secrets.includes(s)) {
                      atomic.characters[existingIdx].secrets.push(s);
                    }
                  });
                }
              } else {
                const charMem: any = {
                  id: vf.id,
                  name: vf.name,
                  identity: parsed.identity || (vf.content ? vf.content.substring(0, 100) : ''),
                  personality: parsed.personality || [],
                  abilities: parsed.abilities || [],
                  relationships: [],
                  secrets: parsed.secrets || [],
                  arc: { start: '', current: '', goal: '' },
                };
                atomic.characters.push(charMem);
              }
            }
          });
          
          const deletedChars = atomic.characters.filter(c => c.id && !currentFileIds.has(c.id));
          if (deletedChars.length > 0) {
            atomic.characters = atomic.characters.filter(c => !c.id || currentFileIds.has(c.id));
            console.log('[MemoryBankService] loadAtomicMemory: 删除已移除的角色:', deletedChars.map(c => c.name).join(', '));
          }
          
          await this.saveAtomicMemory(projectId, atomic);
          console.log('[MemoryBankService] loadAtomicMemory: 从文件系统同步完成，当前角色数:', atomic.characters.length);
        }
      }
    } catch (err) {
      console.error('[MemoryBankService] loadAtomicMemory: 同步失败', err);
    }
    
    return atomic;
  },

  async saveAtomicMemory(projectId: string, memory: AtomicMemory): Promise<void> {
    const filePath = joinPath(getProjectMemoryPath(projectId), 'atomic.json');
    memory.lastUpdated = Date.now();
    await writeJsonFile(filePath, memory);
    await createVersionIfEnabled(
      projectId,
      OperationType.UPDATE_MEMORY,
      '更新原子记忆',
    );
  },

  async loadDynamicMemory(projectId: string): Promise<DynamicMemory> {
    const filePath = joinPath(getProjectMemoryPath(projectId), 'dynamic.json');
    return readJsonFile(filePath, createDefaultDynamicMemory());
  },

  async saveDynamicMemory(projectId: string, memory: DynamicMemory): Promise<void> {
    const filePath = joinPath(getProjectMemoryPath(projectId), 'dynamic.json');
    await writeJsonFile(filePath, memory);
    await createVersionIfEnabled(
      projectId,
      OperationType.UPDATE_MEMORY,
      '更新动态记忆',
    );
  },

  async rollbackToVersion(projectId: string, versionId: string): Promise<boolean> {
    return !!(await MemoryVersionControl.rollbackToVersion(projectId, versionId));
  },

  async listMemoryVersions(projectId: string) {
    return await MemoryVersionControl.listVersions(projectId);
  },

  async loadMemoryVersion(projectId: string, versionId: string) {
    return await MemoryVersionControl.loadVersion(projectId, versionId);
  },

  async compareMemoryVersions(projectId: string, versionId1: string, versionId2: string) {
    return await MemoryVersionControl.compareVersions(projectId, versionId1, versionId2);
  },

  async loadVectors(projectId: string): Promise<VectorMemory[]> {
    const filePath = joinPath(getProjectMemoryPath(projectId), 'vectors.json');
    return readJsonFile(filePath, []);
  },

  async addVector(projectId: string, vector: VectorMemory): Promise<void> {
    const vectors = await this.loadVectors(projectId);
    vectors.push(vector);

    if (vectors.length > 1000) {
      vectors.sort((a, b) => b.importance - a.importance);
      vectors.splice(1000);
    }

    const filePath = joinPath(getProjectMemoryPath(projectId), 'vectors.json');
    await writeJsonFile(filePath, vectors);
  },

  async buildContextFromMemory(
    projectId: string,
    currentChapter: number,
    writingTask?: string
  ): Promise<string> {
    if (!isMemoryBankEnabled(projectId)) {
      return writingTask ? `【写作任务】\n${writingTask}` : '';
    }

    const atomic = await this.loadAtomicMemory(projectId);
    const dynamic = await this.loadDynamicMemory(projectId);

    let context = '';

    if (atomic.world.rules.length > 0 || atomic.world.cosmology) {
      context += `【核心世界观】\n`;

      if (atomic.world.cosmology) {
        context += `- 力量体系: ${atomic.world.cosmology}\n`;
      }

      atomic.world.rules.forEach(rule => {
        context += `- ${rule}\n`;
      });
    }

    if (atomic.characters.length > 0) {
      context += `\n【主要角色】\n`;
      atomic.characters.slice(0, 8).forEach(char => {
        context += `- ${char.name}${(char as any).role ? `（${(char as any).role}）` : ''}: ${(char as any).description?.slice(0, 30) || '暂无描述'}\n`;
      });
    }

    if (dynamic.current.chapter > 0) {
      context += `\n【当前进度】\n`;
      context += `- 章节: 第${dynamic.current.chapter}章\n`;
      if (dynamic.current.scene) context += `- 场景: ${dynamic.current.scene}\n`;
      if (dynamic.current.pov) context += `- 视角: ${dynamic.current.pov}\n`;
      if (dynamic.current.location) context += `- 地点: ${dynamic.current.location}\n`;
      if (dynamic.current.time) context += `- 时间: ${dynamic.current.time}\n`;
      if (dynamic.current.mood) context += `- 氛围: ${dynamic.current.mood}\n`;
    }

    if (writingTask) {
      context += `\n【写作任务】\n${writingTask}\n`;
    }

    return context.slice(0, 3000);
  },

  async analyzeProjectForMemory(project: Project): Promise<{ atomic: AtomicMemory; issues: string[] }> {
    return new Promise((resolve) => {
      const atomic: AtomicMemory = createDefaultAtomicMemory();
      const issues: string[] = [];

      if ((project as any).worldbuilding && (project as any).worldbuilding.length > 0) {
        (project as any).worldbuilding.forEach(item => {
          if (item.content?.includes('力量') || item.content?.includes('体系') || item.content?.includes('法则')) {
            atomic.world.cosmology = (atomic.world.cosmology || '') + (item.content || '') + '\n';
          } else if (item.content?.includes('规则') || item.content?.includes('限制')) {
            atomic.world.rules.push(item.content || '');
          } else if (item.content?.includes('地理') || item.content?.includes('地图')) {
            atomic.world.geography.push(item.content || '');
          } else if (item.content?.includes('历史') || item.content?.includes('纪元')) {
            atomic.world.history.push(item.content || '');
          }
        });
      }

      if (project.characters && project.characters.length > 0) {
        project.characters.forEach(char => {
          const charMem: AtomicMemory['characters'][0] = {
            name: char.name,
            role: (char as any).role,
            description: (char as any).content?.slice(0, 200) || '',
            traits: [],
            relationships: [],
          };

          if ((char as any).content) {
            const traits = (char as any).content.match(/(性格|特点|特质):?\s*([^\n]+)/i);
            if (traits) (charMem as any).traits?.push(traits[2].trim());
          }

          atomic.characters.push(charMem);
        });

        atomic.characters.forEach((char, idx) => {
          const otherChars = atomic.characters.filter((_, i) => i !== idx);
          otherChars.forEach(other => {
            if ((char as any).description?.includes(other.name) || (other as any).description?.includes(char.name)) {
              char.relationships.push({
                targetId: other.name,
                knownTo: [],
                type: 'neutral' as any,
                description: '',
              });
            }
          });
        });
      }

      if (project.outline) {
        (atomic.plots as any).push({
          type: 'main',
          id: 'main-plot',
          summary: project.outline.slice(0, 300),
          keyPoints: [],
        });
      }

      if (atomic.characters.length > 0) {
        atomic.characters.forEach(char => {
          if (!(char as any).role) {
            issues.push(`角色「${char.name}」缺少角色类型标记`);
          }

          if (!(char as any).description || (char as any).description.length < 20) {
            issues.push(`角色「${char.name}」描述过于简略`);
          }

          if (char.personality && char.personality.length > 0) {
          }
        });
      }

      resolve({ atomic, issues });
    });
  },

  async getMaintenanceLog(projectId: string): Promise<Array<{ timestamp: number; action: string; details: string }>> {
    const filePath = joinPath(getProjectMemoryPath(projectId), 'memory-bank.json');
    const data = await readJsonFile<MemoryBank>(filePath, null as any);
    return data?.maintenanceLog || [];
  },

  async logMaintenanceAction(projectId: string, action: string, details: string): Promise<void> {
    const filePath = joinPath(getProjectMemoryPath(projectId), 'memory-bank.json');
    let bank: MemoryBank | null = await readJsonFile<MemoryBank>(filePath, null as any);

    if (!bank) {
      bank = {
        projectId,
        atomic: createDefaultAtomicMemory(),
        dynamic: createDefaultDynamicMemory(),
        vectors: [],
        lastMaintained: 0,
        maintenanceLog: [],
      };
    }

    bank.maintenanceLog.push({
      timestamp: Date.now(),
      action,
      details,
    });

    if (bank.maintenanceLog.length > 100) {
      bank.maintenanceLog = bank.maintenanceLog.slice(-100);
    }

    await writeJsonFile(filePath, bank);
  },

  async updateMemoryFromChapter(projectId: string, chapterContent: string, chapterNumber: number): Promise<void> {
    if (!isMemoryBankEnabled(projectId)) {
      return;
    }

    const memoryPath = getProjectMemoryPath(projectId);
    await ensureDirectoryExists(memoryPath);

    const atomic = await this.loadAtomicMemory(projectId);
    const dynamic = await this.loadDynamicMemory(projectId);

    dynamic.current.chapter = chapterNumber;
    dynamic.tension.history.push({
      chapter: chapterNumber,
      level: Math.floor(Math.random() * 5) + 3,
      timestamp: Date.now(),
    });

    if (dynamic.tension.history.length > 20) {
      dynamic.tension.history = dynamic.tension.history.slice(-20);
    }

    await this.saveAtomicMemory(projectId, atomic);
    await this.saveDynamicMemory(projectId, dynamic);
  },

  async ensureMemoryBankInitialized(projectId: string): Promise<void> {
    const memoryPath = getProjectMemoryPath(projectId);
    await ensureDirectoryExists(memoryPath);

    const atomicPath = joinPath(memoryPath, 'atomic.json');
    // 先尝试读取，如果失败就创建
    try {
      const atomic = await readJsonFile(atomicPath, null);
      if (!atomic) {
        await writeJsonFile(atomicPath, createDefaultAtomicMemory());
      }
    } catch {
      await writeJsonFile(atomicPath, createDefaultAtomicMemory());
    }

    const dynamicPath = joinPath(memoryPath, 'dynamic.json');
    try {
      const dynamic = await readJsonFile(dynamicPath, null);
      if (!dynamic) {
        await writeJsonFile(dynamicPath, createDefaultDynamicMemory());
      }
    } catch {
      await writeJsonFile(dynamicPath, createDefaultDynamicMemory());
    }

    const vectorsPath = joinPath(memoryPath, 'vectors.json');
    try {
      const vectors = await readJsonFile(vectorsPath, null);
      if (!vectors) {
        await writeJsonFile(vectorsPath, []);
      }
    } catch {
      await writeJsonFile(vectorsPath, []);
    }
  },

  async tryGetProjectData(projectId: string): Promise<Project | null> {
    try {
      const project = dataService.getActiveProject();
      return project?.id === projectId ? (project as unknown as Project) : null;
    } catch {
      return null;
    }
  },

  async lightweightIndexContent(
    projectId: string,
    fileId: string,
    fileName: string,
    content: string,
    folderTags: string[],
    model?: ModelConfig,
  ): Promise<void> {
    if (!isMemoryBankEnabled(projectId)) {
      return;
    }

    if (!content || content.trim().length < 10) return;

    await this.ensureMemoryBankInitialized(projectId);

    const atomic = await this.loadAtomicMemory(projectId);
    const dynamic = await this.loadDynamicMemory(projectId);
    let atomicUpdated = false;
    let dynamicUpdated = false;

    if (folderTags.includes('characters')) {
      const charName = fileName.replace(/\.(txt|md|json)$/,'');
      const existingIdx = atomic.characters.findIndex(c => c.id === fileId || c.name === charName);
      
      let parsed;
      if (model && content.length > 200) {
        parsed = await this.analyzeCharacterWithAI(charName, content, model);
      } else {
        parsed = this.fallbackAnalyzeCharacter(charName, content);
      }

      if (existingIdx >= 0) {
        atomic.characters[existingIdx].name = charName;
        if (parsed.identity && (!atomic.characters[existingIdx].identity || atomic.characters[existingIdx].identity.length < 20)) {
          atomic.characters[existingIdx].identity = parsed.identity;
        }
        if (parsed.personality && parsed.personality.length > 0) {
          parsed.personality.forEach(p => {
            if (!atomic.characters[existingIdx].personality.includes(p)) {
              atomic.characters[existingIdx].personality.push(p);
            }
          });
        }
        if (parsed.abilities && parsed.abilities.length > 0) {
          parsed.abilities.forEach(a => {
            if (!atomic.characters[existingIdx].abilities.includes(a)) {
              atomic.characters[existingIdx].abilities.push(a);
            }
          });
        }
        if (parsed.secrets && parsed.secrets.length > 0) {
          parsed.secrets.forEach(s => {
            if (!atomic.characters[existingIdx].secrets.includes(s)) {
              atomic.characters[existingIdx].secrets.push(s);
            }
          });
        }
        if (parsed.relationships && parsed.relationships.length > 0) {
          parsed.relationships.forEach(r => {
            const existingRel = atomic.characters[existingIdx].relationships.find(
              rel => rel.targetId === r.target && rel.type === r.type
            );
            if (!existingRel) {
              atomic.characters[existingIdx].relationships.push({
                targetId: r.target,
                type: r.type as any,
                description: '',
              });
            }
          });
        }
      } else {
        atomic.characters.push({
          id: fileId,
          name: charName,
          identity: parsed.identity || content.slice(0, 200),
          personality: parsed.personality || [],
          abilities: parsed.abilities || [],
          relationships: parsed.relationships ? parsed.relationships.map(r => ({
            targetId: r.target,
            type: r.type as any,
            description: '',
          })) : [],
          secrets: parsed.secrets || [],
          arc: { start: '', current: '', goal: '' },
        });
      }
      atomicUpdated = true;
    }

    if (folderTags.includes('world')) {
      const label = `[${fileName}] ${content.slice(0, 100)}`;
      if (!atomic.world.rules.some(r => r.startsWith(`[${fileName}]`))) {
        atomic.world.rules.push(label);
      } else {
        const idx = atomic.world.rules.findIndex(r => r.startsWith(`[${fileName}]`));
        if (idx >= 0) atomic.world.rules[idx] = label;
      }
      atomicUpdated = true;
    }

    if (folderTags.includes('chapters')) {
      const chapterMatch = fileName.match(/第?(\d+)/);
      if (chapterMatch) {
        const chNum = parseInt(chapterMatch[1], 10);
        if (chNum > dynamic.current.chapter) {
          dynamic.current.chapter = chNum;
          dynamicUpdated = true;
        }
      }
    }

    if (folderTags.includes('outline')) {
      const existingIdx = atomic.plots.findIndex(p => p.id === fileId);
      if (existingIdx >= 0) {
        atomic.plots[existingIdx].description = content.slice(0, 300);
      } else {
        atomic.plots.push({
          id: fileId,
          type: 'main',
          description: content.slice(0, 300),
          status: 'active',
          involvedCharacters: [],
          foreshadows: [],
        });
      }
      atomicUpdated = true;
    }

    if (folderTags.includes('timeline')) {
      const label = `[${fileName}] ${content.slice(0, 100)}`;
      if (!atomic.world.history.some(h => h.startsWith(`[${fileName}]`))) {
        atomic.world.history.push(label);
      } else {
        const idx = atomic.world.history.findIndex(h => h.startsWith(`[${fileName}]`));
        if (idx >= 0) atomic.world.history[idx] = label;
      }
      atomicUpdated = true;
    }

    if (folderTags.includes('detailed_outline')) {
      const existingIdx = atomic.plots.findIndex(p => p.id === fileId);
      if (existingIdx < 0) {
        atomic.plots.push({
          id: fileId,
          type: 'sub',
          description: content.slice(0, 300),
          status: 'active',
          involvedCharacters: [],
          foreshadows: [],
        });
      }
      atomicUpdated = true;
    }

    if (atomicUpdated) {
      await this.saveAtomicMemory(projectId, atomic);
    }
    if (dynamicUpdated) {
      await this.saveDynamicMemory(projectId, dynamic);
    }

    await this.logMaintenanceAction(
      projectId,
      '自动索引',
      `文件「${fileName}」已自动归档到记忆体`,
    );
  },

  async exportMemoryBank(projectId: string): Promise<string> {
    const atomic = await this.loadAtomicMemory(projectId);
    const dynamic = await this.loadDynamicMemory(projectId);
    const vectors = await this.loadVectors(projectId);
    const log = await this.getMaintenanceLog(projectId);
    const bank: MemoryBank = {
      projectId,
      atomic,
      dynamic,
      vectors,
      lastMaintained: 0,
      maintenanceLog: log,
    };
    return JSON.stringify(bank, null, 2);
  },

  parseCharacterContent(content: string): {
    identity?: string;
    personality?: string[];
    abilities?: string[];
    secrets?: string[];
  } {
    const result: { identity?: string; personality?: string[]; abilities?: string[]; secrets?: string[] } = {};
    
    if (!content || content.trim().length === 0) {
      return result;
    }
    
    const lines = content.split('\n');
    let currentSection = '';
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      if (trimmed.startsWith('##') || trimmed.startsWith('###')) {
        const match = trimmed.match(/^#{2,}\s*([^\n]+)/);
        if (match) {
          currentSection = match[1].toLowerCase();
        }
        continue;
      }
      
      if (trimmed.startsWith('**') && trimmed.endsWith('**')) {
        const match = trimmed.match(/^\*\*([^*]+)\*\*[：:]?\s*(.+)?/);
        if (match) {
          const key = match[1].toLowerCase();
          const value = match[2]?.trim();
          
          if (key.includes('身份') || (key.includes('角色') && !key.includes('类型'))) {
            if (value) {
              result.identity = value;
            }
          } else if (key.includes('性格') || key.includes('个性')) {
            result.personality = result.personality || [];
            if (value) {
              result.personality.push(...value.split(/[,，、]/).map(s => s.trim()).filter(s => s.length > 0));
            }
          } else if (key.includes('能力') || key.includes('技能') || key.includes('修为')) {
            result.abilities = result.abilities || [];
            if (value) {
              result.abilities.push(...value.split(/[,，、]/).map(s => s.trim()).filter(s => s.length > 0));
            }
          } else if (key.includes('秘密') || key.includes('隐藏')) {
            result.secrets = result.secrets || [];
            if (value) {
              result.secrets.push(value);
            }
          }
        }
        continue;
      }
      
      if (currentSection.includes('性格') || currentSection.includes('个性')) {
        if (trimmed.length > 0) {
          result.personality = result.personality || [];
          const items = trimmed.split(/[,，、。！？；;]/).map(s => s.trim()).filter(s => s.length >= 2);
          result.personality.push(...items);
        }
      } else if (currentSection.includes('能力') || currentSection.includes('技能')) {
        if (trimmed.length > 0) {
          result.abilities = result.abilities || [];
          const items = trimmed.split(/[,，、。！？；;]/).map(s => s.trim()).filter(s => s.length >= 2);
          result.abilities.push(...items);
        }
      } else if (currentSection.includes('秘密')) {
        if (trimmed.length > 0) {
          result.secrets = result.secrets || [];
          result.secrets.push(trimmed);
        }
      } else if (!result.identity && trimmed.length > 10 && !result.identity) {
        result.identity = trimmed.substring(0, 150);
      }
    }
    
    if (result.personality) {
      result.personality = [...new Set(result.personality.filter(p => p.length >= 2))].slice(0, 8);
    }
    if (result.abilities) {
      result.abilities = [...new Set(result.abilities.filter(a => a.length >= 2))].slice(0, 8);
    }
    if (result.secrets) {
      result.secrets = [...new Set(result.secrets.filter(s => s.length >= 5))].slice(0, 5);
    }
    
    return result;
  },

  fallbackAnalyzeCharacter(characterName: string, fullContent: string) {
    const parsed = this.parseCharacterContent(fullContent);
    return {
      identity: parsed.identity || fullContent.slice(0, 200),
      personality: parsed.personality || [],
      abilities: parsed.abilities || [],
      secrets: parsed.secrets || [],
      relationships: [],
    };
  },

  async analyzeCharacterWithAI(
    characterName: string,
    fullContent: string,
    model: ModelConfig
  ): Promise<{
    identity: string;
    personality: string[];
    abilities: string[];
    secrets: string[];
    relationships: { target: string; type: string }[];
  }> {
    const prompt = `
你是一位专业的角色设定分析师。请分析以下角色设定，提取关键信息：

角色名称：${characterName}

完整设定：
${fullContent}

请输出以下 JSON 格式的分析结果：
{
  "identity": "角色的核心身份定位，100字左右",
  "personality": ["性格特征1", "性格特征2", "..."],
  "abilities": ["能力/技能1", "能力/技能2", "..."],
  "secrets": ["秘密/隐藏设定1", "秘密/隐藏设定2", "..."],
  "relationships": [{"target": "角色名", "type": "关系类型"}, ...]
}

注意：
1. identity 要精炼，突出角色最核心的特点
2. personality 只提取最关键的3-5个性格特征
3. abilities 只提取最主要的3-5个能力
4. secrets 只提取最重要的2-3个秘密
5. relationships 列出与其他角色的主要关系
6. 如果没有相关信息，对应字段可以为空数组或空字符串
7. 只输出 JSON，不要其他内容
    `.trim();

    try {
      const result = await aiService.generateWithContext({
        model,
        prompt,
        maxTokens: 1500,
        temperature: 0.3,
      });

      if (result.error) {
        console.warn('[MemoryBankService] AI 分析角色失败:', result.error);
        return this.fallbackAnalyzeCharacter(characterName, fullContent);
      }

      try {
        const parsed = JSON.parse(result.content || '{}');
        return {
          identity: parsed.identity || '',
          personality: parsed.personality || [],
          abilities: parsed.abilities || [],
          secrets: parsed.secrets || [],
          relationships: parsed.relationships || [],
        };
      } catch {
        console.warn('[MemoryBankService] AI 分析结果解析失败');
        return this.fallbackAnalyzeCharacter(characterName, fullContent);
      }
    } catch {
      return this.fallbackAnalyzeCharacter(characterName, fullContent);
    }
  },

  async extractNewElements(projectId: string, content: string): Promise<{ newCharacters: string[]; newLocations: string[]; newItems: string[] }> {
    const atomic = await this.loadAtomicMemory(projectId);
    const existingChars = new Set(atomic.characters.map(c => c.name.toLowerCase()));

    const newCharacters: string[] = [];
    const namePattern = /([\u4e00-\u9fa5]{2,6})[（(]([^）)]+)[）)]/g;
    let match;
    while ((match = namePattern.exec(content)) !== null) {
      const name = match[1].trim();
      if (!existingChars.has(name.toLowerCase()) && !newCharacters.includes(name)) {
        newCharacters.push(name);
      }
    }

    const newLocations: string[] = [];
    const locationPattern = /[在于到]([\u4e00-\u9fa5]{2,8})[处里中边]/g;
    while ((match = locationPattern.exec(content)) !== null) {
      const loc = match[1].trim();
      if (!newLocations.includes(loc)) {
        newLocations.push(loc);
      }
    }

    return { newCharacters, newLocations, newItems: [] };
  },

  /**
   * 同步整个项目的文件系统到记忆体（给 AI 当图书馆用）
   */
  async syncFromFileSystem(projectId: string): Promise<void> {
    console.log('[MemoryBank] 开始从文件系统同步到记忆体图书馆...');
    
    const atomic = await this.loadAtomicMemory(projectId);
    let hasChanges = false;

    // 1. 同步角色文件夹
    const characterFolderId = dataService.getRootFolderIdByType('characters', projectId);
    let currentFileIds = new Set<string>();
    if (characterFolderId) {
      const characterFiles = dataService.getChildren(characterFolderId, projectId);
      currentFileIds = new Set(characterFiles.filter(vf => vf.type === 'file').map(vf => vf.id));
      
      if (characterFiles && characterFiles.length > 0) {
        const existingIds = new Set(atomic.characters.map(c => c.id));
        
        characterFiles.forEach(vf => {
          if (vf.type === 'file' && vf.content) {
            if (!existingIds.has(vf.id)) {
              // 新增角色
              atomic.characters.push({
                id: vf.id,
                name: vf.name,
                identity: vf.content.substring(0, 200),
                personality: [],
                abilities: [],
                relationships: [],
                secrets: [],
                arc: { start: '', current: '', goal: '' },
              });
              hasChanges = true;
              console.log('[MemoryBank] 新增角色:', vf.name);
            } else {
              // 更新已有的角色
              const idx = atomic.characters.findIndex(c => c.id === vf.id);
              if (idx >= 0) {
                atomic.characters[idx].name = vf.name;
                atomic.characters[idx].identity = vf.content.substring(0, 200);
                hasChanges = true;
              }
            }
          }
        });
      }
    }
    
    // 删除检测：移除记忆体中文件系统中已不存在的角色
    const deletedChars = atomic.characters.filter(c => c.id && !currentFileIds.has(c.id));
    if (deletedChars.length > 0) {
      atomic.characters = atomic.characters.filter(c => c.id && currentFileIds.has(c.id));
      hasChanges = true;
      console.log('[MemoryBank] 删除角色:', deletedChars.map(c => c.name).join(', '));
    }

    // 2. 同步世界观文件夹
    const worldFolderId = dataService.getRootFolderIdByType('world', projectId);
    let currentWorldFileNames = new Set<string>();
    if (worldFolderId) {
      const worldFiles = dataService.getChildren(worldFolderId, projectId);
      currentWorldFileNames = new Set(worldFiles.filter(vf => vf.type === 'file' && vf.content).map(vf => `[${vf.name}]`));
      
      if (worldFiles && worldFiles.length > 0) {
        worldFiles.forEach(vf => {
          if (vf.type === 'file' && vf.content) {
            const label = `[${vf.name}] ${vf.content.substring(0, 150)}`;
            if (!atomic.world.rules.some(r => r.startsWith(`[${vf.name}]`))) {
              atomic.world.rules.push(label);
              hasChanges = true;
              console.log('[MemoryBank] 新增世界观:', vf.name);
            } else {
              const idx = atomic.world.rules.findIndex(r => r.startsWith(`[${vf.name}]`));
              if (idx >= 0 && atomic.world.rules[idx] !== label) {
                atomic.world.rules[idx] = label;
                hasChanges = true;
              }
            }
          }
        });
      }
    }
    
    // 删除检测：移除记忆体中文件系统已不存在的世界观
    const deletedWorlds = atomic.world.rules.filter(r => {
      const prefix = r.match(/^\[[^\]]+\]/)?.[0];
      return prefix && !currentWorldFileNames.has(prefix);
    });
    if (deletedWorlds.length > 0) {
      atomic.world.rules = atomic.world.rules.filter(r => {
        const prefix = r.match(/^\[[^\]]+\]/)?.[0];
        return !prefix || currentWorldFileNames.has(prefix);
      });
      hasChanges = true;
      console.log('[MemoryBank] 删除世界观:', deletedWorlds.length, '条');
    }

    // 3. 同步时间线文件夹
    const timelineFolderId = dataService.getRootFolderIdByType('timeline', projectId);
    let currentTimelineFileNames = new Set<string>();
    if (timelineFolderId) {
      const timelineFiles = dataService.getChildren(timelineFolderId, projectId);
      currentTimelineFileNames = new Set(timelineFiles.filter(vf => vf.type === 'file' && vf.content).map(vf => `[${vf.name}]`));
      
      if (timelineFiles && timelineFiles.length > 0) {
        timelineFiles.forEach(vf => {
          if (vf.type === 'file' && vf.content) {
            const label = `[${vf.name}] ${vf.content.substring(0, 150)}`;
            if (!atomic.world.history.some(h => h.startsWith(`[${vf.name}]`))) {
              atomic.world.history.push(label);
              hasChanges = true;
            } else {
              const idx = atomic.world.history.findIndex(h => h.startsWith(`[${vf.name}]`));
              if (idx >= 0 && atomic.world.history[idx] !== label) {
                atomic.world.history[idx] = label;
                hasChanges = true;
              }
            }
          }
        });
      }
    }
    
    // 删除检测：移除记忆体中文件系统已不存在的时间线
    const deletedTimelines = atomic.world.history.filter(h => {
      const prefix = h.match(/^\[[^\]]+\]/)?.[0];
      return prefix && !currentTimelineFileNames.has(prefix);
    });
    if (deletedTimelines.length > 0) {
      atomic.world.history = atomic.world.history.filter(h => {
        const prefix = h.match(/^\[[^\]]+\]/)?.[0];
        return !prefix || currentTimelineFileNames.has(prefix);
      });
      hasChanges = true;
      console.log('[MemoryBank] 删除时间线:', deletedTimelines.length, '条');
    }

    // 4. 同步大纲文件夹
    const outlineFolderId = dataService.getRootFolderIdByType('outline', projectId);
    let currentOutlineIds = new Set<string>();
    if (outlineFolderId) {
      const outlineFiles = dataService.getChildren(outlineFolderId, projectId);
      currentOutlineIds = new Set(outlineFiles.filter(vf => vf.type === 'file').map(vf => vf.id));
      
      if (outlineFiles && outlineFiles.length > 0) {
        const existingPlotIds = new Set(atomic.plots.map(p => p.id));
        
        outlineFiles.forEach(vf => {
          if (vf.type === 'file' && vf.content) {
            if (!existingPlotIds.has(vf.id)) {
              atomic.plots.push({
                id: vf.id,
                type: 'main',
                description: vf.content.substring(0, 300),
                status: 'active',
                involvedCharacters: [],
                foreshadows: [],
              });
              hasChanges = true;
            } else {
              const idx = atomic.plots.findIndex(p => p.id === vf.id);
              if (idx >= 0) {
                atomic.plots[idx].description = vf.content.substring(0, 300);
                hasChanges = true;
              }
            }
          }
        });
      }
    }
    
    // 删除检测：移除记忆体中文件系统已不存在的剧情线
    const deletedPlots = atomic.plots.filter(p => p.id && !currentOutlineIds.has(p.id));
    if (deletedPlots.length > 0) {
      atomic.plots = atomic.plots.filter(p => p.id && currentOutlineIds.has(p.id));
      hasChanges = true;
      console.log('[MemoryBank] 删除剧情线:', deletedPlots.length, '条');
    }

    if (hasChanges) {
      // 保存到文件系统
      await this.saveAtomicMemory(projectId, atomic);
      
      // 同时也保存到 localStorage 作为缓存
      const cacheKey = `memorybank_${projectId}_atomic`;
      try {
        localStorage.setItem(cacheKey, JSON.stringify(atomic));
        console.log('[MemoryBank] 记忆体已保存到 localStorage');
      } catch (e) {
        console.warn('[MemoryBank] localStorage 保存失败', e);
      }
      
      await this.logMaintenanceAction(
        projectId,
        '文件系统同步',
        `从文件系统同步了 ${atomic.characters.length} 个角色、${atomic.world.rules.length + atomic.world.history.length} 条设定、${atomic.plots.length} 条剧情线`,
      );
      console.log('[MemoryBank] 文件系统同步完成!');
    } else {
      console.log('[MemoryBank] 文件系统没有新内容需要同步');
    }

    // 更新缓存
    cachedAtomicMemory = atomic;
    lastSyncProjectId = projectId;
  },

  /**
   * 同步版本：快速获取原子记忆（带缓存）
   */
  getAtomicMemorySync(projectId: string): AtomicMemory {
    // 如果缓存失效或项目改变，尝试重新加载
    if (!cachedAtomicMemory || lastSyncProjectId !== projectId) {
      // 尝试从 localStorage 快速读取
      const key = `memorybank_${projectId}_atomic`;
      try {
        const stored = localStorage.getItem(key);
        if (stored) {
          cachedAtomicMemory = JSON.parse(stored);
          lastSyncProjectId = projectId;
          console.log('[MemoryBank] 从 localStorage 恢复记忆体');
        }
      } catch (e) {
        console.warn('[MemoryBank] localStorage 读取失败', e);
      }
      if (!cachedAtomicMemory) {
        cachedAtomicMemory = createDefaultAtomicMemory();
      }
    }
    return cachedAtomicMemory;
  },

  /**
   * 同步版本：快速获取动态记忆
   */
  getDynamicMemorySync(projectId: string): DynamicMemory {
    if (!cachedDynamicMemory || lastSyncProjectId !== projectId) {
      cachedDynamicMemory = createDefaultDynamicMemory();
    }
    return cachedDynamicMemory;
  },

  /**
   * 同步版本：构建记忆体上下文（给 AI 当图书馆）
   */
  buildContextFromMemorySync(projectId: string, target?: string): string {
    const sections: string[] = [];
    const atomic = this.getAtomicMemorySync(projectId);
    const dynamic = this.getDynamicMemorySync(projectId);

    sections.push('## 🧠 【记忆体图书馆】');
    sections.push('（以下是你的设定知识库，必须遵守这些设定，不要产生矛盾！）\n');

    // 世界观记忆
    if (atomic.world.rules.length > 0 || atomic.world.cosmology || atomic.world.geography.length > 0 || atomic.world.history.length > 0) {
      sections.push('---');
      sections.push('### 🌍 【世界观设定】');
      
      if (atomic.world.cosmology) {
        sections.push(`**力量体系**: ${atomic.world.cosmology}\n`);
      }
      
      if (atomic.world.rules.length > 0) {
        sections.push('**核心规则**:');
        atomic.world.rules.slice(0, 15).forEach(rule => {
          sections.push(`- ${rule}`);
        });
        sections.push('');
      }
      
      if (atomic.world.geography.length > 0) {
        sections.push('**地理设定**:');
        atomic.world.geography.slice(0, 8).forEach(geo => {
          sections.push(`- ${geo}`);
        });
        sections.push('');
      }
      
      if (atomic.world.history.length > 0) {
        sections.push('**历史事件**:');
        atomic.world.history.slice(0, 8).forEach(his => {
          sections.push(`- ${his}`);
        });
        sections.push('');
      }
    }
    
    // 角色记忆
    if (atomic.characters.length > 0) {
      sections.push('---');
      sections.push(`### 🧑‍🤝‍🧑 【角色档案】（共${atomic.characters.length}位角色）`);
      
      // 根据 target 过滤角色，如果是角色相关，显示更多细节
      const isCharacterTarget = target && ['character', 'general'].includes(target);
      const charLimit = isCharacterTarget ? atomic.characters.length : Math.min(10, atomic.characters.length);
      
      atomic.characters.slice(0, charLimit).forEach((char) => {
        sections.push(`\n---\n**【${char.name}】**`);
        if (char.identity) {
          sections.push(`- 身份: ${char.identity}`);
        }
        if (char.personality && char.personality.length > 0) {
          sections.push(`- 性格: ${char.personality.join('、')}`);
        }
        if (char.abilities && char.abilities.length > 0) {
          sections.push(`- 能力: ${char.abilities.join('、')}`);
        }
        if (char.secrets && char.secrets.length > 0) {
          sections.push(`- 秘密: ${char.secrets.join('、')}`);
        }
        if (char.relationships && char.relationships.length > 0) {
          sections.push('- 关系:');
          char.relationships.forEach(rel => {
            const relTypeDesc = {
              'ally': '盟友',
              'enemy': '敌人', 
              'neutral': '普通',
              'family': '亲人',
              'master': '师徒',
              'disciple': '师徒'
            }[rel.type] || rel.type;
            sections.push(`  - ${rel.target} (${relTypeDesc}): ${rel.description || ''}`);
          });
        }
        if (char.arc && (char.arc.start || char.arc.current || char.arc.goal)) {
          sections.push('- 角色弧光:');
          if (char.arc.start) sections.push(`  - 起源: ${char.arc.start}`);
          if (char.arc.current) sections.push(`  - 现状: ${char.arc.current}`);
          if (char.arc.goal) sections.push(`  - 目标: ${char.arc.goal}`);
        }
      });
      
      if (atomic.characters.length > charLimit) {
        sections.push(`\n...还有 ${atomic.characters.length - charLimit} 位角色`);
      }
    }
    
    // 剧情记忆
    if (atomic.plots.length > 0) {
      sections.push('\n---');
      sections.push('### 📖 【剧情线】');
      
      atomic.plots.forEach(plot => {
        const statusIcon = plot.status === 'resolved' ? '✅' : plot.status === 'active' ? '🔥' : '⏸️';
        const typeLabel = plot.type === 'main' ? '主线' : plot.type === 'sub' ? '支线' : plot.type === 'romance' ? '感情' : '悬疑';
        sections.push(`\n**${statusIcon} ${typeLabel}剧情**`);
        sections.push(`- ${plot.description}`);
        
        if (plot.involvedCharacters && plot.involvedCharacters.length > 0) {
          sections.push(`- 涉及角色: ${plot.involvedCharacters.join('、')}`);
        }
        
        if (plot.foreshadows && plot.foreshadows.length > 0) {
          sections.push('- 伏笔:');
          plot.foreshadows.forEach(foreshadow => {
            const foreshadowStatus = foreshadow.status === 'resolved' ? '✅已收' : foreshadow.status === 'partial' ? '⚠️部分' : '🌱种下';
            sections.push(`  ${foreshadowStatus} ${foreshadow.hint} (第${foreshadow.chapter}章)`);
          });
        }
      });
    }
    
    // 当前进度
    if (dynamic.current.chapter > 0 || dynamic.tension.level > 0) {
      sections.push('\n---');
      sections.push('### ⏱️ 【当前创作进度】');
      
      if (dynamic.current.chapter > 0) {
        sections.push(`- 当前章节: 第${dynamic.current.chapter}章`);
      }
      if (dynamic.current.scene) {
        sections.push(`- 场景: ${dynamic.current.scene}`);
      }
      if (dynamic.current.pov) {
        sections.push(`- 视角: ${dynamic.current.pov}`);
      }
      if (dynamic.current.location) {
        sections.push(`- 地点: ${dynamic.current.location}`);
      }
      if (dynamic.current.time) {
        sections.push(`- 时间: ${dynamic.current.time}`);
      }
      if (dynamic.current.mood) {
        sections.push(`- 氛围: ${dynamic.current.mood}`);
      }
      if (dynamic.tension && dynamic.tension.level !== undefined) {
        const tensionLevel = Math.round(dynamic.tension.level);
        const tensionBar = '🔥'.repeat(Math.min(tensionLevel, 5));
        sections.push(`- 剧情紧张度: ${tensionLevel}/5 ${tensionBar}`);
      }
    }
    
    // 如果记忆体是空的，给出提示
    if (sections.length === 1) {
      return '## 🧠 【记忆体图书馆】\n（还没有设定数据，请先在「内容设定」中创建角色、世界观等设定文件）';
    }
    
    return sections.filter(s => s.length > 0).join('\n');
  },
};