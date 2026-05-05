import { AIChatMessage, AIPendingPrompt, AgentPhase, AgentRequiredAction, AgentStateInfo } from '../../../shared/types/fileSystem';

export interface PendingConfirm {
  files: Array<{
    action: 'create_file' | 'update_file';
    name: string;
    parentId: string | null;
    content: string;
    fileId?: string;
  }>;
}

export function detectAgentState(
  messages: AIChatMessage[],
  isProcessing: boolean,
  streamingContent: string | null,
  pendingConfirm: PendingConfirm | null,
  pendingPrompt: AIPendingPrompt | null,
): AgentStateInfo {
  const base: AgentStateInfo = {
    phase: AgentPhase.IDLE,
    currentTask: '',
    progress: 0,
    requiredAction: 'none' as AgentRequiredAction,
    error: null,
    pendingFiles: [],
    iteration: 0,
    maxIterations: 3,
  };

  if (!isProcessing && !streamingContent && !pendingConfirm && !pendingPrompt) {
    return base;
  }

  if (pendingConfirm) {
    const hasUpdate = pendingConfirm.files.some(f => f.action === 'update_file');
    return {
      ...base,
      phase: AgentPhase.WAITING_CONFIRM,
      currentTask: '等待确认文件操作',
      progress: 85,
      requiredAction: hasUpdate ? 'confirm_update' : 'confirm_create',
      pendingFiles: pendingConfirm.files,
    };
  }

  if (pendingPrompt) {
    return {
      ...base,
      phase: AgentPhase.WAITING_CONFIRM,
      currentTask: '等待用户输入',
      progress: 50,
      requiredAction: 'answer_question',
    };
  }

  if (streamingContent !== null && isProcessing) {
    return {
      ...base,
      phase: AgentPhase.GENERATING,
      currentTask: '生成中',
      progress: 40,
      requiredAction: 'none',
    };
  }

  if (isProcessing) {
    return {
      ...base,
      phase: AgentPhase.ANALYZING,
      currentTask: '分析中',
      progress: 10,
      requiredAction: 'none',
    };
  }

  return base;
}
