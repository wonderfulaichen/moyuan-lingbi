import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ElectronStorageProvider } from './ElectronStorageProvider';

/**
 * ElectronStorageProvider 测试
 *
 * 覆盖 save/load/delete/list/clear 五个核心方法，验证：
 * - 正确调用 electronAPI 的文件系统方法
 * - localStorage 作为缓存和后备的正确行为
 * - 构造函数守卫（非 Electron 环境抛错）
 *
 * 全局 mock（src/test/setup.ts）提供 window.electronAPI 默认实现，
 * 每个 beforeEach 重置 mock 调用记录。
 */

describe('ElectronStorageProvider', () => {
  let provider: ElectronStorageProvider;
  const mockApi = window.electronAPI!;

  beforeEach(() => {
    vi.resetAllMocks();
    // 重置默认 mock 行为（resetAllMocks 会清除 mockResolvedValue）
    vi.mocked(mockApi.getAppDataPath).mockResolvedValue('/mock-appdata');
    vi.mocked(mockApi.exists).mockResolvedValue(false);
    vi.mocked(mockApi.readFile).mockResolvedValue('');
    vi.mocked(mockApi.writeFile).mockResolvedValue(undefined);
    vi.mocked(mockApi.unlink).mockResolvedValue(undefined);

    localStorage.clear();
    provider = new ElectronStorageProvider();
  });

  describe('构造函数', () => {
    it('Electron 环境下正常构造', () => {
      expect(provider).toBeInstanceOf(ElectronStorageProvider);
    });

    it('非 Electron 环境下抛错（防御性守卫）', () => {
      const originalApi = window.electronAPI;
      // 临时移除 electronAPI 模拟非 Electron 环境
      delete (window as any).electronAPI;
      expect(() => new ElectronStorageProvider()).toThrow(/仅能在 Electron 环境下实例化/);
      // 恢复
      (window as any).electronAPI = originalApi;
    });
  });

  describe('save', () => {
    it('应该同步写入 localStorage 并异步写入文件', async () => {
      const data = { name: 'test', value: 123 };
      await provider.save('test-key', data);

      // localStorage 同步写入
      expect(localStorage.getItem('test-key')).toBe(JSON.stringify(data));

      // 文件异步写入
      expect(mockApi.writeFile).toHaveBeenCalledWith(
        '/mock-appdata/test-key.json',
        JSON.stringify(data)
      );
    });

    it('文件写入失败时不应抛错（仅 console.error）', async () => {
      vi.mocked(mockApi.writeFile).mockRejectedValue(new Error('disk full'));
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await expect(provider.save('test-key', { data: 1 })).resolves.not.toThrow();
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('load', () => {
    it('优先从 localStorage 读取', async () => {
      const cached = { cached: true };
      localStorage.setItem('test-key', JSON.stringify(cached));

      const result = await provider.load('test-key');
      expect(result).toEqual(cached);
      // 不应调用文件系统
      expect(mockApi.exists).not.toHaveBeenCalled();
    });

    it('localStorage 无数据时从文件读取', async () => {
      const fileData = { fromFile: true };
      vi.mocked(mockApi.exists).mockResolvedValue(true);
      vi.mocked(mockApi.readFile).mockResolvedValue(JSON.stringify(fileData));

      const result = await provider.load('test-key');
      expect(result).toEqual(fileData);
      expect(mockApi.exists).toHaveBeenCalledWith('/mock-appdata/test-key.json');
      expect(mockApi.readFile).toHaveBeenCalledWith('/mock-appdata/test-key.json');
      // 回写 localStorage 缓存
      expect(localStorage.getItem('test-key')).toBe(JSON.stringify(fileData));
    });

    it('文件不存在时返回 null', async () => {
      vi.mocked(mockApi.exists).mockResolvedValue(false);

      const result = await provider.load('test-key');
      expect(result).toBeNull();
    });

    it('文件读取失败时返回 null（不抛错）', async () => {
      vi.mocked(mockApi.exists).mockResolvedValue(true);
      vi.mocked(mockApi.readFile).mockRejectedValue(new Error('read error'));
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await provider.load('test-key');
      expect(result).toBeNull();
      consoleSpy.mockRestore();
    });
  });

  describe('delete', () => {
    it('应该同时删除 localStorage 和文件', async () => {
      localStorage.setItem('test-key', 'data');
      vi.mocked(mockApi.exists).mockResolvedValue(true);

      await provider.delete('test-key');

      expect(localStorage.getItem('test-key')).toBeNull();
      expect(mockApi.unlink).toHaveBeenCalledWith('/mock-appdata/test-key.json');
    });

    it('文件不存在时不调用 unlink', async () => {
      vi.mocked(mockApi.exists).mockResolvedValue(false);

      await provider.delete('test-key');
      expect(mockApi.unlink).not.toHaveBeenCalled();
    });
  });

  describe('list', () => {
    it('应该从 localStorage 列出匹配前缀的键', async () => {
      localStorage.setItem('proj-1', 'a');
      localStorage.setItem('proj-2', 'b');
      localStorage.setItem('other-1', 'c');

      const keys = await provider.list('proj-');
      expect(keys).toEqual(['proj-1', 'proj-2']);
    });

    it('无匹配时返回空数组', async () => {
      localStorage.setItem('other-1', 'c');

      const keys = await provider.list('proj-');
      expect(keys).toEqual([]);
    });
  });

  describe('clear', () => {
    it('应该清除所有以默认存储键开头的项', async () => {
      localStorage.setItem('moyuan-lingbi-state-1', 'a');
      localStorage.setItem('moyuan-lingbi-state-2', 'b');
      localStorage.setItem('other', 'c');

      await provider.clear();

      expect(localStorage.getItem('moyuan-lingbi-state-1')).toBeNull();
      expect(localStorage.getItem('moyuan-lingbi-state-2')).toBeNull();
      // clear() 只清除以 DEFAULT_STORAGE_KEY ('moyuan-lingbi-state') 开头的项
      expect(localStorage.getItem('other')).toBe('c');
    });

    it('应该删除对应的文件', async () => {
      localStorage.setItem('moyuan-lingbi-state-1', 'a');
      vi.mocked(mockApi.exists).mockResolvedValue(true);

      await provider.clear();

      expect(mockApi.unlink).toHaveBeenCalledWith('/mock-appdata/moyuan-lingbi-state-1.json');
    });
  });
});
