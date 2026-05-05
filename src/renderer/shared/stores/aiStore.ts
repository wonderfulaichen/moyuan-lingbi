import { create } from 'zustand';
import { AIChatMessage, AITaskItem, AIPendingPrompt, Conversation, AIAgent, AgentPhase, AgentStateInfo } from '../../../shared/types/fileSystem';
import { detectAgentState, PendingConfirm } from '../services/ai-assistant/detectAgentState';

const STREAMING_DEBOUNCE_MS = 150;

export interface AIStoreState {
  messages: AIChatMessage[];
  isProcessing: boolean;
  streamingContent: string | null;
  pendingConfirm: PendingConfirm | null;
  pendingPrompt: AIPendingPrompt | null;
  conversations: Conversation[];
  activeConversationId: string | null;
  agents: AIAgent[];
  activeAgentId: string;
  tokenUsage: { prompt: number; completion: number; total: number } | null;
  tasks: AITaskItem[];
  agentState: AgentStateInfo;
}

let pendingStreamUpdate: string | null = null;
let streamDebounceTimer: ReturnType<typeof setTimeout> | null = null;

function clearPendingStream() {
  if (streamDebounceTimer) {
    clearTimeout(streamDebounceTimer);
    streamDebounceTimer = null;
  }
  pendingStreamUpdate = null;
}

export const useAIStore = create<AIStoreState>()((set, get) => ({
  messages: [],
  isProcessing: false,
  streamingContent: null,
  pendingConfirm: null,
  pendingPrompt: null,
  conversations: [],
  activeConversationId: null,
  agents: [],
  activeAgentId: 'agent-general',
  tokenUsage: null,
  tasks: [],
  agentState: {
    phase: AgentPhase.IDLE,
    currentTask: '',
    progress: 0,
    requiredAction: 'none',
    error: null,
    pendingFiles: [],
    iteration: 0,
    maxIterations: 3,
  },

  setMessages: (messages: AIChatMessage[]) => {
    set(s => {
      const agentState = detectAgentState(
        messages,
        s.isProcessing,
        s.streamingContent,
        s.pendingConfirm,
        s.pendingPrompt,
      );
      return { messages, agentState };
    });
  },

  addMessage: (msg: AIChatMessage) => {
    set(s => {
      const messages = [...s.messages, msg];
      if (messages.length > 200) {
        const trimmed = messages.slice(-150);
        const agentState = detectAgentState(trimmed, s.isProcessing, s.streamingContent, s.pendingConfirm, s.pendingPrompt);
        return { messages: trimmed, agentState };
      }
      const agentState = detectAgentState(messages, s.isProcessing, s.streamingContent, s.pendingConfirm, s.pendingPrompt);
      return { messages, agentState };
    });
  },

  setIsProcessing: (isProcessing: boolean) => {
    set(s => {
      const agentState = detectAgentState(
        s.messages,
        isProcessing,
        s.streamingContent,
        s.pendingConfirm,
        s.pendingPrompt,
      );
      return { isProcessing, agentState };
    });
  },

  setStreamingContent: (content: string | null) => {
    if (content === null) {
      clearPendingStream();
      set(s => {
        const agentState = detectAgentState(
          s.messages,
          s.isProcessing,
          null,
          s.pendingConfirm,
          s.pendingPrompt,
        );
        return { streamingContent: null, agentState };
      });
      return;
    }
    pendingStreamUpdate = content;
    if (!streamDebounceTimer) {
      streamDebounceTimer = setTimeout(() => {
        const current = pendingStreamUpdate;
        streamDebounceTimer = null;
        if (current !== null) {
          set(s => {
            const agentState = detectAgentState(
              s.messages,
              s.isProcessing,
              current,
              s.pendingConfirm,
              s.pendingPrompt,
            );
            return { streamingContent: current, agentState };
          });
        }
      }, STREAMING_DEBOUNCE_MS);
    }
  },

  setPendingConfirm: (confirm: PendingConfirm | null) => {
    set(s => {
      const agentState = detectAgentState(
        s.messages,
        s.isProcessing,
        s.streamingContent,
        confirm,
        s.pendingPrompt,
      );
      return { pendingConfirm: confirm, agentState };
    });
  },

  setPendingPrompt: (prompt: AIPendingPrompt | null) => {
    set(s => {
      const agentState = detectAgentState(
        s.messages,
        s.isProcessing,
        s.streamingContent,
        s.pendingConfirm,
        prompt,
      );
      return { pendingPrompt: prompt, agentState };
    });
  },

  setConversations: (conversations: Conversation[]) => set({ conversations }),
  setActiveConversationId: (id: string | null) => set({ activeConversationId: id }),
  setAgents: (agents: AIAgent[]) => set({ agents }),
  setActiveAgentId: (id: string) => set({ activeAgentId: id }),
  setTokenUsage: (usage: { prompt: number; completion: number; total: number } | null) => set({ tokenUsage: usage }),
  setTasks: (tasks: AITaskItem[]) => set({ tasks }),

  setAgentStateOverride: (partial: Partial<AgentStateInfo>) => {
    set(s => ({
      agentState: { ...s.agentState, ...partial },
    }));
  },

  resetForNewTask: () => {
    clearPendingStream();
    set(s => ({
      isProcessing: false,
      streamingContent: null,
      pendingConfirm: null,
      pendingPrompt: null,
      tokenUsage: null,
      agentState: {
        phase: AgentPhase.IDLE,
        currentTask: '',
        progress: 0,
        requiredAction: 'none',
        error: null,
        pendingFiles: [],
        iteration: 0,
        maxIterations: 3,
      },
    }));
  },

  syncFromService: (serviceState: {
    messages: AIChatMessage[];
    isProcessing: boolean;
    streamingContent: string | null;
    pendingPrompt: AIPendingPrompt | null;
    conversations: Conversation[];
    activeConversationId: string | null;
    agents: AIAgent[];
    activeAgentId: string;
    tokenUsage: { prompt: number; completion: number; total: number } | null;
    tasks: AITaskItem[];
    agentState: AgentStateInfo;
  }) => {
    clearPendingStream();
    set({
      messages: serviceState.messages,
      isProcessing: serviceState.isProcessing,
      streamingContent: serviceState.streamingContent,
      pendingPrompt: serviceState.pendingPrompt,
      conversations: serviceState.conversations,
      activeConversationId: serviceState.activeConversationId,
      agents: serviceState.agents,
      activeAgentId: serviceState.activeAgentId,
      tokenUsage: serviceState.tokenUsage,
      tasks: serviceState.tasks,
      agentState: serviceState.agentState,
    });
  },
}));
