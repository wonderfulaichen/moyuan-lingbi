# 墨渊灵笔 — 代码健康检查 & Phase 0 技术摸底报告

**日期**: 2026-06-05  
**项目路径**: `D:\Office software\Development Project\moyuan-lingbi`  
**总文件数**: 168 个 TS/TSX 源文件  
**分析范围**: src/ 全目录  

---

## 目录

1. [现有 AI 助手模块](#1-现有-ai-助手模块)
2. [StepMemory / 持久化雏形](#2-stepmemory--持久化雏形)
3. [AI 接口层](#3-ai-接口层)
4. [代码整体健康度](#4-代码整体健康度)
5. [Phase 0 落地可行性评估](#5-phase-0-落地可行性评估)
6. [技术债务汇总](#6-技术债务汇总)
7. [Phase 0 执行方案建议](#7-phase-0-执行方案建议)

---

## 1. 现有 AI 助手模块

### 1.1 文件分布

AI 助手模块分为三层：

**核心服务层**（`src/renderer/shared/services/`）：

| 文件 | 行数 | 职责 |
|------|------|------|
| `ai-assistant/index.ts` | 1232 | AIAssistantService 单例 — 状态管理、对话、Agent 切换 |
| `ai-assistant/processWithAI.ts` | 1109 | Agent Loop：迭代式分析→规划→执行→完成 |
| `ai-assistant/ToolParser.ts` | 353 | 解析 AI 输出中的 ````tool` JSON 块 |
| `ai-assistant/UnifiedExecutor.ts` | 409 | 统一执行器：create/update/delete/search/read 等操作 |
| `ai-assistant/PlanExecutor.ts` | 143 | 多步骤计划的执行器 |
| `ai-assistant/contextBuilder.ts` | 304 | 上下文构建：VFile 文件树、项目元数据、目标检测 |
| `ai-assistant/contextCompress.ts` | 119 | 上下文压缩：AI 摘要或截断 |
| `ai-assistant/systemPrompt.ts` | 87 | 内置 Agent 定义 + 系统提示词 |
| `ai-assistant/detectAgentState.ts` | — | 状态机检测 |
| `aiService.ts` | 638 | LLM 统一调用层（流式/非流式） |
| `ModelRouter.ts` | 321 | 模型路由：按任务类型分配模型 |
| `AIAssistantService.ts` | 1 | 仅为 `export { aiAssistant } from './ai-assistant'` |

**状态管理层**（`src/renderer/shared/stores/`）：

| 文件 | 职责 |
|------|------|
| `aiStore.ts` | Zustand store，同步 AIAssistantService 状态到 UI |
| `aiStatusStore.ts` | AI 运行状态存储 |

**提示词系统**（`src/shared/prompts/`）：

| 文件 | 职责 |
|------|------|
| `index.ts` | PromptComposer — 分层提示词组合器 |
| `types.ts` | 类型定义：AgentId, TaskId, FormatId, RuleId |
| `agents/index.ts` | 5 个 Agent 的完整 system prompt（各约500字） |
| `tasks/index.ts` | 任务提示词模板（大纲/写作/润色等） |
| `formats/index.ts` | 输出格式定义 |
| `rules/index.ts` | 规则提示词 |
| `foundation/index.ts` | 基础规则：文件操作、正典系统 |
| `foundation/toolFormat.ts` | 工具调用格式指令 |
| `foundation/workflow.ts` | Agent Loop 工作流程指令 |
| `userOverrides.ts` | 用户自定义覆盖 |

### 1.2 System Prompt 机制

**系统提示词采用分层组合架构**（`PromptComposer.compose()`），共 5 层：

1. **基础层**（foundation）：工具调用格式 + 回复模式 + 工作流 + 自主执行规则 + 文件规则 + 正典系统
2. **角色层**（agent）：当前 Agent 的身份提示（通用/世界观/角色/剧情/润色）
3. **任务层**（task）：具体任务的提示词模板
4. **格式层**（format）：输出格式规范
5. **规则层**（rule）：自动附加的规则

关键文件：`src/shared/prompts/index.ts:41-128` — `PromptComposer.compose()`

对于 AI 助手主对话，调用路径为：
```
processWithAI.ts:131 → PromptComposer.composeForAssistant({agentId, projectContext, fileTreeDescription})
```

**内置 5 个 Agent**（`src/shared/prompts/agents/index.ts`）：
- `agent-general`（通用助手）
- `agent-worldbuilder`（世界观架构师）
- `agent-character`（角色设计师）
- `agent-plotter`（剧情策划师）
- `agent-editor`（文字润色师）

Agent 系统提示在 UI 侧还有一份备份（`systemPrompt.ts`），但 `PromptComposer` 使用 `agents/index.ts` 的版本，两者内容一致。

### 1.3 对话历史管理

**存储路径**：`AIAssistantService` → `persistConversations()` → `localStorage` + 文件系统

**管理逻辑**（`ai-assistant/index.ts:1025-1080`）：
- 每个项目最多保留 20 条对话（`MAX_CONVERSATIONS = 20`）
- 每条对话保留近 40 条完整消息，更早的截断至 150 字符摘要
- 超出 4MB 警告，缩减到 5 条对话
- 自动保存间隔：5 秒（`setInterval(() => this.flushSave(), 5000)`）
- Electron 环境：额外写入 `appDataPath/moyuan-ai-conversations-{projectId}.json`

**传递机制**：
- `AIAssistantService` 维护完整消息列表 `this.state.messages`
- 每次 AI 调用前，`processWithAI.ts:166` 调用 `compressHistoryIfNeeded()` 压缩历史
- 压缩逻辑：估算 token → 超过预算 80% → AI 摘要或截断

### 1.4 当前 LLM 模型

**支持的提供商**（`src/shared/constants/index.ts:104-138`）：
- OpenAI Compatible（默认 `gpt-4o`，128K 上下文）
- DeepSeek（`deepseek-chat`，64K 上下文）
- Ollama 本地（`qwen2.5:7b`，32K 上下文）
- 本地 GGUF（`local-model`，4K 上下文）

**默认模型**：`deepseek-chat`（实际由 `INITIAL_MODELS` 第一条决定）

**调用层**：`aiService.ts` 的 `generateStream()` 和 `generate()` 方法

### 1.5 上下文窗口管理

已有完善的上下文压缩机制（`contextCompress.ts`）：
1. Token 估算（`contextBuilder.ts:296-304`）：中文字符 ×2，英文字符 ×0.25
2. 预算计算（`processWithAI.ts:161-164`）：`contextWindow - systemTokens - maxOutputTokens - 500`
3. 压缩触发阈值：超过预算的 80%
4. 三种压缩策略：
   - AI 摘要（调用 LLM 压缩早期对话）
   - 简单截断（保留最近 4 条）
   - 增量合并

---

## 2. StepMemory / 持久化雏形

### 2.1 整体存储架构

```
storage layer (storage.ts)
  ├── localStorage                    ← 主存储（5MB 限制警告）
  ├── StorageProvider (抽象接口)       ← 平台适配层
  │   ├── ElectronStorageProvider      ← Electron: fs + localStorage
  │   └── IndexedDBStorageProvider     ← Web/Android: IndexedDB + localStorage
  └── DataService                      ← 数据访问门面
       ├── AppData (全应用状态)         ← 项目列表、模型配置、VFile 系统
       ├── VFileSystem                 ← 文件系统（树状结构）
       └── memoryBankService           ← 记忆体子系统
```

### 2.2 VFile 系统（核心存储模型）

`VFile` 是项目内容的基本单元，定义在 `src/shared/types/fileSystem.ts:1-29`：
```typescript
interface VFile {
  id: string;
  name: string;
  type: 'folder' | 'file';
  parentId: string | null;
  content: string;
  metadata: VFileMetadata;
  childrenIds: string[];
  // ...
}
```

每个项目拥有独立的 `VFileSystem`（`{ files: Record<string, VFile>, rootIds: string[] }`）。

**根文件夹类型**（`DataService.createDefaultProject()`）：
- 世界观（world）
- 角色（characters）
- 时间线（timeline）
- 大纲（outline）
- 细纲（detailed_outline）
- 章节（chapters）

### 2.3 项目状态管理

**AppData 结构**（`src/shared/types/fileSystem.ts:253-262`）：
```typescript
interface AppData {
  projects: ProjectMeta[];
  activeProjectId: string | null;
  models: ModelConfig[];
  prompts: PromptTemplate[];
  activeModelId: string;
  fileSystems: Record<string, VFileSystem>;
  modelRouting?: Record<string, string>;
}
```

**自动保存机制**：
- `DataService`：每次变更后 150ms 防抖自动保存到 localStorage
- `AIAssistantService`：每 5 秒自动保存对话到 localStorage + 文件系统

### 2.4 记忆体系统（Memory Bank）

`MemoryBankService`（1339 行）是已有的"持久化雏形"，已实现：

- **原子记忆**（AtomicMemory）：世界观规则、角色档案、剧情线索、伏笔
- **动态记忆**（DynamicMemory）：当前章进度、张力水平、活跃剧情线
- **向量记忆**（VectorMemory）：语义检索（embedding 占位，实际未使用）
- **维护 Agent**（MemoryMaintenanceAgent）：AI 提取章节信息、一致性检查
- **文件系统同步**：`syncFromFileSystem()` 自动同步 VFile 到记忆体

**存储方式**：Electron 环境下写入 `{appData}/memory-bank/{projectId}/atomic.json` 等文件

**已有概念"StepMemory"的定义**：目前没有独立名为"StepMemory"的模块，但 `MemoryBankService` + `MemoryMaintenanceAgent` 已实现类似功能。

---

## 3. AI 接口层

### 3.1 接口封装结构

```
aiService.ts (统一调用层)
  ├── generate()           ← 非流式调用
  ├── generateStream()     ← 流式调用（主要路径）
  ├── generateWithContext() ← 带正典上下文的调用
  ├── testConnection()      ← 连接测试
  └── fetchAvailableModels() ← 模型列表获取

ModelRouter.ts (模型路由)
  └── getModelForTask(taskType, availableModels, fallbackModel)
       ├── 基于任务类型的模型路由
       ├── 12 种任务类型（general ~ agent-researcher）
       └── 支持用户自定义路由
```

### 3.2 流式处理

`aiService.ts:139-208` — `parseChatCompletionsStream()`：
- 标准 SSE 解析（`data: {...}`）
- 支持 DeepSeek 特有的 `reasoning_content` / `thinking` 字段
- 实时回调 content 和 reasoningContent
- 5 分钟超时（300000ms）

### 3.3 API Key 管理

- 存储：`DataService` 使用 XOR 加密（`encryptApiKey/decryptApiKey`，密钥 `moyuan-lingbi-v1`）
- 读时解密：`getActiveModel()` 和 `getModels()` 调用 `decryptApiKey`
- 写时加密：`updateModels()` 调用 `encryptApiKey`
- 传输：`aiService.buildChatCompletionsRequest()` 使用 `Bearer {apiKey}`

### 3.4 现有 Agent 路由 vs 子 Agent 路由需求

**已有 Agent 路由**（用户可见）：
- 5 个内置 Agent，用户可切换
- 每个 Agent 有独立的 system prompt 和 `BUILT_IN_AGENTS` 定义
- 通过 `switchAgent(agentId)` 切换

**模型路由**（任务类型 → 模型）：
- `ModelRouter` 支持 12 种任务类型，可独立配置模型
- 存储为 `AppData.modelRouting` 字典

**承接子 Agent 路由的能力**：
- `ModelRouter` 已预定义了 agent 系列任务类型（`agent-planner`, `agent-writer`, `agent-reviewer`, `agent-memory`, `agent-researcher`）
- 但这些尚未与实际的执行器连接
- 当前的 `processWithAI` 是单 Agent 循环，没有子 Agent 调度

---

## 4. 代码整体健康度

### 4.1 src/ 目录结构

```
src/
├── assets/                         # 静态资源
├── main/                           # Electron 主进程
├── renderer/                       # 渲染进程（React 应用）
│   ├── index.tsx                   # 入口
│   ├── app/
│   │   ├── App.tsx                 # 主应用组件
│   │   ├── app-shell/              # 应用壳
│   │   │   ├── AIAssistantPanel.tsx
│   │   │   ├── Sidebar.tsx
│   │   │   ├── FileExplorer.tsx
│   │   │   └── ai-assistant/      # AI 助手 UI 组件
│   │   │       ├── components/
│   │   │       └── hooks/
│   │   ├── mobile/                 # 移动端适配
│   │   └── components/             # 通用组件
│   ├── features/                   # 功能模块
│   │   ├── characters/             # 角色塑造
│   │   ├── plot/                   # 情节创作
│   │   ├── writing/                # 正文写作
│   │   ├── inspiration/            # 灵感模块
│   │   ├── memory/                 # 记忆体/记忆网络
│   │   ├── settings/               # 设置
│   │   ├── pomodoro/               # 番茄钟
│   │   ├── review/                 # 审阅
│   │   ├── world/                  # 世界观
│   │   ├── chapters/               # 章节管理
│   │   ├── achievements/           # 成就系统
│   │   └── settings/               # 设置
│   └── shared/                     # 共享层
│       ├── services/               # 业务服务（AI、存储、记忆体等）
│       │   ├── ai-assistant/       # AI 助手服务（7 个模块文件）
│       │   ├── storage/            # 存储提供者
│       │   ├── memory-bank/        # 记忆体维护
│       │   └── ...                 # 其他服务
│       ├── stores/                 # Zustand 状态管理
│       ├── hooks/                  # React Hooks
│       ├── contexts/               # React Contexts
│       ├── components/             # 共享 UI 组件
│       ├── modules/                # 模块系统
│       └── data/                   # 数据（changelog）
├── shared/                         # 跨进程共享
│   ├── types/                      # 类型定义
│   ├── prompts/                    # 分层提示词系统
│   │   ├── agents/                 # Agent 定义
│   │   ├── tasks/                  # 任务提示词模板
│   │   ├── formats/                # 输出格式
│   │   ├── rules/                  # 规则
│   │   ├── foundation/             # 基础层
│   │   └── analysis/               # 分析提示词
│   └── constants/                  # 常量（模型、提供商、初始状态）
└── test/                           # 测试
```

### 4.2 TODO 分布

项目中有 2 个 TODO 位置，仅 3 行，整体注释管理良好。

### 4.3 模块耦合分析

**强耦合关系**：

```
DataService ←→ MemoryBankService (双向依赖)
DataService ←→ AIAssistantService (依赖)
AIAssistantService ←→ aiService (依赖)
AIAssistantService ←→ PromptComposer (依赖)
processWithAI ←→ memoryBankService (深入集成)
```

**关键发现**：
1. **`DataService` 是中心枢纽** — 几乎所有服务都依赖它
2. **`AIAssistantService` 和 `DataService` 职责过重** — 前者 1232 行，后者 659 行，都承担了过多职责
3. **`MemoryBankService`（1339 行）存在维护困难风险** — 包含存储、同步、解析、AI 分析等杂糅职责
4. **`processWithAI.ts`（1109 行）过于集中** — Agent Loop 状态机、上下文构建、工具执行、错误处理全部在一个文件

### 4.4 可直接复用的模块

| 模块 | 复用价值 | 备注 |
|------|---------|------|
| `StorageProvider` 接口 | 🔵 高 | 已有平台适配抽象，可直接用于 StepMemory |
| `VFile` 数据模型 | 🔵 高 | 树状文件结构完全适用于 StepMemory 节点 |
| `ModelRouter` | 🔵 高 | 按任务类型路由已支持 agent 系列，扩展性佳 |
| `PromptComposer` | 🔵 高 | 分层提示词组合可复用于子 Agent |
| `ToolParser` | 🔵 高 | tool JSON 解析可直接用于 Agent 工具调用 |
| `UnifiedExecutor` | 🔵 高 | 文件操作统一执行层 |
| `memoryBankService.syncFromFileSystem` | 🟡 中 | 可改造为 StepMemory 的数据源 |
| `MemoryMaintenanceAgent.extractFromChapter` | 🟡 中 | AI 提取逻辑可复用 |

---

## 5. Phase 0 落地可行性评估

### 5.1 StepMemory 基础存储/召回 — 可用性

**可以直接用的部分**：
- ✅ `StorageProvider` 抽象（支持文件系统和 IndexedDB）— 可复用为 StepMemory 持久化层
- ✅ `VFile` + `VFileSystem` — 树状节点结构完全匹配 Step 数据模型
- ✅ `dataService.getFile/updateFile/searchFiles` — 现成的 CRUD 操作
- ✅ `memoryBankService.buildContextFromMemorySync` — 已有的上下文召回机制

**需要改造的部分**：
- 🔧 `MemoryBankService` 需重构为 `StepMemoryService` — 当前记忆体是"AI 图书馆"定位，需改为"子 Agent 共享状态"
- 🔧 当前 `syncFromFileSystem` 理念正确但与 Phase 0 的"存储即 Agent 共享内存"有一层抽象差距
- 🔧 需要添加 Step 版本控制（已有 `MemoryVersionControl` 可参考）

**需要重写的部分**：
- ❌ 当前没有"子 Agent 写入 Step"的接口 — Agent Loop 直接调用 `UnifiedExecutor` 修改 VFile，没有 Step 抽象中介
- ❌ 没有 Step 间依赖/编排逻辑

### 5.2 Agent 接口规范 — 可用性

**可以直接用的部分**：
- ✅ `PromptComposer` 分层组合架构 — Agent 提示词生产可以直接复用
- ✅ 已有 `AgentId`、`AIAgent` 类型定义
- ✅ `AgentPhase` 枚举（IDLE → ANALYZING → PLANNING → GENERATING → VALIDATING → EXECUTING → COMPLETED → ERROR）
- ✅ `ModelRouter` 已有 agent 系列任务类型定义
- ✅ `processWithAI` 的 Agent Loop 迭代模式 — 可以改造为子 Agent 调度器

**需要改造的部分**：
- 🔧 `processWithAI.ts` 的单 Agent 主循环需要重构为注册式的子 Agent 调度器
- 🔧 Agent 接口需要标准化输入/输出（当前是自由格式 prompt + tool JSON）
- 🔧 `AIAssistantService` 的 Agent 切换逻辑需要升级为子 Agent 注册式管理
- 🔧 需要添加 Agent 间通信机制（当前是串行 Loop，没有并行能力）

**需要重写的部分**：
- ❌ 子 Agent 的调度编排层完全缺失
- ❌ 没有统一的 Agent 结果归并机制
- ❌ 没有子 Agent 的隔离上下文（processWithAI 共享全量消息历史）

---

## 6. 技术债务汇总

| 严重度 | 问题 | 文件 | 说明 |
|--------|------|------|------|
| 🔴 | AIAssistantService 单例模式全局可变状态 | `ai-assistant/index.ts` | 单例 + 直接修改 state 对象，并发安全有隐患 |
| 🔴 | processWithAI 1109 行状态机 | `processWithAI.ts` | 函数过长，迭代控制、工具执行、错误处理杂糅 |
| 🔴 | MemoryBankService 1339 行职责超载 | `MemoryBankService.ts` | 同时承担存储、同步、解析、AI 分析、文本解析 |
| 🟠 | DataService 存储没有迁移机制 | `DataService.ts` | localStorage key 硬编码，数据迁移需要手动处理 |
| 🟠 | API Key 加密极弱（XOR） | `DataService.ts:470-489` | 仅供防意外泄漏，非安全加密 |
| 🟠 | VFile.content 直接包含所有文本 | `VFile` 类型 | 大文件内容全部加载到内存，没有分页/懒加载 |
| 🟠 | Electron API 通过 window.electronAPI 桥接 | 多处 | 类型不安全，大量 `(window as any)` 调用 |
| 🟠 | localStorage 容量接近 5MB 上限 | `DataService.ts:620-634` | 已有容量警告，但无自动清理策略 |
| 🟡 | processWithAI 多次重复的 `buildCompressedHistory` | `processWithAI.ts` | 和 contextCompress 的 compressHistoryIfNeeded 逻辑重叠 |
| 🟡 | aiStore 中 Agent 状态由 detectAgentState 推导 | `aiStore.ts` | 与 AIAssistantService 的 agentState 重复维护 |
| 🟡 | PromptComposer 需要每次都重新 compose | `prompts/index.ts` | 没有缓存，每次 AI 调用都重新拼接全部提示词 |
| 🟡 | fallbackAnalyzeCharacter 与 parseCharacterContent 逻辑重复 | `MemoryBankService.ts:834-842` | 两个函数做几乎相同的事 |
| 🟢 | 内置 Agent 的 system prompt 有两份定义 | `systemPrompt.ts` vs `agents/index.ts` | 前者是旧实现，后者是 PromptComposer 使用的新实现 |
| 🟢 | 无单元测试覆盖率衡量 | 整个项目 | 仅有 5 个测试文件（MemoryNetworkService, MemorySearchService, MemoryHealthService, MemoryVersionControl, setup） |
| 🟢 | TODO 仅 2 处，代码注释管理良好 | — | 正面发现 |

---

## 7. Phase 0 执行方案建议

### 7.1 StepMemory 实现起点

**建议位置**：`src/renderer/shared/services/step-memory/`

**建议步骤**：

1. **第 1 步 — 抽取 StepMemoryService**
   - 从 `MemoryBankService` 中抽取存储基础：`loadAtomicMemory` / `saveAtomicMemory` 等通用的 JSON 文件读写
   - 复用 `StorageProvider` 作为底层
   - 定义 Step 类型（以 `VFile` 为基础，增加 `stepId`, `agentId`, `dependencies`, `status` 字段）

2. **第 2 步 — 实现 Step 写入/读取接口**
   ```
   writeStep(projectId, step): Promise<void>
   readStep(projectId, stepId): Promise<Step | null>
   searchSteps(projectId, query): Promise<Step[]>
   listStepsByAgent(projectId, agentId): Promise<Step[]>
   ```

3. **第 3 步 — 实现 Step 间依赖**
   ```
   addDependency(stepId, dependsOnStepId): void
   getUnblockedSteps(projectId): Promise<Step[]> // 所有依赖已完成的 step
   ```

### 7.2 Agent 接口抽象建议位置

**建议位置**：`src/renderer/shared/services/agent-runtime/`

**建议架构**：
```
agent-runtime/
├── types.ts           ← AgentInput, AgentOutput, AgentContext, AgentResult
├── AgentRegistry.ts   ← 子 Agent 注册表（id → factory）
├── AgentRuntime.ts    ← 子 Agent 调度执行器（输入 → 串行/并行 → 归并输出）
├── agents/            ← 具体 Agent 实现
│   ├── index.ts
│   ├── worldbuilder.ts
│   ├── character.ts
│   ├── plotter.ts
│   └── editor.ts
└── StepMemoryLink.ts  ← Agent ↔ StepMemory 桥接
```

**标准 Agent 接口**：
```typescript
interface AgentInput {
  stepId: string;
  userRequest: string;
  context: StepMemoryContext;  // 从 StepMemory 读取的共享上下文
  toolSet: ToolDefinition[];   // 该 Agent 可用的工具
}

interface AgentOutput {
  stepResults: StepResult[];
  memoryUpdates: MemoryDelta[];
  nextSteps: string[];         // 建议的下游 Step IDs
  status: 'completed' | 'needs_review' | 'blocked';
}
```

### 7.3 关键改造优先级

| 优先级 | 任务 | 预计工作量 | 依赖 |
|--------|------|-----------|------|
| P0 | 抽取 StepMemoryService | 3-5 天 | 无 |
| P0 | 定义标准 Agent 接口 + 注册机制 | 2-3 天 | 无 |
| P1 | 改造 processWithAI 为 AgentRuntime | 5-7 天 | P0 两个任务 |
| P1 | Agent ↔ StepMemory 写入桥接 | 2-3 天 | StepMemoryService |
| P2 | 实现子 Agent 隔离上下文 | 3-5 天 | AgentRuntime |
| P2 | 实现 Step 间依赖编排 | 2-3 天 | StepMemoryService |
| P3 | 迁移 5 个内置 Agent 到新接口 | 3-5 天 | AgentRuntime |
| P3 | 废弃旧 AIAssistantService 的 Agent 切换 | 1 天 | AgentRuntime |

### 7.4 风险提示

1. **`processWithAI.ts` 重构风险高** — 1109 行状态机与 UI、存储、AI 调用深度耦合，建议以"并行新实现 + 逐步迁移"方式而非直接重写
2. **StepMemory 的数据来源冲突** — 现有 VFile 系统和 MemoryBank 同时管理内容，Phase 0 需要明确 StepMemory 是"新写"还是"包装"现有数据
3. **Electron/Web 双平台** — `window.electronAPI` 桥接方式在 Android（Capacitor）环境下不可用，StepMemory 的持久化层需要 IndexedDB fallback

---

## 附录：关键文件行数统计

```
ai-assistant/index.ts          1232  — AIAssistantService 单例
processWithAI.ts               1109  — Agent 主循环状态机
MemoryBankService.ts           1339  — 记忆体服务（需重构）
DataService.ts                  659  — 数据访问门面
aiService.ts                    638  — LLM 统一调用层
ModelRouter.ts                  321  — 模型路由
contextBuilder.ts               304  — 上下文构建
ToolParser.ts                   353  — 工具调用解析
UnifiedExecutor.ts              409  — 统一执行器
storage.ts                      178  — 存储层
PromptComposer (prompts/index)  398  — 提示词组合器
=======================================
总计                           ~6800 行（核心服务层）
```
