import { describe, it, expect, beforeEach, vi } from 'vitest';
import { migrateOldProject, runMigration } from './MigrationService';
import { Project, AppState } from '../../../shared/types';
import { AppData } from '../../../shared/types/fileSystem';

/**
 * MigrationService 测试
 *
 * 覆盖两个核心函数：
 * - migrateOldProject：旧 Project 结构 → 新 {meta, fs} 结构
 * - runMigration：localStorage 旧 key → 新 key 的完整迁移流程
 *
 * 测试策略：
 * - 构造完整的旧 Project 对象（含所有可选字段）
 * - 验证转换后的 fs 结构、rootIds、文件内容
 * - 验证 runMigration 的幂等性、错误恢复、空数据处理
 */

const OLD_KEY = 'moyuan-lingbi-state';
const NEW_KEY = 'moyuan-v2-data';

function createOldProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'proj-1',
    title: '测试项目',
    characters: [],
    chapters: [],
    outline: '',
    locations: [],
    factions: [],
    ruleSystems: [],
    timelineEvents: [],
    folders: [],
    ...overrides,
  } as Project;
}

describe('MigrationService', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('migrateOldProject', () => {
    it('应该创建 5 个默认根文件夹', () => {
      const { meta, fs } = migrateOldProject(createOldProject());

      expect(meta.rootFolderIds).toHaveLength(5);
      expect(fs.rootIds).toHaveLength(5);

      const folderNames = fs.rootIds.map(id => fs.files[id].name);
      expect(folderNames).toEqual(['世界观', '角色', '时间线', '大纲', '章节']);
    });

    it('应该正确设置文件夹的 cardType 和 sortOrder', () => {
      const { fs } = migrateOldProject(createOldProject());

      const rootFolders = fs.rootIds.map(id => fs.files[id]);
      expect(rootFolders[0].metadata.cardType).toBe('world');
      expect(rootFolders[0].metadata.sortOrder).toBe(0);
      expect(rootFolders[1].metadata.cardType).toBe('characters');
      expect(rootFolders[1].metadata.sortOrder).toBe(1);
      expect(rootFolders[2].metadata.cardType).toBe('timeline');
      expect(rootFolders[3].metadata.cardType).toBe('outline');
      expect(rootFolders[4].metadata.cardType).toBe('chapters');
    });

    it('应该迁移 locations 到世界观文件夹', () => {
      const project = createOldProject({
        locations: [
          { id: 'l1', name: '青云山', description: '仙门所在', type: '山脉', features: '灵气', atmosphere: '清幽' },
        ],
      });

      const { fs } = migrateOldProject(project);
      const worldFolder = fs.files[fs.rootIds[0]];
      expect(worldFolder.childrenIds).toHaveLength(1);

      const locFile = fs.files[worldFolder.childrenIds[0]];
      expect(locFile.name).toBe('青云山');
      expect(locFile.content).toContain('青云山');
      expect(locFile.content).toContain('仙门所在');
      expect(locFile.content).toContain('类型');
      expect(locFile.content).toContain('山脉');
      expect(locFile.metadata.tags).toContain('world');
      expect(locFile.metadata.tags).toContain('location');
    });

    it('应该迁移 factions 到世界观文件夹', () => {
      const project = createOldProject({
        factions: [
          { id: 'f1', name: '青云门', description: '正道之首', ideology: '除魔卫道', leader: '掌门', territory: '青云山' },
        ],
      });

      const { fs } = migrateOldProject(project);
      const worldFolder = fs.files[fs.rootIds[0]];
      const facFile = fs.files[worldFolder.childrenIds[0]];
      expect(facFile.name).toBe('青云门');
      expect(facFile.content).toContain('核心理念');
      expect(facFile.content).toContain('除魔卫道');
      expect(facFile.metadata.tags).toContain('faction');
    });

    it('应该迁移 ruleSystems 到世界观文件夹', () => {
      const project = createOldProject({
        ruleSystems: [
          { id: 'r1', name: '修真体系', description: '炼气到元婴', type: '修炼', rules: '循序渐进' },
        ],
      });

      const { fs } = migrateOldProject(project);
      const worldFolder = fs.files[fs.rootIds[0]];
      const ruleFile = fs.files[worldFolder.childrenIds[0]];
      expect(ruleFile.name).toBe('修真体系');
      expect(ruleFile.content).toContain('核心原则');
      expect(ruleFile.metadata.tags).toContain('rule');
    });

    it('应该迁移 characters 到角色文件夹（过滤空名称）', () => {
      const project = createOldProject({
        characters: [
          { id: 'c1', name: '李云飞', background: '山村少年', personality: '勇敢', appearance: '俊朗', gender: '男', age: '20' } as any,
          { id: 'c2', name: '新角色' } as any, // 应被过滤
          { id: 'c3', name: '  ' } as any, // 应被过滤
        ],
      });

      const { fs } = migrateOldProject(project);
      const charsFolder = fs.files[fs.rootIds[1]];
      expect(charsFolder.childrenIds).toHaveLength(1);

      const charFile = fs.files[charsFolder.childrenIds[0]];
      expect(charFile.name).toBe('李云飞');
      expect(charFile.content).toContain('山村少年');
      expect(charFile.content).toContain('勇敢');
      expect(charFile.content).toContain('性别');
      expect(charFile.content).toContain('男');
    });

    it('应该迁移 timelineEvents 到时间线文件夹', () => {
      const project = createOldProject({
        timelineEvents: [
          { id: 'e1', title: '神魔大战', description: '上古大战', timestamp: '万年前', order: 0 },
        ],
      });

      const { fs } = migrateOldProject(project);
      const timelineFolder = fs.files[fs.rootIds[2]];
      const evtFile = fs.files[timelineFolder.childrenIds[0]];
      expect(evtFile.name).toBe('神魔大战');
      expect(evtFile.content).toContain('时间');
      expect(evtFile.content).toContain('万年前');
    });

    it('应该迁移 outline 到大纲文件夹', () => {
      const project = createOldProject({
        outline: '这是一个关于修真的故事',
      });

      const { fs } = migrateOldProject(project);
      const outlineFolder = fs.files[fs.rootIds[3]];
      expect(outlineFolder.childrenIds).toHaveLength(1);
      const outlineFile = fs.files[outlineFolder.childrenIds[0]];
      expect(outlineFile.content).toContain('这是一个关于修真的故事');
    });

    it('无 outline 时大纲文件夹应为空', () => {
      const { fs } = migrateOldProject(createOldProject());
      const outlineFolder = fs.files[fs.rootIds[3]];
      expect(outlineFolder.childrenIds).toHaveLength(0);
    });

    it('应该按 order 排序迁移 chapters', () => {
      const project = createOldProject({
        chapters: [
          { id: 'ch2', title: '第二章', content: '内容2', summary: '', order: 1 },
          { id: 'ch1', title: '第一章', content: '内容1', summary: '', order: 0 },
          { id: 'ch3', title: '第三章', content: '内容3', summary: '概要3', order: 2 },
        ],
      });

      const { fs } = migrateOldProject(project);
      const chaptersFolder = fs.files[fs.rootIds[4]];
      expect(chaptersFolder.childrenIds).toHaveLength(3);

      const ch1 = fs.files[chaptersFolder.childrenIds[0]];
      const ch2 = fs.files[chaptersFolder.childrenIds[1]];
      const ch3 = fs.files[chaptersFolder.childrenIds[2]];
      expect(ch1.name).toBe('第一章');
      expect(ch2.name).toBe('第二章');
      expect(ch3.name).toBe('第三章');
      expect(ch3.content).toContain('概要3'); // summary 应包含
    });

    it('应该迁移 folders 及其 contentCards（仅 isFavorited）', () => {
      const project = createOldProject({
        folders: [
          {
            id: 'fold1', name: '自定义文件夹', type: 'custom',
            contentCards: [
              { id: 'card1', title: '收藏卡片', content: '内容', tagText: '', isFavorited: true, batchId: 'b1', createdAt: 0, updatedAt: 0 },
              { id: 'card2', title: '未收藏', content: '内容2', tagText: '', isFavorited: false, batchId: null, createdAt: 0, updatedAt: 0 },
            ],
            children: [],
          } as any,
        ],
      });

      const { fs, meta } = migrateOldProject(project);
      expect(meta.rootFolderIds).toHaveLength(6); // 5 默认 + 1 自定义
      const customFolder = fs.files[meta.rootFolderIds[5]];
      expect(customFolder.name).toBe('自定义文件夹');
      expect(customFolder.childrenIds).toHaveLength(1); // 只收藏的卡片

      const cardFile = fs.files[customFolder.childrenIds[0]];
      expect(cardFile.name).toBe('收藏卡片');
      expect(cardFile.metadata.aiGenerated).toBe(true);
      expect(cardFile.metadata.batchId).toBe('b1');
    });

    it('应该迁移 folders 的子文件夹', () => {
      const project = createOldProject({
        folders: [
          {
            id: 'fold1', name: '父文件夹', type: 'custom',
            contentCards: [],
            children: [
              {
                id: 'sub1', name: '子文件夹', type: 'custom',
                contentCards: [
                  { id: 'c1', title: '子卡片', content: '内容', tagText: '', isFavorited: true, batchId: null, createdAt: 0, updatedAt: 0 },
                ],
                children: [],
              } as any,
            ],
          } as any,
        ],
      });

      const { fs, meta } = migrateOldProject(project);
      const parentFolder = fs.files[meta.rootFolderIds[5]];
      expect(parentFolder.childrenIds).toHaveLength(1);

      const subFolder = fs.files[parentFolder.childrenIds[0]];
      expect(subFolder.name).toBe('子文件夹');
      expect(subFolder.type).toBe('folder');
      expect(subFolder.parentId).toBe(parentFolder.id);

      expect(subFolder.childrenIds).toHaveLength(1);
      const subCard = fs.files[subFolder.childrenIds[0]];
      expect(subCard.name).toBe('子卡片');
    });

    it('meta 应该有正确的字段', () => {
      const { meta } = migrateOldProject(createOldProject({ id: 'p1', title: '我的项目' }));

      expect(meta.id).toBe('p1');
      expect(meta.title).toBe('我的项目');
      expect(meta.intro).toBe('');
      expect(meta.outline).toBe('');
      expect(meta.createdAt).toBeDefined();
      expect(meta.updatedAt).toBeDefined();
      expect(meta.rootFolderIds).toHaveLength(5);
    });
  });

  describe('runMigration', () => {
    it('无旧数据时返回 false', () => {
      expect(runMigration()).toBe(false);
    });

    it('已有新数据时返回 false（幂等性）', () => {
      localStorage.setItem(NEW_KEY, JSON.stringify({ projects: [] }));
      localStorage.setItem(OLD_KEY, JSON.stringify({ projects: [] }));

      expect(runMigration()).toBe(false);
    });

    it('旧数据无项目时返回 false', () => {
      const oldState: AppState = {
        projects: [],
        activeProjectId: null,
        models: [],
        prompts: [],
        activeModelId: null,
      };
      localStorage.setItem(OLD_KEY, JSON.stringify(oldState));

      expect(runMigration()).toBe(false);
    });

    it('应该成功迁移并写入新 key', () => {
      const oldState: AppState = {
        projects: [createOldProject({ id: 'p1', title: '项目1' })],
        activeProjectId: 'p1',
        models: [],
        prompts: [],
        activeModelId: null,
      };
      localStorage.setItem(OLD_KEY, JSON.stringify(oldState));

      const result = runMigration();
      expect(result).toBe(true);

      const newRaw = localStorage.getItem(NEW_KEY);
      expect(newRaw).toBeTruthy();
      const newData: AppData = JSON.parse(newRaw!);
      expect(newData.projects).toHaveLength(1);
      expect(newData.projects[0].title).toBe('项目1');
      expect(newData.activeProjectId).toBe('p1');
      expect(newData.fileSystems['p1']).toBeDefined();
    });

    it('应该保留 models 和 prompts', () => {
      const oldState: AppState = {
        projects: [createOldProject()],
        activeProjectId: null,
        models: [{ id: 'm1', name: 'gpt-4', provider: 'openai' } as any],
        prompts: [{ id: 'p1', name: '写作', category: 'writing', template: '...' } as any],
        activeModelId: 'm1',
      };
      localStorage.setItem(OLD_KEY, JSON.stringify(oldState));

      runMigration();
      const newData: AppData = JSON.parse(localStorage.getItem(NEW_KEY)!);
      expect(newData.models).toHaveLength(1);
      expect(newData.prompts).toHaveLength(1);
      expect(newData.activeModelId).toBe('m1');
    });

    it('迁移失败时返回 false（JSON 解析错误）', () => {
      localStorage.setItem(OLD_KEY, '{invalid json}');
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      expect(runMigration()).toBe(false);
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('多次调用应只迁移一次（幂等）', () => {
      const oldState: AppState = {
        projects: [createOldProject()],
        activeProjectId: null,
        models: [], prompts: [], activeModelId: null,
      };
      localStorage.setItem(OLD_KEY, JSON.stringify(oldState));

      expect(runMigration()).toBe(true);
      expect(runMigration()).toBe(false); // 第二次因 NEW_KEY 已存在而跳过
    });
  });
});
