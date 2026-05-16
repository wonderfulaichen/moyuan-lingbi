export type PromptLayer = 'foundation' | 'agent' | 'task' | 'format' | 'rule';

export type AgentId = 'agent-general' | 'agent-worldbuilder' | 'agent-character' | 'agent-plotter' | 'agent-editor';

export type TaskId =
  | 'inspire-tags'
  | 'inspire-schemes'
  | 'char-build'
  | 'char-single'
  | 'char-overview'
  | 'world-build'
  | 'world-single'
  | 'timeline-frame'
  | 'timeline-event'
  | 'outline-gen'
  | 'outline-detailed'
  | 'chapter-split'
  | 'writing-create'
  | 'writing-continue'
  | 'edit-polish'
  | 'summary-extract'
  | 'memory-extract'
  | 'analyze-state'
  | 'decide-next'
  | 'self-reflect';

export type FormatId =
  | 'character-card'
  | 'world-document'
  | 'timeline-event'
  | 'outline-document'
  | 'scheme-document'
  | 'json-strict';

export type RuleId =
  | 'role-type-tag'
  | 'detail-level'
  | 'task-focus'
  | 'canon-consistency'
  | 'file-uniqueness';

export type EntryPoint = 'assistant' | 'button' | 'inspiration' | 'plot' | 'writing' | 'memory';

interface BasePromptItem {
  id: string;
  content: string;
  layer: PromptLayer;
}

export interface FoundationPrompt extends BasePromptItem {
  layer: 'foundation';
  category: 'tool-format' | 'workflow' | 'file-rules' | 'canon-system' | 'compress';
  priority: number;
}

export interface AgentPrompt extends BasePromptItem {
  layer: 'agent';
  agentId: AgentId;
  name: string;
  icon: string;
  color: string;
  description: string;
}

export interface TaskPrompt extends BasePromptItem {
  layer: 'task';
  taskId: TaskId;
  name: string;
  category: 'inspiration' | 'character' | 'world' | 'timeline' | 'outline' | 'chapter' | 'writing' | 'edit' | 'summary' | 'memory' | 'analysis';
  folderType?: 'characters' | 'world' | 'timeline' | 'outline';
  description?: string;
}

export interface FormatPrompt extends BasePromptItem {
  layer: 'format';
  formatId: FormatId;
  name: string;
  description: string;
}

export interface RulePrompt extends BasePromptItem {
  layer: 'rule';
  ruleId: RuleId;
  name: string;
  autoApplyForTasks?: TaskId[];
  autoApplyForAgents?: AgentId[];
}

export type AnyPromptItem = FoundationPrompt | AgentPrompt | TaskPrompt | FormatPrompt | RulePrompt;

export interface PromptLibraryItem {
  id: string;
  name: string;
  layer: PromptLayer;
  layerLabel: string;
  category?: string;
  categoryLabel?: string;
  description?: string;
  content: string;
  icon?: string;
  color?: string;
  autoApplyFor?: string[];
  editable?: boolean;
}

export interface ComposeOptions {
  entryPoint: EntryPoint;
  agentId?: AgentId;
  taskId?: TaskId;
  formatId?: FormatId;
  projectContext?: string;
  fileTreeDescription?: string;
  customRules?: RuleId[];
  skipLayers?: PromptLayer[];
}

export interface ComposedPrompt {
  fullPrompt: string;
  layersUsed: PromptLayer[];
  agentName?: string;
  taskName?: string;
}
