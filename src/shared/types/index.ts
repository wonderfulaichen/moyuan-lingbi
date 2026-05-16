// ========== 模型相关类型 ==========

export type ModelProvider = 'openai-compatible' | 'ollama' | 'deepseek' | 'local';

export type OutputMode = 'streaming' | 'traditional';

export interface ModelConfig {
  id: string;
  name: string;
  provider: ModelProvider;
  endpoint?: string;
  apiKey?: string;
  modelName: string;
  temperature?: number;
  maxTokens?: number;
  contextWindow?: number;      // 模型上下文窗口大小（tokens），用于显示使用度
  systemPrompt?: string;
  supportsStreaming?: boolean;
  defaultOutputMode?: OutputMode;
  availableModels?: string[];
  modelsLastFetched?: number;
  modelsFetchError?: string;
  modelContextMap?: Record<string, number>;
  isFetchingModels?: boolean;
  // 本地模型专用配置
  modelPath?: string;          // .gguf 文件路径
  gpuLayers?: number;          // GPU 加速层数（0=纯CPU）
  gpuAcceleration?: boolean;   // 是否启用 GPU
  contextSize?: number;        // 上下文窗口大小
}

// ========== AI响应类型 ==========

export interface AIResponse {
  content: string;
  tokens?: {
    prompt: number;
    completion: number;
    total: number;
  };
  model?: string;
  finishReason?: string;
  error?: string;
  metadata?: {
    prompt?: string;
    modelConfig?: ModelConfig;
    [key: string]: unknown;
  };
}

export interface StreamingAIResponse extends AIResponse {
  isComplete: boolean;
  isStreaming?: boolean;
  reasoningContent?: string;
}

export type StreamingCallback = (response: StreamingAIResponse) => void;

// ========== 角色类型 ==========

export interface Character {
  id: string;
  name: string;
  gender: string;
  age: string;
  role: string;
  personality: string;
  background: string;
  relationships: string;
  appearance: string;
  distinctiveFeatures: string;
  occupation: string;
  motivation: string;
  strengths: string;
  weaknesses: string;
  characterArc: string;
  factionId?: string;
  homeLocationId?: string;
  currentLocationId?: string;
  mbti?: string;
  coreValues?: string[];
  speechStyle?: string;
  emotionalPatterns?: string;
}

// ========== 章节类型 ==========

export interface Chapter {
  id: string;
  title: string;
  summary: string;
  content: string;
  contentSummary?: string;
  order: number;
  mainLocationId?: string;
  involvedFactionIds?: string[];
  timelineEventId?: string;
  // 细纲扩展字段
  keyEvents?: string[];      // 关键事件列表
  characters?: string[];     // 本章节涉及角色ID列表
  // 卷分组字段
  volumeId?: string;         // 所属卷ID
  volumeName?: string;       // 所属卷名称
}

// ========== 卷细纲类型 ==========

export interface VolumeOutline {
  id: string;
  name: string;              // 卷名称，如"第一卷：初入仙途"
  order: number;             // 卷顺序
  summary: string;           // 该卷完整细纲文本（包含所有章节）
}

// ========== 知识库类型 ==========

export type KnowledgeCategory = 'inspiration' | 'character' | 'outline' | 'chapter' | 'writing';

export interface KnowledgeItem {
  id: string;
  name: string;
  content: string;
  type: string;
  size: number;
  addedAt: number;
  category: KnowledgeCategory;
}

// ========== 提示词模板类型 ==========

export interface PromptTemplate {
  id: string;
  category: 'inspiration' | 'character' | 'outline' | 'chapter' | 'edit' | 'writing' | 'summary';
  name: string;
  content: string;
}

// ========== 世界观类型 ==========

export interface WorldLocation {
  id: string;
  name: string;
  description: string;
  type: string;
  parentId?: string;
  features?: string;
  atmosphere?: string;
}

export interface WorldFaction {
  id: string;
  name: string;
  description: string;
  leader?: string;
  territory?: string;
  ideology?: string;
  relationships?: string;
}

export interface WorldRuleSystem {
  id: string;
  name: string;
  description: string;
  type: string;
  levels?: string[];
  rules?: string;
}

// ========== 时间线类型 ==========

export interface TimelineEvent {
  id: string;
  title: string;
  description: string;
  timestamp: string;
  order: number;
  relatedCharacterIds?: string[];
  relatedLocationId?: string;
}

// ========== 灵感模块类型 ==========

/** 灵感标签 */
export interface InspirationTag {
  id: string;
  text: string;
  selected: boolean;
  source: 'ai' | 'user';  // AI生成的还是用户手动添加的
}

/** 小说方案 */
export interface NovelScheme {
  id: string;
  title: string;
  intro: string;
  genre: string;           // 题材类型
  tone: string;            // 基调风格
  coreConflict: string;    // 核心冲突
  highlights: string;      // 亮点特色
  selected: boolean;       // 用户是否选中此方案
  favorited: boolean;      // 用户是否收藏此方案
  groupId: string | null;  // 所属分组ID
  createdAt: number;       // 创建时间
}

/** 方案分组 */
export interface SchemeGroup {
  id: string;
  name: string;
  createdAt: number;
}

/** 方案历史记录 */
export interface SchemeHistory {
  id: string;
  schemes: NovelScheme[];
  tags: InspirationTag[];
  inspiration: string;
  createdAt: number;
  groupId: string | null;
}

// ========== 图表配置类型 ==========

export type ChartType = 'relation-graph' | 'region-map' | 'timeline' | 'tree-diagram';

export interface ChartConfig {
  id: string;
  type: ChartType;
  title: string;
  enabled: boolean;
}

// ========== 气泡文件夹类型 ==========

/** 内容卡片 - 每个标签对应一张内容卡片 */
export interface ContentCard {
  id: string;
  tagText: string;
  title: string;
  content: string;
  isFavorited: boolean;
  batchId: string | null;
  createdAt: number;
  updatedAt: number;
  lastIndexedAt?: number;
}

export interface BubbleFolder {
  id: string;
  name: string;
  icon: string;
  color: string;
  parentId: string | null;
  type: 'world' | 'characters' | 'timeline' | 'outline' | 'detailed_outline' | 'chapters' | 'custom';
  vfileId?: string;                // 对应 VFile 系统中的文件夹节点 ID（统一数据源）
  mode?: 'folder' | 'generate';  // 文件夹模式 / 生成模式
  prompt?: string;
  generatedTags?: InspirationTag[];
  selectedTags?: InspirationTag[];
  schemes?: NovelScheme[];
  charts?: ChartConfig[];
  // 生成模式扩展字段
  selectedSchemeId?: string;       // 关联的灵感方案ID
  knowledgeInputs?: KnowledgeItem[]; // 知识输入（文件导入）
  contentCards?: ContentCard[];    // [兼容旧数据] 内容卡片，新代码应通过 dataService.getChildren(vfileId) 读取
  children?: BubbleFolder[];       // 子文件夹（支持嵌套）
  content?: string;                // 子文件夹专属内容（用于情节创作的大纲/细纲/章节）
  createdAt: number;
}

// ========== 项目类型 ==========

export interface Project {
  id: string;
  title: string;
  inspiration: string;
  intro: string;
  characters: Character[];
  outline: string;
  chapters: Chapter[];
  volumeOutlines?: VolumeOutline[]; // 卷细纲（按卷存储完整细纲文本）
  knowledge: KnowledgeItem[];
  locations: WorldLocation[];
  factions: WorldFaction[];
  ruleSystems: WorldRuleSystem[];
  timelineEvents: TimelineEvent[];
  // 灵感模块扩展字段
  inspirationTags: InspirationTag[];
  novelSchemes: NovelScheme[];
  selectedSchemeId: string | null;
  schemeGroups: SchemeGroup[];
  schemeHistory: SchemeHistory[];
  promptHistory?: string[];      // 灵感提示输入历史（可选，兼容旧数据）
  schemePromptHistory?: string[]; // 方案提示输入历史（可选，兼容旧数据）
  // 气泡文件夹
  folders: BubbleFolder[];
  lastModified: number;
  // 记忆体开关（实验功能）
  memoryBankEnabled?: boolean;
}

// ========== 应用状态类型 ==========

export interface AppState {
  projects: Project[];
  activeProjectId: string | null;
  models: ModelConfig[];
  prompts: PromptTemplate[];
  activeModelId: string;
}

// ========== 记忆体类型（Memory Bank）==========

/** 原子记忆 - 核心设定，永不丢失 */
export interface AtomicMemory {
  version: number;
  lastUpdated: number;
  world: {
    rules: string[];
    cosmology: string;
    geography: string[];
    history: string[];
  };
  characters: {
    id: string;
    name: string;
    identity: string;
    publicIdentity?: string;
    personality: string[];
    abilities: string[];
    relationships: Array<{
      targetId: string;
      type: 'ally' | 'enemy' | 'neutral' | 'family' | 'master' | 'disciple';
      description: string;
      knownTo: string[];
    }>;
    secrets: string[];
    arc: { start: string; current: string; goal: string };
  }[];
  plots: {
    id: string;
    type: 'main' | 'sub' | 'romance' | 'mystery';
    status: 'active' | 'resolved' | 'dormant';
    description: string;
    involvedCharacters: string[];
    foreshadows: Array<{
      chapter: number;
      hint: string;
      expectedPayoff: string;
      status: 'planted' | 'partial' | 'resolved';
    }>;
  }[];
}

/** 动态记忆 - 随写作进度更新 */
export interface DynamicMemory {
  current: {
    chapter: number;
    scene: string;
    pov: string;
    location: string;
    time: string;
    mood: string;
  };
  tension: {
    level: number;
    history: Array<{ chapter: number; level: number; event: string }>;
  };
  activeThreads: Array<{
    plotId: string;
    urgency: number;
    lastMentioned: number;
  }>;
  characterStates: Array<{
    characterId: string;
    currentLocation: string;
    currentMood: string;
    recentEvents: string[];
    temporaryStatus: string[];
  }>;
}

/** 向量记忆 - 用于语义检索 */
export interface VectorMemory {
  id: string;
  text: string;
  type: 'scene' | 'dialogue' | 'description' | 'action';
  chapter: number;
  characters: string[];
  embedding?: number[];
  importance: number;
}

/** 记忆体完整结构 */
export interface MemoryBank {
  projectId: string;
  atomic: AtomicMemory;
  dynamic: DynamicMemory;
  vectors: VectorMemory[];
  lastMaintained: number;
  maintenanceLog: Array<{
    timestamp: number;
    action: string;
    details: string;
  }>;
}
