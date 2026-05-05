/**
 * IndexedDB 存储实现
 *
 * 适用于 WebView/Android 环境（Capacitor 或纯 Web）。
 * 使用 IndexedDB 作为持久化存储，localStorage 作为缓存。
 */
import { StorageProvider, DB_NAME, STORE_NAME } from './StorageProvider';

export class IndexedDBStorageProvider implements StorageProvider {
  private dbPromise: Promise<IDBDatabase> | null = null;

  /**
   * 获取 IndexedDB 数据库连接
   */
  private async getDB(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);

        request.onupgradeneeded = (event) => {
          const db = (event.target as IDBOpenDBRequest).result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME, { keyPath: 'key' });
          }
        };

        request.onsuccess = (event) => {
          resolve((event.target as IDBOpenDBRequest).result);
        };

        request.onerror = (event) => {
          console.error('[IndexedDBStorage] Failed to open DB:', request.error);
          reject(request.error);
        };
      });
    }
    return this.dbPromise;
  }

  async save<T>(key: string, data: T): Promise<void> {
    const json = JSON.stringify(data);

    // 同步缓存到 localStorage
    try {
      localStorage.setItem(key, json);
    } catch (e) {
      console.warn('[IndexedDBStorage] localStorage write failed:', e);
    }

    // 异步写入 IndexedDB
    try {
      const db = await this.getDB();
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      store.put({ key, value: json });

      return new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = (event) => {
          console.error(`[IndexedDBStorage] Failed to save "${key}":`, transaction.error);
          reject(transaction.error);
        };
      });
    } catch (error) {
      console.error(`[IndexedDBStorage] Failed to save "${key}":`, error);
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
      console.warn('[IndexedDBStorage] localStorage read failed:', e);
    }

    // 从 IndexedDB 读取
    try {
      const db = await this.getDB();
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(key);

      return new Promise((resolve, reject) => {
        request.onsuccess = () => {
          const result = request.result;
          if (result && result.value) {
            // 回写 localStorage 缓存
            localStorage.setItem(key, result.value);
            resolve(JSON.parse(result.value) as T);
          } else {
            resolve(null);
          }
        };
        request.onerror = () => {
          console.error(`[IndexedDBStorage] Failed to load "${key}":`, request.error);
          reject(request.error);
        };
      });
    } catch (error) {
      console.error(`[IndexedDBStorage] Failed to load "${key}":`, error);
    }

    return null;
  }

  async delete(key: string): Promise<void> {
    localStorage.removeItem(key);

    try {
      const db = await this.getDB();
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      store.delete(key);

      return new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => {
          console.error(`[IndexedDBStorage] Failed to delete "${key}":`, transaction.error);
          reject(transaction.error);
        };
      });
    } catch (error) {
      console.error(`[IndexedDBStorage] Failed to delete "${key}":`, error);
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

    // 从 IndexedDB 补全
    try {
      const db = await this.getDB();
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAllKeys();

      return new Promise((resolve, reject) => {
        request.onsuccess = () => {
          const allKeys = request.result as string[];
          for (const key of allKeys) {
            if (key.startsWith(prefix) && !keys.includes(key)) {
              keys.push(key);
            }
          }
          resolve(keys);
        };
        request.onerror = () => {
          console.error('[IndexedDBStorage] Failed to list keys:', request.error);
          resolve(keys);
        };
      });
    } catch (error) {
      console.error('[IndexedDBStorage] Failed to list keys:', error);
    }

    return keys;
  }

  async clear(): Promise<void> {
    // 清除 localStorage 中所有以应用前缀开头的项
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('moyuan-')) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));

    // 清除 IndexedDB
    try {
      const db = await this.getDB();
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      store.clear();

      return new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => {
          console.error('[IndexedDBStorage] Failed to clear:', transaction.error);
          reject(transaction.error);
        };
      });
    } catch (error) {
      console.error('[IndexedDBStorage] Failed to clear:', error);
    }
  }
}
