import { VFile, VFileSystem, VFileMetadata, ProjectMeta, AppData } from '../../../shared/types/fileSystem';
import { ModelConfig, PromptTemplate } from '../../../shared/types';
import { INITIAL_MODELS } from '../../../shared/constants';
import { getPromptLibrary } from '../../../shared/prompts';
import { memoryBankService } from './MemoryBankService';
import { accumulateTodayWords } from '../stores/uiStore';
import { nanoid } from '../utils/nanoid';
import { inferContentType } from '../utils/contentType';

function getRecycleBinKey(projectId: string) { return `moyuan-recycle-bin-${projectId}`; }
function getRecycleFolderKey(projectId: string) { return `moyuan-recycle-folder-${projectId}`; }

const STORAGE_KEY = 'moyuan-v2-data';

type ChangeListener = () => void;

function createDefaultMetadata(partial?: Partial<VFileMetadata>): VFileMetadata {
  return {
    tags: [],
    favorited: true,
    cardType: '',
    references: [],
    aiGenerated: false,
    batchId: null,
    sortOrder: 0,
    ...partial,
  };
}

function createEmptyFS(): VFileSystem {
  return { files: {}, rootIds: [] };
}

function createDefaultProject(title: string, intro?: string): { meta: ProjectMeta; fs: VFileSystem } {
  const projectId = nanoid();
  const now = Date.now();

  const worldId = nanoid();
  const charsId = nanoid();
  const timelineId = nanoid();
  const outlineId = nanoid();
  const detailedOutlineId = nanoid();
  const chaptersId = nanoid();

  const folders: VFile[] = [
    { id: worldId, name: '世界观', type: 'folder', parentId: null, content: '', metadata: createDefaultMetadata({ tags: ['world'], cardType: 'folder' }), childrenIds: [], createdAt: now, updatedAt: now, version: 1 },
    { id: charsId, name: '角色', type: 'folder', parentId: null, content: '', metadata: createDefaultMetadata({ tags: ['characters'], cardType: 'folder' }), childrenIds: [], createdAt: now, updatedAt: now, version: 1 },
    { id: timelineId, name: '时间线', type: 'folder', parentId: null, content: '', metadata: createDefaultMetadata({ tags: ['timeline'], cardType: 'folder' }), childrenIds: [], createdAt: now, updatedAt: now, version: 1 },
    { id: outlineId, name: '大纲', type: 'folder', parentId: null, content: '', metadata: createDefaultMetadata({ tags: ['outline'], cardType: 'folder' }), childrenIds: [], createdAt: now, updatedAt: now, version: 1 },
    { id: detailedOutlineId, name: '细纲', type: 'folder', parentId: null, content: '', metadata: createDefaultMetadata({ tags: ['detailed_outline'], cardType: 'folder' }), childrenIds: [], createdAt: now, updatedAt: now, version: 1 },
    { id: chaptersId, name: '章节', type: 'folder', parentId: null, content: '', metadata: createDefaultMetadata({ tags: ['chapters'], cardType: 'folder' }), childrenIds: [], createdAt: now, updatedAt: now, version: 1 },
  ];

  const files: Record<string, VFile> = {};
  for (const f of folders) files[f.id] = f;

  return {
    meta: { id: projectId, title, intro: intro || '', createdAt: now, updatedAt: now, rootFolderIds: [worldId, charsId, timelineId, outlineId, detailedOutlineId, chaptersId], inspiration: { text: '', tags: [], promptHistory: [] }, novelSchemes: [], selectedSchemeId: null, schemeHistory: [], schemeGroups: [], schemePromptHistory: [], outline: '' },
    fs: { files, rootIds: [worldId, charsId, timelineId, outlineId, detailedOutlineId, chaptersId] },
  };
}

class DataService {
  private data: AppData;
  private listeners: Set<ChangeListener> = new Set();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private static instance: DataService | null = null;
  private _cryptoKey: string = 'moyuan-lingbi-v1'; // 旧密钥，initCryptoKey 后替换为每安装随机密钥
  /**
   * P0-safeStorage: 启动时把所有 models 的 apiKey 明文解密缓存到内存 Map
   * getActiveModel/getModels 从 Map 读明文，避免把同步方法改异步（影响面大）
   * 缓存未命中时（如 updateModels 后未刷新）降级用同步 XOR 解密
   */
  private apiKeyCache: Map<string, string> = new Map();

  private constructor() {
    this.data = this.loadFromStorage() || this.createDefaultData();
    this.autoCleanOutlineFragments();
    this.ensureDetailedOutlineFolder();
  }

  /** 初始化加密密钥（应用启动时调用一次） */
  async initCryptoKey(): Promise<void> {
    try {
      const api = window.electronAPI;
      if (api) {
        const keyPath = (await api.getAppDataPath()) + '/crypto.key';
        if (await api.exists(keyPath)) {
          this._cryptoKey = await api.readFile(keyPath);
        } else {
          const newKey = this.generateRandomKey();
          await api.writeFile(keyPath, newKey);
          this._cryptoKey = newKey;
        }
      } else {
        let stored = localStorage.getItem('moyuan-crypto-key');
        if (!stored) {
          stored = this.generateRandomKey();
          localStorage.setItem('moyuan-crypto-key', stored);
        }
        this._cryptoKey = stored;
      }
    } catch (err) {
      console.warn('[DataService] 加密密钥初始化失败，使用默认密钥:', err);
    }
  }

  /** 迁移旧密钥加密的 API Key 到新密钥 */
  async migrateApiKeys(): Promise<void> {
    if (this._cryptoKey === 'moyuan-lingbi-v1') return;
    const oldKey = 'moyuan-lingbi-v1';
    let migrated = false;
    for (const model of this.data.models) {
      if (model.apiKey && model.apiKey.startsWith('enc:')) {
        const raw = this.xorCrypt(atob(model.apiKey.slice(4)), oldKey);
        model.apiKey = 'enc:' + btoa(this.xorCrypt(raw, this._cryptoKey));
        migrated = true;
      }
    }
    if (migrated) {
      this.saveToStorage();
      console.log('[DataService] API Key 已迁移到新的加密密钥');
    }
  }

  /**
   * safeStorage 集成：优先用 OS 原生加密（Windows Credential Manager / macOS Keychain），
   * 不可用时降级到 XOR + 随机密钥（Web/PWA/Capacitor 或 Linux 无 DE 环境）。
   * 密文前缀 'safe:' 表示 safeStorage，'enc:' 表示 XOR 降级。
   */
  private async secureEncrypt(plaintext: string): Promise<string> {
    const api = window.electronAPI;
    if (api && await api.safeStorageAvailable()) {
      try {
        const cipher = await api.safeStorageEncrypt(plaintext);
        return 'safe:' + cipher;
      } catch (err) {
        console.warn('[DataService] safeStorage encrypt 失败，降级 XOR:', err);
      }
    }
    return 'enc:' + btoa(this.xorCrypt(plaintext, this._cryptoKey));
  }

  private async secureDecrypt(cipher: string): Promise<string> {
    if (cipher.startsWith('safe:')) {
      const api = window.electronAPI;
      if (api) {
        try {
          return await api.safeStorageDecrypt(cipher.slice(5));
        } catch (err) {
          console.warn('[DataService] safeStorage decrypt 失败（可能系统重装/账户变更），需用户重填 API Key:', err);
          return '';
        }
      }
      // 非 Electron 环境但密文是 safe: 格式（不应发生，防御性处理）
      console.warn('[DataService] 非 Electron 环境无法解密 safe: 密文，需用户重填');
      return '';
    }
    if (cipher.startsWith('enc:')) {
      return this.xorCrypt(atob(cipher.slice(4)), this._cryptoKey);
    }
    // 无前缀：旧明文（历史数据），直接返回
    return cipher;
  }

  /** 把旧 XOR 密文（enc:）升级到 safeStorage 密文（safe:） */
  async upgradeToSafeStorage(): Promise<void> {
    const api = window.electronAPI;
    if (!api || !await api.safeStorageAvailable()) return; // 非 Electron 或不可用，跳过
    let upgraded = 0;
    for (const model of this.data.models) {
      if (model.apiKey && model.apiKey.startsWith('enc:')) {
        try {
          const plain = this.xorCrypt(atob(model.apiKey.slice(4)), this._cryptoKey);
          model.apiKey = await this.secureEncrypt(plain);
          upgraded++;
        } catch (err) {
          console.warn(`[DataService] 模型 ${model.id} 的 API Key 升级 safeStorage 失败:`, err);
        }
      }
    }
    if (upgraded > 0) {
      this.saveToStorage();
      console.log(`[DataService] ${upgraded} 个 API Key 已升级到 safeStorage 加密`);
    }
  }

  /** 启动时把所有 models 的 apiKey 解密缓存到内存（供 getActiveModel/getModels 同步读） */
  async initApiKeyCache(): Promise<void> {
    this.apiKeyCache.clear();
    for (const model of this.data.models) {
      if (model.apiKey) {
        try {
          const plain = await this.secureDecrypt(model.apiKey);
          this.apiKeyCache.set(model.id, plain);
        } catch (err) {
          console.warn(`[DataService] 模型 ${model.id} 的 apiKey 缓存失败:`, err);
        }
      }
    }
  }

  private generateRandomKey(): string {
    const arr = new Uint8Array(32);
    crypto.getRandomValues(arr);
    return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
  }

  private xorCrypt(input: string, key: string): string {
    let result = '';
    for (let i = 0; i < input.length; i++) {
      result += String.fromCharCode(input.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    return result;
  }

  private autoCleanOutlineFragments(): void {
    try {
      const outlineFolderId = this.getRootFolderIdByType('outline');
      if (!outlineFolderId) return;
      const children = this.getChildren(outlineFolderId).filter(f => f.type === 'file');
      if (children.length <= 1) return;
      const mainOutline = children.find(f => f.name.includes('大纲'));
      const toDelete = children.filter(f => f !== mainOutline);
      if (toDelete.length === 0) return;
      console.log(`[DataService] 自动清理 ${toDelete.length} 个大纲碎片文件，保留「${mainOutline?.name || children[0]?.name}」`);
      // P0-1 修复：类内方法直接访问 this.data.fileSystems 而非 this.getFS()，
      // 避免通过 getter 返回的引用修改内部状态（getter 未来将返回只读视图）
      const pid = this.data.activeProjectId;
      if (!pid) return;
      const fs = this.data.fileSystems[pid];
      if (!fs) return;
      for (const file of toDelete) {
        delete fs.files[file.id];
        if (file.parentId && fs.files[file.parentId]) {
          fs.files[file.parentId].childrenIds = fs.files[file.parentId].childrenIds.filter(id => id !== file.id);
        }
      }
      this.saveToStorage();
    } catch (e) {
      console.error('[DataService] autoCleanOutlineFragments failed:', e);
    }
  }

  private ensureDetailedOutlineFolder(): void {
    try {
      const existing = this.getRootFolderIdByType('detailed_outline');
      if (existing) return;
      const now = Date.now();
      const id = nanoid();
      const folder: VFile = {
        id, name: '细纲', type: 'folder', parentId: null,
        content: '', metadata: createDefaultMetadata({ tags: ['detailed_outline'], cardType: 'folder' }),
        childrenIds: [], createdAt: now, updatedAt: now, version: 1,
      };
      // P0-1 修复：类内方法直接访问 this.data 而非 this.getFS()/this.getActiveProject()
      const pid = this.data.activeProjectId;
      if (!pid) return;
      const fs = this.data.fileSystems[pid];
      if (!fs) return;
      fs.files[id] = folder;
      fs.rootIds.push(id);
      const meta = this.data.projects.find(p => p.id === pid);
      if (meta) {
        meta.rootFolderIds.push(id);
        meta.updatedAt = now;
      }
      console.log('[DataService] 自动补建细纲根文件夹');
      this.saveToStorage();
    } catch (e) {
      console.error('[DataService] ensureDetailedOutlineFolder failed:', e);
    }
  }

  static getInstance(): DataService {
    if (!DataService.instance) {
      DataService.instance = new DataService();
    }
    return DataService.instance;
  }

  subscribe(listener: ChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
    this.scheduleSave();
  }

  private scheduleSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.saveToStorage(), 150);
  }

  /**
   * P0-1 探测：包装一个对象，在 DEV 模式下检测外部直接修改内部状态的行为。
   * 生产行为不变（直接返回原对象），仅在开发模式打 console.warn 并打印调用栈。
   * 用法：return this.wrapDevReadOnly(this.data, 'getData');
   */
  private wrapDevReadOnly<T extends object>(obj: T, getterName: string): T {
    // 生产环境直接返回原对象（性能优先）
    if (!import.meta.env?.DEV) return obj;
    // 已经包装过的不再重复包装
    if ((obj as any).__p01_wrapped) return obj;
    const warned = new Set<string>();
    const handler: ProxyHandler<T> = {
      get(target, prop, receiver) {
        // 内部标记直接放行
        if (prop === '__p01_wrapped') return true;
        const value = Reflect.get(target, prop, receiver);
        // 返回的引用类型也递归包装（浅层，避免性能问题）
        if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
          return new Proxy(value as object, handler) as any;
        }
        return value;
      },
      set(_target, prop, value) {
        const key = `${getterName}.${String(prop)}`;
        if (!warned.has(key)) {
          warned.add(key);
          console.warn(
            `[P0-1] 检测到外部直接修改 DataService 返回值: ${key}\n` +
            `应改用 DataService 的 mutation API（如 updateFile/updateProjectMeta 等）以保证 emit 与持久化。\n` +
            `调用栈:\n${new Error().stack?.split('\n').slice(2, 6).join('\n') || '(无)'}`
          );
        }
        return Reflect.set(_target, prop, value);
      },
      deleteProperty(_target, prop) {
        const key = `${getterName}.[delete ${String(prop)}]`;
        if (!warned.has(key)) {
          warned.add(key);
          console.warn(
            `[P0-1] 检测到外部直接删除 DataService 返回值属性: ${key}\n` +
            `调用栈:\n${new Error().stack?.split('\n').slice(2, 6).join('\n') || '(无)'}`
          );
        }
        return Reflect.deleteProperty(_target, prop);
      },
    };
    return new Proxy(obj, handler);
  }

  getData(): AppData {
    return this.wrapDevReadOnly(this.data, 'getData');
  }

  getFS(projectId?: string): VFileSystem {
    const pid = projectId || this.data.activeProjectId;
    if (!pid) return createEmptyFS();
    const fs = this.data.fileSystems[pid];
    if (!fs) return createEmptyFS();
    return this.wrapDevReadOnly(fs, 'getFS');
  }

  getActiveProject(): ProjectMeta | null {
    const project = this.data.projects.find(p => p.id === this.data.activeProjectId);
    if (!project) return null;
    return this.wrapDevReadOnly(project, 'getActiveProject');
  }

  getActiveModel(): ModelConfig {
    const model = this.data.models.find(m => m.id === this.data.activeModelId) || this.data.models[0];
    if (!model) return model;
    // safeStorage 集成：优先从内存缓存读明文（启动时已解密），缓存未命中降级同步 XOR 解密
    const cachedPlain = this.apiKeyCache.get(model.id);
    const apiKey = cachedPlain !== undefined
      ? cachedPlain
      : (model.apiKey ? this.decryptApiKey(model.apiKey) : undefined);
    return { ...model, apiKey };
  }

  getFile(fileId: string, projectId?: string): VFile | undefined {
    // P0-1 修复：通过 getFS() 获取（已被 Proxy 包装），再取 file
    const fs = this.getFS(projectId);
    const file = fs.files[fileId];
    return file ? this.wrapDevReadOnly(file, `getFile(${fileId})`) : undefined;
  }

  getChildren(parentId: string | null, projectId?: string): VFile[] {
    const fs = this.getFS(projectId);
    const ids = parentId ? (fs.files[parentId]?.childrenIds || []) : fs.rootIds;
    // P0-1 修复：数组元素也需包装，避免外部通过元素引用直接改状态
    return ids
      .map(id => fs.files[id])
      .filter(Boolean)
      .sort((a, b) => (a.metadata.sortOrder || 0) - (b.metadata.sortOrder || 0))
      .map(f => this.wrapDevReadOnly(f, `getChildren(${parentId ?? 'root'})[${f.id}]`));
  }

  getRootFolderIdByType(typeTag: string, projectId?: string): string | null {
    const folders = this.getAllFiles({ type: 'folder', tag: typeTag }, projectId);
    return folders.length > 0 ? folders[0].id : null;
  }

  getAllFiles(options?: { type?: 'folder' | 'file'; tag?: string; favoritedOnly?: boolean }, projectId?: string): VFile[] {
    const fs = this.getFS(projectId);
    let files = Object.values(fs.files);
    if (options?.type) files = files.filter(f => f.type === options.type);
    if (options?.tag) files = files.filter(f => f.metadata.tags.includes(options.tag!));
    if (options?.favoritedOnly) files = files.filter(f => f.metadata.favorited);
    return files;
  }

  searchFiles(query: string, projectId?: string): VFile[] {
    const q = query.toLowerCase();
    const fs = this.getFS(projectId);
    return Object.values(fs.files).filter(f =>
      f.name.toLowerCase().includes(q) ||
      f.content.toLowerCase().includes(q) ||
      f.metadata.tags.some(t => t.toLowerCase().includes(q))
    );
  }

  buildAIContext(maxChars: number = 8000, projectId?: string): string {
    const fs = this.getFS(projectId);
    let files = Object.values(fs.files).filter(f => f.type === 'file' && f.metadata.favorited && f.content);
    if (files.length === 0) return '';

    const grouped: Record<string, { folderName: string; files: VFile[]; isOutlineFolder: boolean }> = {};
    for (const f of files) {
      const parentId = f.parentId || '__root__';
      if (!grouped[parentId]) {
        const parent = parentId !== '__root__' ? this.getFile(parentId, projectId) : null;
        const isOutline = parent?.metadata?.tags?.includes('outline') || false;
        grouped[parentId] = { folderName: parent?.name || '根目录', files: [], isOutlineFolder: isOutline };
      }
      grouped[parentId].files.push(f);
    }

    for (const [groupId, group] of Object.entries(grouped)) {
      if (group.isOutlineFolder && group.files.length > 1) {
        const mainOutline = group.files.find(f => f.name.includes('大纲'));
        group.files = mainOutline ? [mainOutline] : [group.files[0]];
      }
    }

    let ctx = '';
    const budgetPerGroup = Math.floor(maxChars / Object.keys(grouped).length);

    for (const [, group] of Object.entries(grouped)) {
      const header = `\n## 📁 ${group.folderName}\n`;
      ctx += header;
      let groupUsed = 0;
      const budgetPerFile = Math.floor(budgetPerGroup / group.files.length);

      for (const f of group.files) {
        const maxLen = Math.min(budgetPerFile, 1200);
        const content = f.content!.length > maxLen
          ? f.content!.slice(0, maxLen) + '\n…（内容较长，可用 read_file 读取完整内容）'
          : f.content!;
        const tags = f.metadata.tags.length > 0 ? ` [${f.metadata.tags.join(', ')}]` : '';
        const entry = `### ${f.name}${tags}\n${content}\n`;
        if (ctx.length + entry.length > maxChars) break;
        if (groupUsed + entry.length > budgetPerGroup && groupUsed > 0) break;
        ctx += entry;
        groupUsed += entry.length;
      }
    }

    return ctx;
  }

  createProject(title: string, intro?: string): ProjectMeta {
    const { meta, fs } = createDefaultProject(title, intro);
    this.data.projects.push(meta);
    this.data.fileSystems[meta.id] = fs;
    this.data.activeProjectId = meta.id;
    this.emit();

    memoryBankService.ensureMemoryBankInitialized(meta.id).catch(err => {
      console.error('[DataService] 自动初始化记忆体失败:', err);
    });

    return meta;
  }

  deleteProject(projectId: string): void {
    this.data.projects = this.data.projects.filter(p => p.id !== projectId);
    delete this.data.fileSystems[projectId];
    if (this.data.activeProjectId === projectId) {
      this.data.activeProjectId = this.data.projects[0]?.id || null;
    }
    // 清理该项目的回收站数据
    try {
      localStorage.removeItem(getRecycleBinKey(projectId));
      localStorage.removeItem(getRecycleFolderKey(projectId));
    } catch (e) {
      console.error('[DataService] 清理回收站数据失败:', e);
    }
    this.emit();
  }

  renameProject(projectId: string, title: string): void {
    const p = this.data.projects.find(p => p.id === projectId);
    if (p) { p.title = title; p.updatedAt = Date.now(); this.emit(); }
  }

  setActiveProject(projectId: string): void {
    if (this.data.activeProjectId !== projectId) {
      this.data.activeProjectId = projectId;
      this.emit();
    }
  }

  createFile(parentId: string | null, params: {
    name: string;
    type: 'folder' | 'file';
    content?: string;
    metadata?: Partial<VFileMetadata>;
  }, projectId?: string): VFile {
    const fs = this.getFS(projectId);
    const id = nanoid();
    const now = Date.now();
    const siblings = parentId
      ? (fs.files[parentId]?.childrenIds || [])
      : fs.rootIds;

    const file: VFile = {
      id,
      name: params.name,
      type: params.type,
      parentId,
      content: params.content || '',
      metadata: createDefaultMetadata({ sortOrder: siblings.length, ...params.metadata }),
      childrenIds: [],
      createdAt: now,
      updatedAt: now,
      version: 1,
      // 文件夹固定为 unknown，文件根据扩展名推断
      contentType: params.type === 'folder' ? 'unknown' : inferContentType(params.name),
    };

    fs.files[id] = file;

    if (parentId && fs.files[parentId]) {
      fs.files[parentId].childrenIds = [...fs.files[parentId].childrenIds, id];
      fs.files[parentId].updatedAt = now;
    } else if (!parentId) {
      fs.rootIds = [...fs.rootIds, id];
    }

    const meta = this.getActiveProject();
    if (meta) meta.updatedAt = now;

    this.emit();

    if (file.type === 'file' && params.content && params.content.trim().length >= 10) {
      accumulateTodayWords(params.content.length);
      const folderTags = parentId ? (fs.files[parentId]?.metadata?.tags || []) : [];
      const pid = projectId || this.data.activeProjectId;
      if (pid && folderTags.length > 0) {
        memoryBankService.lightweightIndexContent(pid, id, params.name, params.content, folderTags)
          .then(() => {
            const f = fs.files[id];
            if (f) {
              f.metadata.lastIndexedAt = Date.now();
              this.emit();
            }
          })
          .catch(err => {
            console.error('[DataService] 自动索引记忆体失败:', err);
          });
      }
    }

    return file;
  }

  updateFile(fileId: string, updates: Partial<Pick<VFile, 'name' | 'content'> & { metadata: Partial<VFileMetadata> }>, projectId?: string): VFile | null {
    const fs = this.getFS(projectId);
    const file = fs.files[fileId];
    if (!file) return null;

    if (updates.name !== undefined) file.name = updates.name;
    if (updates.content !== undefined) {
      const oldLen = file.content.length;
      file.content = updates.content;
      const delta = file.content.length - oldLen;
      if (delta > 0) accumulateTodayWords(delta);
    }
    if (updates.metadata) {
      file.metadata = { ...file.metadata, ...updates.metadata };
    }
    file.updatedAt = Date.now();
    file.version += 1;

    const meta = this.getActiveProject();
    if (meta) meta.updatedAt = file.updatedAt;

    this.emit();

    if (updates.content !== undefined && file.type === 'file' && updates.content.trim().length >= 10) {
      const folderTags = file.parentId ? (fs.files[file.parentId]?.metadata?.tags || []) : [];
      const pid = projectId || this.data.activeProjectId;
      if (pid && folderTags.length > 0) {
        memoryBankService.lightweightIndexContent(pid, fileId, file.name, updates.content, folderTags)
          .then(() => {
            file.metadata.lastIndexedAt = Date.now();
            this.emit();
          })
          .catch(err => {
            console.error('[DataService] 自动更新记忆体失败:', err);
          });
      }
    }

    return file;
  }

  deleteFile(fileId: string, projectId?: string): void {
    const fs = this.getFS(projectId);
    const file = fs.files[fileId];
    if (!file) return;

    if (file.type === 'folder' && file.childrenIds.length > 0) {
      for (const cid of [...file.childrenIds]) {
        this.deleteFile(cid, projectId);
      }
    }

    if (file.parentId && fs.files[file.parentId]) {
      fs.files[file.parentId].childrenIds = fs.files[file.parentId].childrenIds.filter(id => id !== fileId);
    } else {
      fs.rootIds = fs.rootIds.filter(id => id !== fileId);
    }

    delete fs.files[fileId];

    const meta = this.getActiveProject();
    if (meta) meta.updatedAt = Date.now();

    this.emit();
  }

  cleanOutlineFragmentFiles(projectId?: string): { deleted: number; kept: string } {
    const outlineFolderId = this.getRootFolderIdByType('outline', projectId);
    if (!outlineFolderId) return { deleted: 0, kept: '' };

    const children = this.getChildren(outlineFolderId, projectId).filter(f => f.type === 'file');
    if (children.length <= 1) return { deleted: 0, kept: children[0]?.name || '' };

    const mainOutline = children.find(f => f.name.includes('大纲'));
    const toDelete = children.filter(f => f !== mainOutline);

    for (const file of toDelete) {
      this.deleteFile(file.id, projectId);
    }

    return { deleted: toDelete.length, kept: mainOutline?.name || children[0]?.name || '' };
  }

  moveFile(fileId: string, newParentId: string | null, projectId?: string): void {
    const fs = this.getFS(projectId);
    const file = fs.files[fileId];
    if (!file) return;

    if (file.parentId && fs.files[file.parentId]) {
      fs.files[file.parentId].childrenIds = fs.files[file.parentId].childrenIds.filter(id => id !== fileId);
    } else {
      fs.rootIds = fs.rootIds.filter(id => id !== fileId);
    }

    file.parentId = newParentId;
    file.updatedAt = Date.now();
    file.version += 1;

    if (newParentId && fs.files[newParentId]) {
      fs.files[newParentId].childrenIds = [...fs.files[newParentId].childrenIds, fileId];
    } else if (!newParentId) {
      fs.rootIds = [...fs.rootIds, fileId];
    }

    this.emit();
  }

  reorderChildren(parentId: string | null, orderedIds: string[], projectId?: string): void {
    const fs = this.getFS(projectId);
    if (parentId && fs.files[parentId]) {
      fs.files[parentId].childrenIds = orderedIds;
    } else if (!parentId) {
      fs.rootIds = orderedIds;
    }
    orderedIds.forEach((id, idx) => {
      if (fs.files[id]) fs.files[id].metadata.sortOrder = idx;
    });
    this.emit();
  }

  /**
   * 更新模型列表（含 API Key 加密存储）。
   * safeStorage 集成后改为 async：加密走 IPC（OS 原生加密优先，XOR 降级）。
   * 加密完成后同步刷新内存缓存，再 emit 触发 UI 更新。
   */
  async updateModels(models: ModelConfig[]): Promise<void> {
    const encrypted: ModelConfig[] = [];
    for (const m of models) {
      encrypted.push({
        ...m,
        apiKey: m.apiKey ? await this.secureEncrypt(m.apiKey) : undefined,
      });
    }
    this.data.models = encrypted;
    // 同步刷新内存缓存（updateModels 后 getActiveModel/getModels 立即可读）
    this.apiKeyCache.clear();
    for (const m of models) {
      if (m.apiKey) this.apiKeyCache.set(m.id, m.apiKey);
    }
    this.emit();
  }

  private encryptApiKey(key: string): string {
    return 'enc:' + btoa(this.xorCrypt(key, this._cryptoKey));
  }

  private decryptApiKey(encrypted: string): string {
    if (!encrypted.startsWith('enc:')) return encrypted;
    return this.xorCrypt(atob(encrypted.slice(4)), this._cryptoKey);
  }

  getModels(): ModelConfig[] {
    return this.data.models.map(m => {
      // safeStorage 集成：优先从内存缓存读明文，缓存未命中降级同步 XOR 解密
      const cachedPlain = this.apiKeyCache.get(m.id);
      const apiKey = cachedPlain !== undefined
        ? cachedPlain
        : (m.apiKey ? this.decryptApiKey(m.apiKey) : undefined);
      return { ...m, apiKey };
    });
  }

  setActiveModel(modelId: string): void {
    this.data.activeModelId = modelId;
    this.emit();
  }

  updatePrompts(prompts: PromptTemplate[]): void {
    this.data.prompts = prompts;
    this.emit();
  }

  updateModelRouting(routing: Record<string, string>): void {
    this.data.modelRouting = routing;
    this.emit();
  }

  updateProjectMeta(updates: Partial<ProjectMeta>): void {
    const meta = this.getActiveProject();
    if (!meta) return;
    Object.assign(meta, updates, { updatedAt: Date.now() });
    this.emit();
  }

  updateInspiration(text: string, tags?: import('../../../shared/types/fileSystem').InspirationData['tags']): void {
    const meta = this.getActiveProject();
    if (!meta) return;
    if (text !== undefined) meta.inspiration.text = text;
    if (tags !== undefined) meta.inspiration.tags = tags;
    meta.updatedAt = Date.now();
    this.emit();
  }

  updateSchemes(schemes: import('../../../shared/types/fileSystem').NovelScheme[]): void {
    const meta = this.getActiveProject();
    if (!meta) return;
    meta.novelSchemes = schemes;
    meta.updatedAt = Date.now();
    this.emit();
  }

  confirmScheme(schemeId: string): void {
    const meta = this.getActiveProject();
    if (!meta) return;
    const scheme = meta.novelSchemes.find(s => s.id === schemeId);
    if (!scheme) return;
    meta.novelSchemes = meta.novelSchemes.map(s => ({ ...s, selected: s.id === schemeId }));
    meta.selectedSchemeId = schemeId;
    meta.title = scheme.title;
    meta.intro = scheme.intro;
    meta.updatedAt = Date.now();
    this.emit();
  }

  updateOutline(outline: string): void {
    const meta = this.getActiveProject();
    if (!meta) return;
    meta.outline = outline;
    meta.updatedAt = Date.now();
    this.emit();
  }

  async exportProject(projectId: string): Promise<string> {
    const meta = this.data.projects.find(p => p.id === projectId);
    const fs = this.data.fileSystems[projectId];
    if (!meta || !fs) return '';
    return JSON.stringify({ meta, fs }, null, 2);
  }

  async importProject(json: string): Promise<ProjectMeta | null> {
    try {
      const { meta, fs } = JSON.parse(json);
      if (!meta?.id || !fs?.files) return null;
      this.data.projects.push(meta);
      this.data.fileSystems[meta.id] = fs;
      this.data.activeProjectId = meta.id;
      this.emit();
      return meta;
    } catch {
      return null;
    }
  }

  exportAllData(): string {
    return JSON.stringify(this.data, null, 2);
  }

  importAllData(json: string): boolean {
    try {
      const parsed = JSON.parse(json);
      if (!parsed.projects || !parsed.fileSystems) return false;
      this.data = parsed as AppData;
      this.emit();
      return true;
    } catch {
      return false;
    }
  }

  clearAll(): void {
    this.data = this.createDefaultData();
    this.emit();
  }

  private createDefaultData(): AppData {
    return {
      projects: [],
      activeProjectId: null,
      models: INITIAL_MODELS,
      prompts: getPromptLibrary().map(p => ({
        id: p.id,
        category: (p.category ?? p.layer) as any,
        name: p.name,
        content: p.content,
      })),
      activeModelId: 'default-openai',
      fileSystems: {},
    };
  }

  private saveToStorage(): void {
    try {
      const data = JSON.stringify(this.data);
      // 检查 localStorage 容量（约 5MB 限制）
      const sizeMB = new Blob([data]).size / 1024 / 1024;
      if (sizeMB > 4.5) {
        console.warn(`[DataService] 数据量接近上限 (${sizeMB.toFixed(2)}MB)，建议清理或导出`);
        // 触发容量警告事件
        this.emitStorageWarning(`存储空间不足 (${sizeMB.toFixed(1)}MB/5MB)，请导出备份或清理旧项目`);
      }
      localStorage.setItem(STORAGE_KEY, data);
    } catch (e) {
      if (e instanceof DOMException && e.name === 'QuotaExceededError') {
        console.error('[DataService] 存储空间已满，请导出数据后清理');
        this.emitStorageWarning('存储空间已满！请立即导出数据，然后删除旧项目释放空间');
      } else {
        console.error('[DataService] save failed:', e);
      }
    }
  }

  private storageWarningListeners: Set<(msg: string) => void> = new Set();

  onStorageWarning(listener: (msg: string) => void): () => void {
    this.storageWarningListeners.add(listener);
    return () => this.storageWarningListeners.delete(listener);
  }

  private emitStorageWarning(msg: string): void {
    for (const fn of this.storageWarningListeners) fn(msg);
  }

  private loadFromStorage(): AppData | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw) as AppData;
    } catch (e) {
      console.error('[DataService] load failed:', e);
    }
    return null;
  }
}

export const dataService = DataService.getInstance();
