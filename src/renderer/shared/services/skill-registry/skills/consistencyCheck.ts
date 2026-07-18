/**
 * 一致性检测 Skill
 *
 * 分析项目文件中的设定，检查前后矛盾。
 * 规则驱动：根据关键词、命名、时间线等规则检测冲突。
 */
import type { SkillDefinition } from '../types';

interface CheckRule {
  name: string;
  check: (text: string) => string[]; // 返回违规列表
}

/** 内置检测规则 */
const RULES: CheckRule[] = [
  {
    name: '角色名一致性',
    check(text) {
      const issues: string[] = [];
      // 检查角色名称是否在同一文档中矛盾
      const namePatterns = [
        { name: '主角', aliases: [/主角/g, /主人公/g, /男主/g] },
        { name: '女主', aliases: [/女主/g, /女主角/g, /女主人公/g] },
      ];
      for (const pattern of namePatterns) {
        const found = new Map<string, number[]>();
        for (const re of pattern.aliases) {
          let m;
          while ((m = re.exec(text)) !== null) {
            const lineNum = text.slice(0, m.index).split('\n').length;
            const key = re.source;
            if (!found.has(key)) found.set(key, []);
            found.get(key)!.push(lineNum);
          }
        }
        if (found.size > 1) {
          const counts = Array.from(found.entries()).map(([k, v]) => `${k}（${v.length}处）`);
          issues.push(`[${pattern.name}] 混用不同称呼：${counts.join('、')}。建议统一为一种称呼。`);
        }
      }
      return issues;
    },
  },
  {
    name: '时间线顺序',
    check(text) {
      const issues: string[] = [];
      // 检查"第X章"是否按顺序
      const chapters: { num: number; index: number }[] = [];
      const chapterRe = /第(\d+)\s*章/g;
      let m;
      while ((m = chapterRe.exec(text)) !== null) {
        chapters.push({ num: parseInt(m[1]), index: m.index });
      }
      for (let i = 1; i < chapters.length; i++) {
        if (chapters[i].num <= chapters[i - 1].num) {
          const lineNum = text.slice(0, chapters[i].index).split('\n').length;
          issues.push(`[时间线] 第 ${chapters[i - 1].num} 章之后出现第 ${chapters[i].num} 章（第 ${lineNum} 行），顺序可能错误。`);
        }
      }
      return issues;
    },
  },
  {
    name: '角色状态突变',
    check(text) {
      const issues: string[] = [];
      // 检查"死亡"后是否又"活着"（简单启发式）
      const deathPositions: number[] = [];
      const deathRe = /(?:死[了去]|阵亡|牺牲|陨落)/g;
      let m;
      while ((m = deathRe.exec(text)) !== null) deathPositions.push(m.index);

      if (deathPositions.length > 0) {
        const aliveRe = /活着|苏醒|复活|重生/g;
        let m2;
        let lastDeathIdx = deathPositions[deathPositions.length - 1];
        while ((m2 = aliveRe.exec(text)) !== null) {
          if (m2.index > lastDeathIdx) {
            issues.push(`[角色状态] 角色在死后续出现 "复活" 相关描述。如果是剧情设定请忽略，否则请检查。`);
            break;
          }
        }
      }
      return issues;
    },
  },
];

export const consistencyCheckSkill: SkillDefinition = {
  id: 'skill-consistency-check',
  name: '设定一致性检测',
  description: '分析项目文档，检测角色名混用、时间线错乱、状态矛盾等设定不一致问题',
  category: 'analysis',

  execute(input) {
    const { params } = input;
    const content = (params.content as string) || '';
    const ruleFilter = (params.rules as string) || ''; // 可选规则过滤

    if (!content) {
      return { success: false, result: '需要提供待检测的内容（params.content）' };
    }

    const allIssues: { rule: string; issues: string[] }[] = [];
    const applicableRules = ruleFilter
      ? RULES.filter((r) => r.name.includes(ruleFilter))
      : RULES;

    for (const rule of applicableRules) {
      const issues = rule.check(content);
      if (issues.length > 0) {
        allIssues.push({ rule: rule.name, issues });
      }
    }

    if (allIssues.length === 0) {
      return {
        success: true,
        result: '✅ 设定一致性检测通过，未发现问题。',
        data: { issues: [], passed: true },
      };
    }

    const report = allIssues
      .map((group) => `### ${group.rule}\n${group.issues.map((i) => `- ${i}`).join('\n')}`)
      .join('\n\n');

    return {
      success: true,
      result: `⚠️ 发现 ${allIssues.reduce((sum, g) => sum + g.issues.length, 0)} 个一致性问题：\n\n${report}`,
      data: {
        issues: allIssues,
        totalCount: allIssues.reduce((sum, g) => sum + g.issues.length, 0),
        passed: false,
      },
    };
  },
};
