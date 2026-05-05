import { dataService } from '../DataService';
import { ProjectMeta, VFile } from '../../../../shared/types/fileSystem';

type ContextTarget = 'character' | 'world' | 'timeline' | 'outline' | 'chapter' | 'general';

interface ContextOptions {
  maxContentLength: number;
  includeInspiration: boolean;
  includeScheme: boolean;
  includeOutline: boolean;
  includeProgress: boolean;
  includeExistingContent: boolean;
  maxExistingFiles: number;
}

const DEFAULT_OPTIONS: ContextOptions = {
  maxContentLength: 12000,
  includeInspiration: true,
  includeScheme: true,
  includeOutline: true,
  includeProgress: true,
  includeExistingContent: true,
  maxExistingFiles: 10,
};

export function detectTarget(userText: string): ContextTarget {
  const t = userText.toLowerCase();
  const charKeywords = ['角色', '人物', '主角', '配角', '反派', '女主', 'character'];
  const worldKeywords = ['世界观', '世界', '地点', '地图', '势力', '组织', '规则', '魔法', '修炼', '科技', 'world', 'location'];
  const timelineKeywords = ['时间线', '时间', '事件', '历史', 'timeline'];
  const outlineKeywords = ['大纲', '情节', '剧情', '故事线', 'outline'];
  const chapterKeywords = ['章节', '正文', '写作', '写一段', '续写', 'chapter'];

  if (charKeywords.some(k => t.includes(k))) return 'character';
  if (worldKeywords.some(k => t.includes(k))) return 'world';
  if (timelineKeywords.some(k => t.includes(k))) return 'timeline';
  if (chapterKeywords.some(k => t.includes(k))) return 'chapter';
  if (outlineKeywords.some(k => t.includes(k))) return 'outline';
  return 'general';
}

export function buildForTarget(target: ContextTarget, options: Partial<ContextOptions> = {}): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const project = dataService.getActiveProject();
  const sections: string[] = [];

  sections.push(buildProjectHeader(project));
  sections.push(buildInspiration(project, opts));
  sections.push(buildScheme(project, opts));

  if (target === 'character') {
    sections.push(buildCharacterContext(project, opts));
  } else if (target === 'world') {
    sections.push(buildWorldContext(project, opts));
  } else if (target === 'timeline') {
    sections.push(buildTimelineContext(project, opts));
  } else if (target === 'outline' || target === 'chapter') {
    sections.push(buildOutlineContext(project, opts));
  }

  sections.push(buildOutline(project, opts));
  sections.push(buildProgress(project, opts));

  return sections.filter(s => s.length > 0).join('\n\n');
}

export function buildFullContext(options: Partial<ContextOptions> = {}): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const project = dataService.getActiveProject();
  const sections: string[] = [];

  sections.push(buildProjectHeader(project));
  sections.push(buildInspiration(project, opts));
  sections.push(buildScheme(project, opts));
  sections.push(buildWorldContext(project, opts));
  sections.push(buildCharacterContext(project, opts));
  sections.push(buildTimelineContext(project, opts));
  sections.push(buildOutline(project, opts));
  sections.push(buildProgress(project, opts));

  return sections.filter(s => s.length > 0).join('\n\n');
}

function buildProjectHeader(project: ProjectMeta | null): string {
  if (!project) return '## 当前项目\n（无活跃项目）';
  const parts = [`## 当前项目\n项目名：${project.title || '未命名'}`];
  if (project.intro) parts.push(`小说简介：${project.intro}`);
  return parts.join('\n');
}

function buildInspiration(project: ProjectMeta | null, opts: ContextOptions): string {
  if (!opts.includeInspiration || !project?.inspiration?.text?.trim()) return '';
  return `## 💡 灵感来源\n${project.inspiration.text.slice(0, 500)}`;
}

function buildScheme(project: ProjectMeta | null, opts: ContextOptions): string {
  if (!opts.includeScheme || !project) return '';

  if (project.selectedSchemeId) {
    const scheme = project.novelSchemes?.find(s => s.id === project.selectedSchemeId);
    if (scheme) {
      return [
        '## 🎯 已选创作方案（必须遵守）',
        `- 标题：「${scheme.title}」`,
        `- 题材：${scheme.genre}`,
        `- 基调：${scheme.tone}`,
        `- 故事简介：${scheme.intro}`,
        `- 核心冲突：${scheme.coreConflict}`,
        `- 亮点特色：${scheme.highlights}`,
      ].join('\n');
    }
  }

  if ((project.novelSchemes?.length || 0) > 0) {
    return `## 🎯 创作方案（${project.novelSchemes!.length} 个待选择，尚未确认）`;
  }
  return '';
}

function buildCharacterContext(project: ProjectMeta | null, opts: ContextOptions): string {
  if (!opts.includeExistingContent) return '';
  const existing = getFilesByFolderType('characters', opts.maxExistingFiles);
  if (existing.length === 0) return '## 📋 已有角色\n（暂无角色设定）';

  const parts = ['## 📋 已有角色（生成新角色时必须参考，避免重复或矛盾）'];
  for (const f of existing) {
    const roleType = extractRoleType(f.content);
    const summary = f.content!.length > 300 ? f.content!.slice(0, 300) + '…' : f.content!;
    parts.push(`### ${f.name}${roleType ? ` [${roleType}]` : ''}\n${summary}`);
  }
  return parts.join('\n\n');
}

function buildWorldContext(project: ProjectMeta | null, opts: ContextOptions): string {
  if (!opts.includeExistingContent) return '';
  const existing = getFilesByFolderType('world', opts.maxExistingFiles);
  if (existing.length === 0) return '## 📋 已有世界观\n（暂无世界观设定）';

  const parts = ['## 📋 已有世界观设定（生成新内容时必须遵守这些规则）'];
  for (const f of existing) {
    const summary = f.content!.length > 400 ? f.content!.slice(0, 400) + '…' : f.content!;
    parts.push(`### ${f.name}\n${summary}`);
  }
  return parts.join('\n\n');
}

function buildTimelineContext(project: ProjectMeta | null, opts: ContextOptions): string {
  if (!opts.includeExistingContent) return '';
  const existing = getFilesByFolderType('timeline', opts.maxExistingFiles);
  if (existing.length === 0) return '## 📋 已有时间线\n（暂无时间线事件）';

  const parts = ['## 📋 已有时间线事件（新事件必须与这些事件逻辑一致）'];
  for (const f of existing) {
    const summary = f.content!.length > 200 ? f.content!.slice(0, 200) + '…' : f.content!;
    parts.push(`### ${f.name}\n${summary}`);
  }
  return parts.join('\n\n');
}

function buildOutlineContext(project: ProjectMeta | null, opts: ContextOptions): string {
  if (!opts.includeExistingContent) return '';
  const outlineFiles = getFilesByFolderType('outline', opts.maxExistingFiles);
  const chapterFiles = getFilesByFolderType('chapters', opts.maxExistingFiles);

  const parts: string[] = [];
  if (outlineFiles.length > 0) {
    parts.push('## 📋 已有大纲');
    for (const f of outlineFiles) {
      const summary = f.content!.length > 500 ? f.content!.slice(0, 500) + '…' : f.content!;
      parts.push(`### ${f.name}\n${summary}`);
    }
  }
  if (chapterFiles.length > 0) {
    parts.push(`## 📋 已有章节（${chapterFiles.length} 章）`);
    for (const f of chapterFiles.slice(0, 5)) {
      const summary = f.content!.length > 200 ? f.content!.slice(0, 200) + '…' : f.content!;
      parts.push(`### ${f.name}\n${summary}`);
    }
    if (chapterFiles.length > 5) {
      parts.push(`…还有 ${chapterFiles.length - 5} 个章节`);
    }
  }
  return parts.join('\n\n');
}

function buildOutline(project: ProjectMeta | null, opts: ContextOptions): string {
  if (!opts.includeOutline || !project) return '';
  if (project.outline?.trim()) {
    return `## 📖 大纲\n${project.outline.slice(0, 800)}`;
  }
  return '## 📖 大纲：尚未创建';
}

function buildProgress(project: ProjectMeta | null, opts: ContextOptions): string {
  if (!opts.includeProgress) return '';
  const rootFolders = dataService.getChildren(null).filter(c => c.type === 'folder');
  const typeLabels: Record<string, string> = { characters: '角色', world: '世界观', timeline: '时间线', outline: '大纲', chapters: '章节' };
  const emptyTypes: string[] = [];
  const filledTypes: string[] = [];

  for (const f of rootFolders) {
    const childFiles = dataService.getChildren(f.id).filter(c => c.type === 'file' && c.content);
    const label = typeLabels[f.metadata?.folderType as string] || f.name;
    if (childFiles.length === 0) {
      emptyTypes.push(label);
    } else {
      filledTypes.push(`${label}(${childFiles.length})`);
    }
  }

  const parts: string[] = ['## 📋 创作进度'];
  if (filledTypes.length > 0) {
    parts.push(`已完成：${filledTypes.join('、')}`);
  }
  if (emptyTypes.length > 0) {
    parts.push(`尚未填写：${emptyTypes.join('、')}`);
    parts.push('建议优先补全空白的设定文件夹，或先生成大纲再逐步填充。');
  }
  return parts.join('\n');
}

function getFilesByFolderType(folderType: string, maxFiles: number): VFile[] {
  const folderId = dataService.getRootFolderIdByType(folderType);
  if (!folderId) return [];
  const children = dataService.getChildren(folderId).filter(c => c.type === 'file' && c.content && c.metadata.favorited);
  return children.slice(0, maxFiles);
}

function extractRoleType(content: string | undefined): string {
  if (!content) return '';
  const match = content.match(/【角色类型[：:]\s*([^】]+)】/);
  return match ? match[1].trim() : '';
}

export function summarizeTask(text: string): string {
  const target = detectTarget(text);
  const labels: Record<string, string> = {
    character: '角色创作',
    world: '世界观构建',
    timeline: '时间线规划',
    outline: '大纲设计',
    chapter: '章节写作',
    general: '通用任务',
  };
  return labels[target] || '处理中';
}

export function buildFileTreeDescription(): string {
  const lines: string[] = [];
  const build = (parentId: string | null, indent: number) => {
    const children = dataService.getChildren(parentId);
    for (const child of children) {
      if (child.type === 'folder') {
        const fileCount = dataService.getChildren(child.id).filter(c => c.type === 'file').length;
        lines.push(`${'  '.repeat(indent)}📁 ${child.name} [id:${child.id}] (${fileCount}个文件)`);
        build(child.id, indent + 1);
      } else {
        const size = child.content ? `${child.content.length}字` : '空';
        const fav = child.metadata.favorited ? ' ⭐' : '';
        const tags = child.metadata.tags.length > 0 ? ` #${child.metadata.tags.join(' #')}` : '';
        lines.push(`${'  '.repeat(indent)}📄 ${child.name} [id:${child.id}] ${size}${fav}${tags}`);
      }
    }
  };
  build(null, 0);
  return lines.join('\n') || '（空项目）';
}

export function detectCreateIntent(userText: string): boolean {
  const t = userText.toLowerCase();
  const createWords = ['创建', '生成', '添加', '完善', '帮我', '写', '做', '设计', '规划', '建立', '制作', '补充', '扩展', '补全', '填充', '创建'];
  const targetWords = ['角色', '人物', '世界观', '世界', '地点', '时间线', '时间', '大纲', '势力', '组织', '规则', '魔法', '体系', '设定', '内容', '档案', '卡片'];
  return createWords.some(w => t.includes(w)) && targetWords.some(w => t.includes(w));
}

export function estimateTokenCount(text: string): number {
  if (!text) return 0;
  let count = 0;
  for (const ch of text) {
    if (/[\u4e00-\u9fff\u3400-\u4dbf]/.test(ch)) count += 2;
    else if (ch > ' ') count += 0.25;
  }
  return Math.ceil(count);
}
