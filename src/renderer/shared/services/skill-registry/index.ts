/**
 * Skill Registry — Agent 技能注册与调度中心
 *
 * 单例模式，全局唯一。
 * 提供技能的注册(push)、查询(find)和执行(execute)能力。
 */
import type { SkillDefinition, SkillInput, SkillOutput } from './types';
import { tokenSaverSkill } from './skills/tokenSaver';
import { contextCompressSkill } from './skills/contextCompress';
import { consistencyCheckSkill } from './skills/consistencyCheck';

type SkillListener = (event: { type: 'executed'; skillId: string; result: SkillOutput }) => void;

class SkillRegistry {
  private static instance: SkillRegistry | null = null;
  private skills: Map<string, SkillDefinition> = new Map();
  private listeners: Set<SkillListener> = new Set();

  private constructor() {
    this.registerBuiltInSkills();
  }

  static getInstance(): SkillRegistry {
    if (!SkillRegistry.instance) {
      SkillRegistry.instance = new SkillRegistry();
    }
    return SkillRegistry.instance;
  }

  /** 注册内置 Skill */
  private registerBuiltInSkills(): void {
    this.skills.set(tokenSaverSkill.id, tokenSaverSkill);
    this.skills.set(contextCompressSkill.id, contextCompressSkill);
    this.skills.set(consistencyCheckSkill.id, consistencyCheckSkill);
  }

  /** 注册一个新 Skill（支持外部扩展） */
  register(skill: SkillDefinition): void {
    if (this.skills.has(skill.id)) {
      console.warn(`[SkillRegistry] Skill "${skill.id}" 已存在，将被覆盖`);
    }
    this.skills.set(skill.id, skill);
  }

  /** 按 ID 查找 */
  find(id: string): SkillDefinition | undefined {
    return this.skills.get(id);
  }

  /** 按关键词搜索 */
  search(keyword: string): SkillDefinition[] {
    const kw = keyword.toLowerCase();
    return Array.from(this.skills.values()).filter(
      (s) =>
        s.id.toLowerCase().includes(kw) ||
        s.name.toLowerCase().includes(kw) ||
        s.description.toLowerCase().includes(kw),
    );
  }

  /** 按分类获取 */
  getByCategory(category: SkillDefinition['category']): SkillDefinition[] {
    return Array.from(this.skills.values()).filter((s) => s.category === category);
  }

  /** 获取所有 Skill */
  listAll(): SkillDefinition[] {
    return Array.from(this.skills.values());
  }

  /** 执行 Skill */
  async execute(skillId: string, input: SkillInput): Promise<SkillOutput> {
    const skill = this.skills.get(skillId);
    if (!skill) {
      return { success: false, result: `Skill "${skillId}" 不存在` };
    }

    try {
      const output = await skill.execute(input);
      // 广播执行事件
      for (const fn of this.listeners) {
        try { fn({ type: 'executed', skillId, result: output }); } catch {}
      }
      return output;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Skill 执行异常';
      return { success: false, result: `[${skill.name}] 执行失败: ${msg}` };
    }
  }

  /** 构造 Agent 可用的 Skill 描述文本（拼进 system prompt） */
  buildSkillListForPrompt(): string {
    const lines = ['## 可用技能列表 (Skill)', ''];
    for (const s of this.skills.values()) {
      lines.push(`- **${s.name}** (${s.id}): ${s.description}`);
    }
    lines.push(...[
      '',
      '如需调用某个 Skill，使用以下格式：',
      '```tool',
      '{"action": "invoke_skill", "skill": "skill-id", "params": {"key": "value"}}',
      '```',
    ]);
    return lines.join('\n');
  }

  /** 订阅 Skill 执行事件 */
  subscribe(fn: SkillListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}

/** 全局单例 */
export const skillRegistry = SkillRegistry.getInstance();
export type { SkillDefinition, SkillInput, SkillOutput } from './types';
