// @ts-check
/**
 * Electron preload 脚本
 *
 * 通过 contextBridge.exposeInMainWorld 向 renderer 暴露 electronAPI，
 * 类型契约见 src/renderer/env.d.ts 的 Window.electronAPI 声明。
 *
 * 注意：本文件类型通过 JSDoc + checkJs 提供（不转 .ts 以避免改构建脚本）。
 * 新增 IPC 方法时，必须同步更新：
 *   1. 本文件的 JSDoc 类型注释
 *   2. src/renderer/env.d.ts 的 Window.electronAPI 声明
 *   3. src/main/main.js 的 ipcMain.handle 注册
 */

const { contextBridge, ipcRenderer } = require('electron');

/**
 * Electron 对话框选项（与 env.d.ts 的 ElectronDialogOptions 一致）
 * @typedef {Object} ElectronDialogOptions
 * @property {string} [title]
 * @property {string} [defaultPath]
 * @property {Array<{name: string, extensions: string[]}>} [filters]
 * @property {string[]} [properties]
 */

/**
 * 向 renderer 暴露的 Electron API
 * @typedef {Object} ElectronAPI
 * @property {() => Promise<string>} getAppDataPath
 * @property {(filePath: string) => Promise<string>} readFile
 * @property {(filePath: string, data: string) => Promise<void>} writeFile
 * @property {(filePath: string) => Promise<boolean>} exists
 * @property {(filePath: string) => Promise<void>} unlink
 * @property {(options: ElectronDialogOptions) => Promise<string[] | null>} openFileDialog
 * @property {(options: ElectronDialogOptions) => Promise<string | null>} saveFileDialog
 * @property {() => string} getVersion
 * @property {() => string} getPlatform
 * @property {() => void} minimize
 * @property {() => void} maximize
 * @property {() => void} close
 * @property {() => Promise<boolean>} safeStorageAvailable
 * @property {(plaintext: string) => Promise<string>} safeStorageEncrypt
 * @property {(base64Cipher: string) => Promise<string>} safeStorageDecrypt
 */

/**
 * @type {ElectronAPI}
 */
const electronAPI = {
  // 文件系统操作
  getAppDataPath: () => ipcRenderer.invoke('get-app-data-path'),
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
  writeFile: (filePath, data) => ipcRenderer.invoke('write-file', filePath, data),
  exists: (filePath) => ipcRenderer.invoke('file-exists', filePath),
  unlink: (filePath) => ipcRenderer.invoke('delete-file', filePath),

  // 对话框
  openFileDialog: (options) => ipcRenderer.invoke('open-file-dialog', options),
  saveFileDialog: (options) => ipcRenderer.invoke('save-file-dialog', options),

  // 应用信息
  getVersion: () => process.versions.electron,
  getPlatform: () => process.platform,

  // 窗口控制
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),

  // safeStorage: OS 原生加密
  safeStorageAvailable: () => ipcRenderer.invoke('safe-storage-available'),
  safeStorageEncrypt: (plaintext) => ipcRenderer.invoke('safe-storage-encrypt', plaintext),
  safeStorageDecrypt: (base64Cipher) => ipcRenderer.invoke('safe-storage-decrypt', base64Cipher),
};

// 错误处理：contextBridge.exposeInMainWorld 在某些 Electron 版本/sandbox 配置下可能失败
// 失败时 renderer 侧 window.electronAPI 为 undefined，调用方已有运行时守卫（getElectronAPI）
// 此处 console.error 便于主进程日志排查 preload 加载失败的原因
try {
  contextBridge.exposeInMainWorld('electronAPI', electronAPI);
} catch (error) {
  console.error('[preload] contextBridge.exposeInMainWorld 失败:', error);
}
