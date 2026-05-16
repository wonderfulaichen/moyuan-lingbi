export interface VFile {
  id: string;
  name: string;
  type: 'folder' | 'file';
  parentId: string | null;
  content: string;
  metadata: VFileMetadata;
  childrenIds: string[];
  createdAt: number;
  updatedAt: number;
  version: number;
}

export interface VFileMetadata {
  tags: string[];
  favorited: boolean;
  cardType: string;
  references: string[];
  aiGenerated: boolean;
  batchId: string | null;
  sortOrder: number;
  lastIndexedAt?: number;
  [key: string]: unknown;
}

export interface VFileSystem {
  files: Record<string, VFile>;
  rootIds: string[];
}

export interface AITaskItem {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
  result: string;
  createdAt: number;
  completedAt: number | null;
  fileId: string | null;
}

export interface AIChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  actions: AIAction[];
  compressedSummary?: string;
  isCompressed?: boolean;
  thinking?: string;
  todoList?: TodoItem[];
}

export interface AIAction {
  type: 'create_file' | 'update_file' | 'delete_file' | 'ask_user' | 'search' | 'read_file';
  target: string;
  payload: unknown;
  result: unknown;
  confirmed: boolean;
}

export interface AIInputPrompt {
  type: 'input';
  question: string;
  placeholder: string;
  onAnswer: (answer: string) => void;
}

export interface AIChoicePrompt {
  type: 'choice';
  question: string;
  options: string[];
  multiSelect: boolean;
  onAnswer: (answer: string | string[]) => void;
}

export interface AIPlanPrompt {
  type: 'plan';
  title: string;
  steps: AIPlanStep[];
  onConfirm: () => void;
  onCancel: () => void;
  onStepToggle: (index: number, enabled: boolean) => void;
}

export interface AIPlanStep {
  title: string;
  description: string;
  enabled: boolean;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
}

export type AIPendingPrompt = AIInputPrompt | AIChoicePrompt | AIPlanPrompt;

export interface AIAgent {
  id: string;
  name: string;
  icon: string;
  color: string;
  description: string;
  systemPrompt: string;
  isBuiltIn: boolean;
  createdAt: number;
}

export interface Conversation {
  id: string;
  title: string;
  messages: AIChatMessage[];
  agentId?: string;
  createdAt: number;
  updatedAt: number;
}

export enum AgentPhase {
  IDLE = 'idle',
  ANALYZING = 'analyzing',
  PLANNING = 'planning',
  GENERATING = 'generating',
  VALIDATING = 'validating',
  WAITING_CONFIRM = 'waiting_confirm',
  EXECUTING = 'executing',
  SELF_CORRECTING = 'self_correcting',
  COMPLETED = 'completed',
  ERROR = 'error',
}

export type AgentRequiredAction =
  | 'none'
  | 'confirm_create'
  | 'confirm_update'
  | 'answer_question'
  | 'retry'
  | 'start_new_task'
  | 'cancel';

export interface AgentStateInfo {
  phase: AgentPhase;
  currentTask: string;
  progress: number;
  requiredAction: AgentRequiredAction;
  error: string | null;
  pendingFiles: Array<{
    action: 'create_file' | 'update_file';
    name: string;
    parentId: string | null;
    content: string;
    fileId?: string;
  }>;
  iteration: number;
  maxIterations: number;
}

export interface CheckIssue {
  id: string;
  description: string;
  category: 'character' | 'plot' | 'world' | 'consistency' | 'other';
  selected: boolean;
  fixed: boolean;
}

export interface AIAssistantState {
  messages: AIChatMessage[];
  tasks: AITaskItem[];
  checkIssues: CheckIssue[];
  isProcessing: boolean;
  streamingContent: string | null;
  streamingThinking: string | null;
  pendingPrompt: AIPendingPrompt | null;
  conversations: Conversation[];
  activeConversationId: string | null;
  agents: AIAgent[];
  activeAgentId: string;
  tokenUsage: { prompt: number; completion: number; total: number } | null;
  agentState: AgentStateInfo;
  todoList: TodoItem[];
}

export interface TodoItem {
  id: string;
  content: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  type?: 'system' | 'task';
  icon?: string;
  details?: string;
}

export const SYSTEM_STEPS = {
  BUILD_CONTEXT: { id: 'system-build-context', content: '构建上下文', icon: 'fa-database' },
  COMPOSE_PROMPT: { id: 'system-compose-prompt', content: '组合提示词', icon: 'fa-scroll' },
  CALL_AI: { id: 'system-call-ai', content: '调用 AI', icon: 'fa-robot' },
  PARSE_RESPONSE: { id: 'system-parse-response', content: '解析响应', icon: 'fa-code' },
  EXECUTE_OPERATIONS: { id: 'system-execute-operations', content: '执行操作', icon: 'fa-play' },
  CHECK_COMPLETION: { id: 'system-check-completion', content: '检查完成', icon: 'fa-check-double' },
} as const;

export type SystemStepId = keyof typeof SYSTEM_STEPS;

export interface InspirationData {
  text: string;
  tags: import('./index').InspirationTag[];
  promptHistory: string[];
}

export interface NovelScheme {
  id: string;
  title: string;
  intro: string;
  genre: string;
  tone: string;
  coreConflict: string;
  highlights: string;
  selected: boolean;
  favorited: boolean;
  groupId: string | null;
  createdAt: number;
}

export interface SchemeHistory {
  id: string;
  schemes: NovelScheme[];
  tags: import('./index').InspirationTag[];
  inspiration: string;
  createdAt: number;
  groupId: string | null;
}

export interface SchemeGroup {
  id: string;
  name: string;
  createdAt: number;
}

export interface ProjectMeta {
  id: string;
  title: string;
  intro: string;
  createdAt: number;
  updatedAt: number;
  rootFolderIds: string[];
  inspiration: InspirationData;
  novelSchemes: NovelScheme[];
  selectedSchemeId: string | null;
  schemeHistory: SchemeHistory[];
  schemeGroups: SchemeGroup[];
  schemePromptHistory: string[];
  outline: string;
  folders?: import('./index').BubbleFolder[];
  memoryBankEnabled?: boolean;
}

export interface AppData {
  projects: ProjectMeta[];
  activeProjectId: string | null;
  models: import('./index').ModelConfig[];
  prompts: import('./index').PromptTemplate[];
  activeModelId: string;
  fileSystems: Record<string, VFileSystem>;
  modelRouting?: Record<string, string>;
}
