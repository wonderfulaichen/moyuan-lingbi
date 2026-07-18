/**
 * Agent 实现模块
 *
 * 独立 Agent 的实现文件，每个 Agent 作为纯函数导出。
 *
 * ## 设计原则
 *
 * 1. **一个文件一个 Agent** — 每个 Agent 的执行逻辑独立成文件
 * 2. **纯函数导出** — 不暴露类，不依赖内部状态
 * 3. **可独立调用** — 也可通过 AgentRuntime 编排运行
 * 4. **统一接口** — 所有 Agent 函数签名保持一致
 * 5. **Revisor 复用 Writer** — Revisor 不新增 Agent 类型，改写复用 Writer prompt
 *
 * ## 已实现
 *
 * | Agent | 文件 | 函数 | 用途 |
 * |-------|------|------|------|
 * | Writer | WriterAgent.ts | executeWriterAgent() | 章节生成 |
 * | Auditor | AuditorAgent.ts | executeAuditorAgent() | 质量审校 |
 * | Revisor | RevisorAgent.ts | executeRevisorAgent() | 修订改写（复用 Writer） |
 */

export { executeWriterAgent } from './WriterAgent';
export type { WriterInput } from './WriterAgent';

export { executeAuditorAgent } from './AuditorAgent';
export type { AuditorInput } from './AuditorAgent';

export { executeRevisorAgent } from './RevisorAgent';
export type { RevisorInput } from './RevisorAgent';

export { executePlannerAgent } from './PlannerAgent';
export type { PlannerInput } from './PlannerAgent';

export { executeResearcherAgent } from './ResearcherAgent';
export type { ResearcherInput } from './ResearcherAgent';

export { executeMemoryAgent } from './MemoryAgent';
export type { MemoryInput } from './MemoryAgent';
