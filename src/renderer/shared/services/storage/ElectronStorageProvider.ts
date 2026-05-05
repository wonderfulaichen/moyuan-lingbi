/**
 * Electron 存储实现
 * 
 * 使用 Electron 的 fs 模块（通过 preload 暴露的 electronAPI）进行文件存储，
 * 同时配合 localStorage 作为缓存和后备。
 */

import { StorageProvider, DEFAULT_STORAGE_KEY } from './StorageProvider';

export class ElectronStorageProvider implements StorageProvider {
  private appDataPath: string | null = null;
  private api: any;

  constructor() {
    this.api = (window as any).electronAPI;
  }

  /**
   * 获取 Electron 应用数据目录路径
   */
  private async getAppDataPath(): Promise<string> {
    if (!this.appDataPath) {
      this.appDataPath = await this.api.getAppDataPath();
    }
    return this.appDataPath;
  }

  /**
   * 获取文件路径
   */
  private getFilePath(key: string): string {
    // 过滤非法文件名字符
    const safeKey = key.replace(/[^a-zA-Z0-9_-]/g, '_');
    const path = this.appDataPath || 'appdata';
    return `${path}/${safeKey}.json`;
  }

  async save<T>(key: string, data: T): Promise<void> {
    const json = JSON.stringify(data);
    
    // 同步缓存到 localStorage
    try {
      localStorage.setItem(key, json);
    } catch (e) {
      console.warn('[ElectronStorage] localStorage write failed:', e);
    }

    // 异步写入文件
    try {
      const appDataPath = await this.getAppDataPath();
      const filePath = `${appDataPath}/${key}.json`;
      await this.api.writeFile(filePath, json);
    } catch (error) {
      console.error(`[ElectronStorage] Failed to save "${key}":`, error);
    }
  }

  async load<T>(key: string): Promise<T | null> {
    // 优先从 localStorage 读取（速度快）
    try {
      const localData = localStorage.getItem(key);
      if (localData) {
        return JSON.parse(localData) as T;
      }
    } catch (e) {
      console.warn('[ElectronStorage] localStorage read failed:', e);
    }

    // 从文件读取
    try {
      const appDataPath = await this.getAppDataPath();
      const filePath = `${appDataPath}/${key}.json`;
      const exists = await this.api.exists(filePath);
      if (exists) {
        const content = await this.api.readFile(filePath);
        const data = JSON.parse(content) as T;
        // 回写 localStorage 缓存
        localStorage.setItem(key, content);
        return data;
      }
    } catch (error) {
      console.error(`[ElectronStorage] Failed to load "${key}":`, error);
    }

    return null;
  }

  async delete(key: string): Promise<void> {
    localStorage.removeItem(key);

    try {
      const appDataPath = await this.getAppDataPath();
      const filePath = `${appDataPath}/${key}.json`;
      const exists = await this.api.exists(filePath);
      if (exists) {
        await this.api.unlink(filePath);
      }
    } catch (error) {
      console.error(`[ElectronStorage] Failed to delete "${key}":`, error);
    }
  }

  async list(prefix: string): Promise<string[]> {
    const keys: string[] = [];

    // 从 localStorage 列出
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(prefix)) {
        keys.push(key);
      }
    }

    return keys;
  }

  async clear(): Promise<void> {
    // 清除 localStorage 中所有以 DEFAULT_STORAGE_KEY 开头的项
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(DEFAULT_STORAGE_KEY)) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));

    // 清除文件
    try {
      const appDataPath = await this.getAppDataPath();
      for (const key of keysToRemove) {
        const filePath = `${appDataPath}/${key}.json`;
        const exists = await this.api.exists(filePath);
        if (exists) {
          await this.api.unlink(filePath);
        }
      }
    } catch (error) {
      console.error('[ElectronStorage] Failed to clear files:', error);
    }
  }
}
