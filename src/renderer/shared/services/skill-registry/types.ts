/**
 * Skill Registry 类型定义
 *
 * Skill = Agent 可调用的"能力模块"（横切能力层）
 * 区别于 Agent（角色人格），Skill 是可复用的工具函数
 */

/** Skill 执行输入 */
export interface SkillInput {
  /** 参数（key-value 形式，由 Agent 在 tool call 中传入） */
  params: Record<string, string | number | boolean | string[]>;
  /** 可选的当前消息 ID（用于执行完后提供反馈） */
  messageId?: string;
}

/** Skill 执行输出 */
export interface SkillOutput {
  /** 是否成功 */
  success: boolean;
  /** 执行结果描述 */
  result: string;
  /** 结构化数据（可选，供 Agent 后续使用） */
  data?: Record<string, unknown>;
}

/** Skill 定义 */
export interface SkillDefinition {
  /** 唯一 ID */
  id: string;
  /** 人类可读名称 */
  name: string;
  /** 描述（Agent 据此决定是否调用） */
  description: string;
  /** 执行函数 */
  execute: (input: SkillInput) => Promise<SkillOutput> | SkillOutput;
  /** 分类标签 */
  category: 'token' | 'content' | 'analysis' | 'system';
}

/** Skill 执行上下文（注册时注入） */
export interface SkillExecutionContext {
  /** 获取当前项目文件列表 */
  getProjectFiles: () => string[];
  /** 获取当前对话消息 */
  getMessages: () => { role: string; content: string }[];
}
