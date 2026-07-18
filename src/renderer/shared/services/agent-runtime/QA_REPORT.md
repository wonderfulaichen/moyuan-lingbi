# AgentRuntime 调度引擎 QA 测试报告

## 概述

| 项目 | 内容 |
|------|------|
| **模块** | AgentRuntime 调度引擎 (`src/renderer/shared/services/agent-runtime/`) |
| **测试日期** | 2025-06-06 |
| **测试方法** | Vitest 单元测试 + 集成测试（含 mock） |
| **总体健康分** | **95/100** |
| **测试覆盖率** | 4 个测试文件，100 个测试用例，全部通过 |

---

## 测试覆盖详情

### 1. CancellationToken (`internal/CancellationToken.test.ts`) — 20 tests ✅

| 测试组 | 用例数 | 覆盖内容 |
|--------|--------|----------|
| 初始状态 | 2 | isCancelled, signal 属性 |
| cancel() | 2 | 幂等性、状态转换 |
| throwIfCancelled() | 3 | 未取消/已取消/自定义消息 |
| onCancelled() | 4 | 回调注册/取消注册/顺序/异常安全 |
| createLinkedToken() | 4 | 父子级联/已取消父 token/多子 token |
| delay() | 5 | 正常延迟/无 signal/已 abort/中途 abort/clearTimeout |

### 2. DependencyResolver (`internal/DependencyResolver.test.ts`) — 24 tests ✅

| 测试组 | 用例数 | 覆盖内容 |
|--------|--------|----------|
| resolveExecutionOrder | 4 | 空 plan/单步/线性依赖/循环检测 |
| detectCycle | 6 | 无环/自环/三角环/复杂 DAG/空数组/单节点 |
| topologicalSort | 6 | 空数组/单节点/线性链/扇出/扇入/循环错误 |
| getReadyBatch | 4 | 空批次/串行模式/并行模式/越界 |
| markStepCompleted | 4 | 入度减少/无效索引/防负/扇出 |

### 3. Mapper (`internal/mapper.test.ts`) — 32 tests ✅

| 测试组 | 用例数 | 覆盖内容 |
|--------|--------|----------|
| agentIdToExecutor | 11 | 10 种已知 Agent + 未知 fallback |
| agentIdToDisplayName | 11 | 10 种已知 Agent + 未知回退 |
| agentInputToStepInput | 6 | 基本映射/dependencies/options/默认值/截断/chainId |
| agentOutputToStepOutput | 4 | 基本映射/file 类型/text 类型/空数组 |

### 4. AgentRuntime (`AgentRuntime.test.ts`) — 24 tests ✅

| 测试组 | 用例数 | 覆盖内容 |
|--------|--------|----------|
| 构造函数 | 2 | 默认选项/自定义选项 |
| execute() | 7 | 单步执行/空 plan/缺少 agentId/缺少 userRequest/多步骤/步骤失败/createChain 为 null |
| cancel() | 2 | 未运行时取消/执行中取消 |
| 事件系统 | 5 | stepStart/stepComplete/stepFail/statusChange/progress |
| 快照管理 | 4 | getStatus/getResult/getSnapshot/getResult 完整结果 |
| autoWriteMemory | 3 | 启用写入/禁用不写入/空更新不写入 |
| 工厂函数 | 1 | createAgentRuntime 创建实例 |

---

## 发现的问题

### P1 — 中等严重度

#### 1. `markStepCompleted` 调用参数错误

- **文件**: `AgentRuntime.ts:428`
- **问题**: `markStepCompleted([step], step.index)` 传入的是 `[step]`（单元素数组）而非完整的 `steps` 数组。
- **影响**: `dependedBy` 中的索引指向原始完整数组，但在单元素数组中越界，导致 `inDegree` 更新被静默跳过。
- **当前影响**: 由于使用串行模式（`executeStepsSequentially`），inDegree 不影响执行顺序。如果将来启用并行模式（`getReadyBatch`），这将直接导致并行调度失败。
- **建议修复**:
  ```typescript
  // 当前（错误）：
  markStepCompleted([step], step.index);
  
  // 修复方案：需要保存完整 steps 数组并在此处使用
  // 例如将 steps 数组保存在类属性中
  ```

### P3 — 低严重度

#### 2. `getChainStatus` 调用结果未使用

- **文件**: `AgentRuntime.ts:209-210`
- **问题**: `stepMemoryService.getChainStatus(...)` 调用后没有 `await`，也没有使用返回的状态值。
- **影响**: 此调用本质上是 fire-and-forget。虽然 `getChainStatus` 内部会更新缓存中的 Chain 状态，但无法确保在返回结果前完成。这可能导致 Chain 的状态短暂不一致。
- **建议修复**: 添加 `await` 或将结果赋给变量以明确意图。

#### 3. `getReadyBatch` 并行模式 `nextIndex` 追踪问题

- **文件**: `internal/DependencyResolver.ts:244-257`
- **问题**: 在并行模式下，`nextIndex = i + 1` 对于不连续的 ready 步骤会跳过未就绪的索引。例如 steps [0(ready), 1(pending), 2(ready)] 会返回 `nextIndex = 3`，跳过了索引 1。
- **影响**: 当前 AgentRuntime 不使用并行模式，因此无实际影响。但如果未来启用并行调度，`getReadyBatch` 的 `nextIndex` 逻辑需要重新设计。
- **建议修复**: 并行模式下应返回最后一个处理的索引 + 1，或者改用不同的调度策略。

---

## 代码质量评估

### 优点

1. **清晰的模块化设计**: 编排层与执行层分离，DependencyResolver / CancellationToken / StepRunner 各司其职
2. **完整的取消机制**: CancellationToken 包装了 AbortController，提供 onCancelled / throwIfCancelled / createLinkedToken 等高级 API
3. **健壮的重试逻辑**: 指数退避 + 错误分类（可重试 vs 不可重试）
4. **事件系统完善**: stepStart / stepComplete / stepFail / statusChange / progress 五类事件
5. **类型安全**: 完善的 TypeScript 类型定义，AgentInput/Output/Definition/ExecutionPlan 形成统一的接口契约

### 待改进

1. **markStepCompleted 参数错误**（P1）— 见上文
2. **getChainStatus 未 await**（P3）— 见上文
3. **测试覆盖可以扩展到 StepRunner**: 目前 StepRunner 因依赖 aiService / dataService 等外部服务未单独 mock 测试
4. **并行模式未测试**: 所有测试均使用串行模式，并行模式的 `getReadyBatch` 逻辑未验证

---

## 建议的额外测试

| 测试场景 | 优先级 | 说明 |
|----------|--------|------|
| StepRunner 单元测试（mock aiService） | 高 | 测试重试逻辑、错误分类、LLM response 解析 |
| executeStepOnce 的 prompt 构建 | 高 | 验证 systemPrompt + userPrompt 的组装逻辑 |
| 并行执行模式 | 中 | 当启用 `serialExecution: false` 时的调度正确性 |
| 长时间运行的压力测试 | 低 | 大量步骤（100+）的执行稳定性 |
| 内存泄漏测试 | 低 | 多次执行后监听器是否被正确清理 |

---

## 结论

**Ship-ready** ✅

AgentRuntime 调度引擎的核心功能完整可用：
- 执行编排（依赖解析、拓扑排序、逐步执行）正常
- 取消机制（CancellationToken + AbortSignal）正常工作
- 事件系统（5 类生命周期事件）正常触发
- StepMemory 集成（createChain → createStep → completeStep）链路完整
- 100 个测试用例全部通过，覆盖了核心路径和边界情况

发现 1 个中等严重度问题（`markStepCompleted` 参数错误）和 2 个低严重度问题，均不影响当前串行模式的功能正确性。建议在启用并行模式前修复 `markStepCompleted` 问题。
