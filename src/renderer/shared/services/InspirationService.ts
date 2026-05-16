export interface Inspiration {
  id: string;
  content: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
  projectId?: string;
  type: 'idea' | 'dialogue' | 'character' | 'plot' | 'setting' | 'note';
}

export interface InspirationStats {
  totalCount: number;
  todayCount: number;
  weeklyCount: number;
  topTags: Array<{ tag: string; count: number }>;
}

interface InspirationStorage {
  inspirations: Inspiration[];
}

const STORAGE_KEY = 'moyuan-inspirations';

class InspirationService {
  private inspirations: Inspiration[] = [];

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const data: InspirationStorage = JSON.parse(stored);
        this.inspirations = data.inspirations || [];
      }
    } catch {
      this.inspirations = [];
    }
  }

  private saveToStorage(): void {
    try {
      const data: InspirationStorage = {
        inspirations: this.inspirations,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // ignore
    }
  }

  private generateId(): string {
    return `insp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  addInspiration(data: {
    content: string;
    tags?: string[];
    projectId?: string;
    type?: Inspiration['type'];
  }): Inspiration {
    const inspiration: Inspiration = {
      id: this.generateId(),
      content: data.content,
      tags: data.tags || [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      projectId: data.projectId,
      type: data.type || 'idea',
    };

    this.inspirations.unshift(inspiration);
    this.saveToStorage();
    return inspiration;
  }

  getInspiration(id: string): Inspiration | undefined {
    return this.inspirations.find(i => i.id === id);
  }

  getAllInspirations(): Inspiration[] {
    return [...this.inspirations];
  }

  getInspirationsByType(type: Inspiration['type']): Inspiration[] {
    return this.inspirations.filter(i => i.type === type);
  }

  getInspirationsByProject(projectId: string): Inspiration[] {
    return this.inspirations.filter(i => i.projectId === projectId);
  }

  getRecentInspirations(count: number = 10): Inspiration[] {
    return this.inspirations.slice(0, count);
  }

  searchInspirations(query: string): Inspiration[] {
    const lowerQuery = query.toLowerCase();
    return this.inspirations.filter(
      i =>
        i.content.toLowerCase().includes(lowerQuery) ||
        i.tags.some(tag => tag.toLowerCase().includes(lowerQuery))
    );
  }

  updateInspiration(id: string, updates: Partial<Inspiration>): Inspiration | undefined {
    const index = this.inspirations.findIndex(i => i.id === id);
    if (index === -1) return undefined;

    this.inspirations[index] = {
      ...this.inspirations[index],
      ...updates,
      updatedAt: Date.now(),
    };

    this.saveToStorage();
    return this.inspirations[index];
  }

  deleteInspiration(id: string): boolean {
    const index = this.inspirations.findIndex(i => i.id === id);
    if (index === -1) return false;

    this.inspirations.splice(index, 1);
    this.saveToStorage();
    return true;
  }

  getStats(): InspirationStats {
    const now = Date.now();
    const todayStart = new Date(now).setHours(0, 0, 0, 0);
    const weekStart = todayStart - 7 * 24 * 60 * 60 * 1000;

    const todayCount = this.inspirations.filter(i => i.createdAt >= todayStart).length;
    const weeklyCount = this.inspirations.filter(i => i.createdAt >= weekStart).length;

    const tagCounts: Record<string, number> = {};
    this.inspirations.forEach(i => {
      i.tags.forEach(tag => {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      });
    });

    const topTags = Object.entries(tagCounts)
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      totalCount: this.inspirations.length,
      todayCount,
      weeklyCount,
      topTags,
    };
  }

  clearAll(): void {
    this.inspirations = [];
    this.saveToStorage();
  }

  getTypeLabel(type: Inspiration['type']): string {
    const labels: Record<Inspiration['type'], string> = {
      idea: '灵感',
      dialogue: '对话',
      character: '角色',
      plot: '情节',
      setting: '场景',
      note: '笔记',
    };
    return labels[type];
  }

  getTypeColor(type: Inspiration['type']): string {
    const colors: Record<Inspiration['type'], string> = {
      idea: '#8b5cf6',
      dialogue: '#3b82f6',
      character: '#ec4899',
      plot: '#10b981',
      setting: '#f59e0b',
      note: '#6b7280',
    };
    return colors[type];
  }

  generatePrompt(inspiration: Inspiration): string {
    const typeLabel = this.getTypeLabel(inspiration.type);
    const tags = inspiration.tags.length > 0 ? `标签: ${inspiration.tags.join(', ')}` : '';
    return `${typeLabel}: ${inspiration.content}\n${tags}`;
  }
}

export const inspirationService = new InspirationService();
