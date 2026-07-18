# Phase 0 服务层交付记录

**日期**：2026-06-05
**模块**：StepMemory + Agent 接口层

---

## 背景

Phase 0 目标是在 0-2 周搭建 Agent 流水线的基石，包括：
1. **StepMemory** — Agent 执行流水线的统一存储管理层
2. **Agent 接口规范** — Agent 的类型定义、注册管理和调度接口

---

## 交付文件清单

### StepMemoryService — `src/renderer/shared/services/step-memory/`

| 文件 | 行数 | 说明 |
|------|------|------|
| `types.ts` | 234 | 10 个核心类型定义 |
| `StepMemoryService.ts` | 1056 | 完整服务实现 |
| `index.ts` | 16 | 统一导出 |

### Agent 接口层 — `src/renderer/shared/services/agent-runtime/`

| 文件 | 行数 | 说明 |
|------|------|------|
| `types.ts` | 182 | 7 个核心类型定义 |
| `AgentRegistry.ts` | 290 | Agent 注册表实现 |
| `index.ts` | 40 | 统一导出 + 工具函数 |

---

## StepMemoryService 架构

### 设计模式
- **单例模式**：全局 `stepMemoryService`，与项目其他服务一致
- **懒加载**：`StorageProvider` 在首次方法调用时创建
- **自旋锁初始化**：`init()` 方法防并发重复初始化
- **两级缓存**：内存 `Map<string, ProjectCache>` + `StorageProvider` 持久化
- **写后自动持久化**：所有写操作自动 save，异步无阻塞

### 存储键模式
```
step-memory/{projectId}/steps
step-memory/{projectId}/fragments
step-memory/{projectId}/chains
```

### 核心 API 一览

**Step CRUD（6 个）**
- `getStep(projectId, stepId)` — 读取单个，优先缓存
- `listSteps(projectId, query?)` — 支持 5 种过滤 + 排序 + 分页
- `createStep(projectId, input: CreateStepInput)` — 自动状态判定
- `updateStepStatus(projectId, stepId, status, error?)` — 含时间戳自动记录
- `completeStep(projectId, stepId, output)` — 完成 + 写入输出 + 级联解锁
- `deleteStep(projectId, stepId)` — 安全删除

**依赖管理（3 个）**
- `addDependency(projectId, stepId, dependsOnStepId)` — 防自依赖/防重复
- `getUnblockedSteps(projectId)` — 获取 ready 状态的 Step
- `getBlockedSteps(projectId)` — 获取 pending/blocked 状态的 Step
- `getDependencyChain(stepId)` — 广度优先递归获取上游依赖链

**上下文构建（1 个）**
- `buildContext(projectId, agentId)` — 召回相关片段 + 收集活跃 Step 摘要

**Fragment 管理（4 个）**
- `addFragment(projectId, data)` — 自动分配 id + 时间戳
- `getRelevantFragments(projectId, executorType)` — 按 EXECUTOR_FRAGMENT_MAP 过滤
- `getFragmentsByType(projectId, type)` — 按片段类型过滤
- `searchFragments(projectId, keyword)` — 按 content 关键词搜索

**Chain 管理（3 个）**
- `createChain(projectId, input)` — 创建 StepChain
- `addStepToChain(projectId, chainId, stepId)` — 加入 Chain 并自动更新 chainId
- `getChainStatus(projectId, chainId)` — 从 Step 状态推导 Chain 状态

**缓存管理（1 个）**
- `clearCache(projectId?)` — 清除指定或全部缓存

### 设计要点

- **自依赖防护**：`addDependency` 检测 `stepId === dependsOnStepId` 直接拒绝
- **重复依赖防护**：使用 `includes()` 检测
- **级联解锁**：`cascadeUnblockDependents` 在 Step 完成时自动检查依赖该 Step 的其他 Step
- **EXECUTOR_FRAGMENT_MAP**：定义了 12 种执行者类型与 6 种片段类型的映射关系
- **状态推导**：`deriveChainStatus` 从链中所有 Step 的状态推导 Chain 状态
- **逆向索引**：`stepProjectIndex` 支持仅用 stepId 查找 projectId

---

## Agent 接口层架构

### AgentRegistry 设计

- **单例模式**：全局 `agentRegistry`
- **启动时自动注册**：从 `prompts/agents/index.ts` 读取 5 个内置 Agent
- **内置 Agent 受保护**：不可删除，只允许 `registerOrUpdate` 覆盖更新

### 内置 Agent 列表

| Agent ID | 名称 | 兼容任务 | 允许工具 |
|----------|------|---------|---------|
| `agent-general` | 通用助手 | general, inspiration | file, search, memory, ai |
| `agent-worldbuilder` | 世界观构建 | world-building | file, search, memory |
| `agent-character` | 角色设计 | character | file, search, memory |
| `agent-plotter` | 情节规划 | outline, writing | file, search, memory |
| `agent-editor` | 文风润色 | review | file, search |

### 核心 API

- `register(agent)` — 注册新 Agent（防重复 ID 冲突）
- `registerOrUpdate(agent)` — 注册或覆盖更新
- `get(agentId)` — 按 ID 查找
- `list()` — 获取全部
- `listByFilter(options)` — 支持 taskType / searchQuery / includeHidden 过滤
- `getByTask(taskType)` — 按任务类型查找
- `unregister(agentId)` — 删除自定义 Agent（内置受保护）
- `exists(agentId)` — 检查存在性

### AnyAgentId 扩展

在 5 个内置 Agent 基础上，新增 5 个子 Agent ID：
- `agent-sub-writer` — 章节写手
- `agent-sub-planner` — 大纲规划师
- `agent-sub-memory` — 记忆整理
- `agent-sub-researcher` — 资料研究员
- `agent-sub-reviewer` — 审校员

---

## 类型互通关系

```
AgentInput.context          → StepMemoryContext  ← 含 projectState + relevantMemory + activeSteps
AgentOutput.memoryUpdates   → StepMemoryFragment[] ← 写回 StepMemory
AgentExecutionPlan.chainId  → StepChain.id         ← 调度与存储对齐
AgentDefinition             → 独立类型             ← 注册表用
```

---

## 集成验证

- ✅ 两个模块均编译通过（零新增错误）
- ✅ agent-runtime/types.ts 已 import step-memory 类型
- ✅ 单例命名风格一致（`agentRegistry` / `stepMemoryService`）
- ✅ 均使用 `async/await` + try-catch 错误处理
- ✅ 均与项目现有架构兼容（增量添加，不改旧文件）

---

## 已知预存问题

以下为项目中已有的编译问题，非本次引入：

| 位置 | 问题 |
|------|------|
| `shared/types/fileSystem` | 模块找不到 |
| `aiService.ts` | StreamingAIResponse 缺少 isComplete |
| `MemoryBankService.ts` | electronAPI / worldbuilding 等属性不存在 |
| `LocalModelService.ts` | node-llama-cpp 导入不兼容 |

---

## 下一步建议

1. **AgentRuntime** — 调度引擎，消费 StepMemory 的 Step 并派发给 Agent 执行
2. **PromptComposer** — 将 AgentDefinition.systemPrompt 与 StepMemoryContext 组合为完整 prompt
3. **逐章确认 UI** — Agent MVP 的用户界面（Step 状态展示 + 输出确认）
