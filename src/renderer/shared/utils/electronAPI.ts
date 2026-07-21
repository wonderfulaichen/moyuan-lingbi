/**
 * Electron API 统一访问入口
 *
 * 收口所有对 `window.electronAPI` 的访问，消除 `(window as any).electronAPI` 强转，
 * 并提供运行时守卫，避免在浏览器/PWA/Capacitor 环境下访问 undefined。
 *
 * 相关文件：
 * - 类型声明：src/renderer/env.d.ts
 * - 实际暴露：src/main/preload.js（contextBridge.exposeInMainWorld）
 *
 * 使用方式：
 * ```ts
 * import { getElectronAPI, isElectron } from '@/shared/utils/electronAPI';
 *
 * const api = getElectronAPI();
 * if (api) {
 *   await api.writeFile(path, data);
 * }
 *
 * if (isElectron()) {
 *   // Electron 专属逻辑
 * }
 * ```
 */

/** Electron API 的具体类型（从 env.d.ts 的 Window.electronAPI 派生） */
export type ElectronAPI = NonNullable<Window['electronAPI']>;

/**
 * 获取 electronAPI 实例
 * @returns ElectronAPI 实例；非 Electron 环境下返回 null
 */
export function getElectronAPI(): ElectronAPI | null {
  if (typeof window === 'undefined') return null;
  return window.electronAPI ?? null;
}

/**
 * 检测当前是否为 Electron 环境
 *
 * 替代 `storage/StorageProvider.ts` 中的 isElectron() 实现，
 * 统一通过本模块访问，避免类型绕过。
 */
export function isElectron(): boolean {
  return getElectronAPI() !== null;
}
