/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

interface Window {
  electronAPI?: {
    getAppDataPath: () => Promise<string>;
    readFile: (filePath: string) => Promise<string>;
    writeFile: (filePath: string, data: string) => Promise<void>;
    exists: (filePath: string) => Promise<boolean>;
    unlink: (filePath: string) => Promise<void>;
    openFileDialog: (options: unknown) => Promise<string[] | null>;
    saveFileDialog: (options: unknown) => Promise<string | null>;
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
