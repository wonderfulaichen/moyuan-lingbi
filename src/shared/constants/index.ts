import { ModelConfig } from '../types';

export interface ProviderInfo {
  label: string;
  icon: string;
  color: string;
  gradient: string;
  bgGradient: string;
  defaultEndpoint: string;
  endpointHint: string;
  apiKeyHint: string;
  website: string;
  apiApplyUrl: string;
  modelExamples: string[];
  description: string;
  tips: string[];
}

export const PROVIDER_INFO: Record<string, ProviderInfo> = {
  'openai-compatible': {
    label: 'OpenAI Compatible',
    icon: 'fa-cloud',
    color: 'text-green-400',
    gradient: 'from-green-500/20 to-emerald-500/10',
    bgGradient: 'from-[var(--color-primary-400)] to-[var(--color-primary-500)]',
    defaultEndpoint: 'https://api.openai.com/v1',
    endpointHint: '兼容 OpenAI 格式的 API 端点',
    apiKeyHint: '以 sk- 开头的 API 密钥',
    website: 'https://platform.openai.com',
    apiApplyUrl: 'https://platform.openai.com/api-keys',
    modelExamples: ['gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo'],
    description: '标准 OpenAI 兼容接口，支持大多数 AI 模型服务商',
    tips: [
      '支持所有提供 OpenAI 兼容 API 的服务商',
      'API Key 在服务商平台获取',
      '确保端点地址以 /v1 结尾',
      '支持流式输出（Streaming）'
    ],
  },
  'deepseek': {
    label: 'DeepSeek',
    icon: 'fa-dragon',
    color: 'text-blue-400',
    gradient: 'from-blue-500/20 to-indigo-500/10',
    bgGradient: 'from-blue-500 to-cyan-600',
    defaultEndpoint: 'https://api.deepseek.com/v1',
    endpointHint: 'DeepSeek 官方 API 端点',
    apiKeyHint: '在 platform.deepseek.com 获取 API 密钥',
    website: 'https://platform.deepseek.com',
    apiApplyUrl: 'https://platform.deepseek.com/api_keys',
    modelExamples: ['deepseek-chat', 'deepseek-coder'],
    description: '深度求索公司开发的 AI 模型，提供高质量的对话和代码生成能力',
    tips: [
      '注册后可在控制台获取 API Key',
      '免费额度：每月 1000 万 tokens',
      '模型名称填写：deepseek-chat',
      '支持 128K 上下文长度'
    ],
  },
  'ollama': {
    label: 'Ollama (本地)',
    icon: 'fa-server',
    color: 'text-emerald-400',
    gradient: 'from-emerald-500/20 to-teal-500/10',
    bgGradient: 'from-green-500 to-emerald-600',
    defaultEndpoint: 'http://127.0.0.1:11434/v1',
    endpointHint: 'Ollama 本地服务的 API 端点',
    apiKeyHint: 'Ollama 无需 API 密钥，留空即可',
    website: 'https://ollama.com',
    apiApplyUrl: 'https://ollama.com/download',
    modelExamples: ['qwen2.5', 'llama3.2', 'mistral', 'gemma', 'phi'],
    description: '本地运行的 AI 模型服务，支持多种开源模型，数据完全本地处理',
    tips: [
      '下载并安装 Ollama：https://ollama.com/download',
      '在终端运行：ollama pull qwen2.5 下载模型',
      '启动服务：ollama serve',
      'API Key 留空即可',
      '模型名称填写已下载的模型名，如：qwen2.5',
      '支持完全离线运行，保护隐私'
    ],
  },
  'local': {
    label: '本地模型 (GGUF)',
    icon: 'fa-microchip',
    color: 'text-amber-400',
    gradient: 'from-amber-500/20 to-orange-500/10',
    bgGradient: 'from-amber-500 to-orange-600',
    defaultEndpoint: '',
    endpointHint: '使用 node-llama-cpp 直接加载 .gguf 模型文件',
    apiKeyHint: '无需 API 密钥，直接使用本地模型文件',
    website: 'https://huggingface.co/models?library=gguf',
    apiApplyUrl: 'https://huggingface.co/models?library=gguf&sort=downloads',
    modelExamples: ['qwen2.5-7b-instruct-q4_k_m', 'llama-3.2-3b-instruct-q4_k_m', 'phi-3-mini-4k-instruct-q4'],
    description: '内置 llama.cpp 推理引擎，用户自备 GGUF 格式模型文件，完全离线运行',
    tips: [
      '将 .gguf 模型文件放入 models 目录',
      '模型名称填写文件名（不含 .gguf 后缀）',
      '根据硬件配置选择合适的模型大小',
      '首次运行需要加载模型，可能需要几分钟'
    ],
  },
};

export const INITIAL_MODELS: ModelConfig[] = [
  {
    id: 'default-openai',
    name: 'OpenAI Compatible',
    provider: 'openai-compatible',
    modelName: 'gpt-4o',
    contextWindow: 128000,
    supportsStreaming: true,
  },
  {
    id: 'default-deepseek',
    name: 'DeepSeek',
    provider: 'deepseek',
    endpoint: 'https://api.deepseek.com/v1',
    modelName: 'deepseek-chat',
    supportsStreaming: true,
  },
  {
    id: 'default-ollama',
    name: 'Ollama (本地)',
    provider: 'ollama',
    endpoint: 'http://127.0.0.1:11434/v1',
    modelName: 'qwen2.5:7b',
    contextWindow: 32768,
    supportsStreaming: true,
  },
  {
    id: 'default-local',
    name: '本地模型 (.gguf)',
    provider: 'local',
    modelName: 'local-model',
    contextWindow: 4096,
    supportsStreaming: true,
  },
];

export const DEFAULT_PROMPTS: Array<{ id: string; name: string; content: string; category: string }> = [
  {
    id: 'task-inspire-tags',
    name: '灵感标签发散',
    content: `你是一位经验丰富的创意写作顾问。用户提供了一段灵感描述，请进行以下步骤：

**步骤1：分析灵感核心**
先理解这段灵感的主题、氛围、潜在冲突和世界观倾向。

**步骤2：多维度发散标签**
根据你的分析，生成{count}个精准的创作标签。请从以下维度发散，确保覆盖全面且避免重复：

- 题材大类（如：都市异能、仙侠修真、科幻星际、悬疑推理、历史架空、末世废土等）
- 情感基调（如：热血燃向、温馨治愈、暗黑深沉、轻松搞笑、悲剧虐心、悬疑紧张等）
- 核心设定/金手指（如：重生、穿越、系统、签到、契约、双修、血统等）
- 世界特征（如：赛博朋克、蒸汽朋克、克苏鲁、修仙世界、无限流、末日求生等）
- 人物成长方向（如：逆袭崛起、群像叙事、双主角、萌宠相伴、师徒传承、宿敌对决等）

**步骤3：自我检查**
确保每个标签都是常见的网络小说创作术语，避免生僻词。标签之间互不重叠。

用户灵感：{inspiration}

请直接以逗号分隔输出标签，不要编号、不要解释、不要前缀。例如：都市异能,热血,重生,系统流,爽文,扮猪吃虎,商战,赘婿,逆袭`,
    category: 'inspiration',
  },
  {
    id: 'task-inspire-schemes',
    name: '小说方案构思',
    content: `你是一位从业15年的资深小说策划编辑，精通网络文学市场趋势。请根据以下信息，构思{count}个不同风格且具有市场竞争力的小说方案。

用户灵感：{inspiration}
选定标签：{tags}

**创作流程：**
1. 先分析灵感的核心爽点/痛点
2. 思考当前网文市场上这类题材的流行趋势和差异化空间
3. 确保每个方案的"核心冲突"具有足够的戏剧张力
4. 最后检查各方案是否真正风格迥异

每个方案请严格遵循以下格式输出（使用 --- 分隔不同方案）：

书名：[创意书名 —— 需有网感、易记住、能一眼突出核心卖点]
题材：[具体题材子类，如"都市异能+职场商战"]
基调：[情感基调 + 叙事风格，如"轻松热血 + 快节奏爽文"]
核心冲突：[50-80字，用一句话说清楚故事的核心矛盾与冲突张力]
简介：[150-250字的故事简介，要有钩子 —— 开头有悬念、中间有转折、结尾有期待]
亮点：[这个方案的2-3个独特卖点，区别于同类作品的地方]
目标读者定位：[简述主要面向哪类读者群体，吸引他们的核心是什么]

---
请确保{count}个方案的题材、基调、主角类型各不相同，避免雷同。书名要朗朗上口，简介要有"一读就停不下来"的吸引力。`,
    category: 'inspiration',
  },
  {
    id: 'task-char-build',
    name: '多维角色构建',
    content: `你是一位擅长塑造深度角色的小说创作专家。请基于小说《{title}》及其简介：{intro}，系统性地构建一套完整的角色体系。

**请按以下层次逐步构思：**

**一、核心主角（1-2位）**
每个主角需包含：
- 姓名及绰号/别称
- 身份定位（开局身份 → 故事中成长方向）
- 核心欲望与内在需求（表面想要什么 vs 内心真正需要什么）
- 性格光谱（在「理性-感性」「主动-被动」「光明-暗黑」等维度上的位置）
- 关键缺陷（这个缺陷将如何影响剧情走向）
- 人物弧线（开局状态 → 中期转变 → 最终蜕变）
- 标志性特质（独特的口头禅、习惯动作、战斗风格等）

**二、重要配角（3-5位）**
每个配角需说明：
- 与主角的关系定位（导师/伙伴/竞争/暧昧对象等）
- 在故事中的功能（推动剧情/制造冲突/提供帮助/映射主角等）
- 独立于主角的个人目标（配角应有自己的动机，不是工具人）

**三、核心反派（1-2位）**
- 反派的理念/信条（反派认为自己在做正确的事，逻辑自洽）
- 与主角的深层对立关系（价值观冲突 > 简单的正邪对立）
- 反派的优势和底牌（让主角的胜利来之不易）

**四、关系网络**
用简短描述勾勒出全体角色之间的核心关系链条和潜在的矛盾冲突点。

每个角色请保持格式完整，内容详实但精准。`,
    category: 'character',
  },
  {
    id: 'task-outline-gen',
    name: '深度大纲生成',
    content: `你是一位精通三幕式结构和类型小说创作技巧的资深故事架构师。请根据以下信息，为小说《{title}》编写一份逻辑严密、冲突递进、节奏流畅的故事大纲。

小说简介：{intro}
人物设定：{characters}

**创作要求：**

**一、整体结构**
请采用经典的三幕式结构（或适合该题材的特殊结构），确保：
- 起因（Act I）：占整部小说约25%，建立世界观、引入核心冲突
- 冲突升级（Act II）：占约50%，层层递进，设置3-5个关键转折点
- 高潮与结局（Act III）：占约25%，所有伏笔回收，冲突达到顶点

**二、情节逻辑要求**
- 每个关键事件必须有一个"起因→行动→结果→连锁反应"的因果链条
- 角色决策必须符合其性格设定，不得强行制造冲突
- 情节转折需要足够的铺垫，避免"机械降神"
- 主线与支线相互交织，支线服务于主线

**三、角色与情节的融合**
- 每个主要角色在剧情中要有对应的成长线和关键场景
- 冲突类型要多样化：外在冲突（人与环境/人与他人）+ 内在冲突（人物内心挣扎）

**四、输出格式**

【总体概览】（100-200字）
一句话梗概 -> 核心冲突说明 -> 主题思想

【第一幕：开端】（详细描述）
第1个情节点(触发事件)→ 角色反应 → 决定踏上旅程

【第二幕：冲突升级】
第2个情节点 → 第3个情节点(中点转折) → 第4个情节点(最黑暗时刻)

【第三幕：高潮与结局】
第5个情节点(最终决战/抉择) → 结局

【核心悬念与伏笔清单】
列出3-5个需要在行文中埋设的重要伏笔及其回收时机。`,
    category: 'outline',
  },
  {
    id: 'task-outline-detailed',
    name: '细纲生成',
    content: `你是一位擅长节奏控制和段落编排的小说策划专家。请根据以下大纲，生成一套精彩绝伦的分卷细纲。

大纲：{outline}

**输出要求：**
将故事分为3-5卷（如：第一卷·开端、第二卷·冲突升级、第三卷·高潮等），每卷之间用 --- 分隔。

**格式规范：**

## 第N卷：[卷名]

### 卷主题
（一句话概括本卷的核心主题和情感基调）

### 时间跨度
（本卷故事发生的时间范围）

### 主要地点
（本卷主要发生的场景地点）

### 核心冲突
（本卷的主要矛盾和冲突点）

### 章节安排
（列出本卷包含的章节及每章核心内容）
- 第X章：[章节标题] - [核心事件]
- 第Y章：[章节标题] - [核心事件]
- ...

### 角色成长
（主要角色在本卷中的变化和成长）

### 伏笔埋设
（本卷需要埋设的伏笔及其回收时机）

### 与前后卷衔接
（如何承接上一卷，如何引出下一卷）

---
**质量要求：**
- 每卷必须有明确的主题和节奏变化
- 卷与卷之间要有自然的过渡和衔接
- 伏笔要在前后期呼应
- 确保整体故事结构完整`,
    category: 'outline',
  },
  {
    id: 'task-writing-create',
    name: '沉浸式正文创作',
    content: `你是一位擅长营造沉浸感的畅销小说作家。请根据以下信息，为《{title}》创作当前章节的正式正文内容。

当前章节：{chapterTitle}
章节细纲：{summary}
小说角色信息：{characters}

**创作原则：**

1. **Show, don't tell（展示而非告知）**
   - 用场景、动作、对话来展现角色情感，而不是直接陈述
   - 例如：不说"他很生气"，而是写"他握紧拳头，指节发白"

2. **感官描写**
   - 在关键场景中调用至少2-3种感官（视觉、听觉、嗅觉、触觉、味觉）
   - 环境描写要服务于氛围营造，不写无意义的风景

3. **对话应有潜台词**
   - 每个角色的说话方式要符合其性格和当前情绪状态
   - 对话背后要有隐藏的目的或情感

4. **节奏控制**
   - 紧张场景：短句、快节奏、动作密集
   - 抒情场景：长句、描写细腻、留有回味空间

5. **POV一致性**
   - 全章保持统一的视角（第三人称有限视角或第一人称）
   - 不随意跨入其他角色的内心

6. **因果逻辑**
   - 每个情节行动都要有合理的动机驱动
   - 避免角色做出不符合其性格设定的行为

请开始创作正文。注意开篇第一段要有吸引力，结尾要预留悬念或情感余韵。`,
    category: 'writing',
  },
  {
    id: 'task-writing-continue',
    name: '智能逻辑续写',
    content: `你是一位严谨且富有创造力的网络小说作者。请根据以下上下文，对小说章节进行逻辑严密的续写。

本章细纲：{summary}
已写内容：{content}
小说角色信息：{characters}

**续写规则：**

1. **一致性检查（最重要）**
   - 续写前，先识别已写内容中的角色性格、说话风格、当前场景设置
   - 所有续写内容必须与已有设定保持严格一致
   - 注意时态、视角、人称的一致性

2. **因果衔接**
   - 从已写内容的最后一句话自然衔接，不要突兀跳转
   - 每个新事件/对话都要有前文的因果关系支撑

3. **推进剧情**
   - 续写必须推动细纲中规划的情节发展，不要原地打转
   - 每300-500字应有一个小的进展或情绪转变

4. **文风保持**
   - 模仿已写内容的行文风格：句式长短、用词习惯、描写密度
   - 不要突然改变叙事节奏或语调

5. **自动纠错**
   - 如果已写内容中存在明显逻辑矛盾，优先以细纲为准进行调整
   - 如果细纲与已写内容有冲突，以最近一次的有效上下文为准

请开始续写。`,
    category: 'writing',
  },
  {
    id: 'task-edit-polish',
    name: '文学性精修',
    content: `你是一位顶尖的文学编辑。请对以下正文进行专业润色，提升其文学品质。

{content}

**请重点优化以下方面：**

1. **词汇升级**：将平淡的表达替换为更生动、精准的词语，但不要过度堆砌辞藻
2. **句式变化**：调整长短句的搭配，增加排比、倒装等修辞手法，避免句式单调
3. **感官丰富**：在关键场景中补充感官细节（听觉/嗅觉/触觉），增强身临其境感
4. **节奏优化**：通过调整段落长度和标点符号，优化叙事节奏
5. **情感浓度**：在情感高潮处加强描写力度，让读者产生共情
6. **冗余删减**：删除重复表述、无意义的修饰词和拖沓的过渡段落

**润色后请附带简短的修改说明**（50字以内），概括本次润色的主要改进方向。

注意：保留原文的核心情节、角色性格和叙事视角，不要改变故事的本质内容。`,
    category: 'edit',
  },
  {
    id: 'task-summary-extract',
    name: '章节摘要提取',
    content: `请为以下章节正文提取一份专业的章节摘要。

{content}

**摘要要求：**
- 控制在100-200字以内
- 突出本章的主要情节推进和最关键的剧情转折
- 点明本章出现的新角色或新设定（如有）
- 指出本章结尾留下的悬念或伏笔
- 用简洁的文字串联起"起因→发展→结果"的完整链条

**格式：**
【主要情节】（50-80字）
【关键转折】（20-40字）
【登场角色】（列出本章主要出场角色）
【结尾悬念】（20-40字，如无则填写"——"）`,
    category: 'summary',
  },
];

export function getKnownModelSpec(modelName: string): { contextWindow?: number } {
  const known: Record<string, { contextWindow: number }> = {
    'gpt-4o': { contextWindow: 128000 },
    'gpt-4o-mini': { contextWindow: 128000 },
    'gpt-4-turbo': { contextWindow: 128000 },
    'gpt-4': { contextWindow: 8192 },
    'claude-3-5-sonnet': { contextWindow: 200000 },
    'claude-3-opus': { contextWindow: 200000 },
    'deepseek-chat': { contextWindow: 64000 },
    'deepseek-coder': { contextWindow: 64000 },
    'qwen2.5:7b': { contextWindow: 32768 },
    'qwen2.5:14b': { contextWindow: 32768 },
    'llama3.1:8b': { contextWindow: 128000 },
    'llama3.2:3b': { contextWindow: 128000 },
    'gemma2:9b': { contextWindow: 8192 },
  };
  return known[modelName] || {};
}
