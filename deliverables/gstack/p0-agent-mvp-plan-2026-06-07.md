# P0 Agent MVP 全栈规划报告

**日期**：2026-06-07
**场景**：产品评审 + 架构审查 + 可维护性评估 + 可交付性检查
**参与成员**：（因 gstack 专家 Agent 不可用，由主理人全栈分析）
- 📋 产品评审（主理人代行）
- 🏗️ 架构审查（主理人代行）
- 🔧 可维护性评估（主理人代行）
- 🚀 可交付性检查（主理人代行）

---

## 📌 TL;DR（执行摘要）

- **整体结论**：🟢 **P0 可以推进，地基很扎实，但缺的第一个实际代码还没写**
- 阻塞项：0 个技术阻塞，但有 **1 个关键决策待定**（Agent 的实现策略）
- Phase 0 交付质量超出预期 —— AgentRuntime 引擎 100 测试通过、Health 95/100，类型系统完善
- **最大风险不是技术，是范围**：P0 的"逐章确认 UI"容易做重或做轻
- 建议 **4 周内交付可运行的"写→审→改"闭环**，不做复杂 UI，先跑通逻辑

---

## 🎯 核心结论卡片

| 项目 | 内容 |
|------|------|
| Go / No-Go | 🟢 **Go** — 地基坚固，Phase 0 模块设计质量高 |
| 严重度分布 | 🟠 0 / 🟡 2 / 🟢 5+ |
| 关键行动项 | **5** 条 |
| 建议负责人 | 主理人（架构 + 实现） |
| 预估工期 | 3-4 周（需有人全职写代码） |
| 可维护性前景 | 🟢 好 —— 分层清晰，但需补充集成测试 |

---

## 1. 各维度核心结论

### 📋 产品评审 — P0 方向正确，但要防"过度设计"

P0 目标（Writer → Auditor → Revisor + 逐章确认 UI）**完全正确**。几个判断：

- **最小可行闭环**：用户输入大纲/设定 → Writer 生成章节 → Auditor 审查 → Revisor 修改 → 用户确认 → 推进到下一章。这个链路必须完整跑通，才算 P0 完成
- **"逐章确认 UI"不能做成二次开发平台**：P0 只需要展示生成结果 + 确认/拒绝按钮 + 修改建议列表。**不要**做版本对比、Diff 高亮、分支管理。那些是 P1+ 的事
- **Agent 一定是"轻代理 + 重 prompt"模式**：不要写复杂的执行代码。每个 Agent 只是一个 system prompt + 输入输出适配器，核心逻辑在 LLM prompt 里

### 🏗️ 架构审查 — 分层清晰，但缺两个关键层

**✅ 好的：**
| 层次 | 状态 | 说明 |
|------|------|------|
| 类型系统 | 🟢 完善 | AgentInput/Output/Definition/ExecutionPlan 定义清晰，类型互通 |
| 调度引擎 | 🟢 完善 | 拓扑排序 + 串行执行 + 取消 + 事件系统 + 重试 |
| 存储层 | 🟢 完善 | StepMemory CRUD + 依赖管理 + Fragment 记忆体 |
| 事件系统 | 🟢 完善 | stepStart/Complete/Fail + statusChange + progress |

**❌ 缺的（P0 必须补）：**
| 缺失层 | 优先级 | 说明 |
|--------|--------|------|
| **Agent 实现层** | P0 | 目前只有类型和注册，没有实际的 Writer/Auditor/Revisor Agent 代码 |
| **Prompt 工程层** | P0 | 没有小说创作专用的 prompt 模板（章节生成、逻辑审查、风格修改） |
| **UI 绑定层** | P0 | AgentRuntime 完全未接入 UI，进度快照未消费 |
| **集成测试** | P0 | 只有单元测试，没有 Writer→Auditor→Revisor 的端到端一次验证 |

### 🔧 可维护性评估 — 代码质量好，但有一个"地雷"

**代码质量亮点：**
- 单例模式（AgentRegistry, StepMemoryService）使用恰当
- 事件系统用 Set 存储回调，无内存泄漏风险
- 取消机制用了 CancellationToken 包装 AbortController，设计成熟
- 类型系统互相引用但不循环，结构清晰

**🔴 必须立即修的地雷：**
- `AgentRuntime.ts:428` — `markStepCompleted([step], step.index)` 传了单元素数组而不是完整的步骤数组。这在串行模式下不影响功能，但一旦启用了并行模式会直接崩溃。**建议在 P0 阶段就修掉，避免以后踩坑**

**🟡 两个需注意的低严重度遗留：**
- `AgentRuntime.ts:209` — `getChainStatus` 调用未 `await`，fire-and-forget，Chain 状态可能短暂不一致
- `DependencyResolver.ts:244-257` — `getReadyBatch` 并行模式的 `nextIndex` 追踪逻辑有问题（但当前用不到）

### 🚀 可交付性检查 — 4 周可交付，但需要全职投入

**交付物定义：**
1. 用户在 UI 中选择"Agent 写作"模式
2. 输入大纲/设定（已有功能）
3. 点击"开始写作"
4. Writer Agent 生成第一章内容
5. Auditor Agent 自动审查，返回批注列表
6. Revisor Agent 按批注修改
7. 用户在 UI 中看到三个阶段的结果，逐一确认
8. 确认后推进到第二章

**交付标准：**
- [ ] Writer Agent 能根据设定生成连贯的章节（≥500 字）
- [ ] Auditor Agent 能发现至少 3 种常见问题（逻辑矛盾/风格漂移/设定冲突）
- [ ] Revisor Agent 能按批注修改并保持原文风格
- [ ] 逐章确认 UI 展示三个阶段的输入→输出
- [ ] 用户可接受/拒绝每章结果
- [ ] 支持连续多章生成

---

## 2. 综合发现（按严重度排序）

| # | 严重度 | 类别 | 位置 | 问题描述 | 建议 | 来源 |
|---|--------|------|------|---------|------|------|
| 1 | 🟠 | Bug | AgentRuntime.ts:428 | `markStepCompleted([step], step.index)` 传单元素数组，并行模式会崩 | 保存完整 steps 数组到类属性，传入正确的数组 | 架构 |
| 2 | 🟠 | 缺失 | 全项目 | 没有任何实际 Agent 实现代码（Writer/Auditor/Revisor） | P0 第一件事就是写这三个 Agent | 产品 |
| 3 | 🟡 | 缺失 | 全项目 | 没有 prompt 模板系统 | 新建 `prompts/` 目录，放 Agent 的 system prompt | 架构 |
| 4 | 🟡 | 缺失 | 全项目 | AgentRuntime 未接入 UI | 新建 AgentWorkflow 组件消费 runtime snapshot | 产品 |
| 5 | 🟡 | 缺失 | 全项目 | 缺少端到端集成测试 | 用 mock aiService 写 Writer→Auditor→Revisor 的集成测试 | 可维护性 |
| 6 | 🟢 | 代码质量 | AgentRuntime.ts:209 | `getChainStatus` 未 await | 加 await 或移除这行 | 可维护性 |
| 7 | 🟢 | 文档 | AgentRegistry.ts | 内置 Agent 列表与架构文档的"8个子 Agent"不一致 | 对齐或更新文档 | 可维护性 |

---

## 3. 详细实现计划

### 阶段 1：修地基（1-2 天）

#### 1.1 修 markStepCompleted bug

**位置**：`AgentRuntime.ts:428`
**当前代码**：`markStepCompleted([step], step.index);`
**修复方案**：
```typescript
// 在类中保存完整步骤数组
private async executeStepsSequentially(steps, result) {
  this.executableSteps = steps; // ← 新增这行
  for (const step of steps) {
    // ...
    markStepCompleted(this.executableSteps, step.index); // ← 改这里
  }
}
```

#### 1.2 加 await + 移除 fire-and-forget

**位置**：`AgentRuntime.ts:209-210`
**修改**：加 `await` 或直接移除此调用（`getChainStatus` 在 `createChain` 内部已经执行过了）

### 阶段 2：三个 Agent 实现（1-2 周）

#### 2.1 新建 Agent 实现文件

建议放在 `src/renderer/features/agent-workflow/agents/` 目录下：

```
src/renderer/features/agent-workflow/
├── agents/
│   ├── WriterAgent.ts
│   ├── AuditorAgent.ts
│   └── RevisorAgent.ts
├── components/
│   └── AgentWorkflowPanel.tsx    # 逐章确认 UI
├── hooks/
│   └── useAgentWorkflow.ts       # 接入 AgentRuntime 的 hook
├── prompts/
│   ├── writer-prompt.txt         # Writer system prompt
│   ├── auditor-prompt.txt        # Auditor system prompt  
│   └── revisor-prompt.txt        # Revisor system prompt
└── index.ts
```

#### 2.2 Writer Agent

**职责**：接收设定+大纲+前文摘要 → 生成下一章/节内容

**输入结构**：
```typescript
interface WriterInput {
  projectSetting: string;     // 世界观/角色设定
  outline: string;            // 完整大纲
  previousChapters: string[]; // 前文摘要（前几章内容）
  chapterNumber: number;      // 当前章节号
  chapterOutline: string;     // 本章大纲
}
```

**System Prompt 核心要求**：
- 保持与已写章节在风格、语气、视角上一致
- 严格遵循前文已建立的设定（角色性格、世界规则）
- 输出长度：2000-4000 字
- 输出格式：纯文本 + 章节标题

**实现方案**：不写复杂的类，而是写一个纯函数：
```typescript
// WriterAgent.ts
import { AgentInput, AgentOutput } from '../../shared/services/agent-runtime';

export async function executeWriterAgent(input: AgentInput): Promise<AgentOutput> {
  // 1. 从 context 中提取项目设定、大纲、前文
  // 2. 组装 system prompt + user prompt
  // 3. 调用 aiService
  // 4. 解析返回内容，构造 AgentOutput
  // 5. 写入 memoryUpdates（章节摘要）
}
```

#### 2.3 Auditor Agent

**职责**：审查已生成的内容，返回批注列表

**System Prompt 核心要求**：
- 检查以下方面：
  1. ✅ **逻辑一致性**（前后矛盾、时间线错误）
  2. ✅ **设定一致性**（角色能力、世界观规则）
  3. ✅ **风格连续性**（语气、视角、时态）
  4. ✅ **叙述节奏**（拖沓/跳跃/失衡）
- 输出格式：结构化的批注列表
- 每个批注需标注：**严重度（P0/P1/P2）**、**位置**、**问题描述**、**修改建议**

#### 2.4 Revisor Agent

**职责**：按批注修改原文，输出修订版

**System Prompt 核心要求**：
- 逐条处理批注，不遗漏
- 修改后保持原文风格
- 输出格式：完整修订版（非 diff）
- 附上修改说明：改了哪里、为什么改

### 阶段 3：注册与绑定（2-3 天）

#### 3.1 注册到 AgentRegistry

```typescript
agentRegistry.register({
  id: 'agent-sub-writer',
  name: '章节写手',
  icon: 'fa-feather-pointed',
  color: '#10b981',
  description: '根据设定和大纲生成小说章节',
  systemPrompt: '', // 从 prompts/ 加载
  compatibleTasks: ['writing'],
  allowedToolCategories: ['memory', 'ai'],
  maxRetries: 2,
  hiddenOfDefault: true,
});
```

#### 3.2 新建 Workflow 执行计划

```typescript
const plan: AgentExecutionPlan = {
  chainId: `chapter-${chapterNumber}`,
  steps: [
    {
      agentId: 'agent-sub-writer',
      input: {
        stepId: `write-ch${chapterNumber}`,
        userRequest: `生成第 ${chapterNumber} 章`,
        context: { ... },
        messages: [],
      },
      dependsOn: [],
    },
    {
      agentId: 'agent-sub-reviewer',  // Auditor
      input: {
        stepId: `audit-ch${chapterNumber}`,
        userRequest: `审查第 ${chapterNumber} 章`,
        context: { ... },
        messages: [],
      },
      dependsOn: [`write-ch${chapterNumber}`],
    },
    {
      agentId: 'agent-sub-writer',  // Revisor (可复用 Writer Agent，prompt 不同)
      input: {
        stepId: `revise-ch${chapterNumber}`,
        userRequest: `修改第 ${chapterNumber} 章`,
        context: { ... },
        messages: [],
      },
      dependsOn: [`audit-ch${chapterNumber}`],
    },
  ],
};
```

> **设计决策**：Revisor 可以复用 Writer Agent（system prompt 不同），也可以独立一个 Agent。建议 P0 阶段**用一个 Agent + 不同 prompt**，减少类型膨胀。

### 阶段 4：逐章确认 UI（1 周）

#### 4.1 UI 组件设计

```
┌─────────────────────────────────────────┐
│  📝 第 3 章：暗流涌动                      │
│  ┌─────────────────────────────────────┐ │
│  │  写稿阶段 ✅                          │ │
│  │  [内容展示区域 - 只读]                  │ │
│  └─────────────────────────────────────┘ │
│  ┌─────────────────────────────────────┐ │
│  │  审查阶段 ✅  3 条批注                 │ │
│  │  P0 🔴 第2段: 与设定矛盾 (角色不会火系) │ │
│  │  P1 🟡 第5段: 节奏拖沓                  │ │
│  │  P2 🟢 第8段: 语病"的"字过多            │ │
│  └─────────────────────────────────────┘ │
│  ┌─────────────────────────────────────┐ │
│  │  修改阶段 ✅                           │ │
│  │  [修订版展示 - 带修改标注]               │ │
│  └─────────────────────────────────────┘ │
│  [确认该章]  [退回修改]  [跳过]            │
└─────────────────────────────────────────┘
```

**P0 版本只做三个卡片叠加展示，不做 Diff 高亮、不做版本对比。** 每张卡片显示三块：
1. Writer 原始输出
2. Auditor 批注列表（3 级严重度用颜色区分）
3. Revisor 修订版（简单标注"已修改"的位置）

交互：
- **[确认该章]** → 写入 project chapters，推进到下一章
- **[退回修改]** → 重新走一遍 Revisor（保留批注，增加"人工补充批注"功能）
- **[跳过]** → 跳过本章，推进到下一章（不写入正式章节）

#### 4.2 Hook: useAgentWorkflow

```typescript
function useAgentWorkflow(projectId: string) {
  // 创建 AgentRuntime 实例
  // 注册事件监听
  // 返回：{ execute, snapshot, result, isRunning, cancel }
}

// 使用方式
const { execute, snapshot, result, isRunning } = useAgentWorkflow(projectId);
// snapshot.currentAgentId → 当前执行到哪个 Agent
// snapshot.completedSteps / totalSteps → 进度
// snapshot.status → 'running' | 'completed' | 'failed'
```

### 阶段 5：集成测试 + 调试（3-5 天）

必须写的测试：
| 测试 | 类型 | 说明 |
|------|------|------|
| Writer 生成测试 | 单元 | Mock aiService，验证输出结构 |
| Auditor 批注测试 | 单元 | Mock aiService，验证批注格式 |
| Revisor 修改测试 | 单元 | Mock aiService，验证修改版格式 |
| 三阶段集成测试 | 集成 | Mock aiService，验证完整流程 |
| UI 交互测试 | 组件 | 验证确认/退回/跳过交互 |
| 多章连续测试 | 集成 | 验证 chainId 传递和记忆体写入 |

---

## 4. 关键设计决策

### 决策 1：Agent 是"轻函数"还是"重类"？

**建议**：轻函数（纯函数式）

```
// ✅ 推荐
export async function executeWriter(input: AgentInput): Promise<AgentOutput> { ... }

// ❌ 不推荐（过度设计）
export class WriterAgent extends BaseAgent { ... }
```

原因：Agent 的核心是 prompt，不是逻辑。函数式对单元测试更友好，树摇更干净。

### 决策 2：Revisor 复用 Writer 还是独立 Agent？

**P0 建议**：**同一个 Agent ID + 不同 prompt 上下文**

```typescript
// Writer 阶段：prompt = write-prompt + settings + outline
// Revisor 阶段：prompt = revise-prompt + original + auditComments

// 通过 AgentInput.options 传递阶段标识
input.options = { phase: 'write' | 'revise' }
```

P1 如果 prompt 差异太大再拆分。P0 保持简洁。

### 决策 3：逐章确认 UI 用什么框架？

**建议**：直接在当前 App 上新增一个 step（`agent`），不弹窗、不新开窗口。

```typescript
// App.tsx 新增一个 step
const STEPS = [
  { id: 'inspiration', label: '灵感萌发', icon: 'fa-lightbulb' },
  { id: 'content', label: '内容设定', icon: 'fa-folder-tree' },
  { id: 'plot', label: '情节创作', icon: 'fa-pen-nib' },
  { id: 'agent', label: 'Agent写作', icon: 'fa-robot' }, // ← 新增
  { id: 'review', label: '智能审查', icon: 'fa-search' },
];
```

### 决策 4：是否用 StepMemory 存储每一步？

**建议**：**用**。AgentRuntime 已经集成了 StepMemory，每步自动创建 Step、写入输出、写 memoryUpdates。这为后续的"打断恢复"（崩溃后从失败步骤继续）打下基础。

---

## 5. 风险登记册

| # | 风险 | 概率 | 影响 | 缓解措施 |
|---|------|------|------|---------|
| 1 | **LLM 生成质量不可控**（长文后情节跑偏、角色 OOC） | 🟡 中 | 🟠 大 | Auditor 设 P0 级"设定一致性检查"；人工确认兜底 |
| 2 | **逐章确认 UI 做得太重**（加入 Diff/分支/版本管理） | 🟡 中 | 🟡 中 | 明确 P0 边界：只做三卡片展示+三按钮；拒绝的功能移入 Roadmap |
| 3 | **长篇文章的上下文窗口膨胀** | 🟠 高 | 🟡 中 | 前文摘要策略：只传关键事件摘要 + 角色当前状态，不传全文 |
| 4 | **重复生成消耗 Token**（退回修改时可能从头重跑） | 🟡 中 | 🟢 低 | 退回修改只重跑 Revisor（保留 Writer 输出和 Auditor 批注） |
| 5 | **AgentRuntime 引擎在真实 LLM 调用中超时** | 🟡 中 | 🟠 大 | 已有 120s 超时保护；如需更长文本可配置超时参数 |

---

## 6. 可维护性保障措施

### 6.1 现在就该做的事

关于可维护性，除了修掉那个 `markStepCompleted` bug，还有几件性价比极高的事建议在 P0 阶段顺手做了：

1. **补一行代码**：`AgentRuntime.ts:209` 的 `getChainStatus` 加 `await` 或移除
2. **给 AgentRegistry 增加 listByAgentId 缓存**：当前每次 `getAgent` 都遍历列表，P0 阶段 Agent 数量少不是问题，但养成好习惯
3. **prompt 外部化**：所有 Agent 的 system prompt 放到 `.txt` 或 `.ts` 常量文件里，不要在代码里硬编码。这样后续改 prompt 不用改代码

### 6.2 P0 阶段的长期负债清单

| 负债项 | 严重度 | 何时还 |
|--------|--------|--------|
| `markStepCompleted` 传参错误 | 🟠 | **P0 必须还**（不然 P1 并行模式直接崩） |
| 没有 StepRunner 单元测试 | 🟡 | 建议 P0 补上 |
| 并行模式 `getReadyBatch` 未测试 | 🟡 | 建议 P1 前补上 |
| 无 E2E 测试 | 🟡 | P0 至少写一个集成测试 |

### 6.3 代码审查清单（供后续 PR 用）

每当提交 Agent 相关代码时，检查：
- [ ] Agent 实现是否为纯函数？（不是类继承）
- [ ] System prompt 是否在单独文件/常量中？（不是硬编码在函数体里）
- [ ] 是否注册到 AgentRegistry？（不是手动 import/require）
- [ ] 输入输出是否符合 AgentInput/AgentOutput 类型？
- [ ] 是否通过 StepMemory 写入了 memoryUpdates？（否则后续 Agent 看不到上下文）
- [ ] 单元测试是否覆盖了正常路径 + 错误路径？

---

## 7. 实施路线图

| 周 | 重点 | 交付物 |
|----|------|--------|
| **W1** | 修 bug + Writer Agent 核心 | 修 markStepCompleted + 写 Writer prompt + executeWriter 函数 |
| **W2** | Auditor + Revisor + 注册 | Audit prompt + Revise prompt + 注册到 Registry |
| **W3** | 逐章确认 UI | AgentWorkflowPanel + useAgentWorkflow hook + App.tsx 集成 |
| **W4** | 集成测试 + 调试调优 | 三阶段集成测试 + 调试 + 手动走一遍完整流程 |

---

## 8. 结论

Phase 0 的 StepMemory + AgentRuntime 引擎是一个**出乎意料扎实的地基**。框架完整、类型安全、测试充分、扩展性好。P0 要做的事看起来很繁，但实际核心工作量就三样：

1. **写 3 个 prompt 模板**（Writer/Auditor/Revisor）
2. **写 3 个执行函数**（每个 50-100 行）
3. **写 1 个 UI 组件**（三卡片展示 + 三个按钮）

剩下都是胶水代码。**4 周交付是可行的**，前提是：

- 不做过重的 UI（P0 的 UI 就是三卡片 + 三按钮）
- 不纠结 Agent 代码的"框架化"（函数式就够了，不需要基类/抽象类）
- prompt 质量直接决定产品质量，建议多迭代几轮

**关键下一步：写 Writer Agent 的第一个 prompt。** 这是整个 P0 的起点——没有它能生成什么，后面全白搭。

---

## ⚠️ 待完善 / 已知局限

- 本报告未做实际的 UI 原型验证（需要开发人员在实际的 App.tsx 中集成测试）
- prompt 模板未经过真实 LLM 测试，需要写出来后实际跑一遍迭代
- AgentRuntime 与 AIAssistantPanel 的交互尚未设计——当前右侧有 AI 助手面板，Agent 模式启动后如何与之共存需要确认

---

> 本报告由主理人沽思航（Gu）全栈分析产出。由于 gstack 团队专家 Agent（product-reviewer）在本环境中不可用，所有专业审查维度由主理人基于代码阅读理解代行。决策关键点由工程负责人复核。
