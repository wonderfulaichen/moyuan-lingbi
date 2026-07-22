/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

/**
 * Electron 对话框选项类型
 *
 * 与 Electron 主进程 ipcMain.handle('open-file-dialog'/'save-file-dialog') 接收的 options 一致，
 * 对应 Electron 的 OpenDialogOptions / SaveDialogOptions 子集。
 * 此处只声明项目实际使用的字段，避免引入完整 Electron 类型依赖。
 */
export interface ElectronDialogOptions {
  title?: string;
  defaultPath?: string;
  filters?: Array<{ name: string; extensions: string[] }>;
  properties?: string[];
}

/**
 * 全局 Window 类型扩展
 *
 * 由于本文件存在 `export interface ElectronDialogOptions`，整个文件被视作模块而非全局脚本，
 * `interface Window` 必须用 `declare global` 包装才能合并到全局 Window 类型，
 * 否则 DataService.ts 等文件中访问 `window.electronAPI` 会报 TS2339。
 */
declare global {
  interface Window {
    electronAPI?: {
      getAppDataPath: () => Promise<string>;
      readFile: (filePath: string) => Promise<string>;
      writeFile: (filePath: string, data: string) => Promise<void>;
      exists: (filePath: string) => Promise<boolean>;
      unlink: (filePath: string) => Promise<void>;
      openFileDialog: (options: ElectronDialogOptions) => Promise<string[] | null>;
      saveFileDialog: (options: ElectronDialogOptions) => Promise<string | null>;
      getVersion: () => string;
      getPlatform: () => string;
      minimize: () => void;
      maximize: () => void;
      close: () => void;
      safeStorageAvailable: () => Promise<boolean>;
      safeStorageEncrypt: (plaintext: string) => Promise<string>;
      safeStorageDecrypt: (base64Cipher: string) => Promise<string>;
    };
  }
}
