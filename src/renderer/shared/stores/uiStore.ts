import { create } from 'zustand';

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
  editingAgent: import('../../shared/types/fileSystem').AIAgent | null;
  aiGenerating: boolean;
  showAiGenDialog: boolean;
  aiGenInput: string;
  isAtBottom: boolean;
}

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
  setEditingAgent: (agent: import('../../shared/types/fileSystem').AIAgent | null) => set({ editingAgent: agent }),
  setAiGenerating: (generating: boolean) => set({ aiGenerating: generating }),
  setShowAiGenDialog: (show: boolean) => set({ showAiGenDialog: show }),
  setAiGenInput: (input: string) => set({ aiGenInput: input }),
  setIsAtBottom: (bottom: boolean) => set({ isAtBottom: bottom }),
}));
