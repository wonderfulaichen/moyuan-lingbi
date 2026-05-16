import React, { createContext, useContext, useMemo, useSyncExternalStore } from 'react';
import { useAIStatusStore, TokenUsage, AITaskRecord } from '../stores/aiStatusStore';

export type { TokenUsage, AITaskRecord as AITask };

export interface AIStatusInfo {
  isGenerating: boolean;
  statusMessage: string;
  progress: number;
  tokenUsage: TokenUsage | null;
  modelName: string;
  lastDuration: number | null;
  error: string | null;
  currentTask: string;
  tasks: AITaskRecord[];
  activeTaskId: string | null;
}

interface AIStatusContextType {
  status: AIStatusInfo;
  setGenerating: (modelName: string, message?: string, task?: string) => void;
  setProgress: (progress: number) => void;
  setStatusMessage: (message: string) => void;
  setTokenUsage: (usage: TokenUsage) => void;
  setError: (error: string | null) => void;
  setComplete: () => void;
  resetStatus: () => void;
  addTask: (task: Omit<AITaskRecord, 'startTime'> & { startTime?: number }) => string;
  setActiveTask: (taskId: string | null) => void;
  clearCompletedTasks: () => void;
}

const AIStatusContext = createContext<AIStatusContextType | null>(null);

const subscribeNoop = () => () => {};

export const AIStatusProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const store = useAIStatusStore();

  const contextValue = useMemo<AIStatusContextType>(() => ({
    status: {
      isGenerating: store.isGenerating,
      statusMessage: store.statusMessage,
      progress: store.progress,
      tokenUsage: store.tokenUsage,
      modelName: store.modelName,
      lastDuration: store.lastDuration,
      error: store.error,
      currentTask: store.currentTask,
      tasks: store.tasks,
      activeTaskId: store.activeTaskId,
    },
    setGenerating: store.setGenerating,
    setProgress: store.setProgress,
    setStatusMessage: store.setStatusMessage,
    setTokenUsage: store.setTokenUsage,
    setError: store.setError,
    setComplete: store.setComplete,
    resetStatus: store.resetStatus,
    addTask: store.addTask,
    setActiveTask: store.setActiveTask,
    clearCompletedTasks: store.clearCompletedTasks,
  }), [
    store.isGenerating,
    store.statusMessage,
    store.progress,
    store.tokenUsage,
    store.modelName,
    store.lastDuration,
    store.error,
    store.currentTask,
    store.tasks,
    store.activeTaskId,
    store.setGenerating,
    store.setProgress,
    store.setStatusMessage,
    store.setTokenUsage,
    store.setError,
    store.setComplete,
    store.resetStatus,
    store.addTask,
    store.setActiveTask,
    store.clearCompletedTasks,
  ]);

  return (
    <AIStatusContext.Provider value={contextValue}>
      {children}
    </AIStatusContext.Provider>
  );
};

export function useAIStatus(): AIStatusContextType {
  const ctx = useContext(AIStatusContext);
  if (!ctx) {
    throw new Error('useAIStatus must be used within an AIStatusProvider');
  }
  return ctx;
}
