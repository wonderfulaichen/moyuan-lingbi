import { AtomicMemory } from '../../../shared/types';

export type HealthIssueSeverity = 'error' | 'warning' | 'info';

export interface HealthIssue {
  id: string;
  type: 'duplicate' | 'incomplete' | 'consistency';
  severity: HealthIssueSeverity;
  title: string;
  description: string;
  relatedId?: string;
}

export interface HealthCheckResult {
  score: number;
  issues: HealthIssue[];
}

export const MemoryHealthService = {
  checkDuplicates(atomic: AtomicMemory): HealthIssue[] {
    const issues: HealthIssue[] = [];

    const charNames = new Map<string, string[]>();
    atomic.characters.forEach(char => {
      if (!char.name) return;
      const existing = charNames.get(char.name) || [];
      existing.push(char.id);
      charNames.set(char.name, existing);
    });
    charNames.forEach((ids, name) => {
      if (ids.length > 1) {
        issues.push({
          id: `dup-char-${name}`,
          type: 'duplicate',
          severity: 'error',
          title: '重复的角色名称',
          description: `角色名称 "${name}" 被 ${ids.length} 个角色使用`,
          relatedId: name
        });
      }
    });

    const geoCounts = new Map<string, number>();
    atomic.world.geography.forEach(geo => {
      geoCounts.set(geo, (geoCounts.get(geo) || 0) + 1);
    });
    geoCounts.forEach((count, geo) => {
      if (count > 1) {
        issues.push({
          id: `dup-geo-${geo}`,
          type: 'duplicate',
          severity: 'warning',
          title: '重复的地理名称',
          description: `地理名称 "${geo}" 出现了 ${count} 次`,
          relatedId: geo
        });
      }
    });

    const plotDescs = new Map<string, string[]>();
    atomic.plots.forEach(plot => {
      if (!plot.description) return;
      const existing = plotDescs.get(plot.description) || [];
      existing.push(plot.id);
      plotDescs.set(plot.description, existing);
    });
    plotDescs.forEach((ids, desc) => {
      if (ids.length > 1) {
        issues.push({
          id: `dup-plot-${desc}`,
          type: 'duplicate',
          severity: 'warning',
          title: '重复的剧情描述',
          description: `剧情描述 "${desc}" 被 ${ids.length} 个剧情使用`,
          relatedId: desc
        });
      }
    });

    return issues;
  },

  checkCompleteness(atomic: AtomicMemory): HealthIssue[] {
    const issues: HealthIssue[] = [];

    atomic.characters.forEach(char => {
      if (!char.name || !char.identity) {
        issues.push({
          id: `inc-char-${char.id}`,
          type: 'incomplete',
          severity: 'warning',
          title: '角色信息不完整',
          description: `角色 ${char.name || '无名'} 缺少名称或身份信息`,
          relatedId: char.id
        });
      }
    });

    if (atomic.plots.length === 0) {
      issues.push({
        id: 'inc-plots',
        type: 'incomplete',
        severity: 'info',
        title: '缺少剧情记忆',
        description: '记忆体中还没有剧情记录',
      });
    }

    if (atomic.world.rules.length === 0 && !atomic.world.cosmology) {
      issues.push({
        id: 'inc-world',
        type: 'incomplete',
        severity: 'info',
        title: '世界观信息较少',
        description: '建议添加一些世界观规则或力量体系设定',
      });
    }

    return issues;
  },

  checkConsistency(atomic: AtomicMemory): HealthIssue[] {
    const issues: HealthIssue[] = [];

    atomic.characters.forEach(char => {
      const relationsToSameTarget = new Map<string, string[]>();
      char.relationships.forEach(rel => {
        const existing = relationsToSameTarget.get(rel.targetId) || [];
        existing.push(rel.type);
        relationsToSameTarget.set(rel.targetId, existing);
      });
      relationsToSameTarget.forEach((types, targetId) => {
        if (types.length > 1) {
          const hasConflict = (types.includes('family') || types.includes('ally')) && types.includes('enemy');
          if (hasConflict) {
            issues.push({
              id: `cons-rel-${char.id}-${targetId}`,
              type: 'consistency',
              severity: 'error',
              title: '角色关系冲突',
              description: `角色 "${char.name}" 对同一对象有多种冲突关系: ${types.join(', ')}`,
              relatedId: char.id
            });
          }
        }
      });
    });

    return issues;
  },

  runHealthCheck(atomic: AtomicMemory): HealthCheckResult {
    const allIssues: HealthIssue[] = [
      ...this.checkDuplicates(atomic),
      ...this.checkCompleteness(atomic),
      ...this.checkConsistency(atomic)
    ];

    let score = 100;
    allIssues.forEach(issue => {
      switch (issue.severity) {
        case 'error':
          score -= 10;
          break;
        case 'warning':
          score -= 3;
          break;
        case 'info':
          score -= 1;
          break;
      }
    });
    score = Math.max(0, score);

    return {
      score,
      issues: allIssues
    };
  }
};
