/**
 * Agent 注册表
 *
 * 统一的 Agent 注册管理中心：
 * - 启动时自动注册 5 个内置 Agent（从 prompts/agents/index.ts 导入）
 * - 支持运行时注册/注销自定义 Agent
 * - 提供按类型、按关键词的过滤查询
 * - 单例模式导出
 *
 * 与外部系统的集成：
 * - systemPrompt 可被 PromptComposer 引用组合
 * - compatibleTasks 与 ModelRouter.TaskType 对齐
 * - 注册的 Agent 可被 AgentRuntime 调度执行
 */

import type { AgentDefinition, AgentFilterOptions } from './types';
import type { TaskType } from '../ModelRouter';
import { BUILT_IN_AGENTS } from '../../../../shared/prompts/agents';

// ============================================================
// 内置 Agent 的 TaskType 映射配置
// ============================================================

/**
 * AgentId → TaskType[] 映射
 *
 * 定义了每个内置 Agent 能够处理的任务类型范围。
 * 与 ModelRouter 的 TASK_TYPES 定义保持语义一致。
 */
const BUILT_IN_TASK_MAP: Record<string, TaskType[]> = {
  'agent-general': ['general', 'inspiration'],
  'agent-worldbuilder': ['world-building'],
  'agent-character': ['character'],
  'agent-plotter': ['outline', 'writing'],
  'agent-editor': ['review'],
  'agent-sub-writer': ['writing'],
  'agent-sub-reviewer': ['review'],
  'agent-sub-planner': ['outline'],
  'agent-sub-researcher': ['general'],
  'agent-sub-memory': ['memory'],
};

/**
 * AgentId → 允许的工具类别映射
 */
const BUILT_IN_TOOL_MAP: Record<string, string[]> = {
  'agent-general': ['file', 'search', 'memory', 'ai'],
  'agent-worldbuilder': ['file', 'search', 'memory'],
  'agent-character': ['file', 'search', 'memory'],
  'agent-plotter': ['file', 'search', 'memory'],
  'agent-editor': ['file', 'search'],
  'agent-sub-writer': ['file', 'memory'],
  'agent-sub-reviewer': ['file'],
  'agent-sub-planner': ['file', 'memory'],
  'agent-sub-researcher': ['search', 'memory'],
  'agent-sub-memory': ['memory'],
};

// ============================================================
// Registry 服务
// ============================================================

class AgentRegistryService {
  /** 内部存储：agentId → AgentDefinition */
  private readonly agents = new Map<string, AgentDefinition>();
  /** 内置 Agent 的 ID 集合（用于保护内置 Agent 不被删除） */
  private readonly builtInAgentIds = new Set<string>();

  constructor() {
    this.registerBuiltInAgents();
    this.registerSubAgents();
  }

  /**
   * 注册子 Agent（Writer/Auditor/Revisor 等）
   *
   * 子 Agent 是流水线专用 Agent，不来自 BUILT_IN_AGENTS，
   * 而是以独立的 prompt 文件 + 执行函数形式存在。
   */
  private registerSubAgents(): void {
    // ---- Writer Agent ----
    const writerAgent: AgentDefinition = {
      id: 'agent-sub-writer',
      name: '章节写手',
      icon: 'fa-feather',
      color: '#8b5cf6',
      description: '专注章节正文生成：根据大纲和设定创作小说章节',
      systemPrompt: `你是"墨渊灵笔"的章节写手（Writer Agent）。你的职责是：根据章节大纲和项目正典，创作高质量的小说章节正文。

## 输入信息

你会收到：
- 章节大纲（必选）：当前章节的详细大纲
- 角色档案（可选）：角色状态和动机
- 前情摘要（可选）：前一章的内容摘要
- 项目正典（可选）：世界观设定
- 风格指引（可选）：文风要求
- 用户特殊要求（可选）

## 输出规范

你必须返回结构化的章节正文，使用 Markdown 格式：

## 第 X 章 — 标题

（正文内容）

---

### 章节信息
- **字数**：XXXX 字
- **章节定位**：推进主线 / 角色成长 / 世界观展现 / 冲突爆发
- **情感基调**：紧张 / 温馨 / 悲伤 / 激昂
- **关键事件**：事件1、事件2

## 正文要求

1. 开篇前 200 字建立场景感（时间、地点、氛围）
2. 中段围绕大纲展开，避免偏离核心冲突
3. 结尾制造钩子——悬念、反转、情感余韵
4. 节奏有张有弛，高潮短句加速，抒情长句营造氛围
5. 对话符合角色性格，每人有辨识度的说话方式
6. 多感官描写，避免冗余引导词
7. 按指定视角展开，不加不必要的视角切换

## 行为准则

- 忠于大纲：不擅自改变情节走向
- 忠于设定：角色性格、世界观规则不可矛盾
- 不写元评论、不修改角色设定
- 不重复前文长段落
- 字数 2000-5000 字（按目标浮动 ±20%）`,
      compatibleTasks: BUILT_IN_TASK_MAP['agent-sub-writer'] || ['writing'],
      allowedToolCategories: BUILT_IN_TOOL_MAP['agent-sub-writer'] || ['file', 'memory'],
      maxRetries: 3,
      hiddenOfDefault: false,
    };
    this.agents.set(writerAgent.id, writerAgent);
    this.builtInAgentIds.add(writerAgent.id);

    // ---- Reviewer (Auditor) Agent ----
    const reviewerAgent: AgentDefinition = {
      id: 'agent-sub-reviewer',
      name: '审校员',
      icon: 'fa-clipboard-check',
      color: '#f59e0b',
      description: '专注章节质量审校：评估情节、角色、节奏、描写并输出修改建议',
      systemPrompt: `你是"墨渊灵笔"的章节审校员（Auditor Agent）。你的职责是：对小说章节进行结构化质量评估，输出可执行的修改建议。

## 输出规范

你必须返回结构化的审校报告，格式如下：

## 审校报告

### 总体评分
- **综合得分**：X.X / 10
- **评审结论**：通过 / 条件通过 / 需重写
- **问题总数**：N 个（严重 X 个 / 建议 Y 个）

### ⚠️ 必须修复
1. **[严重/一般]** 问题描述 — 具体修改建议

### 💡 优化建议
1. **[节奏/描写/对话/结构]** 建议描述 — 修改方向

### 分项评分
| 维度 | 得分 | 简评 |
|------|------|------|
| 情节连贯性 | X/10 | ... |
| 角色一致性 | X/10 | ... |
| 节奏控制 | X/10 | ... |
| 描写质量 | X/10 | ... |
| 对话质量 | X/10 | ... |
| 语言规范 | X/10 | ... |

### 总结
总体评价（2-3 句话）

## 评估维度
- 情节连贯性：忠于大纲？逻辑自洽？
- 角色一致性：言行符合性格？
- 节奏控制：张弛得当？
- 描写质量：画面感和多感官描写？
- 对话质量：自然且有辨识度？
- 语言规范：语法和文风统一？

## 行为准则
- 对事不对人，每条问题附具体位置和修改方向
- 区分严重程度：情节矛盾→严重，表达优化→建议
- 严重问题>3个→结论为"需重写"
- 不越权修改、不因个人喜好否定文风`,
      compatibleTasks: BUILT_IN_TASK_MAP['agent-sub-reviewer'] || ['review'],
      allowedToolCategories: BUILT_IN_TOOL_MAP['agent-sub-reviewer'] || ['file'],
      maxRetries: 3,
      hiddenOfDefault: false,
    };
    this.agents.set(reviewerAgent.id, reviewerAgent);
    this.builtInAgentIds.add(reviewerAgent.id);

    // ---- Planner Agent ----
    const plannerAgent: AgentDefinition = {
      id: 'agent-sub-planner',
      name: '大纲规划师',
      icon: 'fa-sitemap',
      color: '#f59e0b',
      description: '专注章节大纲规划：将故事骨架分解为可执行的章节大纲',
      systemPrompt: `你是"墨渊灵笔"的大纲规划师（Planner Agent）。你的职责是：根据故事大纲和项目正典，生成详细可执行的章节大纲。

## 输入信息
- 故事大纲（必选）：总体情节走向和关键节点
- 世界观设定（可选）：地理、势力、规则体系
- 角色档案（可选）：当前角色状态和关系

## 输出规范
每个章节大纲包含：
- 章节标题和定位
- 场景序列（3-5个场景）
- 关键冲突和转折点
- 出场角色及动机
- 字数目标（2000-5000字）

## 行为准则
- 保持情节连贯，伏笔在有收有放
- 每章至少有一个核心冲突
- 节奏有张有弛`,
      compatibleTasks: BUILT_IN_TASK_MAP['agent-sub-planner'] || ['outline'],
      allowedToolCategories: BUILT_IN_TOOL_MAP['agent-sub-planner'] || ['file', 'memory'],
      maxRetries: 3,
      hiddenOfDefault: false,
    };
    this.agents.set(plannerAgent.id, plannerAgent);
    this.builtInAgentIds.add(plannerAgent.id);

    // ---- Researcher Agent ----
    const researcherAgent: AgentDefinition = {
      id: 'agent-sub-researcher',
      name: '资料研究员',
      icon: 'fa-book',
      color: '#3b82f6',
      description: '专注资料查询和知识检索：为创作提供参考资料和设定核查',
      systemPrompt: `你是"墨渊灵笔"的资料研究员（Researcher Agent）。你的职责是：查询和整理创作所需的参考资料。

## 核心能力
- 搜索已有设定资料，避免前后矛盾
- 查询角色档案、世界观规则
- 整理创作所需的背景知识

## 行为准则
- 引用必须注明来源
- 不确定时说明"这属于推测"
- 保持客观，不编造事实`,
      compatibleTasks: BUILT_IN_TASK_MAP['agent-sub-researcher'] || ['general'],
      allowedToolCategories: BUILT_IN_TOOL_MAP['agent-sub-researcher'] || ['search', 'memory'],
      maxRetries: 3,
      hiddenOfDefault: false,
    };
    this.agents.set(researcherAgent.id, researcherAgent);
    this.builtInAgentIds.add(researcherAgent.id);

    // ---- Memory Agent ----
    const memoryAgent: AgentDefinition = {
      id: 'agent-sub-memory',
      name: '记忆整理专家',
      icon: 'fa-brain',
      color: '#ec4899',
      description: '专注记忆体管理：整理创作记忆，维护设定一致性',
      systemPrompt: `你是"墨渊灵笔"的记忆整理专家（Memory Agent）。你的职责是：管理创作记忆体，确保设定一致性。

## 核心能力
- 提取和整理关键设定信息
- 检测设定前后矛盾
- 维护角色、世界观的记忆图谱

## 行为准则
- 每次整理后输出变更摘要
- 检测到矛盾时标记并报告`,
      compatibleTasks: BUILT_IN_TASK_MAP['agent-sub-memory'] || ['memory'],
      allowedToolCategories: BUILT_IN_TOOL_MAP['agent-sub-memory'] || ['memory'],
      maxRetries: 3,
      hiddenOfDefault: false,
    };
    this.agents.set(memoryAgent.id, memoryAgent);
    this.builtInAgentIds.add(memoryAgent.id);
  }

  /**
   * 注册内置 Agent
   *
   * 从 `prompts/agents/index.ts` 的 BUILT_IN_AGENTS 读取 5 个内置 Agent，
   * 自动补充 compatibleTasks、allowedToolCategories 等字段。
   */
  private registerBuiltInAgents(): void {
    const entries = Object.entries(BUILT_IN_AGENTS) as Array<
      [string, { name: string; icon: string; color: string; description: string; content: string }]
    >;
    for (const [agentId, agentPrompt] of entries) {
      const agentDef: AgentDefinition = {
        id: agentId,
        name: agentPrompt.name,
        icon: agentPrompt.icon,
        color: agentPrompt.color || '#6b7280',
        description: agentPrompt.description,
        systemPrompt: agentPrompt.content,
        compatibleTasks: BUILT_IN_TASK_MAP[agentId] || ['general'],
        allowedToolCategories: BUILT_IN_TOOL_MAP[agentId] || ['file'],
        maxRetries: 3,
        hiddenOfDefault: false,
      };
      this.agents.set(agentId, agentDef);
      this.builtInAgentIds.add(agentId);
    }
  }

  // ============================================================
  // 公共 API
  // ============================================================

  /**
   * 注册一个 Agent
   *
   * @param agent - Agent 定义（所有字段必须完整）
   * @throws 如果 agentId 已存在（包括内置 Agent）则抛出错误
   *
   * @example
   * agentRegistry.register({
   *   id: 'my-custom-agent',
   *   name: '自定义 Agent',
   *   icon: 'fa-star',
   *   color: '#8b5cf6',
   *   description: '我的自定义 Agent',
   *   systemPrompt: '你是...',
   *   compatibleTasks: ['writing'],
   *   allowedToolCategories: ['file'],
   *   maxRetries: 3,
   *   hiddenOfDefault: false,
   * });
   */
  register(agent: AgentDefinition): void {
    if (this.agents.has(agent.id)) {
      throw new Error(`[AgentRegistry] Agent "${agent.id}" 已存在`);
    }
    this.agents.set(agent.id, { ...agent });
  }

  /**
   * 注册或更新 Agent
   *
   * 与 register 不同，如果 agentId 已存在则覆盖更新。
   * 可用于更新内置 Agent 的某些属性。
   *
   * @param agent - Agent 定义
   */
  registerOrUpdate(agent: AgentDefinition): void {
    this.agents.set(agent.id, { ...agent });
    // 如果更新的是内置 Agent，也从内置集合中标记
    if (BUILT_IN_AGENTS[agent.id as keyof typeof BUILT_IN_AGENTS]) {
      this.builtInAgentIds.add(agent.id);
    }
  }

  /**
   * 根据 agentId 查找 Agent
   *
   * @param agentId - Agent 唯一标识
   * @returns Agent 定义，如果未找到返回 undefined
   *
   * @example
   * const agent = agentRegistry.get('agent-general');
   * if (agent) { console.log(agent.name); }
   */
  get(agentId: string): AgentDefinition | undefined {
    return this.agents.get(agentId);
  }

  /**
   * 获取所有已注册的 Agent
   *
   * @returns Agent 定义列表（包含内置 + 自定义）
   */
  list(): AgentDefinition[] {
    return Array.from(this.agents.values());
  }

  /**
   * 根据过滤选项获取 Agent 列表
   *
   * 支持按任务类型、搜索关键词、是否包含隐藏 Agent 过滤。
   *
   * @param options - 过滤选项
   * @returns 过滤后的 Agent 定义列表
   *
   * @example
   * // 获取所有写作相关的 Agent
   * const writers = agentRegistry.listByFilter({ taskType: 'writing' });
   *
   * // 搜索名称中包含"角色"的 Agent
   * const results = agentRegistry.listByFilter({ searchQuery: '角色' });
   */
  listByFilter(options: AgentFilterOptions): AgentDefinition[] {
    let result = Array.from(this.agents.values());

    if (options.taskType) {
      result = result.filter(a => a.compatibleTasks.includes(options.taskType!));
    }

    if (!options.includeHidden) {
      result = result.filter(a => !a.hiddenOfDefault);
    }

    if (options.searchQuery) {
      const query = options.searchQuery.toLowerCase();
      result = result.filter(
        a =>
          a.name.toLowerCase().includes(query) ||
          a.description.toLowerCase().includes(query) ||
          a.id.toLowerCase().includes(query),
      );
    }

    return result;
  }

  /**
   * 按任务类型查找兼容的 Agent
   *
   * 简化版的 listByFilter，直接按任务类型过滤。
   *
   * @param taskType - 任务类型（与 ModelRouter 的 TaskType 对齐）
   * @returns 兼容该任务类型的 Agent 定义列表
   *
   * @example
   * const agents = agentRegistry.getByTask('world-building');
   * // 返回 [agent-worldbuilder]
   */
  getByTask(taskType: TaskType): AgentDefinition[] {
    return Array.from(this.agents.values()).filter(a =>
      a.compatibleTasks.includes(taskType),
    );
  }

  /**
   * 注销一个 Agent
   *
   * @param agentId - 要注销的 Agent ID
   * @returns 是否成功注销
   *   true  - 成功删除
   *   false - Agent 不存在 或 不允许注销内置 Agent
   *
   * @remarks 内置 Agent 受保护，不允许注销。
   * 尝试注销内置 Agent 会返回 false 并记录警告。
   */
  unregister(agentId: string): boolean {
    if (!this.agents.has(agentId)) {
      return false;
    }

    if (this.builtInAgentIds.has(agentId)) {
      console.warn(`[AgentRegistry] 不允许注销内置 Agent "${agentId}"`);
      return false;
    }

    return this.agents.delete(agentId);
  }

  /**
   * 获取已注册的 Agent 总数
   *
   * @returns 当前注册的 Agent 数量（包括内置 + 自定义）
   */
  getCount(): number {
    return this.agents.size;
  }

  /**
   * 检查 Agent 是否存在
   *
   * @param agentId - Agent 唯一标识
   * @returns 是否存在
   */
  exists(agentId: string): boolean {
    return this.agents.has(agentId);
  }

  /**
   * 获取内置 Agent 的数量
   */
  getBuiltInCount(): number {
    return this.builtInAgentIds.size;
  }

  /**
   * 获取所有内置 Agent 的 ID 列表
   */
  getBuiltInIds(): string[] {
    return Array.from(this.builtInAgentIds);
  }

  /**
   * 重置注册表到初始状态（测试用）
   *
   * @internal
   * 清除所有自定义 Agent 并重新注册内置 Agent（含主 Agent 和子 Agent）。
   */
  _clearForTest(): void {
    this.agents.clear();
    this.builtInAgentIds.clear();
    this.registerBuiltInAgents();
    this.registerSubAgents();
  }
}

/** AgentRegistry 全局单例 */
export const agentRegistry = new AgentRegistryService();
