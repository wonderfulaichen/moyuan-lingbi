import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { aiAssistant } from './index';
import { AgentPhase, AIChatMessage, SYSTEM_STEPS } from '../../../../shared/types/fileSystem';
import { ModelConfig } from '../../../../shared/types';

/**
 * AIAssistantService 单元测试
 *
 * 覆盖范围：
 * - 单例与订阅机制
 * - 项目切换 (switchToProject / ensureActiveProjectLoaded)
 * - 消息发送 (sendMessage / sendCommand) 含成功/失败/waitingForUser 分支
 * - Prompt 处理 (answerInput/answerChoice/confirmPlan/cancelPlan/togglePlanStep/dismissPrompt)
 * - 任务/CheckIssue/TodoList 管理
 * - 对话管理 (new/switch/recall/delete/rename)
 * - Agent 管理 (switch/create/update/delete)
 * - 中断与重发 (abort/regenerateLast/editAndResend)
 * - createCallbacks 内部 callback 行为（currentTaskId 防过期、tokenUsage 累积）
 * - showPrompt 三种分支 (ask_input/ask_choice/plan)
 *
 * 关键设计点：
 * - 单例模式：通过 (AIAssistantService as any).instance = null 在 beforeEach 重置
 * - currentTaskId 防过期：所有 callbacks 检查 this.currentTaskId === currentTaskId
 * - finally 块 pendingPrompt 检查：waitingForUser=true 时保持 isProcessing=true
 * - localStorage 持久化：每项目独立 key (moyuan-ai-conversations-${projectId})
 */

// ============ Mock 依赖 ============

vi.mock('../aiService', () => ({
  aiService: {
    abortAll: vi.fn(),
    generateStream: vi.fn(),
  },
}));

vi.mock('../DataService', () => ({
  dataService: {
    getActiveProject: vi.fn().mockReturnValue(null),
    buildAIContext: vi.fn().mockReturnValue(''),
    getFS: vi.fn().mockReturnValue({ files: {}, rootIds: [] }),
    getChildren: vi.fn().mockReturnValue([]),
    getRootFolderIdByType: vi.fn().mockReturnValue(null),
    getFile: vi.fn().mockReturnValue(null),
  },
}));

vi.mock('./processWithAI', () => ({
  processWithAI: vi.fn().mockResolvedValue({ waitingForUser: false }),
}));

vi.mock('./UnifiedExecutor', () => ({
  unifiedExecutor: {
    filterFileOperationsByMessageIds: vi.fn().mockReturnValue([]),
    revertOperations: vi.fn().mockReturnValue([]),
    removeFileOperationsByMessageIds: vi.fn(),
    getFileOperations: vi.fn().mockReturnValue([]),
  },
}));

vi.mock('./PlanExecutor', () => ({
  setPlanSteps: vi.fn(),
  clearPlanState: vi.fn(),
  toggleStep: vi.fn(),
  executePlan: vi.fn().mockResolvedValue(undefined),
  getPlanState: vi.fn().mockReturnValue({ steps: [] }),
}));

vi.mock('./systemPrompt', () => ({
  BUILT_IN_AGENTS: [
    { id: 'agent-general', name: '通用助手', icon: 'fa-robot', color: '', description: '通用', systemPrompt: '', isBuiltIn: true, createdAt: 0 },
    { id: 'agent-worldbuilder', name: '世界观构建师', icon: 'fa-globe', color: '', description: '世界观', systemPrompt: '', isBuiltIn: true, createdAt: 0 },
  ],
}));

vi.mock('./contextBuilder', () => ({
  summarizeTask: vi.fn().mockImplementation((text: string) => text.slice(0, 20)),
}));

vi.mock('../../utils/nanoid', () => ({
  nanoid: vi.fn().mockImplementation(() => `id-${Math.random().toString(36).slice(2, 10)}`),
}));

// ============ 导入被 mock 的模块以获取类型安全 mock ============

import { aiService } from '../aiService';
import { processWithAI } from './processWithAI';
import { unifiedExecutor } from './UnifiedExecutor';
import { setPlanSteps, clearPlanState, toggleStep, executePlan, getPlanState } from './PlanExecutor';
import { summarizeTask } from './contextBuilder';
import { nanoid } from '../../utils/nanoid';

const mockedProcessWithAI = vi.mocked(processWithAI);
const mockedAbortAll = vi.mocked(aiService.abortAll);
const mockedGenerateStream = vi.mocked(aiService.generateStream);
const mockedFilterOps = vi.mocked(unifiedExecutor.filterFileOperationsByMessageIds);
const mockedRevertOps = vi.mocked(unifiedExecutor.revertOperations);
const mockedRemoveOps = vi.mocked(unifiedExecutor.removeFileOperationsByMessageIds);
const mockedSetPlanSteps = vi.mocked(setPlanSteps);
const mockedClearPlanState = vi.mocked(clearPlanState);
const mockedToggleStep = vi.mocked(toggleStep);
const mockedExecutePlan = vi.mocked(executePlan);
const mockedGetPlanState = vi.mocked(getPlanState);
const mockedSummarizeTask = vi.mocked(summarizeTask);
const mockedNanoid = vi.mocked(nanoid);

// ============ 测试工具 ============

const createModel = (): ModelConfig => ({
  id: 'm1',
  name: '测试模型',
  provider: 'openai-compatible',
  apiKey: '',
  modelName: 'gpt-test',
  contextWindow: 8000,
  maxTokens: 1000,
});

// ============ 测试主体 ============

describe('AIAssistantService', () => {
  let service: typeof aiAssistant;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();

    // 使用单例，重置内部状态（类未导出，无法重置 static instance）
    service = aiAssistant;
    (service as any).state = (service as any).createDefaultState();
    (service as any).currentMessageId = null;
    (service as any).currentTaskId = null;
    (service as any).projectId = null;
    (service as any).listeners = new Set();
    (service as any).onTokenUsageCallback = null;
    (service as any).rafId = null;

    // 重置 processWithAI 默认行为
    mockedProcessWithAI.mockResolvedValue({ waitingForUser: false });
    mockedGetPlanState.mockReturnValue({ steps: [], model: null, currentIndex: 0 });
  });

  afterEach(() => {
    // 清理可能的孤儿 timer（旧实例的 autoSaveTimer）
    vi.clearAllTimers();
  });

  // ============ 1. 单例与订阅 ============

  describe('单例与订阅', () => {
    it('aiAssistant 是单例（导入即唯一实例）', () => {
      // 直接验证导入的 aiAssistant 可用
      expect(service).toBeDefined();
      expect(typeof service.getState).toBe('function');
    });

    it('subscribe 添加监听器并触发 emit', () => {
      const listener = vi.fn();
      service.subscribe(listener);
      service.getState(); // 仅读取不触发
      // 触发一次 emit（通过 newConversation）
      service.newConversation();
      expect(listener).toHaveBeenCalled();
    });

    it('subscribe 返回取消订阅函数', () => {
      const listener = vi.fn();
      const unsub = service.subscribe(listener);
      unsub();
      service.newConversation();
      expect(listener).not.toHaveBeenCalled();
    });

    it('getState 返回当前状态快照', () => {
      const state = service.getState();
      expect(state.isProcessing).toBe(false);
      expect(state.messages).toEqual([]);
      expect(state.activeAgentId).toBe('agent-general');
    });

    it('setOnTokenUsage 设置回调', () => {
      const cb = vi.fn();
      service.setOnTokenUsage(cb);
      // createCallbacks 调用时捕获 currentTaskId，需在调用前设置
      (service as any).currentTaskId = 'task1';
      const callbacks = (service as any).createCallbacks('test');
      callbacks.setTokenUsage({ prompt: 10, completion: 5, total: 15 });
      expect(cb).toHaveBeenCalledWith(expect.objectContaining({ prompt: 10 }));
    });
  });

  // ============ 2. 项目切换 ============

  describe('项目切换', () => {
    it('switchToProject 相同 projectId 不处理', () => {
      (service as any).projectId = 'p1';
      const before = service.getState();
      service.switchToProject('p1');
      expect(service.getState()).toBe(before); // 同一引用，未触发 emit
    });

    it('switchToProject 不同 projectId 重置状态并加载', () => {
      (service as any).projectId = 'p1';
      // 预置 localStorage 让 loadProjectConversations 返回数据
      const conv = { id: 'c1', title: '旧对话', messages: [], createdAt: 1, updatedAt: 1 };
      localStorage.setItem('moyuan-ai-conversations-p2', JSON.stringify([conv]));

      service.switchToProject('p2');

      const state = service.getState();
      expect(state.conversations.length).toBe(1);
      expect(state.conversations[0].id).toBe('c1');
      expect(state.activeConversationId).toBe('c1');
      expect(state.messages).toEqual([]);
    });

    it('switchToProject null projectId 重置状态但不加载对话', () => {
      (service as any).projectId = 'p1';
      service.switchToProject(null);
      const state = service.getState();
      expect(state.conversations).toEqual([]);
      expect(state.activeConversationId).toBeNull();
    });

    it('switchToProject 新项目无对话时创建新对话', () => {
      (service as any).projectId = 'p1';
      service.switchToProject('p-new');
      const state = service.getState();
      expect(state.conversations.length).toBe(1);
      expect(state.conversations[0].title).toBe('新对话');
    });

    it('switchToProject 切换时调用 abortSilent（aiService.abortAll）', () => {
      (service as any).projectId = 'p1';
      service.switchToProject('p2');
      expect(mockedAbortAll).toHaveBeenCalled();
    });

    it('ensureActiveProjectLoaded 当 active project 变化时调用 switchToProject', async () => {
      const { dataService } = await import('../DataService');
      const mockedGetActive = vi.mocked(dataService.getActiveProject);
      mockedGetActive.mockReturnValue({ id: 'new-p', title: '新项目' } as any);
      (service as any).projectId = 'old-p';

      service.ensureActiveProjectLoaded();
      expect((service as any).projectId).toBe('new-p');
    });

    it('ensureActiveProjectLoaded 当 active project 为 null 时切换到 null', async () => {
      const { dataService } = await import('../DataService');
      const mockedGetActive = vi.mocked(dataService.getActiveProject);
      mockedGetActive.mockReturnValue(null);
      (service as any).projectId = 'old-p';

      service.ensureActiveProjectLoaded();
      expect((service as any).projectId).toBeNull();
    });
  });

  // ============ 3. 消息发送 ============

  describe('消息发送', () => {
    it('sendMessage 添加 user 消息并调用 processWithAI', async () => {
      await service.sendMessage('你好', createModel());
      const state = service.getState();
      expect(state.messages.length).toBe(1);
      expect(state.messages[0].role).toBe('user');
      expect(state.messages[0].content).toBe('你好');
      expect(mockedProcessWithAI).toHaveBeenCalledWith('你好', expect.anything(), expect.anything());
    });

    it('sendMessage 成功后 isProcessing 恢复 false', async () => {
      await service.sendMessage('你好', createModel());
      expect(service.getState().isProcessing).toBe(false);
      expect((service as any).currentTaskId).toBeNull();
    });

    it('sendMessage processWithAI 抛错时添加错误消息', async () => {
      mockedProcessWithAI.mockRejectedValueOnce(new Error('网络错误'));
      await service.sendMessage('你好', createModel());
      const state = service.getState();
      const errorMsg = state.messages.find(m => m.content.includes('❌ 请求失败'));
      expect(errorMsg).toBeDefined();
      expect(state.agentState.phase).toBe(AgentPhase.ERROR);
      expect(state.agentState.error).toBe('网络错误');
    });

    it('sendMessage waitingForUser=true 时保持 isProcessing=true', async () => {
      // 模拟 processWithAI 设置 pendingPrompt 后返回 waitingForUser=true
      mockedProcessWithAI.mockImplementationOnce(async (_text, _model, cb) => {
        // 通过 callback 设置 pendingPrompt
        (service as any).state.pendingPrompt = { type: 'input', question: 'q', placeholder: '', onAnswer: vi.fn() };
        return { waitingForUser: true };
      });
      await service.sendMessage('你好', createModel());
      expect(service.getState().isProcessing).toBe(true);
      expect((service as any).currentTaskId).not.toBeNull();
    });

    it('sendMessage 在 isProcessing 时先调用 abort', async () => {
      (service as any).state.isProcessing = true;
      await service.sendMessage('新消息', createModel());
      expect(mockedAbortAll).toHaveBeenCalled();
    });

    it('sendCommand silent=true 不添加 user 消息', async () => {
      await service.sendCommand('/help', createModel(), { silent: true, label: '帮助' });
      const state = service.getState();
      expect(state.messages.find(m => m.role === 'user')).toBeUndefined();
      expect(mockedProcessWithAI).toHaveBeenCalledWith('/help', expect.anything(), expect.anything());
    });

    it('sendCommand silent=false 添加 user 消息', async () => {
      await service.sendCommand('/help', createModel(), { silent: false });
      const state = service.getState();
      expect(state.messages.find(m => m.role === 'user' && m.content === '/help')).toBeDefined();
    });

    it('sendCommand 使用 label 作为 currentTask', async () => {
      await service.sendCommand('/help', createModel(), { silent: true, label: '自定义标签' });
      expect(service.getState().agentState.currentTask).toBe('自定义标签');
    });
  });

  // ============ 4. Prompt 处理 ============

  describe('Prompt 处理', () => {
    it('answerInput 调用 input prompt 的 onAnswer', () => {
      const onAnswer = vi.fn();
      (service as any).state.pendingPrompt = { type: 'input', question: 'q', placeholder: '', onAnswer };
      service.answerInput('用户回答');
      expect(onAnswer).toHaveBeenCalledWith('用户回答');
    });

    it('answerInput 无 input prompt 时不处理', () => {
      const onAnswer = vi.fn();
      (service as any).state.pendingPrompt = { type: 'choice', question: 'q', options: [], multiSelect: false, onAnswer };
      service.answerInput('回答');
      expect(onAnswer).not.toHaveBeenCalled();
    });

    it('answerChoice 调用 choice prompt 的 onAnswer', () => {
      const onAnswer = vi.fn();
      (service as any).state.pendingPrompt = { type: 'choice', question: 'q', options: ['a', 'b'], multiSelect: false, onAnswer };
      service.answerChoice('a');
      expect(onAnswer).toHaveBeenCalledWith('a');
    });

    it('answerChoice 无 choice prompt 时不处理', () => {
      const onAnswer = vi.fn();
      (service as any).state.pendingPrompt = { type: 'input', question: 'q', placeholder: '', onAnswer };
      service.answerChoice('a');
      expect(onAnswer).not.toHaveBeenCalled();
    });

    it('confirmPlan 调用 plan prompt 的 onConfirm', () => {
      const onConfirm = vi.fn();
      (service as any).state.pendingPrompt = { type: 'plan', title: 't', steps: [], onConfirm, onCancel: vi.fn(), onStepToggle: vi.fn() };
      service.confirmPlan();
      expect(onConfirm).toHaveBeenCalled();
    });

    it('cancelPlan 调用 plan prompt 的 onCancel', () => {
      const onCancel = vi.fn();
      (service as any).state.pendingPrompt = { type: 'plan', title: 't', steps: [], onConfirm: vi.fn(), onCancel, onStepToggle: vi.fn() };
      service.cancelPlan();
      expect(onCancel).toHaveBeenCalled();
    });

    it('togglePlanStep 调用 toggleStep 并更新 pendingPrompt', () => {
      const onStepToggle = vi.fn();
      const step = { title: 's1', description: '', enabled: true, status: 'pending' as const };
      (service as any).state.pendingPrompt = { type: 'plan', title: 't', steps: [step], onConfirm: vi.fn(), onCancel: vi.fn(), onStepToggle };
      mockedGetPlanState.mockReturnValue({ steps: [{ ...step, enabled: false }], model: null, currentIndex: 0 });

      // 修复后：源码底部冗余的 function getPlanState() 已删除，使用顶部 import 的版本，vitest mock 生效
      service.togglePlanStep(0, false);
      expect(mockedToggleStep).toHaveBeenCalledWith(0, false);
      // pendingPrompt 应被更新为新 steps
      const updatedPrompt = service.getState().pendingPrompt as any;
      expect(updatedPrompt.steps[0].enabled).toBe(false);
    });

    it('dismissPrompt 清空 pendingPrompt', () => {
      (service as any).state.pendingPrompt = { type: 'input', question: 'q', placeholder: '', onAnswer: vi.fn() };
      service.dismissPrompt();
      expect(service.getState().pendingPrompt).toBeNull();
    });
  });

  // ============ 5. 任务管理 ============

  describe('任务管理', () => {
    it('addTask 添加任务到 state.tasks 头部', () => {
      const task = service.addTask({ title: 'T1', description: '描述' });
      const state = service.getState();
      expect(state.tasks.length).toBe(1);
      expect(state.tasks[0].id).toBe(task.id);
      expect(state.tasks[0].title).toBe('T1');
      expect(state.tasks[0].status).toBe('completed'); // 默认 status
    });

    it('addTask 限制最多 100 条', () => {
      for (let i = 0; i < 105; i++) {
        service.addTask({ title: `T${i}`, description: '' });
      }
      expect(service.getState().tasks.length).toBe(100);
    });

    it('removeTask 移除指定任务', () => {
      const t1 = service.addTask({ title: 'T1', description: '' });
      const t2 = service.addTask({ title: 'T2', description: '' });
      service.removeTask(t1.id);
      const state = service.getState();
      expect(state.tasks.length).toBe(1);
      expect(state.tasks[0].id).toBe(t2.id);
    });

    it('clearTasks 清空所有任务', () => {
      service.addTask({ title: 'T1', description: '' });
      service.addTask({ title: 'T2', description: '' });
      service.clearTasks();
      expect(service.getState().tasks).toEqual([]);
    });
  });

  // ============ 6. CheckIssue 管理 ============

  describe('CheckIssue 管理', () => {
    const makeIssue = (id: string) => ({
      id, description: `问题${id}`, category: 'character' as const, selected: false, fixed: false,
    });

    it('setCheckIssues 设置问题列表', () => {
      const issues = [makeIssue('i1'), makeIssue('i2')];
      service.setCheckIssues(issues);
      expect(service.getState().checkIssues.length).toBe(2);
    });

    it('toggleCheckIssue 切换 selected 状态', () => {
      service.setCheckIssues([makeIssue('i1')]);
      service.toggleCheckIssue('i1');
      expect(service.getState().checkIssues[0].selected).toBe(true);
      service.toggleCheckIssue('i1');
      expect(service.getState().checkIssues[0].selected).toBe(false);
    });

    it('markIssueFixed 标记为已修复', () => {
      service.setCheckIssues([makeIssue('i1')]);
      service.markIssueFixed('i1');
      expect(service.getState().checkIssues[0].fixed).toBe(true);
    });

    it('clearCheckIssues 清空问题列表', () => {
      service.setCheckIssues([makeIssue('i1')]);
      service.clearCheckIssues();
      expect(service.getState().checkIssues).toEqual([]);
    });
  });

  // ============ 7. TodoList 管理 ============

  describe('TodoList 管理', () => {
    const makeTodo = (id: string): any => ({
      id, content: `任务${id}`, status: 'pending' as const,
    });

    it('setTodoList 设置 todoList', () => {
      service.setTodoList([makeTodo('t1'), makeTodo('t2')]);
      expect(service.getState().todoList.length).toBe(2);
    });

    it('updateTodoItem 更新指定项', () => {
      service.setTodoList([makeTodo('t1')]);
      service.updateTodoItem('t1', { status: 'completed', details: '完成细节' });
      const todo = service.getState().todoList[0];
      expect(todo.status).toBe('completed');
      expect(todo.details).toBe('完成细节');
    });

    it('completeTodoItem 标记为完成', () => {
      service.setTodoList([makeTodo('t1')]);
      service.completeTodoItem('t1');
      expect(service.getState().todoList[0].status).toBe('completed');
    });

    it('setTodoInProgress 标记为进行中', () => {
      service.setTodoList([makeTodo('t1'), makeTodo('t2')]);
      service.setTodoInProgress('t2');
      expect(service.getState().todoList[1].status).toBe('in_progress');
      // 其他项不变
      expect(service.getState().todoList[0].status).toBe('pending');
    });

    it('clearTodoList 清空', () => {
      service.setTodoList([makeTodo('t1')]);
      service.clearTodoList();
      expect(service.getState().todoList).toEqual([]);
    });
  });

  // ============ 8. 对话管理 ============

  describe('对话管理', () => {
    it('newConversation 创建新对话并设为 active', () => {
      service.newConversation();
      const state = service.getState();
      expect(state.conversations.length).toBe(1);
      expect(state.activeConversationId).toBe(state.conversations[0].id);
      expect(state.messages).toEqual([]);
      expect(state.conversations[0].title).toBe('新对话');
    });

    it('newConversation 在 isProcessing 时中断', () => {
      (service as any).state.isProcessing = true;
      (service as any).state.streamingContent = '流式内容';
      service.newConversation();
      expect(mockedAbortAll).toHaveBeenCalled();
      expect(service.getState().isProcessing).toBe(false);
      expect(service.getState().streamingContent).toBeNull();
    });

    it('switchToConversation 切换到目标对话的消息', () => {
      // 预置两个对话
      service.newConversation();
      const conv1 = service.getState().conversations[0];
      (service as any).state.messages = [{ id: 'm1', role: 'user', content: 'hi', timestamp: 1, actions: [] }];
      (service as any).saveCurrentConversation();

      service.newConversation();
      const conv2 = service.getState().conversations[0];

      // 切换回 conv1
      service.switchToConversation(conv1.id);
      expect(service.getState().messages.length).toBe(1);
      expect(service.getState().messages[0].id).toBe('m1');
      expect(service.getState().activeConversationId).toBe(conv1.id);
    });

    it('switchToConversation 不存在 id 时仅触发 emit', () => {
      service.newConversation();
      const before = service.getState().activeConversationId;
      service.switchToConversation('不存在的id');
      expect(service.getState().activeConversationId).toBe(before);
    });

    it('recallMessage 撤回 user 消息（含后续所有消息）', () => {
      // 预置消息序列
      (service as any).state.messages = [
        { id: 'u1', role: 'user', content: 'hi', timestamp: 1, actions: [] },
        { id: 'a1', role: 'assistant', content: 'hello', timestamp: 2, actions: [] },
        { id: 'u2', role: 'user', content: 'bye', timestamp: 3, actions: [] },
        { id: 'a2', role: 'assistant', content: 'bye', timestamp: 4, actions: [] },
      ];
      service.recallMessage('u2');
      const state = service.getState();
      // u2 及之后的 a2 都被移除
      expect(state.messages.length).toBe(2);
      expect(state.messages.find(m => m.id === 'u2')).toBeUndefined();
      expect(state.messages.find(m => m.id === 'a2')).toBeUndefined();
    });

    it('recallMessage 撤回 assistant 消息（含其前的 user 消息）', () => {
      (service as any).state.messages = [
        { id: 'u1', role: 'user', content: 'hi', timestamp: 1, actions: [] },
        { id: 'a1', role: 'assistant', content: 'hello', timestamp: 2, actions: [] },
      ];
      service.recallMessage('a1');
      const state = service.getState();
      // u1 + a1 都被移除
      expect(state.messages.length).toBe(0);
    });

    it('recallMessage 不存在 id 时不处理', () => {
      (service as any).state.messages = [
        { id: 'u1', role: 'user', content: 'hi', timestamp: 1, actions: [] },
      ];
      service.recallMessage('不存在');
      expect(service.getState().messages.length).toBe(1);
    });

    it('deleteConversation 删除 active 时切换到剩余的下一个', () => {
      service.newConversation();
      const c1 = service.getState().conversations[0];
      service.newConversation();
      const c2 = service.getState().conversations[0];
      // c2 是 active
      expect(service.getState().activeConversationId).toBe(c2.id);

      service.deleteConversation(c2.id);
      const state = service.getState();
      expect(state.conversations.find(c => c.id === c2.id)).toBeUndefined();
      expect(state.activeConversationId).toBe(c1.id);
    });

    it('deleteConversation 删除非 active 时直接移除', () => {
      service.newConversation();
      const c1 = service.getState().conversations[0];
      service.newConversation();
      const c2 = service.getState().conversations[0];
      // active 是 c2，删除 c1
      service.deleteConversation(c1.id);
      const state = service.getState();
      expect(state.conversations.find(c => c.id === c1.id)).toBeUndefined();
      expect(state.activeConversationId).toBe(c2.id);
    });

    it('deleteConversation 删除最后一个时创建新对话', () => {
      service.newConversation();
      const c1 = service.getState().conversations[0];
      service.deleteConversation(c1.id);
      const state = service.getState();
      // 应创建新对话
      expect(state.conversations.length).toBe(1);
      expect(state.conversations[0].id).not.toBe(c1.id);
    });

    it('renameConversation 修改对话标题', () => {
      service.newConversation();
      const c1 = service.getState().conversations[0];
      service.renameConversation(c1.id, '新标题');
      expect(service.getState().conversations[0].title).toBe('新标题');
    });

    it('clearChat 等同 newConversation', () => {
      service.clearChat();
      expect(service.getState().conversations.length).toBe(1);
    });
  });

  // ============ 9. Agent 管理 ============

  describe('Agent 管理', () => {
    it('getActiveAgent 返回当前 agent', () => {
      const agent = service.getActiveAgent();
      expect(agent.id).toBe('agent-general');
    });

    it('getActiveAgent 不存在 activeAgentId 时回退到 BUILT_IN_AGENTS[0]', () => {
      (service as any).state.activeAgentId = '不存在的id';
      const agent = service.getActiveAgent();
      expect(agent.id).toBe('agent-general');
    });

    it('switchAgent 切换 agent 并添加 system 消息', () => {
      service.switchAgent('agent-worldbuilder');
      const state = service.getState();
      expect(state.activeAgentId).toBe('agent-worldbuilder');
      const sysMsg = state.messages.find(m => m.role === 'system');
      expect(sysMsg).toBeDefined();
      expect(sysMsg!.content).toContain('世界观构建师');
    });

    it('switchAgent 不存在 id 时不处理', () => {
      const before = service.getState().activeAgentId;
      service.switchAgent('不存在的id');
      expect(service.getState().activeAgentId).toBe(before);
    });

    it('switchAgent 相同 id 时不处理', () => {
      const before = service.getState().activeAgentId;
      service.switchAgent(before);
      // 不应添加 system 消息
      expect(service.getState().messages.find(m => m.role === 'system')).toBeUndefined();
    });

    it('createAgent 添加自定义 agent', () => {
      const agent = service.createAgent({
        name: '我的助手', icon: 'fa-star', color: 'red', description: '自定义', systemPrompt: 'prompt',
      });
      expect(agent.id).toMatch(/^agent-custom-\d+$/);
      expect(agent.isBuiltIn).toBe(false);
      const state = service.getState();
      expect(state.agents.find(a => a.id === agent.id)).toBeDefined();
    });

    it('updateAgent 更新自定义 agent', () => {
      const agent = service.createAgent({ name: '原', icon: '', color: '', description: '', systemPrompt: '' });
      service.updateAgent(agent.id, { name: '新名称', description: '新描述' });
      const updated = service.getState().agents.find(a => a.id === agent.id);
      expect(updated!.name).toBe('新名称');
      expect(updated!.description).toBe('新描述');
    });

    it('updateAgent 不能更新 built-in agent', () => {
      service.updateAgent('agent-general', { name: '改名' });
      expect(service.getState().agents.find(a => a.id === 'agent-general')!.name).toBe('通用助手');
    });

    it('deleteAgent 删除自定义 agent', () => {
      const agent = service.createAgent({ name: '删除我', icon: '', color: '', description: '', systemPrompt: '' });
      service.deleteAgent(agent.id);
      expect(service.getState().agents.find(a => a.id === agent.id)).toBeUndefined();
    });

    it('deleteAgent 不能删除 built-in agent', () => {
      service.deleteAgent('agent-general');
      expect(service.getState().agents.find(a => a.id === 'agent-general')).toBeDefined();
    });

    it('deleteAgent 删除 active 自定义 agent 时切换到 agent-general', () => {
      const agent = service.createAgent({ name: '删除我', icon: '', color: '', description: '', systemPrompt: '' });
      service.switchAgent(agent.id);
      expect(service.getState().activeAgentId).toBe(agent.id);
      service.deleteAgent(agent.id);
      expect(service.getState().activeAgentId).toBe('agent-general');
    });
  });

  // ============ 10. 中断与重发 ============

  describe('中断与重发', () => {
    it('abort 中断并保存 streamingContent 为消息', () => {
      (service as any).state.streamingContent = '流式内容';
      (service as any).state.streamingThinking = '思考';
      (service as any).state.isProcessing = true;
      service.abort();
      const state = service.getState();
      expect(mockedAbortAll).toHaveBeenCalled();
      expect(state.streamingContent).toBeNull();
      expect(state.isProcessing).toBe(false);
      const msg = state.messages.find(m => m.content.includes('流式内容') && m.content.includes('(已中断)'));
      expect(msg).toBeDefined();
    });

    it('abort 无 streamingContent 时不添加消息', () => {
      (service as any).state.isProcessing = true;
      service.abort();
      expect(service.getState().messages.length).toBe(0);
    });

    it('abort 清空 pendingPrompt', () => {
      (service as any).state.pendingPrompt = { type: 'input', question: 'q', placeholder: '', onAnswer: vi.fn() };
      service.abort();
      expect(service.getState().pendingPrompt).toBeNull();
    });

    it('abort 重置 agentState 为 IDLE', () => {
      (service as any).state.isProcessing = true;
      (service as any).state.agentState = { phase: AgentPhase.EXECUTING, currentTask: 't', progress: 50, requiredAction: 'none', error: null, pendingFiles: [], iteration: 5, maxIterations: 3 };
      service.abort();
      const state = service.getState();
      expect(state.agentState.phase).toBe(AgentPhase.IDLE);
      expect(state.agentState.progress).toBe(0);
      expect(state.agentState.iteration).toBe(0);
    });

    it('regenerateLast 无 assistant 消息时不处理', () => {
      (service as any).state.messages = [{ id: 'u1', role: 'user', content: 'hi', timestamp: 1, actions: [] }];
      service.regenerateLast(createModel());
      expect(mockedProcessWithAI).not.toHaveBeenCalled();
    });

    it('regenerateLast 找到最后 user+assistant 并重新生成', () => {
      (service as any).state.messages = [
        { id: 'u1', role: 'user', content: '原始问题', timestamp: 1, actions: [] },
        { id: 'a1', role: 'assistant', content: '回答', timestamp: 2, actions: [] },
      ];
      service.regenerateLast(createModel());
      // a1 被移除
      expect(service.getState().messages.find(m => m.id === 'a1')).toBeUndefined();
      expect(mockedProcessWithAI).toHaveBeenCalledWith('原始问题', expect.anything(), expect.anything());
    });

    it('editAndResend 编辑消息并重新发送', () => {
      (service as any).state.messages = [
        { id: 'u1', role: 'user', content: '原', timestamp: 1, actions: [] },
        { id: 'a1', role: 'assistant', content: '答', timestamp: 2, actions: [] },
      ];
      service.editAndResend('u1', '新内容', createModel());
      const state = service.getState();
      expect(state.messages[0].content).toBe('新内容');
      expect(state.messages.length).toBe(1); // a1 被移除
      expect(mockedProcessWithAI).toHaveBeenCalledWith('新内容', expect.anything(), expect.anything());
    });

    it('editAndResend 不存在 messageId 时不处理', () => {
      (service as any).state.messages = [{ id: 'u1', role: 'user', content: 'x', timestamp: 1, actions: [] }];
      service.editAndResend('不存在', '新', createModel());
      expect(mockedProcessWithAI).not.toHaveBeenCalled();
    });
  });

  // ============ 11. createCallbacks ============

  describe('createCallbacks', () => {
    it('addMessage callback 检查 currentTaskId 一致时添加', () => {
      (service as any).currentTaskId = 'task1';
      const cb = (service as any).createCallbacks('test');
      // currentTaskId 一致
      cb.addMessage({ role: 'user', content: 'msg' });
      expect(service.getState().messages.length).toBe(1);
    });

    it('addMessage callback currentTaskId 不一致时忽略', () => {
      (service as any).currentTaskId = 'task1';
      const cb = (service as any).createCallbacks('test');
      // 模拟任务过期
      (service as any).currentTaskId = 'task2';
      cb.addMessage({ role: 'user', content: 'msg' });
      expect(service.getState().messages.length).toBe(0);
    });

    it('setStreamingContent callback 设置 streamingContent', () => {
      (service as any).currentTaskId = 'task1';
      const cb = (service as any).createCallbacks('test');
      cb.setStreamingContent('流式');
      expect(service.getState().streamingContent).toBe('流式');
    });

    it('setStreamingContent callback currentTaskId 不一致时忽略', () => {
      (service as any).currentTaskId = 'task1';
      const cb = (service as any).createCallbacks('test');
      (service as any).currentTaskId = 'task2';
      cb.setStreamingContent('流式');
      expect(service.getState().streamingContent).toBeNull();
    });

    it('setStreamingThinking callback 设置 streamingThinking', () => {
      (service as any).currentTaskId = 'task1';
      const cb = (service as any).createCallbacks('test');
      cb.setStreamingThinking('思考');
      expect(service.getState().streamingThinking).toBe('思考');
    });

    it('setAgentPhase callback 更新 agentState', () => {
      (service as any).currentTaskId = 'task1';
      const cb = (service as any).createCallbacks('test');
      cb.setAgentPhase(AgentPhase.PLANNING, '新任务', 30, { iteration: 2 });
      const state = service.getState();
      expect(state.agentState.phase).toBe(AgentPhase.PLANNING);
      expect(state.agentState.currentTask).toBe('新任务');
      expect(state.agentState.progress).toBe(30);
      expect(state.agentState.iteration).toBe(2);
    });

    it('setIsProcessing callback 设置 isProcessing', () => {
      (service as any).currentTaskId = 'task1';
      const cb = (service as any).createCallbacks('test');
      cb.setIsProcessing(true);
      expect(service.getState().isProcessing).toBe(true);
    });

    it('setTokenUsage callback 累积 token 使用量', () => {
      (service as any).currentTaskId = 'task1';
      const tokenCb = vi.fn();
      service.setOnTokenUsage(tokenCb);
      const cb = (service as any).createCallbacks('test');

      cb.setTokenUsage({ prompt: 10, completion: 5, total: 15 });
      expect(service.getState().tokenUsage).toEqual({ prompt: 10, completion: 5, total: 15 });

      cb.setTokenUsage({ prompt: 20, completion: 10, total: 30 });
      // 累积而非覆盖
      expect(service.getState().tokenUsage).toEqual({ prompt: 30, completion: 15, total: 45 });
      expect(tokenCb).toHaveBeenCalledTimes(2);
    });

    it('setTodoList callback 设置 todoList', () => {
      (service as any).currentTaskId = 'task1';
      const cb = (service as any).createCallbacks('test');
      const todos: any[] = [{ id: 't1', content: 'task', status: 'pending' }];
      cb.setTodoList(todos);
      expect(service.getState().todoList.length).toBe(1);
    });

    it('initSystemSteps callback 初始化 6 个系统步骤', () => {
      (service as any).currentTaskId = 'task1';
      const cb = (service as any).createCallbacks('test');
      cb.initSystemSteps();
      const todos = service.getState().todoList;
      expect(todos.length).toBe(6);
      expect(todos[0].id).toBe(SYSTEM_STEPS.BUILD_CONTEXT.id);
      expect(todos[5].id).toBe(SYSTEM_STEPS.CHECK_COMPLETION.id);
      expect(todos.every(t => t.type === 'system')).toBe(true);
      expect(todos.every(t => t.status === 'pending')).toBe(true);
    });

    it('updateSystemStep callback 更新指定步骤状态', () => {
      (service as any).currentTaskId = 'task1';
      const cb = (service as any).createCallbacks('test');
      cb.initSystemSteps();
      cb.updateSystemStep(SYSTEM_STEPS.BUILD_CONTEXT.id, 'completed', '完成细节');
      const step = service.getState().todoList.find(t => t.id === SYSTEM_STEPS.BUILD_CONTEXT.id);
      expect(step!.status).toBe('completed');
      expect(step!.details).toBe('完成细节');
    });

    it('updateSystemStep callback 不存在 stepId 时不处理', () => {
      (service as any).currentTaskId = 'task1';
      const cb = (service as any).createCallbacks('test');
      cb.initSystemSteps();
      cb.updateSystemStep('不存在的id', 'completed');
      // 不抛错即可
      expect(service.getState().todoList.length).toBe(6);
    });

    it('isCurrentTask callback 返回 currentTaskId 是否一致', () => {
      (service as any).currentTaskId = 'task1';
      const cb = (service as any).createCallbacks('test');
      expect(cb.isCurrentTask()).toBe(true);
      (service as any).currentTaskId = 'task2';
      expect(cb.isCurrentTask()).toBe(false);
    });

    it('getActiveAgent callback 返回当前 agent', () => {
      (service as any).currentTaskId = 'task1';
      const cb = (service as any).createCallbacks('test');
      const agent = cb.getActiveAgent();
      expect(agent.id).toBe('agent-general');
    });

    it('getMessages callback 返回当前消息列表', () => {
      (service as any).currentTaskId = 'task1';
      const cb = (service as any).createCallbacks('test');
      (service as any).state.messages = [{ id: 'm1', role: 'user', content: 'x', timestamp: 1, actions: [] } as any];
      const msgs = cb.getMessages();
      expect(msgs.length).toBe(1);
    });

    it('getCurrentMessageId callback 返回当前消息 id', () => {
      (service as any).currentTaskId = 'task1';
      (service as any).currentMessageId = 'msg-1';
      const cb = (service as any).createCallbacks('test');
      expect(cb.getCurrentMessageId()).toBe('msg-1');
    });
  });

  // ============ 12. showPrompt ============

  describe('showPrompt', () => {
    it('ask_input 创建 input prompt', () => {
      (service as any).showPrompt(
        { action: 'ask_input', question: '请输入名字', placeholder: '提示' },
        createModel(),
      );
      const prompt = service.getState().pendingPrompt;
      expect(prompt).not.toBeNull();
      expect(prompt!.type).toBe('input');
      expect((prompt as any).question).toBe('请输入名字');
      expect((prompt as any).placeholder).toBe('提示');
    });

    it('ask_input 缺省 question/placeholder 时使用默认值', () => {
      (service as any).showPrompt({ action: 'ask_input' }, createModel());
      const prompt = service.getState().pendingPrompt as any;
      expect(prompt.question).toBe('请输入：');
      expect(prompt.placeholder).toBe('');
    });

    it('ask_choice 创建 choice prompt', () => {
      (service as any).showPrompt(
        { action: 'ask_choice', question: '请选择', options: ['A', 'B'], multiSelect: true },
        createModel(),
      );
      const prompt = service.getState().pendingPrompt as any;
      expect(prompt.type).toBe('choice');
      expect(prompt.question).toBe('请选择');
      expect(prompt.options).toEqual(['A', 'B']);
      expect(prompt.multiSelect).toBe(true);
    });

    it('ask_choice 缺省值', () => {
      (service as any).showPrompt({ action: 'ask_choice' }, createModel());
      const prompt = service.getState().pendingPrompt as any;
      expect(prompt.question).toBe('请选择：');
      expect(prompt.options).toEqual([]);
      expect(prompt.multiSelect).toBe(false);
    });

    it('plan 创建 plan prompt 并调用 setPlanSteps', () => {
      const steps = [
        { title: '步骤1', description: '描述1' },
        { title: '步骤2', description: '描述2' },
      ];
      (service as any).showPrompt(
        { action: 'plan', title: '执行计划', steps },
        createModel(),
      );
      const prompt = service.getState().pendingPrompt as any;
      expect(prompt.type).toBe('plan');
      expect(prompt.title).toBe('执行计划');
      expect(prompt.steps.length).toBe(2);
      expect(prompt.steps[0].enabled).toBe(true);
      expect(prompt.steps[0].status).toBe('pending');
      expect(mockedSetPlanSteps).toHaveBeenCalledWith(expect.anything(), expect.anything());
    });

    it('plan 缺省 title 时使用默认值', () => {
      (service as any).showPrompt({ action: 'plan', steps: [] }, createModel());
      const prompt = service.getState().pendingPrompt as any;
      expect(prompt.title).toBe('执行计划');
    });

    it('plan onCancel 调用 clearPlanState', () => {
      (service as any).showPrompt({ action: 'plan', steps: [] }, createModel());
      const prompt = service.getState().pendingPrompt as any;
      prompt.onCancel();
      expect(mockedClearPlanState).toHaveBeenCalled();
      expect(service.getState().pendingPrompt).toBeNull();
    });

    it('plan onConfirm 调用 executePlan', () => {
      (service as any).showPrompt({ action: 'plan', steps: [] }, createModel());
      const prompt = service.getState().pendingPrompt as any;
      prompt.onConfirm();
      expect(mockedExecutePlan).toHaveBeenCalled();
    });
  });

  // ============ 13. 持久化与加载 ============

  describe('持久化与加载', () => {
    it('saveCurrentConversation 保存消息到 conversation 并自动生成标题', () => {
      service.newConversation();
      const conv = service.getState().conversations[0];
      // 添加首条 user 消息（长度 > 30 时截断）
      (service as any).state.messages = [
        { id: 'm1', role: 'user', content: '这是一段超过三十个字符的用户消息用于测试标题截断功能', timestamp: 1, actions: [] },
      ];
      (service as any).saveCurrentConversation();
      const updated = service.getState().conversations.find(c => c.id === conv.id);
      expect(updated!.title).not.toBe('新对话');
      expect(updated!.title.length).toBeLessThanOrEqual(30);
    });

    it('persistConversations 写入 localStorage', () => {
      (service as any).projectId = 'p1';
      service.newConversation();
      (service as any).persistConversations();
      const raw = localStorage.getItem('moyuan-ai-conversations-p1');
      expect(raw).not.toBeNull();
      const data = JSON.parse(raw!);
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBe(1);
    });

    it('persistConversations 无 projectId 时不写入', () => {
      (service as any).projectId = null;
      service.newConversation();
      (service as any).persistConversations();
      // localStorage 中无任何 conversation key
      const keys = Object.keys(localStorage).filter(k => k.startsWith('moyuan-ai-conversations-'));
      expect(keys.length).toBe(0);
    });

    it('loadCustomAgents 从 localStorage 加载自定义 agent', () => {
      const customAgent = {
        id: 'agent-loaded', name: '加载的', icon: 'fa-star', color: '', description: '',
        systemPrompt: '', isBuiltIn: false, createdAt: 1,
      };
      localStorage.setItem('moyuan-ai-custom-agents', JSON.stringify([customAgent]));
      (service as any).loadCustomAgents();
      const agents = service.getState().agents;
      expect(agents.find(a => a.id === 'agent-loaded')).toBeDefined();
    });

    it('persistCustomAgents 持久化自定义 agent（不含 built-in）', () => {
      service.createAgent({ name: '我的', icon: '', color: '', description: '', systemPrompt: '' });
      (service as any).persistCustomAgents();
      const raw = localStorage.getItem('moyuan-ai-custom-agents');
      expect(raw).not.toBeNull();
      const data = JSON.parse(raw!);
      expect(data.length).toBe(1);
      expect(data[0].isBuiltIn).toBe(false);
    });

    it('loadProjectActiveAgent 从 localStorage 加载项目 active agent', () => {
      localStorage.setItem('moyuan-ai-active-agent-p1', 'agent-worldbuilder');
      (service as any).loadProjectActiveAgent('p1');
      expect(service.getState().activeAgentId).toBe('agent-worldbuilder');
    });

    it('loadProjectActiveAgent 不存在 id 时不切换', () => {
      localStorage.setItem('moyuan-ai-active-agent-p1', '不存在的agent');
      (service as any).loadProjectActiveAgent('p1');
      expect(service.getState().activeAgentId).toBe('agent-general');
    });

    it('persistProjectActiveAgent 写入 localStorage', () => {
      (service as any).projectId = 'p1';
      (service as any).state.activeAgentId = 'agent-worldbuilder';
      (service as any).persistProjectActiveAgent();
      expect(localStorage.getItem('moyuan-ai-active-agent-p1')).toBe('agent-worldbuilder');
    });

    it('persistProjectActiveAgent 无 projectId 时不写入', () => {
      (service as any).projectId = null;
      (service as any).persistProjectActiveAgent();
      const keys = Object.keys(localStorage).filter(k => k.startsWith('moyuan-ai-active-agent-'));
      expect(keys.length).toBe(0);
    });
  });

  // ============ 14. addMessage 消息长度限制 ============

  describe('addMessage 长度限制', () => {
    it('超过 200 条消息时触发 slice(-150) 一次（之后追加不再触发）', () => {
      (service as any).currentTaskId = 'task1';
      // 源码逻辑：if (length > 200) slice(-150)。添加 201 条时触发一次 slice 得 150 条，
      // 之后继续添加不再 > 200，所以最终长度 = 150 + (totalAdditions - 201)
      // 添加 205 条：第 201 条触发 slice 得 150 条，再添加 4 条得 154 条
      for (let i = 0; i < 205; i++) {
        (service as any).addMessage({ role: 'user', content: `msg-${i}` });
      }
      const msgs = service.getState().messages;
      expect(msgs.length).toBe(154); // 150 + 4
    });

    it('恰好 201 条时触发 slice 得 150 条', () => {
      (service as any).currentTaskId = 'task1';
      for (let i = 0; i < 201; i++) {
        (service as any).addMessage({ role: 'user', content: `msg-${i}` });
      }
      expect(service.getState().messages.length).toBe(150);
    });
  });
});
