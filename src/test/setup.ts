import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

/**
 * 全局测试 setup
 *
 * 为所有测试提供统一的 mock 环境：
 * - window.electronAPI：模拟 Electron preload 暴露的 15 个 API
 *   测试可通过 vi.mocked(window.electronAPI!.xxx) 获取 mock 实现
 *   个别测试需要覆盖默认行为时，用 vi.mocked(...).mockResolvedValueOnce(...)
 *
 * 注意：不覆盖 jsdom 提供的 window 对象，仅在其上添加 electronAPI 属性，
 * 避免破坏 React Testing Library 的 act() 机制。
 * MemoryVersionControl.test.ts 等已有自己 mock 的测试会通过 beforeEach 覆盖 electronAPI。
 */

const createElectronAPIMock = () => ({
  getAppDataPath: vi.fn().mockResolvedValue('/mock-appdata'),
  readFile: vi.fn().mockResolvedValue(''),
  writeFile: vi.fn().mockResolvedValue(undefined),
  exists: vi.fn().mockResolvedValue(false),
  unlink: vi.fn().mockResolvedValue(undefined),
  openFileDialog: vi.fn().mockResolvedValue(null),
  saveFileDialog: vi.fn().mockResolvedValue(null),
  getVersion: vi.fn().mockReturnValue('99.0.0'),
  getPlatform: vi.fn().mockReturnValue('test'),
  minimize: vi.fn(),
  maximize: vi.fn(),
  close: vi.fn(),
  safeStorageAvailable: vi.fn().mockResolvedValue(false),
  safeStorageEncrypt: vi.fn().mockResolvedValue(''),
  safeStorageDecrypt: vi.fn().mockResolvedValue(''),
});

// 在 jsdom 提供的 window 上添加 electronAPI，不覆盖整个 window
(window as any).electronAPI = createElectronAPIMock();
