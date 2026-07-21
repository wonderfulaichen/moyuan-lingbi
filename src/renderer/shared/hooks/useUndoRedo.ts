import { useState, useCallback, useRef, useEffect } from 'react';

const MAX_HISTORY = 100;

interface UseUndoRedoOptions<T> {
  initialValue: T;
  onChange?: (value: T) => void;
  equalityFn?: (a: T, b: T) => boolean;
}

interface UseUndoRedoReturn<T> {
  value: T;
  setValue: (newValue: T | ((prev: T) => T), skipHistory?: boolean) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  clearHistory: () => void;
}

/**
 * 带撤销/重做功能的值管理 hook
 *
 * 历史栈使用 useState 管理（而非 useRef），确保 canUndo/canRedo/clearHistory
 * 都能正确触发重渲染。副作用（onChange）通过 useEffect 触发，避免在
 * setState updater 中执行副作用（React 18 StrictMode 下 updater 会被调用两次）。
 */
export function useUndoRedo<T>({
  initialValue,
  onChange,
  equalityFn,
}: UseUndoRedoOptions<T>): UseUndoRedoReturn<T> {
  const [value, setValueState] = useState<T>(initialValue);
  // 历史栈用 state 管理：修改时会触发重渲染，canUndo/canRedo 自动更新
  const [history, setHistory] = useState<T[]>([initialValue]);
  const [currentIndex, setCurrentIndex] = useState<number>(0);

  // 用 ref 保存最新值，避免连续调用时闭包陷阱
  const valueRef = useRef(value);
  const historyRef = useRef(history);
  const indexRef = useRef(currentIndex);
  useEffect(() => { valueRef.current = value; }, [value]);
  useEffect(() => { historyRef.current = history; }, [history]);
  useEffect(() => { indexRef.current = currentIndex; }, [currentIndex]);

  // 用 ref 保存最新的 onChange，避免 undo/redo 因依赖 onChange 而频繁重建
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // 值变化时触发 onChange 副作用（在 updater 外执行，符合 React 纯函数原则）
  useEffect(() => {
    onChangeRef.current?.(value);
  }, [value]);

  const setValue = useCallback((newValue: T | ((prev: T) => T), skipHistory?: boolean) => {
    // 基于 ref 中的最新值计算 resolved，避免连续调用时闭包陷阱
    const resolved = typeof newValue === 'function' ? (newValue as (prev: T) => T)(valueRef.current) : newValue;
    setValueState(resolved);
    valueRef.current = resolved;

    if (!skipHistory) {
      const curHistory = historyRef.current;
      const curIdx = indexRef.current;
      // 历史栈更新：仅当新值与当前栈顶不同时才入栈
      const currentTop = curHistory[curIdx];
      const shouldPush = equalityFn
        ? !equalityFn(resolved, currentTop)
        : resolved !== currentTop;
      if (!shouldPush) return;

      const newHistory = curHistory.slice(0, curIdx + 1);
      newHistory.push(resolved);
      let newIdx: number;
      if (newHistory.length > MAX_HISTORY) {
        newHistory.shift();
        newIdx = newHistory.length - 1;
      } else {
        newIdx = curIdx + 1;
      }
      historyRef.current = newHistory;
      indexRef.current = newIdx;
      setHistory(newHistory);
      setCurrentIndex(newIdx);
    }
  }, [equalityFn]);

  const undo = useCallback(() => {
    const curIdx = indexRef.current;
    if (curIdx <= 0) return;
    const newIdx = curIdx - 1;
    const newValue = historyRef.current[newIdx];
    indexRef.current = newIdx;
    valueRef.current = newValue;
    setCurrentIndex(newIdx);
    setValueState(newValue);
  }, []);

  const redo = useCallback(() => {
    const curIdx = indexRef.current;
    const curHistory = historyRef.current;
    if (curIdx >= curHistory.length - 1) return;
    const newIdx = curIdx + 1;
    const newValue = curHistory[newIdx];
    indexRef.current = newIdx;
    valueRef.current = newValue;
    setCurrentIndex(newIdx);
    setValueState(newValue);
  }, []);

  const clearHistory = useCallback(() => {
    const curValue = valueRef.current;
    historyRef.current = [curValue];
    indexRef.current = 0;
    setHistory([curValue]);
    setCurrentIndex(0);
  }, []);

  const canUndo = currentIndex > 0;
  const canRedo = currentIndex < history.length - 1;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isCtrlOrCmd = e.ctrlKey || e.metaKey;
      if (!isCtrlOrCmd) return;

      if (e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
      } else if (e.key === 'y') {
        e.preventDefault();
        redo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);

  return {
    value,
    setValue,
    undo,
    redo,
    canUndo,
    canRedo,
    clearHistory,
  };
}
