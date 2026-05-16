import { RulePrompt } from '../types';

export const RULE_PROMPTS: Record<string, RulePrompt> = {

  'role-type-tag': {
    id: 'rule-role-type-tag',
    layer: 'rule',
    ruleId: 'role-type-tag',
    name: '角色类型强制标注规则',
    autoApplyForTasks: ['char-single', 'char-overview', 'char-build'],
    autoApplyForAgents: ['agent-character', 'agent-general'],
    content: `## 🏷️ 角色文件必须有类型标记！

创建角色文件时，内容第一行必须是：
【角色类型：主角/女主/反派/反派配角/配角】

**这是关系图谱正确分类的唯一依据，不可省略。**

**根据角色在故事中的实际定位选择类型：**
- 主角=核心驱动者（通常1-2人）
- 女主=女性核心角色
- 反派=主要对手（通常1-2人）
- 反派配角=反派的下属/帮凶
- 配角=其他辅助角色（数量最多）

**严禁把所有角色都标为配角！** 一个项目通常只有1个主角+1个女主+1-2个反派，其余才是配角。
`,
  },

  'detail-level': {
    id: 'rule-detail-level',
    layer: 'rule',
    ruleId: 'detail-level',
    name: '大纲详细程度三级控制',
    autoApplyForTasks: ['outline-gen', 'outline-detailed'],
    autoApplyForAgents: ['agent-plotter'],
    content: `## ⚠️ 详细程度控制（最重要！）

**大纲 ≠ 细纲 ≠ 正文！** 必须严格区分三个层级：

| 层级 | 字数/章 | 包含内容 | 禁止内容 |
|------|---------|---------|---------|
| 大纲 | 30-80字 | 核心事件+转折+结果 | 对话/描写/内心活动/冲突分析 |
| 细纲 | 200-500字 | 情节要点+冲突设计+伏笔 | 完整场景/大段对话 |
| 正文 | 2000+字 | 完整场景/对话/描写 | — |

**判断规则：**
- 用户说"大纲/完善大纲" → 大纲层级（30-80字/章）
- 用户说"细纲/详细大纲" → 细纲层级（200-500字/章）
- **大纲中禁止写**：关键对话、场景描写、角色内心活动、冲突点分析、角色动态——这些属于细纲

**大纲正确示例：**
"第5章：叶冰凝偶遇沈剑心取药，沈剑心被她的眼神震惊，半信半疑。"

**大纲错误示例（禁止！）：**
写核心情节+冲突点+角色动态+关键对话+伏笔（这是细纲，不是大纲！）
`,
  },

  'task-focus': {
    id: 'rule-task-focus',
    layer: 'rule',
    ruleId: 'task-focus',
    name: '任务聚焦原则',
    autoApplyForAgents: ['agent-worldbuilder', 'agent-character', 'agent-plotter', 'agent-editor'],
    content: `## 🎯 任务聚焦原则

- **只关注用户指令中明确提到的文件夹**
- 用户说"完善大纲"→ 只操作 outline 文件夹，禁止去创建时间线/角色/世界观文件
- 用户说"完善角色"→ 只操作 characters 文件夹
- **禁止主动跨文件夹操作**——除非用户明确要求同时处理多个文件夹
- **完成当前任务后再考虑其他任务**——不要在中途跑去处理无关文件夹
- **可以读取其他文件夹作为参考**（read_folder/read_file），但**禁止在非目标文件夹创建文件**
`,
  },

  'canon-consistency': {
    id: 'rule-canon-consistency',
    layer: 'rule',
    ruleId: 'canon-consistency',
    name: '正典一致性检查',
    autoApplyForAgents: ['agent-general', 'agent-worldbuilder', 'agent-character', 'agent-plotter'],
    content: `## ⭐ 正典系统

⭐ 标记的文件是**正典（已定稿）**，是唯一事实来源。

- 正典设定**绝对不可违背**
- 生成新内容前**必须先对照正典**
- **禁止擅自修改正典**——除非用户明确要求
- 非正典文件（无 ⭐）是草稿，**禁止读取和参考**

## 一致性自检（每次生成后必须执行）

1. 角色行为、性格、关系是否与正典一致？
2. 世界观规则是否被违背？
3. 时间线顺序是否冲突？
4. 情节是否与正典矛盾？

回复末尾标注：⚠️ 一致性检查：通过 / ⚠️ 发现冲突：…
`,
  },

  'file-uniqueness': {
    id: 'rule-file-uniqueness',
    layer: 'rule',
    ruleId: 'file-uniqueness',
    name: '文件唯一性约束',
    autoApplyForTasks: ['outline-gen', 'world-build', 'timeline-frame'],
    autoApplyForAgents: ['agent-worldbuilder', 'agent-plotter', 'agent-general'],
    content: `## 📁 文件组织规则

### 大纲（outline）→ 1 个完整文件
**大纲只能有1个文件！** 所有章节必须写在同一个文件里。
用 update_file 更新已有大纲文件，禁止创建多个大纲文件。
如果误创建了多余的大纲文件，用 delete_file 删除碎片文件。
**禁止**把大纲拆成"第一卷大纲"、"第二卷大纲"或多个章节文件。

### 角色（characters）→ 一人一卡
文件名=角色名。每个角色一个独立文件。

### 时间线（timeline）→ 一事件一卡
每个关键事件 1 个文件，按故事顺序排列。
`,
  },
};

export function getRulePrompt(ruleId: string): RulePrompt | undefined {
  return RULE_PROMPTS[ruleId];
}

export function getAutoRulesForTask(taskId: string): RulePrompt[] {
  return Object.values(RULE_PROMPTS).filter(
    r => r.autoApplyForTasks?.includes(taskId as any)
  );
}

export function getAutoRulesForAgent(agentId: string): RulePrompt[] {
  return Object.values(RULE_PROMPTS).filter(
    r => r.autoApplyForAgents?.includes(agentId as any)
  );
}
