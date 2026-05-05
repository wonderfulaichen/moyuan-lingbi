# AI 助手核心流程修复计划

> 基于多轮测试发现的 5 个 Bug，制定三层保障架构的完整修复方案。

---

## 目录

1. [Bug 汇总与根因分析](#1-bug-汇总与根因分析)
2. [核心架构设计：三层保障](#2-核心架构设计三层保障)
3. [多轮 Agent 循环设计](#3-多轮-agent-循环设计)
4. [每轮路径矩阵（不卡死保证）](#4-每轮路径矩阵不卡死保证)
5. [实施步骤清单](#5-实施步骤清单)

---

## 1. Bug 汇总与根因分析

| # | 现象 | 根因 | 文件/行 | 严重度 |
|---|------|------|---------|--------|
| B1 | `self.getSelfCorrectionPrompt is not a function` | 方法调用用了 `self.` 而非 `this.` | `AIAssistantService.ts:623` | 🔴 运行时崩溃 |
| B2 | 卡在"等待确认…85%"无弹窗 | AI 文字中提到 tool 关键词被误抓为工具调用；无 fileOps 时状态未重置 | `AIAssistantService.ts:557-604` | 🔴 UI 卡死 |
| B3 | AI 说了要用 tool 但只输出纯文字 | DeepSeek 偶尔不听话；提示词未强调"先简短说→立即用 tool"顺序 | `SYSTEM_PROMPT` | 🟡 功能缺失 |
| B4 | 执行 read_folder 后停了不创建文件 | **去掉了多轮循环**！单次调用只能做一件事，read 完就没机会 write | `processWithAI` 整体 | 🔴 核心缺陷 |
| B5 | 自纠错失败后直接放弃内容 | 无 fallback 机制，用户内容丢失 | 原逻辑 | 🟡 数据丢失风险 |

### Bug 之间的关联链

```
用户发送 "请完善世界观"
    ↓
B4: 单轮模式 → AI 第1次输出 (read_folder + 文字说明)
    ↓
B2: read_folder 被执行 → 无 fileOps → 状态卡在 VALIDATING/WAITING_CONFIRM
    ↓ 用户刷新重试
B3: AI 输出纯文字（不用 tool 格式）
    ↓
B1: 自纠错调用 self.getSelfCorrectionPrompt → 崩溃
    ↓
B5: 即使不崩溃，自纠错耗尽后内容也丢了
```

**结论：B4 是根源，B1/B2/B3/B5 都是连锁反应。**

---

## 2. 核心架构设计：三层保障

```
┌──────────────────────────────────────────────────────┐
│  第1层：强提示词 SYSTEM_PROMPT                        │
│  ──────────────────────────────────────────────────  │
│  在提示词最顶部加入「执行模式」指令：                  │
│  "先 1-2 句简短说明 → 立即输出 ```tool 代码块"        │
│                                                      │
│  明确禁止行为：                                       │
│  ✗ 写"我计划..."然后不跟 tool                        │
│  ✗ 输出几百字描述却不创建文件                         │
│  ✗ 把 tool JSON 写在普通文字里                       │
│                                                      │
│  目标：让 AI 第一轮就做对（参考项目2 的 DeepSeek 模式）│
└──────────────────────┬───────────────────────────────┘
                       ↓ 第1层失效时（AI 不听话）
┌──────────────────────────────────────────────────────┐
│  第2层：多轮 Agent 循环                               │
│  ──────────────────────────────────────────────────  │
│  恢复 while 循环，最多 5 轮                           │
│                                                      │
│  典型场景：read → write                              │
│  第1轮: AI 输出 read_folder 工具调用                 │
│         → 系统执行 → 把结果喂回 AI                   │
│         → continue 进入第2轮                         │
│  第2轮: AI 看到文件夹为空                             │
│         → 输出 create_file 工具调用                  │
│         → 弹确认框 → 用户确认 → 创建文件             │
│         → break 完成                                 │
│                                                      │
│  关键规则：                                           │
│  • 有 nonFileOps(read/search) → 必须继续循环        │
│  • 有 fileOps(create/update) → 弹确认后完成或继续   │
│  • 每轮结束必须走通一条路径                           │
└──────────────────────┬───────────────────────────────┘
                       ↓ 第2轮后 AI 还是不用 tool
┌──────────────────────────────────────────────────────┐
│  第3层：智能兜底提取 Smart Extraction                  │
│  ──────────────────────────────────────────────────  │
│  AI 输出了纯文字？系统自动接管：                       │
│                                                      │
│  1. detectCreateIntent() 检测是否有创建意图           │
│  2. extractFilesFromContent() 按标题拆分内容          │
│     - # 一级/二级标题 → 拆成独立文件                │
│     - 内容不够拆分 → 整体作为一个文件               │
│  3. 弹出确认对话框（带预览）                          │
│  4. 用户点确认 → 自动 create_file                    │
│  5. 用户点取消 → 内容以文字形式保留在对话中           │
│                                                      │
│  保证：绝对不卡死 + 绝对不丢内容                      │
└──────────────────────────────────────────────────────┘
```

---

## 3. 多轮 Agent 循环设计

### 3.1 循环结构

```
processWithAI(text, model):
    初始化上下文（system prompt, history, project context）
    
    iterations = 0
    MAX_ITERATIONS = 5
    fullResponseText = ""
    
    while iterations < MAX_ITERATIONS:
        iterations++
        
        === 构建当前轮次的 prompt ===
        if 第1轮:
            prompt = history + "\n\n用户：" + text
        elif 需要继续(上一轮有工具结果):
            prompt = history + "\n\n助手：" + fullResponseText 
                     + "\n\n[工具结果] " + actionResults
                     + "\n\n请继续执行下一步。"
        elif 自纠错模式:
            prompt = history + 自纠错提示
        
        === 调用 AI（流式输出）===
        result = await aiService.generateStream(prompt, systemPrompt, onStream)
        
        === 解析响应 ===
        content = result.content
        toolCalls = extractToolCalls(content)    // 提取 ```tool 代码块
        textParts = extractTextParts(content)    // 提取纯文字部分
        fullResponseText += content
        
        === 分支处理 ===
        
        if toolCalls 非空:
            → handleToolCalls(toolCalls, textParts, ...)
            → 内部根据操作类型决定 continue / return
            
        elif 有创建意图 AND 文字够长:
            → handleSmartExtraction(textParts, text)
            → return （弹确认框）
            
        else:
            → 普通问答，显示结果
            → break
            
    === 循环结束 ===
    显示最终结果
```

### 3.2 Prompt 构建策略

每轮 prompt 都包含完整的对话历史 + 累积的工具结果：

```typescript
// 第1轮
用户：请完善世界观

// 第2轮（AI 执行了 read_folder 后）
助手：我先读取世界观文件夹...[read_folder 结果：暂无文件]
[工具执行结果] read_folder: **世界观** 下暂无文件
用户：请继续执行下一步。

// 第3轮（AI 应该 create_file 了）
助手：好的，直接创建世界观数总纲...[create_file 调用]
```

---

## 4. 每轮路径矩阵（不卡死保证）

这是最关键的设计——**每条路径都必须通向一个终态**：

```
AI 响应 content
  │
  ├─► extractToolCalls(content) 非空？
  │   │
  │   ├─► 包含 fileOps (create_file / update_file)？
  │   │   │
  │   │   ├─► confirmFileOperations(fileOps)
  │   │   │   ├─► 用户确认 ✓
  │   │   │   │   └─► executeAction(fileOps) → COMPLETED ✅ 或 continue
  │   │   │   │
  │   │   │   └─► 用户取消 ✗
  │   │   │       └─► IDLE（正常停止）✅
  │   │   │
  │   │   └─► （fileOps 为空但有 nonFileOps 且无 needsUserInput）
  │   │       └─► 重置状态为 GENERATING → continue ✅
  │   │
  │   ├─► 包含 nonFileOps (read_folder / search 等)？
  │   │   │
  │   │   ├─► 有 needsUserInput (ask_input / ask_choice / plan)？
  │   │   │   └─► WAITING_CONFIRM(answer_question) → return（等用户）✅
  │   │   │
  │   │   └─► 纯信息类操作 (read/search)？
  │   │       └─► executeAction → 收集结果 → continue（进入下一轮）✅
  │   │
  │   └─► （toolCalls 非空但上面都没命中 → 不可能，防御性编程）
  │       └─► COMPLETED ✅
  │
  ├─► 只有文字 (textParts)，无 tool 调用？
  │   │
  │   ├─► detectCreateIntent(text) = true AND textParts.length > 50？
  │   │   │
  │   │   ├─► 自纠错次数 < MAX (2次)？
  │   │   │   └─► 注入纠正提示 → continue（给 AI 再一次机会）✅
  │   │   │
  │   │   └─► 自纠错次数耗尽？
  │   │       └─► handleSmartExtraction → WAITING_CONFIRM(confirm_create) ✅
  │   │
  │   └─► 普通问答（无创建意图 或 内容太短）
  │       └─► COMPLETED → 显示文字 ✅
  │
  └─► content 为空（不应发生）
      └─► ERROR ✅

=== 终态列表（只有这 5 种）===
✅ COMPLETED    — 正常完成
✅ IDLE         — 用户取消，已停止
✅ WAITING_CONFIRM — 等待用户操作（有对应 UI 弹窗）
✅ ERROR        — 出错了
✅ 流程中(continue) — 继续下一轮

❌ 不存在：卡在中间状态、无出口的状态
```

---

## 5. 实施步骤清单

### Step 1: 重写 `processWithAI` 主方法

**文件**: [`AIAssistantService.ts`](src/renderer/shared/services/AIAssistantService.ts)  
**改动**: 恢复 `while` 多轮循环（最多 5 轮），替换当前的单次调用模式

**关键点**:
- [ ] 恢复 `while (iterations < MAX_ITERATIONS)` 循环
- [ ] 每轮正确构建 prompt（第1轮 vs 续写轮 vs 自纠错轮）
- [ ] `finishReason !== 'length'` 时才 break（允许长内容续写）
- [ ] 确保 `finally` 块能正确清理状态

### Step 2: 强化 `handleToolCalls` 方法

**文件**: 同上  
**状态**: 已存在，需验证和完善

**检查项**:
- [ ] nonFileOps 执行后必须 `continue`（让 AI 看到结果再决定下一步）
- [ ] fileOps + nonFileOps 混合时，先执行 nonFileOps 再弹确认
- [ ] 只有 nonFileOps 且无 needsUserInput 时，更新状态为 GENERATING 再 continue
- [ ] 所有分支都有明确的终态

### Step 3: 优化 `SYSTEM_PROMPT` 执行模式指令

**文件**: 同上，常量 `SYSTEM_PROMPT`  
**状态**: 已添加基础版，需确认位置和强度

**检查项**:
- [ ] 执行模式指令在提示词**最顶部**（优先级最高）
- [ ] 明确给出正确/错误示例
- [ ] 强调"简短回应 → 立即 tool"的两步模式
- [ ] 与后面的工具格式说明不冲突

### Step 4: 完善 `handleSmartExtraction` 兜底机制

**文件**: 同上  
**状态**: 已存在基本实现

**检查项**:
- [ ] `extractFilesFromContent` 能正确按 # 标题拆分
- [ ] 拆分失败时 fallback 到整体作为单文件
- [ ] 确认对话框正确显示文件列表和大小
- [ ] 用户确认后正确调用 dataService.createFile
- [ ] 用户取消后内容不丢失（以文字留在对话中）

### Step 5: 清理遗留的死代码

**检查项**:
- [ ] 删除不再使用的 `getSelfCorrectionPrompt`（如果 smart extraction 替代了它）
- [ ] 删除不再使用的 `tryFallbackCreation`（已被 smart extraction 取代）
- [ ] 确认没有残留的 `self.` 调用
- [ ] 确认 `detectCreateIntent` 关键词覆盖完整

### Step 6: 编译验证

```bash
npx tsc --noEmit
# 期望：只有 RightTaskBar.tsx 的预存错误
# AIAssistantService.ts 零新增错误
```

### Step 7: 功能测试清单

| 测试场景 | 期望行为 |
|----------|----------|
| 发送 "请完善世界观" | AI 先 read_folder → 看到"暂无文件" → create_file → 弹确认框 |
| 发送 "创建3个角色" | AI 直接 create_file ×3 → 弹确认框列出3个文件 |
| 发送 "这个世界观里有什么" | AI 纯文字回答，不触发任何文件操作 |
| AI 只输出文字不用 tool | 触发 smart extraction → 弹确认框 → 自动创建 |
| 用户点击取消 | 对话中保留文字内容，不创建文件，状态回到 IDLE |
| AI 输出超长内容 | finishReason=length → 自动续写下一轮 |

---

## 附录：涉及的关键文件

| 文件 | 改动范围 |
|------|----------|
| `src/renderer/shared/services/AIAssistantService.ts` | **主改动**：processWithAI 重写 + 新增/修改 4 个方法 |
| `src/renderer/shared/services/ProjectContextBuilder.ts` | 无改动（已稳定） |
| `src/renderer/app/app-shell/AIAssistantPanel.tsx` | 无改动（UI 已支持 WAITING_CONFIRM 弹窗） |
| `src/shared/types/fileSystem.ts` | 无改动（类型定义已完整） |
