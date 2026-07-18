# 墨渊灵笔 — 全景诊断总览

> 审查范围：DataService、AI Assistant、AgentRuntime、StepMemoryService、App.tsx、StepAgent.tsx 等核心模块
> 审查视角：架构（万鉴识）+ 产品/UI/UX（许清楚）+ 代码质量（寇豆码）
> 审查日期：当前

---

## 一、全景概览

| 来源 \ 级别 | P0（必须修） | P1（尽快修） | P2（可延后） |
|:---|---:|---:|---:|
| **架构** (万鉴识) | 6 | 6 | 5 |
| **产品/UI** (许清楚) | 4 | 6 | 3 |
| **代码质量** (寇豆码) | 1 | 6 | 8 |
| **重复/重叠** | 2 | 3 | 2 |
| **去重后合计** | **9** | **15** | **14** |

---

## 二、P0 核心问题（9 项）

### P0-1 [架构] DataService 返回可变引用，破坏观察者模式
- **来源**: 万鉴识 P0-1/P0-2
- **文件**: `DataService.ts:139-143` (`getFS()`) + `:135-137` (`getData()`)
- **本质**: 返回 `this.data` 和 `this.data.fileSystems[pid]` 的原始引用，调用方可绕过 `emit()` 直接修改数据
- **影响**: 全应用数据一致性。UI 可能不更新，Bug 难以追踪
- **修复**: 返回深拷贝 `structuredClone()`，或引入不可变数据结构

### P0-2 [架构/代码] AgentRuntime 超时后未取消 AI 调用 + abort 竞态
- **来源**: 万鉴识 P0-5 + 寇豆码 P1-5
- **关联文件**: `StepRunner.ts:173-195` + `useAIGeneration.ts:29-90`
- **本质**: 超时场景下 `Promise.race` 胜出但 `aiService.generate()` 仍在后台执行（浪费 token）+ abort 事件监听器泄漏 + 组件卸载后 setState 风险
- **影响**: Token 浪费 + 内存泄漏 + React 警告
- **修复**: 超时后调用 `aiService.abort()`；用 `AbortController.timeout()` 替代手动 race；`useRef(isMounted)` 保护 finally 块

### P0-3 [架构] emit() 每次触发都做全量持久化 I/O
- **来源**: 万鉴识 P0-3
- **文件**: `ai-assistant/index.ts:293-298`
- **本质**: 流式输出时每个 token 到达都触发 `emit()` → 全量 JSON.stringify + localStorage.setItem + 文件系统写入
- **影响**: 浏览器主线程阻塞，流式输出性能劣化
- **修复**: 引入 500ms 去抖；分离流式 emit 与持久化 emit；`persistConversationsToFileSync` 仅在关键节点调用

### P0-4 [架构] Step 声称不可变但实际直接修改属性
- **来源**: 万鉴识 P0-4
- **文件**: `StepMemoryService.ts:484-520` + `:531-548`
- **本质**: 代码直接 `step.status = status` 修改缓存中对象，违反不可变约定，并发读取可能拿到不一致状态
- **影响**: StepMemoryService 缓存一致性
- **修复**: 更新时创建新对象 `{ ...step, status, completedAt }`，写时拷贝

### P0-5 [产品] Agent 视图两层三栏嵌套
- **来源**: 许清楚 P0-1
- **文件**: `App.tsx:436-446` + `StepAgent.tsx:364-437`
- **本质**: App.tsx 始终渲染 LeftPanel(240px)+RightPanel，StepAgent 内部又渲染了自己的 FileTree(170px)+RightPanel。用户看到两套左栏+两套右栏，1366px 下内容区被严重压缩
- **影响**: 布局严重冗余，文件树出现两次，右侧信息重复
- **修复**: 二选一——StepAgent 仅渲染聊天区，依赖 App 全局面板；或 App 在 agent 视图下隐藏全局面板

### P0-6 [产品] 消息气泡始终显示"AI 助手"，不随 Agent 角色变化
- **来源**: 许清楚 P0-2
- **文件**: `StepAgent.tsx:95-117`
- **本质**: `AGENT_COLORS` 定义了 writer/auditor/revisor 各自的颜色和标签，但 MessageBubble 行 106 静态写死 `"AI 助手"`
- **影响**: 用户无法区分消息是哪个 Agent 生成的，对话失去角色认知
- **修复**: AIChatMessage 增加 `agentType` 字段；MessageBubble 根据 `msg.agentType` 渲染对应标签和颜色

### P0-7 [产品] 文件树点击不预览内容
- **来源**: 许清楚 P0-3
- **文件**: `App.tsx:206` + `:424`
- **本质**: 行 206 点击文件调用 `onSelectView('file')`，但 `case 'file': return <StepAgent />` 只重新渲染 Agent 页面，完全不加载文件内容
- **影响**: 文件树形同虚设
- **修复**: 添加 `FileViewer` 组件，`case 'file'` 时读取并展示文件内容

### P0-8 [产品] Review 内嵌 Memory 与侧栏入口冲突
- **来源**: 许清楚 P0-4
- **文件**: `StepReview.tsx:636-639`
- **本质**: StepReview 第三个 Tab 直接渲染 `<StepMemory />`，左侧栏也有独立的"记忆体管理"入口。两个入口状态不同步
- **影响**: 功能入口冗余，用户困惑
- **修复**: 移除 Review 的 memory tab 改为跳转，或共享状态

### P0-9 [代码] App.tsx React Hooks 调用顺序违规
- **来源**: 寇豆码 P0-1
- **文件**: `App.tsx:376-378`
- **本质**: 第 376 行 `if (isMobile) return <MobileApp />` 是早期 return，其后的 `useEffect`（行 378）在早期 return 场景下不执行。窗口 resize 触发 isMobile 切换时 hooks 顺序错乱，轻则状态丢失，重则崩溃
- **影响**: 严重。违反 Rules of Hooks，非移动端首次渲染正常，但 resize 切换时可能崩溃
- **修复**: 将 `isMobile` 条件下移至 hooks 全部声明之后，或拆分为两层组件

---

## 三、P1 关键问题（15 项）

### 跨视角重叠问题

| 问题 | 架构视角 | 产品视角 | 代码视角 |
|:---|:---:|:---:|:---:|
| 布局嵌套/冗余面板 | — | P0-1 | P1-1 (renderCenter 重建) |
| 字体/颜色不统一 | — | P1-1/P1-2 | P2-6 |
| API 密钥 XOR 不安全 | P1-1 | — | ✅ 确认 |
| buildContext 假数据 | P1-2 | — | — |
| App 订阅粒度太粗 | P1-3 | — | P1-1 |
| AIAssistant 绕道 DataService | P1-4 | — | — |
| DependencyResolver 静默降级 | P1-5 | — | — |
| streamingContent 缺少节流 | P1-6 | — | — |
| 文件树折叠未实现 | — | P2-3 | P1-4 (onToggleBook 空函数) |
| 角色切换无通知 | — | P1-3 | — |
| 右侧面板信息重复 | — | P1-4 | — |
| InputBar 缺模型选择 | — | P1-5 | P1-3 (activeModel 依赖缺失) |
| 工具页字号不统一 | — | P1-6 | — |
| useUndoRedo 逻辑/副作用 | — | — | P2-2/P2-3 |
| 无 code splitting | — | — | P2-5 |

### P1-1 [架构] API 密钥 XOR 加密不安全
- XOR+base64 完全可逆，密钥 `'moyuan-lingbi-v1'` 硬编码
- 修复：Electron 用 `safeStorage`，浏览器用 Web Crypto API

### P1-2 [架构] buildContext 返回硬编码假数据
- `projectState.title` 为空字符串，`currentChapter` 为 null
- 修复：从 DataService 读取真实项目数据

### P1-3 [架构/产品/代码] 文件树折叠未实现
- `onToggleBook={(id) => {}}` 是空函数（寇豆码 P1-4）
- 文件选择后不更新 App 层高亮（许清楚 P2-3）
- 修复：实现 `onToggleBook`；通过 dataService 共享 `activeFileId`

### P1-4 [架构/产品] 右侧面板信息重复
- App.tsx 右栏"概览"和 StepAgent.tsx 右栏"概览"信息重叠达 60%（许清楚 P1-4）
- `renderCenter()` 非 memo 导致 step 组件潜在重建（寇豆码 P1-1）
- 修复：统一右栏职责；`renderCenter` 改用 `useMemo`

### P1-5 [架构/产品] 输入栏缺模型选择
- `activeModel` useMemo 依赖 `[]`（寇豆码 P1-3），模型切换后不生效
- InputBar 无法切换模型（许清楚 P1-5）
- 修复：补全 useMemo 依赖；在 InputBar 增加模型选择或快捷入口

### P1-6 [产品] 角色切换无通知
- aiAssistant 可在对话中自动切换 Agent，但界面上无任何提示
- 修复：插入系统提示消息 `🔄 已切换至 X Agent…`

### 其余 P1 项（单视角）
- [架构] AIAssistantService 绕过 DataService 直接读 localStorage（P1-4）
- [架构] DependencyResolver 串行模式静默降级（P1-5）
- [架构] streamingContent 缺少 RAF 节流（P1-6）
- [代码] App.tsx 内联回调致无效重渲染（P1-2）
- [代码] renderCenter 返回组件缺 key（P1-6）
- [产品] 工具页字号体系不统一（P1-6）

---

## 四、P2 可优化项（14 项）

详见各报告原文，此处仅列跨视角共识：

| 问题 | 提及者 | 优先级参考 |
|:---|:---|:---:|
| 1366px 布局偏紧 | 许清楚 P2-1 | P0-5 修复后再评估 |
| CSS 变量/硬编码不一致 | 寇豆码 P2-6 + 许清楚 P1-2 | 中 |
| 输入栏缺快捷指令 | 许清楚 P2-2 | 低 |
| 无 code splitting (1.1MB JS) | 寇豆码 P2-5 | 低 |
| undoRedo 逻辑可疑 | 寇豆码 P2-2/P2-3 | 低 |
| store timeout 组件卸载后仍执行 | 寇豆码 P2-4 | 低 |
| 流式滚动动画开销 | 寇豆码 P2-7 | 低 |
| VFile 缺内容类型区分 | 万鉴识 P2-1 | 低 |
| nanoid 重复实现 | 万鉴识 P2-2 | 低 |
| Conversation 压缩丢数据 | 万鉴识 P2-3 | 低 |
| agentId 强制类型转换 | 万鉴识 P2-4 | 低 |
| Electron API 无类型安全 | 万鉴识 P2-5 | 低 |

---

## 五、修复优先级建议

### 第一梯队 — 本周（严重度高 + 副作用小）

| 序号 | 问题 | 预估工日 | 依赖 |
|:---:|:---|---:|:---:|
| 1 | **P0-9**: App.tsx hooks 违规修复 | 0.5 | 无 |
| 2 | **P0-6**: 消息气泡 Agent 角色显示 | 0.5 | 无 |
| 3 | **P0-8**: Review/Memory 入口冲突 | 0.5 | 无 |
| 4 | **P0-7**: 文件树点击预览内容 | 1 | 需先确认 FileViewer 交互设计 |
| 5 | **P0-3**: emit 持久化去抖 | 1 | 无 |

### 第二梯队 — 本月（需架构决策）

| 序号 | 问题 | 预估工日 | 依赖 |
|:---:|:---|---:|:---:|
| 6 | **P0-1**: getFS/getData 深拷贝 | 1.5 | 需评估高频读取性能影响 |
| 7 | **P0-5**: 两层三栏嵌套 | 2 | 需确认 StepAgent 职责边界 |
| 8 | **P0-2**: 超时 AI 取消 + abort 竞态 | 1 | 与 aiService 接口协商 |
| 9 | **P0-4**: Step 写时拷贝 | 1 | 无 |
| 10 | **P1-2**: buildContext 真实数据 | 0.5 | 无 |
| 11 | **P1-3/P1-5**: 文件树折叠 + 模型选择 | 1.5 | 依赖 P0-5 布局决策 |

### 第三梯队 — 持续优化

- 字体/颜色体系统一
- 工具页字号规范
- code splitting / 懒加载
- API 密钥加密升级
- 角色切换通知
- 右栏职责统一

---

## 六、三个视角各自的根建议

### 架构（万鉴识）
> **「两个系统」风险**：`ai-assistant/index.ts`（旧单体）与 `agent-runtime/`（新 DAG 引擎）各自维护独立的 Agent 生命周期，协作关系不清晰。P0 项目标完成后应规划合并或明确路由。

### 产品/UI（许清楚）
> **「布局决定体验」**：P0-1 的嵌套布局是当前最大的体验问题——它不是一个修饰性问题，而是功能性障碍。先修布局，再修其他 UI。

### 代码质量（寇豆码）
> **「Hooks 违反不可协商」**：P0-1 (早期 return) 是 React 的红线规则，必须在所有其他优化之前修复。

---

*本报告由三份独立审查报告交叉对比生成，问题去重后共计 9 项 P0、15 项 P1、14 项 P2。*
