import { useState, useEffect, useCallback, useRef } from 'react';
import { dataService } from '../services/DataService';
import { memoryBankService } from '../services/MemoryBankService';

interface MemoryStatus {
  lastUpdated: number | null;
  lastAction: string;
  totalEntries: number;
  isInitialized: boolean;
}

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 10) return '刚刚';
  if (seconds < 60) return `${seconds}秒前`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}天前`;
  return new Date(timestamp).toLocaleDateString('zh-CN');
}

export function useMemoryStatus() {
  const [memoryStatus, setMemoryStatus] = useState<MemoryStatus>({
    lastUpdated: null,
    lastAction: '',
    totalEntries: 0,
    isInitialized: false,
  });
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    const project = dataService.getActiveProject();
    if (!project) {
      setMemoryStatus({ lastUpdated: null, lastAction: '', totalEntries: 0, isInitialized: false });
      return;
    }

    try {
      const log = await memoryBankService.getMaintenanceLog(project.id);
      if (log.length > 0) {
        const last = log[log.length - 1];
        setMemoryStatus({
          lastUpdated: last.timestamp,
          lastAction: last.action,
          totalEntries: log.length,
          isInitialized: true,
        });
      } else {
        setMemoryStatus({
          lastUpdated: null,
          lastAction: '',
          totalEntries: 0,
          isInitialized: true,
        });
      }
    } catch {
      setMemoryStatus({ lastUpdated: null, lastAction: '', totalEntries: 0, isInitialized: false });
    }
  }, []);

  useEffect(() => {
    refresh();

    const unsubscribe = dataService.subscribe(() => {
      refresh();
    });

    refreshTimerRef.current = setInterval(refresh, 30000);

    return () => {
      unsubscribe();
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current);
      }
    };
  }, [refresh]);

  const relativeTime = memoryStatus.lastUpdated
    ? formatRelativeTime(memoryStatus.lastUpdated)
    : '';

  return {
    ...memoryStatus,
    relativeTime,
    refresh,
  };
}
