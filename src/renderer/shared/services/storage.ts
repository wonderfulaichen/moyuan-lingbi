import { AppState } from '../../../shared/types';
import { StorageProvider, createStorageProvider, isElectron } from './storage/StorageProvider';

const STORAGE_KEY = 'moyuan-lingbi-state';

/**
 * 存储提供者实例（懒初始化）
 */
let _provider: StorageProvider | null = null;

/**
 * 获取存储提供者（懒初始化单例）
 */
async function getProvider(): Promise<StorageProvider> {
  if (!_provider) {
    _provider = await createStorageProvider();
  }
  return _provider;
}

/**
 * 本地存储服务
 * 负责应用状态的持久化和恢复
 *
 * 底层使用 StorageProvider 抽象，自动适配平台：
 * - Electron 环境 → ElectronStorageProvider（文件系统 + localStorage）
 * - WebView/Android → IndexedDBStorageProvider（IndexedDB + localStorage）
 */
export const storage = {
  /**
   * 同步加载状态（仅从 localStorage 读取）
   */
  loadState(): AppState | null {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (data) {
        return JSON.parse(data) as AppState;
      }
    } catch (error) {
      console.error('Failed to load state from localStorage:', error);
    }
    return null;
  },

  /**
   * 异步加载状态（使用 StorageProvider 自动适配平台）
   */
  async loadStateAsync(): Promise<AppState | null> {
    // 优先尝试从 localStorage 加载（同步路径，速度快）
    const localData = this.loadState();
    if (localData) {
      return localData;
    }

    // 使用 StorageProvider 从持久化存储加载
    try {
      const provider = await getProvider();
      const data = await provider.load<AppState>(STORAGE_KEY);
      return data;
    } catch (error) {
      console.error('Failed to load state from StorageProvider:', error);
    }

    // 降级：Electron 环境中尝试从文件加载（兼容旧版本文件路径）
    const api = getElectronAPI();
    if (isElectron() && api) {
      try {
        const appDataPath = await api.getAppDataPath();
        const filePath = `${appDataPath}/app-state.json`;
        const exists = await api.exists(filePath);
        if (exists) {
          const content = await api.readFile(filePath);
          return JSON.parse(content) as AppState;
        }
      } catch (error) {
        console.error('Failed to load state from legacy file:', error);
      }
    }

    return null;
  },

  /**
   * 保存状态
   */
  saveState(state: AppState): void {
    try {
      const data = JSON.stringify(state);
      localStorage.setItem(STORAGE_KEY, data);

      // 异步持久化到 StorageProvider
      getProvider()
        .then(provider => provider.save(STORAGE_KEY, state))
        .catch(err => {
          console.error('Failed to save state via StorageProvider:', err);
        });
    } catch (error) {
      console.error('Failed to save state:', error);
    }
  },

  /**
   * 保存状态到文件（兼容旧接口，内部委托给 StorageProvider）
   */
  async saveStateToFile(state: AppState): Promise<void> {
    try {
      const provider = await getProvider();
      await provider.save(STORAGE_KEY, state);
    } catch (error) {
      console.error('Failed to save state to file:', error);
    }
  },

  /**
   * 清除所有状态
   */
  async clearState(): Promise<void> {
    localStorage.removeItem(STORAGE_KEY);

    try {
      const provider = await getProvider();
      await provider.delete(STORAGE_KEY);
    } catch (error) {
      console.error('Failed to clear state:', error);
    }
  },

  /**
   * 导出全部数据（浏览器原生文件下载）
   */
  exportData(state: AppState): void {
    const data = JSON.stringify(state, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `moyuan-lingbi-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  },

  /**
   * 导入全部数据（浏览器原生文件选择器）
   */
  async importData(): Promise<AppState | null> {
    return new Promise((resolve, reject) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.onchange = (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) {
          reject(new Error('未选择文件'));
          return;
        }
        const reader = new FileReader();
        reader.onload = () => {
          try {
            const data = JSON.parse(reader.result as string) as AppState;
            resolve(data);
          } catch (error) {
            reject(new Error('文件格式错误'));
          }
        };
        reader.onerror = () => reject(new Error('读取文件失败'));
        reader.readAsText(file);
      };
      input.click();
    });
  },

  /**
   * 获取底层的 StorageProvider 实例（供高级用途）
   */
  async getProvider(): Promise<StorageProvider> {
    return getProvider();
  },
};
