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

export function useUndoRedo<T>({
  initialValue,
  onChange,
  equalityFn,
}: UseUndoRedoOptions<T>): UseUndoRedoReturn<T> {
  const [value, setValueState] = useState<T>(initialValue);
  const historyRef = useRef<T[]>([initialValue]);
  const currentIndexRef = useRef<number>(0);
  const isUndoRedoRef = useRef<boolean>(false);

  const canUndo = currentIndexRef.current > 0;
  const canRedo = currentIndexRef.current < historyRef.current.length - 1;

  const setValue = useCallback((newValue: T | ((prev: T) => T), skipHistory?: boolean) => {
    setValueState(prev => {
      const resolved = typeof newValue === 'function' ? (newValue as (prev: T) => T)(prev) : newValue;

      if (!skipHistory && !isUndoRedoRef.current) {
        const history = historyRef.current;
        const currentIdx = currentIndexRef.current;

        if (equalityFn ? !equalityFn(resolved, history[currentIdx]) : resolved === history[currentIdx]) {
          const newHistory = history.slice(0, currentIdx + 1);
          newHistory.push(resolved);
          if (newHistory.length > MAX_HISTORY) {
            newHistory.shift();
          } else {
            currentIndexRef.current = currentIdx + 1;
          }
          historyRef.current = newHistory;
        }
      }

      isUndoRedoRef.current = false;
      onChange?.(resolved);
      return resolved;
    });
  }, [onChange, equalityFn]);

  const undo = useCallback(() => {
    if (!canUndo) return;
    isUndoRedoRef.current = true;
    currentIndexRef.current -= 1;
    const newValue = historyRef.current[currentIndexRef.current];
    setValueState(newValue);
    onChange?.(newValue);
  }, [canUndo, onChange]);

  const redo = useCallback(() => {
    if (!canRedo) return;
    isUndoRedoRef.current = true;
    currentIndexRef.current += 1;
    const newValue = historyRef.current[currentIndexRef.current];
    setValueState(newValue);
    onChange?.(newValue);
  }, [canRedo, onChange]);

  const clearHistory = useCallback(() => {
    historyRef.current = [value];
    currentIndexRef.current = 0;
  }, [value]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
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
