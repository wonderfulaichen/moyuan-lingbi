import { VFile, VFileSystem, VFileMetadata, ProjectMeta, AppData } from '../../../shared/types/fileSystem';
import { AppState, Project } from '../../../shared/types';

const OLD_KEY = 'moyuan-lingbi-state';
const NEW_KEY = 'moyuan-v2-data';

function nanoid(): string {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

function createDefaultMetadata(partial?: Partial<VFileMetadata>): VFileMetadata {
  return {
    tags: [],
    favorited: true,
    cardType: '',
    references: [],
    aiGenerated: false,
    batchId: null,
    sortOrder: 0,
    ...partial,
  };
}

function mdContent(title: string, body: string, extra?: Record<string, string>): string {
  let md = `# ${title}\n\n`;
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      if (v) md += `**${k}**：${v}\n`;
    }
    md += '\n';
  }
  md += body;
  return md;
}

export function migrateOldProject(project: Project): { meta: ProjectMeta; fs: VFileSystem } {
  const now = Date.now();
  const files: Record<string, VFile> = {};
  const rootIds: string[] = [];

  const mkFolder = (name: string, cardType: string, sortOrder: number): string => {
    const id = nanoid();
    files[id] = {
      id, name, type: 'folder', parentId: null, content: '',
      metadata: createDefaultMetadata({ tags: [cardType], cardType, sortOrder }),
      childrenIds: [], createdAt: now, updatedAt: now, version: 1,
    };
    rootIds.push(id);
    return id;
  };

  const mkFile = (parentId: string, name: string, content: string, sortOrder: number, extra?: Partial<VFileMetadata>): string => {
    const id = nanoid();
    files[id] = {
      id, name, type: 'file', parentId, content,
      metadata: createDefaultMetadata({ sortOrder, ...extra }),
      childrenIds: [], createdAt: now, updatedAt: now, version: 1,
    };
    files[parentId].childrenIds.push(id);
    return id;
  };

  const worldId = mkFolder('世界观', 'world', 0);
  const charsId = mkFolder('角色', 'characters', 1);
  const timelineId = mkFolder('时间线', 'timeline', 2);
  const outlineId = mkFolder('大纲', 'outline', 3);
  const chaptersId = mkFolder('章节', 'chapters', 4);

  for (const loc of project.locations || []) {
    mkFile(worldId, loc.name || '未命名地点', mdContent(loc.name, loc.description || '', { '类型': loc.type, '特征': loc.features || '', '氛围': loc.atmosphere || '' }), files[worldId].childrenIds.length, { tags: ['world', 'location'] });
  }

  for (const fac of project.factions || []) {
    mkFile(worldId, fac.name || '未命名势力', mdContent(fac.name, fac.description || '', { '核心理念': fac.ideology || '', '领袖': fac.leader || '', '领地': fac.territory || '' }), files[worldId].childrenIds.length, { tags: ['world', 'faction'] });
  }

  for (const rule of project.ruleSystems || []) {
    mkFile(worldId, rule.name || '未命名规则', mdContent(rule.name, rule.description || '', { '类型': rule.type, '核心原则': rule.rules || '' }), files[worldId].childrenIds.length, { tags: ['world', 'rule'] });
  }

  for (const char of project.characters || []) {
    if (char.name === '新角色' || !char.name.trim()) continue;
    mkFile(charsId, char.name, mdContent(char.name, [char.background, char.personality, char.appearance].filter(Boolean).join('\n\n'), {
      '性别': char.gender, '年龄': char.age, '身份': char.role, '性格': char.personality,
      '外貌': char.appearance, '特征': char.distinctiveFeatures, '职业': char.occupation,
      '动机': char.motivation, '优势': char.strengths, '弱点': char.weaknesses, '人物弧线': char.characterArc,
    }), files[charsId].childrenIds.length, { tags: ['characters'] });
  }

  for (const evt of project.timelineEvents || []) {
    mkFile(timelineId, evt.title || '未命名事件', mdContent(evt.title, evt.description || '', { '时间': evt.timestamp }), files[timelineId].childrenIds.length, { tags: ['timeline'] });
  }

  if (project.outline) {
    mkFile(outlineId, '故事大纲', mdContent('故事大纲', project.outline), 0, { tags: ['outline'] });
  }

  const sortedChapters = [...(project.chapters || [])].sort((a, b) => a.order - b.order);
  for (const ch of sortedChapters) {
    mkFile(chaptersId, ch.title || `第${ch.order + 1}章`, mdContent(ch.title || `第${ch.order + 1}章`, ch.content || ch.summary || '', { '摘要': ch.summary }), files[chaptersId].childrenIds.length, { tags: ['chapters'] });
  }

  for (const folder of project.folders || []) {
    const folderId = mkFolder(folder.name, folder.type, rootIds.length);
    for (const card of folder.contentCards || []) {
      if (!card.isFavorited) continue;
      mkFile(folderId, card.title || card.tagText || '未命名', mdContent(card.title || card.tagText || '', card.content || ''), files[folderId].childrenIds.length, { tags: [folder.type], aiGenerated: card.batchId !== null, batchId: card.batchId });
    }
    for (const child of folder.children || []) {
      const subFolderId = nanoid();
      files[subFolderId] = {
        id: subFolderId, name: child.name, type: 'folder', parentId: folderId, content: '',
        metadata: createDefaultMetadata({ tags: [child.type], cardType: child.type }),
        childrenIds: [], createdAt: now, updatedAt: now, version: 1,
      };
      files[folderId].childrenIds.push(subFolderId);
      for (const card of child.contentCards || []) {
        if (!card.isFavorited) continue;
        mkFile(subFolderId, card.title || card.tagText || '未命名', mdContent(card.title || card.tagText || '', card.content || ''), files[subFolderId].childrenIds.length, { tags: [child.type] });
      }
    }
  }

  return {
    meta: { id: project.id, title: project.title, intro: '', inspiration: { text: '', tags: [], promptHistory: [] },
      novelSchemes: [],
      selectedSchemeId: null,
      schemeHistory: [],
      schemeGroups: [],
      schemePromptHistory: [],
      outline: '', createdAt: now, updatedAt: now, rootFolderIds: rootIds },
    fs: { files, rootIds },
  };
}

export function runMigration(): boolean {
  try {
    const newRaw = localStorage.getItem(NEW_KEY);
    if (newRaw) return false;

    const oldRaw = localStorage.getItem(OLD_KEY);
    if (!oldRaw) return false;

    const oldState: AppState = JSON.parse(oldRaw);
    if (!oldState.projects || oldState.projects.length === 0) return false;

    const newData: AppData = {
      projects: [],
      activeProjectId: oldState.activeProjectId,
      models: oldState.models,
      prompts: oldState.prompts,
      activeModelId: oldState.activeModelId,
      fileSystems: {},
    };

    for (const project of oldState.projects) {
      const { meta, fs } = migrateOldProject(project);
      newData.projects.push(meta);
      newData.fileSystems[meta.id] = fs;
    }

    localStorage.setItem(NEW_KEY, JSON.stringify(newData));
    console.log(`[Migration] 成功迁移 ${newData.projects.length} 个项目`);
    return true;
  } catch (e) {
    console.error('[Migration] 迁移失败:', e);
    return false;
  }
}
