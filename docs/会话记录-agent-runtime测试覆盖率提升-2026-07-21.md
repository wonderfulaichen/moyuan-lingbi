# 会话记录：agent-runtime 子模块测试覆盖率提升

> 日期：2026-07-21
> 范围：agent-runtime 子模块 2 个高优先级文件（StepRunner + AgentRegistry）
> 前序：`docs/会话记录-ai-assistant测试覆盖率提升-2026-07-21.md`、`docs/会话记录-memory-bank测试覆盖率提升-2026-07-21.md`
> 结果：agent-runtime 子模块新增 73 个测试，修复 1 个源码 bug，测试总数 805 → 878

---

## 一、任务背景

通过 subagent 调研发现 agent-runtime 子模块中存在 2 个高风险未覆盖文件：
- `internal/StepRunner.ts`（398 行，单步执行器：LLM 调用 + 重试 + 超时 + 取消）
- `AgentRegistry.ts`（513 行，Agent 注册表：单例 + 10 个内置 Agent + 过滤查询）

这两个文件是 agent-runtime 的核心调度组件，缺测将影响整个 Agent 流水线的可靠性。

---

## 二、完成清单

| 文件 | 测试数 | Commit | 关键覆盖点 |
|---|---|---|---|
| AgentRegistry.test.ts | 36 | c77c0cb | 单例/register/registerOrUpdate/get/exists/list/listByFilter(7)/getByTask(3)/unregister(4)/_clearForTest(2) |
| StepRunner.test.ts | 37 | c77c0cb | executeStep 基础流程(5)/重试逻辑(10)/超时取消(4)/parseLLMResponse(4)/buildSystemPrompt(3)/buildPrompt(2)/isRetryable(5)/错误类导出(3) |
| **合计** | **73** | — | — |

### agent-runtime 子模块覆盖进度

| 文件 | 测试数 | 状态 |
|---|---|---|
| CancellationToken.ts | 20 | 已覆盖（前序） |
| DependencyResolver.ts | 24 | 已覆盖（前序） |
| mapper.ts | 32 | 已覆盖（前序） |
| AgentRegistry.ts | 36 | **本次新增** |
| internal/StepRunner.ts | 37 | **本次新增** |
| agents/WriterAgent.ts | 18 | 已覆盖（前序） |
| agents/AuditorAgent.ts | 12 | 已覆盖（前序） |
| agents/RevisorAgent.ts | 13 | 已覆盖（前序） |
| agents/PlannerAgent.ts | 4 | 已覆盖（前序） |
| agents/MemoryAgent.ts | 5 | 已覆盖（前序） |
| agents/ResearcherAgent.ts | 3 | 已覆盖（前序） |
| AgentRuntime.ts | 部分 | 集成测试，已有但未完整 |
| types.ts | - | 纯类型，无需测试 |

---

## 三、源码 Bug 修复

### 3.1 AgentRegistry._clearForTest 缺失 registerSubAgents

**位置**：`src/renderer/shared/services/agent-runtime/AgentRegistry.ts`

**问题**：
```typescript
// 修复前
_clearForTest(): void {
  this.agents.clear();
  this.builtInAgentIds.clear();
  this.registerBuiltInAgents();
  // 缺少 registerSubAgents()，重置后只有 5 个 Agent 而非 10 个
}
```

**影响**：测试中调用 `_clearForTest` 后注册表状态与生产环境不一致，可能掩盖子 Agent 相关 bug。

**修复**：
```typescript
_clearForTest(): void {
  this.agents.clear();
  this.builtInAgentIds.clear();
  this.registerBuiltInAgents();
  this.registerSubAgents(); // 同步生产构造函数行为
}
```

**根因**：构造函数同时调用 `registerBuiltInAgents()` + `registerSubAgents()`，但 `_clearForTest` 只复制了前者，遗漏了后者。

---

## 四、测试技术亮点

### 4.1 maxRetries=0 避免超时测试循环（5000ms test timeout 根因）

**问题**：超时测试 `advanceTimersByTimeAsync(120000)` 只推进 1 次 120s，但 `executeStep` 默认 maxRetries=3 会重试 3 次（共 4 × 120s + 退避），导致测试 5000ms 超时。

**修复**：超时测试中显式 `createAgentDef({ maxRetries: 0 })`，让一次超时即抛出。

### 4.2 promise.catch(e=>e) 消除 unhandled rejection 警告

**问题**：`mockRejectedValue(error)` 创建同步 rejected Promise，但 `await` 异步附加 handler，期间 vitest 检测到 Promise rejection 无 handler，报 unhandled rejection 错误（exit code 1）。

**修复**：在 `executeStep` 返回 promise 后立即附加 catch：
```typescript
const promise = executeStep('agent-test', createInput(), token, 100);
const errorPromise = promise.catch(e => e);  // 立即附加 handler
// ... 推进 timers ...
const error = await errorPromise;
expect(error).toBeInstanceOf(LLMTimeoutError);
```

### 4.3 await Promise.resolve() 让 Promise.race 启动

**问题**：`vi.advanceTimersByTimeAsync(120000)` 需要在 Promise.race 内部 setTimeout 注册后才能触发，但 `executeStep` 是 async 函数，调用后同步部分执行到 `await Promise.race(...)` 才注册 setTimeout。

**修复**：
```typescript
const promise = executeStep(...);
await Promise.resolve();  // 让微任务运行让 Promise.race 启动
await vi.advanceTimersByTimeAsync(120000);
```

### 4.4 toEqual 替代 toBe 比较 model 对象

**问题**：`expect(args[0].model).toBe(createModel())` 失败，因为 `toBe` 用引用相等，而 mock 调用方传入的 model 与测试中创建的 model 是不同实例。

**修复**：用 `toEqual` 深比较。

### 4.5 summary 期望值反映源码真实行为

**源码**：
```typescript
summary = jsonData.summary ?? content.slice(0, 200);
// content 是原始 LLM 响应（含 ```json 包装），不是 cleanContent
```

**测试期望**：
```typescript
const rawContent = '```json\n' + json + '\n```';
mockedGenerate.mockResolvedValue({ content: rawContent } as any);
const result = await executeStep(...);
expect(result.summary).toBe(rawContent.slice(0, 200));
// 不是 '仅内容'，而是原始 content（含 ```json 包装）
```

**教训**：测试假设需基于源码实际行为，不能基于"合理推测"。源码设计意图（是否应该用 cleanContent）记录在测试注释中。

---

## 五、测试总数统计

| 指标 | 之前 | 之后 | 增量 |
|---|---|---|---|
| 测试文件数 | 33 | 35 | +2 |
| 测试用例数 | 805 | 878 | +73 |
| agent-runtime 覆盖文件 | 9/12 | 11/12 | +2 |

---

## 六、后续建议

### 6.1 剩余测试盲区

- `AgentRuntime.ts`：已有集成测试（AgentRuntime.test.ts）但未完整覆盖快照管理、并行执行、防重入等场景
- `skill-registry`：已有 12 个测试，覆盖率较低但优先级低

### 6.2 测试质量提升

- 考虑为 `AgentRuntime.ts` 补充并行执行模式测试（当前 serialExecution=true 默认）
- 考虑为 `skill-registry` 补充边界场景测试

### 6.3 测试技术沉淀

本次 4 项测试技术亮点（4.1-4.4）已记录，可作为后续测试编写的参考模式：
- fake timer + Promise.race 模式：`await Promise.resolve()` + `advanceTimersByTimeAsync`
- mockRejectedValue + 多次重试模式：`promise.catch(e=>e)` 立即附加 handler
- 超时测试模式：`maxRetries=0` 避免重试循环
- 对象比较模式：`toEqual` 替代 `toBe`
