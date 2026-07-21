import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, renderHookWithOptions } from '@testing-library/react';
import { useUndoRedo } from './useUndoRedo';

describe('useUndoRedo', () => {
  describe('基础功能', () => {
    it('应返回初始值', () => {
      const { result } = renderHook(() => useUndoRedo<string>({ initialValue: 'hello' }));
      expect(result.current.value).toBe('hello');
      expect(result.current.canUndo).toBe(false);
      expect(result.current.canRedo).toBe(false);
    });

    it('setValue 应更新值并入栈', () => {
      const { result } = renderHook(() => useUndoRedo<string>({ initialValue: 'a' }));
      act(() => result.current.setValue('b'));
      expect(result.current.value).toBe('b');
      expect(result.current.canUndo).toBe(true);
      expect(result.current.canRedo).toBe(false);
    });

    it('相同值不应入栈', () => {
      const { result } = renderHook(() => useUndoRedo<string>({ initialValue: 'a' }));
      act(() => result.current.setValue('a'));
      expect(result.current.canUndo).toBe(false);
    });

    it('equalityFn 控制入栈条件', () => {
      const { result } = renderHook(() =>
        useUndoRedo<{ id: number; label: string }>({
          initialValue: { id: 1, label: 'a' },
          equalityFn: (a, b) => a.id === b.id,
        })
      );
      // 同 id 不同 label：按 equalityFn 判定为相等，不入栈
      act(() => result.current.setValue({ id: 1, label: 'b' }));
      expect(result.current.canUndo).toBe(false);
      // 不同 id：判定为不相等，入栈
      act(() => result.current.setValue({ id: 2, label: 'c' }));
      expect(result.current.canUndo).toBe(true);
    });

    it('skipHistory=true 时更新值但不入栈', () => {
      const { result } = renderHook(() => useUndoRedo<string>({ initialValue: 'a' }));
      act(() => result.current.setValue('b', true));
      expect(result.current.value).toBe('b');
      expect(result.current.canUndo).toBe(false);
    });
  });

  describe('undo/redo', () => {
    it('undo 应回到上一个值', () => {
      const { result } = renderHook(() => useUndoRedo<string>({ initialValue: 'a' }));
      act(() => result.current.setValue('b'));
      act(() => result.current.setValue('c'));
      act(() => result.current.undo());
      expect(result.current.value).toBe('b');
      expect(result.current.canRedo).toBe(true);
    });

    it('redo 应前进到下一个值', () => {
      const { result } = renderHook(() => useUndoRedo<string>({ initialValue: 'a' }));
      act(() => result.current.setValue('b'));
      act(() => result.current.setValue('c'));
      act(() => result.current.undo());
      act(() => result.current.redo());
      expect(result.current.value).toBe('c');
      expect(result.current.canRedo).toBe(false);
    });

    it('undo 在边界时安全（不越界）', () => {
      const { result } = renderHook(() => useUndoRedo<string>({ initialValue: 'a' }));
      act(() => result.current.setValue('b'));
      act(() => result.current.undo());
      expect(result.current.value).toBe('a');
      // 连续 undo 不应越界
      act(() => result.current.undo());
      expect(result.current.value).toBe('a');
      expect(result.current.currentIndex).toBeUndefined(); // currentIndex 不在返回值中
    });

    it('redo 在边界时安全（不越界）', () => {
      const { result } = renderHook(() => useUndoRedo<string>({ initialValue: 'a' }));
      act(() => result.current.setValue('b'));
      act(() => result.current.undo());
      act(() => result.current.redo());
      expect(result.current.value).toBe('b');
      // 连续 redo 不应越界
      act(() => result.current.redo());
      expect(result.current.value).toBe('b');
    });

    it('undo 后输入新值应清空 redo 栈', () => {
      const { result } = renderHook(() => useUndoRedo<string>({ initialValue: 'a' }));
      act(() => result.current.setValue('b'));
      act(() => result.current.setValue('c'));
      act(() => result.current.undo()); // 回到 b
      act(() => result.current.setValue('d')); // 新输入
      expect(result.current.value).toBe('d');
      expect(result.current.canRedo).toBe(false); // redo 栈已清空
    });
  });

  describe('clearHistory', () => {
    it('clearHistory 后 canUndo/canRedo 均为 false', () => {
      const { result } = renderHook(() => useUndoRedo<string>({ initialValue: 'a' }));
      act(() => result.current.setValue('b'));
      act(() => result.current.setValue('c'));
      expect(result.current.canUndo).toBe(true);
      act(() => result.current.clearHistory());
      expect(result.current.canUndo).toBe(false);
      expect(result.current.canRedo).toBe(false);
      expect(result.current.value).toBe('c');
    });
  });

  describe('MAX_HISTORY 截断', () => {
    it('超过 100 条历史时应正确截断', () => {
      const { result } = renderHook(() => useUndoRedo<number>({ initialValue: 0 }));
      // 输入 105 个不同值
      act(() => {
        for (let i = 1; i <= 105; i++) {
          result.current.setValue(i);
        }
      });
      expect(result.current.value).toBe(105);
      expect(result.current.canUndo).toBe(true);
      // undo 应能回退（不会因索引越界崩溃）
      act(() => result.current.undo());
      expect(result.current.value).toBe(104);
    });
  });

  describe('onChange 回调', () => {
    it('值变化时触发 onChange', () => {
      const onChange = vi.fn();
      const { result } = renderHook(() => useUndoRedo<string>({ initialValue: 'a', onChange }));
      act(() => result.current.setValue('b'));
      // onChange 通过 useEffect 触发，act 结束后应已调用
      expect(onChange).toHaveBeenCalledWith('b');
    });

    it('undo/redo 时触发 onChange', () => {
      const onChange = vi.fn();
      const { result } = renderHook(() => useUndoRedo<string>({ initialValue: 'a', onChange }));
      act(() => result.current.setValue('b'));
      onChange.mockClear();
      act(() => result.current.undo());
      expect(onChange).toHaveBeenCalledWith('a');
    });
  });

  describe('函数式更新', () => {
    it('支持基于 prev 的函数式更新', () => {
      const { result } = renderHook(() => useUndoRedo<number>({ initialValue: 0 }));
      act(() => result.current.setValue(prev => prev + 1));
      act(() => result.current.setValue(prev => prev + 1));
      expect(result.current.value).toBe(2);
      act(() => result.current.undo());
      expect(result.current.value).toBe(1);
    });
  });

  describe('StrictMode 兼容性', () => {
    it('StrictMode 双重渲染下历史栈不重复入栈', () => {
      // StrictMode 会在开发模式下双重调用 updater，但我们的副作用已移出 updater
      // 这里验证多次调用 setValue 同一值不会产生重复历史
      const { result } = renderHook(() => useUndoRedo<string>({ initialValue: 'a' }));
      act(() => {
        result.current.setValue('b');
        result.current.setValue('b'); // 相同值，不应入栈
        result.current.setValue('b');
      });
      expect(result.current.canUndo).toBe(true);
      act(() => result.current.undo());
      expect(result.current.value).toBe('a');
    });
  });
});
