import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AgentPhase } from '../../../shared/types/fileSystem';

/**
 * aiStore 测试
 *
 * 覆盖 AI 主状态 store 的核心逻辑：
 * - 消息管理（addMessage 200 条截断）
 * - 流式内容防抖（setStreamingContent 150ms 防抖）
 * - agentState 联动更新（每个 set 都触发 detectAgentState）
 * - resetForNewTask / syncFromService 清理定时器
 *
 * mock detectAgentState：避免依赖完整 agent 状态检测逻辑，
 * 让测试聚焦于 store 本身的行为。
 */

vi.mock('../services/ai-assistant/detectAgentState', () => ({
  detectAgentState: vi.fn(() => ({
    phase: AgentPhase.IDLE,
    currentTask: '',
    progress: 0,
    requiredAction: 'none',
    error: null,
    pendingFiles: [],
    iteration: 0,
    maxIterations: 3,
  })),
  PendingConfirm: null as any, // type only
}));

import { useAIStore, AIStoreState } from './aiStore';
import { detectAgentState } from '../services/ai-assistant/detectAgentState';

describe('aiStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    useAIStore.setState({
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
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const getState = (): AIStoreState => useAIStore.getState();

  describe('初始状态', () => {
    it('应该有正确的默认值', () => {
      const s = getState();
      expect(s.messages).toEqual([]);
      expect(s.isProcessing).toBe(false);
      expect(s.streamingContent).toBeNull();
      expect(s.pendingConfirm).toBeNull();
      expect(s.pendingPrompt).toBeNull();
      expect(s.conversations).toEqual([]);
      expect(s.activeConversationId).toBeNull();
      expect(s.agents).toEqual([]);
      expect(s.activeAgentId).toBe('agent-general');
      expect(s.tokenUsage).toBeNull();
      expect(s.tasks).toEqual([]);
      expect(s.agentState.phase).toBe(AgentPhase.IDLE);
    });
  });

  describe('setMessages', () => {
    it('应该设置 messages 并更新 agentState', () => {
      const messages = [{ id: '1', role: 'user', content: 'hello' } as any];
      useAIStore.getState().setMessages(messages);

      expect(getState().messages).toEqual(messages);
      expect(detectAgentState).toHaveBeenCalled();
    });
  });

  describe('addMessage', () => {
    it('应该追加消息到末尾', () => {
      const msg1 = { id: '1', role: 'user', content: 'hello' } as any;
      const msg2 = { id: '2', role: 'assistant', content: 'hi' } as any;

      useAIStore.getState().addMessage(msg1);
      useAIStore.getState().addMessage(msg2);

      expect(getState().messages).toHaveLength(2);
      expect(getState().messages[1]).toEqual(msg2);
    });

    it('消息超过 200 条时应该截断到 150 条', () => {
      // 先添加 200 条
      for (let i = 0; i < 200; i++) {
        useAIStore.getState().addMessage({ id: `m${i}`, content: `msg${i}` } as any);
      }
      expect(getState().messages).toHaveLength(200);

      // 第 201 条触发截断
      useAIStore.getState().addMessage({ id: 'm200', content: 'new' } as any);
      expect(getState().messages).toHaveLength(150);
      // 截断后保留的是最后 150 条（即 m51 到 m200）
      expect(getState().messages[0].id).toBe('m51');
      expect(getState().messages[149].id).toBe('m200');
    });

    it('每次 addMessage 都应该触发 detectAgentState', () => {
      useAIStore.getState().addMessage({ id: '1', content: 'a' } as any);
      useAIStore.getState().addMessage({ id: '2', content: 'b' } as any);
      expect(detectAgentState).toHaveBeenCalledTimes(2);
    });
  });

  describe('setIsProcessing', () => {
    it('应该设置 isProcessing 并更新 agentState', () => {
      useAIStore.getState().setIsProcessing(true);
      expect(getState().isProcessing).toBe(true);
      expect(detectAgentState).toHaveBeenCalled();
    });
  });

  describe('setStreamingContent - 防抖逻辑', () => {
    it('传入 null 应立即清空 streamingContent', () => {
      useAIStore.setState({ streamingContent: 'old' });
      useAIStore.getState().setStreamingContent(null);

      expect(getState().streamingContent).toBeNull();
    });

    it('传入字符串应延迟 150ms 更新', () => {
      useAIStore.getState().setStreamingContent('chunk1');

      // 防抖期间不应更新
      vi.advanceTimersByTime(100);
      expect(getState().streamingContent).toBeNull();

      // 150ms 后应更新
      vi.advanceTimersByTime(50);
      expect(getState().streamingContent).toBe('chunk1');
    });

    it('连续调用应只触发一次定时器（防抖）', () => {
      useAIStore.getState().setStreamingContent('a');
      vi.advanceTimersByTime(50);
      useAIStore.getState().setStreamingContent('b');
      vi.advanceTimersByTime(50);
      useAIStore.getState().setStreamingContent('c');

      // 150ms 后只更新为最后一次的值
      vi.advanceTimersByTime(50);
      expect(getState().streamingContent).toBe('c');
    });

    it('防抖期间传入 null 应取消待更新', () => {
      useAIStore.getState().setStreamingContent('pending');
      useAIStore.getState().setStreamingContent(null);

      // 推进时间，不应更新为 'pending'
      vi.advanceTimersByTime(200);
      expect(getState().streamingContent).toBeNull();
    });
  });

  describe('setPendingConfirm', () => {
    it('应该设置 pendingConfirm 并更新 agentState', () => {
      const confirm = { files: [] };
      useAIStore.getState().setPendingConfirm(confirm as any);

      expect(getState().pendingConfirm).toEqual(confirm);
      expect(detectAgentState).toHaveBeenCalled();
    });

    it('传入 null 应清除', () => {
      useAIStore.getState().setPendingConfirm({ files: [] } as any);
      useAIStore.getState().setPendingConfirm(null);

      expect(getState().pendingConfirm).toBeNull();
    });
  });

  describe('setPendingPrompt', () => {
    it('应该设置 pendingPrompt 并更新 agentState', () => {
      const prompt = { content: 'test' } as any;
      useAIStore.getState().setPendingPrompt(prompt);

      expect(getState().pendingPrompt).toEqual(prompt);
      expect(detectAgentState).toHaveBeenCalled();
    });
  });

  describe('简单 setter', () => {
    it('setConversations', () => {
      const convs = [{ id: 'c1', title: 't' } as any];
      useAIStore.getState().setConversations(convs);
      expect(getState().conversations).toEqual(convs);
    });

    it('setActiveConversationId', () => {
      useAIStore.getState().setActiveConversationId('c1');
      expect(getState().activeConversationId).toBe('c1');
    });

    it('setAgents', () => {
      const agents = [{ id: 'a1', name: 'Agent' } as any];
      useAIStore.getState().setAgents(agents);
      expect(getState().agents).toEqual(agents);
    });

    it('setActiveAgentId', () => {
      useAIStore.getState().setActiveAgentId('a1');
      expect(getState().activeAgentId).toBe('a1');
    });

    it('setTokenUsage', () => {
      const usage = { prompt: 10, completion: 5, total: 15 };
      useAIStore.getState().setTokenUsage(usage);
      expect(getState().tokenUsage).toEqual(usage);
    });

    it('setTasks', () => {
      const tasks = [{ id: 't1', name: 'task' } as any];
      useAIStore.getState().setTasks(tasks);
      expect(getState().tasks).toEqual(tasks);
    });
  });

  describe('setAgentStateOverride', () => {
    it('应该合并 agentState 字段', () => {
      useAIStore.getState().setAgentStateOverride({
        phase: AgentPhase.WORKING,
        progress: 50,
      });

      const s = getState();
      expect(s.agentState.phase).toBe(AgentPhase.WORKING);
      expect(s.agentState.progress).toBe(50);
      // 未覆盖的字段应保持
      expect(s.agentState.maxIterations).toBe(3);
    });
  });

  describe('resetForNewTask', () => {
    it('应该重置任务相关状态', () => {
      // 先设置一些状态
      useAIStore.setState({
        isProcessing: true,
        streamingContent: 'content',
        pendingConfirm: { files: [] } as any,
        pendingPrompt: { content: 'p' } as any,
        tokenUsage: { prompt: 10, completion: 5, total: 15 },
      });

      useAIStore.getState().resetForNewTask();

      const s = getState();
      expect(s.isProcessing).toBe(false);
      expect(s.streamingContent).toBeNull();
      expect(s.pendingConfirm).toBeNull();
      expect(s.pendingPrompt).toBeNull();
      expect(s.tokenUsage).toBeNull();
      expect(s.agentState.phase).toBe(AgentPhase.IDLE);
      expect(s.agentState.progress).toBe(0);
    });

    it('应该清理挂起的流式定时器', () => {
      useAIStore.getState().setStreamingContent('pending');
      useAIStore.getState().resetForNewTask();

      // 推进时间，定时器不应触发
      vi.advanceTimersByTime(200);
      expect(getState().streamingContent).toBeNull();
    });
  });

  describe('syncFromService', () => {
    it('应该从 service 状态完整同步', () => {
      const serviceState = {
        messages: [{ id: '1', content: 'synced' } as any],
        isProcessing: true,
        streamingContent: 'streaming',
        pendingPrompt: { content: 'p' } as any,
        conversations: [{ id: 'c1' } as any],
        activeConversationId: 'c1',
        agents: [{ id: 'a1' } as any],
        activeAgentId: 'a1',
        tokenUsage: { prompt: 100, completion: 50, total: 150 },
        tasks: [{ id: 't1' } as any],
        agentState: {
          phase: AgentPhase.WORKING,
          currentTask: 'working',
          progress: 30,
          requiredAction: 'none',
          error: null,
          pendingFiles: [],
          iteration: 1,
          maxIterations: 3,
        },
      };

      useAIStore.getState().syncFromService(serviceState);

      const s = getState();
      expect(s.messages).toEqual(serviceState.messages);
      expect(s.isProcessing).toBe(true);
      expect(s.streamingContent).toBe('streaming');
      expect(s.activeConversationId).toBe('c1');
      expect(s.activeAgentId).toBe('a1');
      expect(s.tokenUsage?.total).toBe(150);
      expect(s.agentState.phase).toBe(AgentPhase.WORKING);
      expect(s.agentState.progress).toBe(30);
    });

    it('应该清理挂起的流式定时器', () => {
      useAIStore.getState().setStreamingContent('pending');
      useAIStore.getState().syncFromService({
        messages: [],
        isProcessing: false,
        streamingContent: 'synced',
        pendingPrompt: null,
        conversations: [],
        activeConversationId: null,
        agents: [],
        activeAgentId: 'a1',
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
      });

      // 推进时间，旧的防抖定时器不应触发
      vi.advanceTimersByTime(200);
      expect(getState().streamingContent).toBe('synced');
    });
  });
});
