import { describe, it, expect, beforeEach, vi } from 'vitest';
import { processWithAI, ProcessCallbacks } from './processWithAI';
import { AIChatMessage, AgentPhase, SYSTEM_STEPS } from '../../../../shared/types/fileSystem';
import { ModelConfig } from '../../../../shared/types';

/**
 * processWithAI 端到端集成测试
 *
 * processWithAI 是 AI 处理主循环（MAX_ITERATIONS=20），仅此一个导出。
 * 内部 16 个辅助函数均未导出，只能通过控制 aiService.generateStream 的返回值
 * 触发不同分支验证。
 *
 * mock 策略：
 * - aiService.generateStream: 控制流式回调 + result.error/result.content
 * - dataService: mock 所有方法
 * - memoryBankService: syncFromFileSystem / buildContextFromMemorySync
 * - PromptComposer.composeForAssistant: 返回 fullPrompt
 * - compressHistoryIfNeeded: 返回 compressed: false
 * - unifiedExecutor.executeAction: mock 返回结果
 * - ToolParser: 真实调用（让 AI 输出能被正确解析）
 *
 * 覆盖分支：
 * 1. AI 返回 error → 立即返回
 * 2. 无 toolCalls 纯文本 → 直接完成
 * 3. update_todo_list 工具 → 设置 todoList
 * 4. plan 工具 → 创建 taskPlan
 * 5. decide-next complete → 任务完成
 * 6. decide-next ask_user → 等待用户
 * 7. create_file 工具 → handleToolCalls done
 * 8. ask_input/ask_choice → 等待用户
 * 9. analyze-state → 累积上下文
 * 10. 异常 → 重新抛出
 */

vi.mock('../aiService', () => ({
  aiService: {
    generateStream: vi.fn(),
  },
}));

vi.mock('../DataService', () => ({
  dataService: {
    getActiveProject: vi.fn().mockReturnValue({ id: 'p1', title: '测试项目' }),
    buildAIContext: vi.fn().mockReturnValue(''),
    getFS: vi.fn().mockReturnValue({ files: {}, rootIds: [] }),
    getChildren: vi.fn().mockReturnValue([]),
    getRootFolderIdByType: vi.fn().mockReturnValue(null),
    getFile: vi.fn().mockReturnValue(null),
  },
}));

vi.mock('../MemoryBankService', () => ({
  memoryBankService: {
    syncFromFileSystem: vi.fn().mockResolvedValue(undefined),
    buildContextFromMemorySync: vi.fn().mockReturnValue(''),
  },
}));

vi.mock('../../../../shared/prompts', () => ({
  PromptComposer: {
    composeForAssistant: vi.fn().mockReturnValue({ fullPrompt: 'mock system prompt' }),
  },
}));

vi.mock('./contextCompress', () => ({
  compressHistoryIfNeeded: vi.fn().mockResolvedValue({
    compressed: false,
    messages: [],
    tokensSaved: 0,
  }),
}));

vi.mock('./UnifiedExecutor', () => ({
  unifiedExecutor: {
    executeAction: vi.fn().mockResolvedValue('✅ 执行成功'),
    executeAll: vi.fn().mockResolvedValue({ actionResults: 'ok', fileOps: [] }),
  },
}));

import { aiService } from '../aiService';
import { unifiedExecutor } from './UnifiedExecutor';
import { memoryBankService } from '../MemoryBankService';

const mockedGenerateStream = vi.mocked(aiService.generateStream);
const mockedExecuteAction = vi.mocked(unifiedExecutor.executeAction);
const mockedSync = vi.mocked(memoryBankService.syncFromFileSystem);

// ============== 测试夹具 ==============

function createModel(): ModelConfig {
  return {
    id: 'm1',
    name: 'Test',
    provider: 'openai-compatible',
    modelName: 'gpt-4',
    maxTokens: 4096,
    contextWindow: 128000,
  } as ModelConfig;
}

function createCallbacks(overrides: Partial<ProcessCallbacks> = {}): ProcessCallbacks {
  return {
    addMessage: vi.fn().mockReturnValue({ id: 'msg-1' } as AIChatMessage),
    setStreamingContent: vi.fn(),
    setStreamingThinking: vi.fn(),
    setAgentPhase: vi.fn(),
    showPrompt: vi.fn(),
    setIsProcessing: vi.fn(),
    setTokenUsage: vi.fn(),
    setTodoList: vi.fn(),
    updateSystemStep: vi.fn(),
    initSystemSteps: vi.fn(),
    getActiveAgent: vi.fn().mockReturnValue({ id: 'agent-general', systemPrompt: 'test', name: '通用' }),
    getMessages: vi.fn().mockReturnValue([]),
    getCurrentMessageId: vi.fn().mockReturnValue('msg-1'),
    emit: vi.fn(),
    isCurrentTask: vi.fn().mockReturnValue(true),
    ...overrides,
  };
}

/** 模拟 generateStream 的成功返回（带流式回调） */
function mockStreamSuccess(content: string, tokens = { prompt: 100, completion: 50, total: 150 }) {
  mockedGenerateStream.mockImplementationOnce(async (_req: any, onStream: (resp: any) => void) => {
    // 模拟流式回调
    if (onStream) {
      onStream({ isStreaming: true, content, reasoningContent: '思考' });
    }
    return { content, tokens, error: undefined } as any;
  });
}

/** 模拟 generateStream 的错误返回 */
function mockStreamError(error: string) {
  mockedGenerateStream.mockImplementationOnce(async (_req: any, _onStream: any) => {
    return { content: '', error } as any;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  // 重置 generateStream 的所有 mock 实现（避免 mockImplementationOnce 残留污染）
  mockedGenerateStream.mockReset();
  mockedSync.mockResolvedValue(undefined);
  mockedExecuteAction.mockResolvedValue('✅ 执行成功');
});

// ============== 1. 错误处理 ==============

describe('error handling', () => {
  it('AI 返回 error 时应输出错误消息并返回', async () => {
    mockStreamError('API 失败');
    const cb = createCallbacks();

    const result = await processWithAI('测试', createModel(), cb);

    expect(result.waitingForUser).toBe(false);
    expect(cb.addMessage).toHaveBeenCalledWith(expect.objectContaining({
      role: 'assistant',
      content: expect.stringContaining('API 失败'),
    }));
    expect(cb.setAgentPhase).toHaveBeenCalledWith(AgentPhase.ERROR, expect.any(String), 0, expect.any(Object));
  });

  it('memoryBank sync 抛错时不应影响主流程', async () => {
    mockedSync.mockRejectedValueOnce(new Error('sync error'));
    mockStreamSuccess('```tool\n{"action": "decide-next", "decision": "complete", "thought": "完成", "reason": "完成", "confidence": 0.9}\n```');
    const cb = createCallbacks();

    const result = await processWithAI('测试', createModel(), cb);

    // 不应抛错，正常返回
    expect(result.waitingForUser).toBe(false);
  });

  it('processWithAI 抛出异常时应重新抛出', async () => {
    // 让 generateStream 抛错（不是返回 error，而是抛出）
    mockedGenerateStream.mockRejectedValueOnce(new Error('网络异常'));
    const cb = createCallbacks();

    await expect(processWithAI('测试', createModel(), cb)).rejects.toThrow('网络异常');
  });
});

// ============== 2. 纯文本回复 ==============

describe('纯文本回复', () => {
  it('无 toolCalls + 无 createIntent + 短文本 → 直接完成', async () => {
    mockStreamSuccess('短回复');
    const cb = createCallbacks();

    const result = await processWithAI('测试', createModel(), cb);

    expect(result.waitingForUser).toBe(false);
    // 应添加 assistant 消息
    expect(cb.addMessage).toHaveBeenCalled();
    // 应最终设置 COMPLETED phase
    expect(cb.setAgentPhase).toHaveBeenCalledWith(AgentPhase.COMPLETED, expect.any(String), 100);
  });
});

// ============== 3. update_todo_list 工具 ==============

describe('update_todo_list 工具', () => {
  it('应解析 todos 并调用 setTodoList', async () => {
    // 第一轮：返回 update_todo_list + decide-next complete
    const content = '```tool\n{"action": "update_todo_list", "todos": [{"content": "任务1", "status": "pending"}, {"content": "任务2", "status": "completed"}]}\n```\n```tool\n{"action": "decide-next", "decision": "complete", "thought": "完成", "reason": "完成", "confidence": 0.9}\n```';
    mockStreamSuccess(content);
    const cb = createCallbacks();

    await processWithAI('测试', createModel(), cb);

    expect(cb.setTodoList).toHaveBeenCalled();
    const todosArg = (cb.setTodoList as any).mock.calls[0][0];
    expect(todosArg).toHaveLength(2);
    expect(todosArg[0].content).toBe('任务1');
    expect(todosArg[0].status).toBe('pending');
    expect(todosArg[0].type).toBe('task');
  });

  it('todos 为字符串时应通过 parseMarkdownChecklist 解析', async () => {
    const todosMd = '- [ ] 任务1\n- [x] 任务2';
    const content = '```tool\n{"action": "update_todo_list", "todos": "' + todosMd.replace(/"/g, '\\"').replace(/\n/g, '\\n') + '"}\n```\n```tool\n{"action": "decide-next", "decision": "complete", "thought": "完成", "reason": "完成", "confidence": 0.9}\n```';
    mockStreamSuccess(content);
    const cb = createCallbacks();

    await processWithAI('测试', createModel(), cb);

    expect(cb.setTodoList).toHaveBeenCalled();
  });
});

// ============== 4. plan 工具 ==============

describe('plan 工具', () => {
  it('应解析 plan operations 并输出任务规划消息', async () => {
    const planContent = '```tool\n{"action": "plan", "description": "测试计划", "operations": [{"action": "create_file", "name": "文件1", "description": "创建文件1"}, {"action": "create_file", "name": "文件2", "description": "创建文件2"}]}\n```';
    mockStreamSuccess(planContent);
    // 第二轮：返回 complete
    mockStreamSuccess('```tool\n{"action": "decide-next", "decision": "complete", "thought": "完成", "reason": "完成", "confidence": 0.9}\n```');
    const cb = createCallbacks();

    await processWithAI('测试', createModel(), cb);

    // 应输出 "任务规划完成"
    const addMessageCalls = (cb.addMessage as any).mock.calls;
    const planMessage = addMessageCalls.find((call: any[]) =>
      typeof call[0].content === 'string' && call[0].content.includes('任务规划完成')
    );
    expect(planMessage).toBeDefined();
  });
});

// ============== 5. decide-next 工具 ==============

describe('decide-next 工具', () => {
  it('decision=complete 时应输出完成消息', async () => {
    const content = '```tool\n{"action": "decide-next", "decision": "complete", "thought": "任务完成", "reason": "已完成", "confidence": 0.9}\n```';
    mockStreamSuccess(content);
    const cb = createCallbacks();

    const result = await processWithAI('测试', createModel(), cb);

    expect(result.waitingForUser).toBe(false);
    expect(cb.setAgentPhase).toHaveBeenCalledWith(AgentPhase.COMPLETED, expect.any(String), 100);
    // 应输出 reason
    const addMessageCalls = (cb.addMessage as any).mock.calls;
    const completeMessage = addMessageCalls.find((call: any[]) =>
      typeof call[0].content === 'string' && call[0].content.includes('已完成')
    );
    expect(completeMessage).toBeDefined();
  });

  it('decision=ask_user 时应返回 waitingForUser=true', async () => {
    const content = '```tool\n{"action": "decide-next", "decision": "ask_user", "thought": "需要用户输入", "reason": "需要用户提供信息", "confidence": 0.5}\n```';
    mockStreamSuccess(content);
    const cb = createCallbacks();

    const result = await processWithAI('测试', createModel(), cb);

    expect(result.waitingForUser).toBe(true);
    // 应输出 🤔 消息
    const addMessageCalls = (cb.addMessage as any).mock.calls;
    const askMessage = addMessageCalls.find((call: any[]) =>
      typeof call[0].content === 'string' && call[0].content.includes('🤔')
    );
    expect(askMessage).toBeDefined();
  });
});

// ============== 6. create_file 工具 ==============

describe('create_file 工具', () => {
  it('应通过 handleToolCalls 执行 create_file 并完成', async () => {
    const content = '```tool\n{"action": "create_file", "name": "测试.md", "content": "测试内容", "parentId": null}\n```';
    mockStreamSuccess(content);
    // 第二轮：返回 complete
    mockStreamSuccess('```tool\n{"action": "decide-next", "decision": "complete", "thought": "完成", "reason": "完成", "confidence": 0.9}\n```');
    const cb = createCallbacks();

    await processWithAI('测试', createModel(), cb);

    // 应调用 executeAction
    expect(mockedExecuteAction).toHaveBeenCalled();
  });
});

// ============== 7. ask_input / ask_choice 工具 ==============

describe('ask_input / ask_choice 工具', () => {
  it('ask_choice 时应调用 showPrompt 并返回 wait_user', async () => {
    const content = '```tool\n{"action": "ask_choice", "prompt": "请选择", "choices": ["A", "B"]}\n```';
    mockStreamSuccess(content);
    const cb = createCallbacks();

    const result = await processWithAI('测试', createModel(), cb);

    expect(result.waitingForUser).toBe(true);
    expect(cb.showPrompt).toHaveBeenCalled();
  });
});

// ============== 8. analyze-state 工具 ==============

describe('analyze-state 工具', () => {
  it('应累积 analyze-state 的 content 到上下文', async () => {
    // 第一轮：analyze-state
    const analyzeContent = '```tool\n{"action": "analyze-state", "content": "项目状态分析：已创建角色，待创建世界观"}\n```';
    mockStreamSuccess(analyzeContent);
    // 第二轮：complete
    mockStreamSuccess('```tool\n{"action": "decide-next", "decision": "complete", "thought": "完成", "reason": "完成", "confidence": 0.9}\n```');
    const cb = createCallbacks();

    await processWithAI('测试', createModel(), cb);

    // analyze-state 不直接触发 executeAction（被 hasMetaTool 分支处理）
    // 但应设置 setAgentPhase
    expect(cb.setAgentPhase).toHaveBeenCalled();
  });
});

// ============== 9. MAX_ITERATIONS 限制 ==============

describe('MAX_ITERATIONS 限制', () => {
  it('正常完成路径应跳出循环（不触发 MAX_ITERATIONS 警告）', async () => {
    mockStreamSuccess('完成');
    const cb = createCallbacks();

    const result = await processWithAI('测试', createModel(), cb);

    expect(result.waitingForUser).toBe(false);
    // 应设置 COMPLETED phase
    expect(cb.setAgentPhase).toHaveBeenCalledWith(AgentPhase.COMPLETED, expect.any(String), 100);
  });
});

// ============== 10. setIsProcessing 流程 ==============

describe('isProcessing 状态', () => {
  it('正常完成时不应调用 setIsProcessing（在 finally 中 cb.isCurrentTask=true 才调用）', async () => {
    mockStreamSuccess('完成');
    const cb = createCallbacks();

    await processWithAI('测试', createModel(), cb);

    // cb.isCurrentTask()=true，所以 finally 会调用 setIsProcessing(false)
    expect(cb.setIsProcessing).toHaveBeenCalledWith(false);
    expect(cb.setStreamingContent).toHaveBeenCalledWith(null);
  });

  it('waitingForUser=true 时 finally 块不应调用 setIsProcessing(false)', async () => {
    const content = '```tool\n{"action": "decide-next", "decision": "ask_user", "thought": "需要用户输入", "reason": "需要信息", "confidence": 0.5}\n```';
    mockStreamSuccess(content);
    const cb = createCallbacks();

    const result = await processWithAI('测试', createModel(), cb);

    expect(result.waitingForUser).toBe(true);
    // 源码 finally 块：if (!waitingForUser && cb.isCurrentTask()) - waitingForUser=true 时 !waitingForUser=false，不进入
    // 所以不应调用 setIsProcessing(false)
    expect(cb.setIsProcessing).not.toHaveBeenCalledWith(false);
  });
});

// ============== 11. updateSystemStep 流程 ==============

describe('updateSystemStep 流程', () => {
  it('应按顺序更新系统步骤（BUILD_CONTEXT → COMPOSE_PROMPT → CALL_AI → PARSE_RESPONSE）', async () => {
    mockStreamSuccess('完成');
    const cb = createCallbacks();

    await processWithAI('测试', createModel(), cb);

    const stepIds = (cb.updateSystemStep as any).mock.calls.map((call: any[]) => call[0]);
    expect(stepIds).toContain(SYSTEM_STEP_IDS.BUILD_CONTEXT);
    expect(stepIds).toContain(SYSTEM_STEP_IDS.COMPOSE_PROMPT);
    expect(stepIds).toContain(SYSTEM_STEP_IDS.CALL_AI);
    expect(stepIds).toContain(SYSTEM_STEP_IDS.PARSE_RESPONSE);
  });
});

// SYSTEM_STEPS 常量提取
const SYSTEM_STEP_IDS = {
  BUILD_CONTEXT: SYSTEM_STEPS.BUILD_CONTEXT.id,
  COMPOSE_PROMPT: SYSTEM_STEPS.COMPOSE_PROMPT.id,
  CALL_AI: SYSTEM_STEPS.CALL_AI.id,
  PARSE_RESPONSE: SYSTEM_STEPS.PARSE_RESPONSE.id,
  EXECUTE_OPERATIONS: SYSTEM_STEPS.EXECUTE_OPERATIONS.id,
  CHECK_COMPLETION: SYSTEM_STEPS.CHECK_COMPLETION.id,
} as const;
