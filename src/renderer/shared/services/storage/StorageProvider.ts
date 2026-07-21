/**
 * 存储提供者接口
 *
 * 为跨平台数据持久化提供统一抽象。
 * - Electron 环境：使用 Electron fs + localStorage
 * - WebView/Android 环境：使用 IndexedDB
 *
 * 通过 createStorageProvider() 工厂函数自动检测平台并返回对应实现。
 */

// isElectron 统一从 electronAPI 工具模块导出，避免重复实现和类型绕过
export { isElectron } from '../../utils/electronAPI';

export interface StorageProvider {
  /** 保存数据 */
  save<T>(key: string, data: T): Promise<void>;
  /** 加载数据 */
  load<T>(key: string): Promise<T | null>;
  /** 删除数据 */
  delete(key: string): Promise<void>;
  /** 列出指定前缀的所有键 */
  list(prefix: string): Promise<string[]>;
  /** 清除所有数据 */
  clear(): Promise<void>;
}

/**
 * 工厂函数：自动检测平台并返回对应的存储实现
 */
export async function createStorageProvider(): Promise<StorageProvider> {
  if (isElectron()) {
    const { ElectronStorageProvider } = await import('./ElectronStorageProvider');
    return new ElectronStorageProvider();
  }
  const { IndexedDBStorageProvider } = await import('./IndexedDBStorageProvider');
  return new IndexedDBStorageProvider();
}

/** 应用的默认存储键 */
export const DEFAULT_STORAGE_KEY = 'moyuan-lingbi-state';
/** IndexedDB 数据库名称 */
export const DB_NAME = 'MoyuanLingBiDB';
/** IndexedDB 存储对象名称 */
export const STORE_NAME = 'appState';
