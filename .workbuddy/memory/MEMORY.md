# 墨渊灵笔项目长期记忆

## 产品方向
- **核心价值**：AI 辅助小说创作的 Agent 流水线，GUI + Agent 双模式
- **竞品对标**：InkOS（已验证 45 万字长篇 Agent 闭环）
- **差异化**：GUI 是护城河，Agent 是攻城锤

## 关键决策记录
- ✅ Agent 优先于游离功能（番茄钟/白噪音/成就后补）
- ✅ Agent 模式采用混合策略（P0 逐章确认 → P1 全自动批次）
- ✅ 手机端保留代码但暂停推进，聚焦桌面端
- ✅ 用户仅对"创作助手"主 Agent 说话，子 Agent 默认隐藏（80%场景）
- ✅ **2026-06-11** 打通 ai-assistant（对话层）与 agent-runtime（流水线层）：子 Agent 注册到 UI Agent 列表中，选择后直接路由到对应 systemPrompt

## 架构模式
- 主 Agent（创作助手）→ 子 Agent（8个专业写作角色）→ Skill（能力模块）→ 系统级 Skill（横切能力）
- 原 Writer/Auditor/Revisor 线性流水线 → 星形调度
- Auditor 拆分为多个专业审计子 Agent
- **Agent 实现模式**：轻函数式（非类继承），核心在 prompt 不在代码
- **P0 UI 策略**：逐章确认仅展示三卡片（Writer 输出 / Auditor 批注 / Revisor 修订）+ 三个按钮（确认/退回修改/跳过）
- **Revisor 策略**：P0 复用 Writer Agent（不同 prompt 上下文），P1 视差异再拆分
- **Agent 工作流存储**：使用 StepMemory 记录每步，支持后续打断恢复

## Phase 0 已交付模块
### StepMemoryService (`src/renderer/shared/services/step-memory/`)
- Step CRUD + 依赖管理 + Fragment 记忆体管理
- 两级缓存（内存 + StorageProvider 持久化）
- 单例模式，懒加载

### Agent 接口层 (`src/renderer/shared/services/agent-runtime/`)
- 标准 AgentInput/AgentOutput/AgentDefinition 类型
- AgentRegistry 单例（内置 5 Agent + 自定义注册）
- 与 StepMemory 类型互通（context/fragment 共享）

### AgentRuntime 调度引擎 (`src/renderer/shared/services/agent-runtime/`)
- 拓扑排序 + 串行执行 + 取消机制 + 事件系统
- 重试策略（指数退避）+ LLM 超时保护（120s）
- 100 测试通过，Health 评分 95/100

## 路线图
| 阶段 | 时间 | 重点 | 状态 |
|------|------|------|------|
| Phase 0 | 0-2周 | StepMemory + Agent 接口规范 | ✅ |
| P0-W1 | W1 | Writer Agent (prompt + 执行函数) | ✅ |
| P0-W2 | W2 | Auditor + Revisor Agent + 注册 | ✅ |
| P0-W3 | W3 | App 三栏布局重构 + StepAgent 对话界面 | ✅ |
| P0-W4 | 晚场 | Skill Registry + 子Agent补齐(Planner/Researcher/Memory) + 集成 | ✅ |
| P0-桥接 | 6/11 | 10个Agent全入UI选择器 + 路由到真实流水线 | ✅ 当前 |
| P1 | 待定 | 全自动批次 + 记忆体图谱 + 游离功能 | 📅 |
| P2 | 待定 | 成就系统 + 手机轻量版 + Truth Files | 📅 |

## 已知技术债
- ~~`AgentRuntime.ts:428` — markStepCompleted 传参错误~~ → ✅ 审查确认代码已是正确形态
- ~~`AgentRuntime.ts:209` — getChainStatus 未 await~~ → ✅ 已修复
- ✅ StepRunner 已有单元测试
- 4 个 MemoryVersionControl 测试预存失败（与 Agent 无关）

## 架构现状（2026-06-11）
- **ai-assistant**（对话层）：5 内置 Agent + 5 子 Agent（章节写手/审校员/大纲规划师/资料研究员/记忆整理专家），UI 可选，选型后路由到对应 systemPrompt
- **agent-runtime**（流水线层）：10 Agent 注册 + 3 Skill 注册，AgentRuntime DAG 引擎就绪
- **Skill 系统**：skill-registry 单例 + tokenSaver/contextCompress/consistencyCheck 三个内置 Skill，通过 invoke_skill tool call 调用

## 技术栈
- React 18 + Vite 6 + Electron 39 + Capacitor 8
- TypeScript
