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

export interface AIAssistantState {
  messages: AIChatMessage[];
  tasks: AITaskItem[];
  isProcessing: boolean;
  streamingContent: string | null;
  pendingPrompt: AIPendingPrompt | null;
  conversations: Conversation[];
  activeConversationId: string | null;
  agents: AIAgent[];
  activeAgentId: string;
  tokenUsage: { prompt: number; completion: number; total: number } | null;
  agentState: AgentStateInfo;
}

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
}

export interface AppData {
  projects: ProjectMeta[];
  activeProjectId: string | null;
  models: import('./index').ModelConfig[];
  prompts: import('./index').PromptTemplate[];
  activeModelId: string;
  fileSystems: Record<string, VFileSystem>;
}
