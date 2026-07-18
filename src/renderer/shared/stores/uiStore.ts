import { create } from 'zustand';

export type AutoThemeMode = 'off' | 'time' | 'system';
export type AnimationLevel = 'full' | 'minimal' | 'none';

export interface WritingStats {
  totalWords: number;
  totalCharacters: number;
  writingTime: number; // 毫秒
  sessions: number;
  lastSession: number | null; // 时间戳
  dailyGoal: number;
  todayWords: number;
  todayDate: string; // YYYY-MM-DD，用于判断是否需要重置今日字数
}

/** 在 DataService 的 createFile / updateFile 中调用，累计今日净新增字数 */
export function accumulateTodayWords(delta: number): void {
  if (delta <= 0) return;
  const state = useUIStore.getState();
  const stats = state.writingStats;
  const today = new Date();
  const dateKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  if (stats.todayDate !== dateKey) {
    // 新的一天，重置今日字数
    state.updateWritingStats({ todayWords: delta, todayDate: dateKey });
  } else {
    state.updateWritingStats({ todayWords: stats.todayWords + delta });
  }
}

export interface UIStoreState {
  inputText: string;
  activeTab: 'chat' | 'tasks';
  panelWidth: number;
  isExpanded: boolean;
  isResizing: boolean;
  editingMsgId: string | null;
  editContent: string;
  collapsedIds: Set<string>;
  copyToast: string | null;
  showHistory: boolean;
  showAgentMenu: boolean;
  renamingId: string | null;
  renameValue: string;
  attachedFiles: Array<{ name: string; content: string; size: number }>;
  showJumpMenu: boolean;
  showAgentEditor: boolean;
  editingAgent: import('../../../shared/types/fileSystem').AIAgent | null;
  aiGenerating: boolean;
  showAiGenDialog: boolean;
  aiGenInput: string;
  isAtBottom: boolean;
  // 新增功能状态
  autoThemeMode: AutoThemeMode;
  animationLevel: AnimationLevel;
  dayTimeStart: string; // 例如 "07:00"
  nightTimeStart: string; // 例如 "19:00"
  writingStats: WritingStats;
  updateWritingStats: (updates: Partial<WritingStats>) => void;
}

const defaultWritingStats: WritingStats = {
  totalWords: 0,
  totalCharacters: 0,
  writingTime: 0,
  sessions: 0,
  lastSession: null,
  dailyGoal: 2000,
  todayWords: 0,
  todayDate: '',
};

export const useUIStore = create<UIStoreState>()((set) => ({
  inputText: '',
  activeTab: 'chat',
  panelWidth: (() => { try { return Number(localStorage.getItem('moyuan-ai-panel-width')) || 360; } catch { return 360; } })(),
  isExpanded: (() => { try { return localStorage.getItem('moyuan-ai-panel-expanded') === 'true'; } catch { return false; } })(),
  isResizing: false,
  editingMsgId: null,
  editContent: '',
  collapsedIds: new Set<string>(),
  copyToast: null,
  showHistory: false,
  showAgentMenu: false,
  renamingId: null,
  renameValue: '',
  attachedFiles: [],
  showJumpMenu: false,
  showAgentEditor: false,
  editingAgent: null,
  aiGenerating: false,
  showAiGenDialog: false,
  aiGenInput: '',
  isAtBottom: true,
  // 新增功能状态
  autoThemeMode: (() => { try { return (localStorage.getItem('moyuan-auto-theme') as AutoThemeMode) || 'off'; } catch { return 'off'; } })(),
  animationLevel: (() => { try { return (localStorage.getItem('moyuan-animation-level') as AnimationLevel) || 'full'; } catch { return 'full'; } })(),
  dayTimeStart: (() => { try { return localStorage.getItem('moyuan-day-start') || '07:00'; } catch { return '07:00'; } })(),
  nightTimeStart: (() => { try { return localStorage.getItem('moyuan-night-start') || '19:00'; } catch { return '19:00'; } })(),
  writingStats: (() => { 
    try { 
      const saved = localStorage.getItem('moyuan-writing-stats');
      return saved ? { ...defaultWritingStats, ...JSON.parse(saved) } : defaultWritingStats;
    } catch { 
      return defaultWritingStats; 
    } 
  })(),

  setInputText: (text: string) => set({ inputText: text }),
  setActiveTab: (tab: 'chat' | 'tasks') => set({ activeTab: tab }),
  setPanelWidth: (width: number) => {
    try { localStorage.setItem('moyuan-ai-panel-width', String(width)); } catch {}
    set({ panelWidth: width });
  },
  setIsExpanded: (expanded: boolean) => {
    try { localStorage.setItem('moyuan-ai-panel-expanded', String(expanded)); } catch {}
    set({ isExpanded: expanded });
  },
  setIsResizing: (resizing: boolean) => set({ isResizing: resizing }),
  setEditingMsgId: (id: string | null) => set({ editingMsgId: id }),
  setEditContent: (content: string) => set({ editContent: content }),
  toggleCollapsed: (msgId: string) => set(s => {
    const next = new Set(s.collapsedIds);
    if (next.has(msgId)) next.delete(msgId); else next.add(msgId);
    return { collapsedIds: next };
  }),
  setCopyToast: (id: string | null) => set({ copyToast: id }),
  setShowHistory: (show: boolean) => set({ showHistory: show }),
  setShowAgentMenu: (show: boolean) => set({ showAgentMenu: show }),
  setRenamingId: (id: string | null) => set({ renamingId: id }),
  setRenameValue: (value: string) => set({ renameValue: value }),
  addAttachedFile: (file: { name: string; content: string; size: number }) => set(s => ({
    attachedFiles: [...s.attachedFiles, file],
  })),
  removeAttachedFile: (idx: number) => set(s => ({
    attachedFiles: s.attachedFiles.filter((_, i) => i !== idx),
  })),
  clearAttachedFiles: () => set({ attachedFiles: [] }),
  setShowJumpMenu: (show: boolean) => set({ showJumpMenu: show }),
  setShowAgentEditor: (show: boolean) => set({ showAgentEditor: show }),
  setEditingAgent: (agent: import('../../../shared/types/fileSystem').AIAgent | null) => set({ editingAgent: agent }),
  setAiGenerating: (generating: boolean) => set({ aiGenerating: generating }),
  setShowAiGenDialog: (show: boolean) => set({ showAiGenDialog: show }),
  setAiGenInput: (input: string) => set({ aiGenInput: input }),
  setIsAtBottom: (bottom: boolean) => set({ isAtBottom: bottom }),
  // 新增功能的 setter
  setAutoThemeMode: (mode: AutoThemeMode) => {
    try { localStorage.setItem('moyuan-auto-theme', mode); } catch {}
    set({ autoThemeMode: mode });
  },
  setAnimationLevel: (level: AnimationLevel) => {
    try { localStorage.setItem('moyuan-animation-level', level); } catch {}
    set({ animationLevel: level });
  },
  setDayTimeStart: (time: string) => {
    try { localStorage.setItem('moyuan-day-start', time); } catch {}
    set({ dayTimeStart: time });
  },
  setNightTimeStart: (time: string) => {
    try { localStorage.setItem('moyuan-night-start', time); } catch {}
    set({ nightTimeStart: time });
  },
  updateWritingStats: (updates: Partial<WritingStats>) => set(s => {
    const newStats = { ...s.writingStats, ...updates };
    try { localStorage.setItem('moyuan-writing-stats', JSON.stringify(newStats)); } catch {}
    return { writingStats: newStats };
  }),
  resetWritingStats: () => {
    try { localStorage.setItem('moyuan-writing-stats', JSON.stringify(defaultWritingStats)); } catch {}
    set({ writingStats: defaultWritingStats });
  },
}));
