import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  detectTarget,
  summarizeTask,
  detectCreateIntent,
  estimateTokenCount,
  buildFileTreeDescription,
  buildForTarget,
  buildFullContext,
} from './contextBuilder';
import { VFile, ProjectMeta } from '../../../../shared/types/fileSystem';

/**
 * contextBuilder 测试
 *
 * 覆盖 7 个公开导出函数：
 * - detectTarget: 关键词匹配 + 优先级（character > world > timeline > chapter > outline > general）
 * - summarizeTask: target → 中文标签映射
 * - detectCreateIntent: create word × target word 双条件
 * - estimateTokenCount: 中文=2/字，英文=0.25/字
 * - buildFileTreeDescription: mock dataService.getChildren 递归生成文件树描述
 * - buildForTarget: mock dataService + memoryBankService，覆盖 memory 命中/未命中 5 种 target 分支
 * - buildFullContext: section 拼接与过滤
 *
 * mock 策略：
 * - dataService: 单例，mock getActiveProject/getChildren/getRootFolderIdByType/getFile
 * - memoryBankService: mock buildContextFromMemorySync 控制命中/未命中
 */

vi.mock('../DataService', () => ({
  dataService: {
    getActiveProject: vi.fn(),
    getChildren: vi.fn(),
    getRootFolderIdByType: vi.fn(),
    getFile: vi.fn(),
  },
}));

vi.mock('../MemoryBankService', () => ({
  memoryBankService: {
    buildContextFromMemorySync: vi.fn(),
  },
}));

import { dataService } from '../DataService';
import { memoryBankService } from '../MemoryBankService';

const mockedDataService = vi.mocked(dataService);
const mockedMemoryBank = vi.mocked(memoryBankService);

// ============== 测试夹具 ==============

function createFile(overrides: Partial<VFile> = {}): VFile {
  return {
    id: 'file-' + Math.random().toString(36).slice(2, 8),
    name: '未命名',
    type: 'file',
    parentId: null,
    content: '',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    metadata: {
      folderType: 'custom',
      tags: [],
      favorited: false,
      aiGenerated: false,
      wordCount: 0,
      cardType: '',
      references: [],
      batchId: null,
      sortOrder: 0,
    },
    ...overrides,
  } as VFile;
}

function createFolder(overrides: Partial<VFile> = {}): VFile {
  return {
    id: 'folder-' + Math.random().toString(36).slice(2, 8),
    name: '未命名文件夹',
    type: 'folder',
    parentId: null,
    content: '',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    metadata: {
      folderType: 'custom',
      tags: [],
      favorited: false,
      aiGenerated: false,
      wordCount: 0,
    },
    ...overrides,
  } as VFile;
}

function createProject(overrides: Partial<ProjectMeta> = {}): ProjectMeta {
  return {
    id: 'proj-1',
    title: '测试项目',
    intro: '测试简介',
    inspiration: { text: '', tags: [], promptHistory: [] },
    novelSchemes: [],
    selectedSchemeId: null,
    outline: '',
    ...overrides,
  } as ProjectMeta;
}

beforeEach(() => {
  vi.clearAllMocks();
  // 默认无项目
  mockedDataService.getActiveProject.mockReturnValue(null);
  mockedDataService.getChildren.mockReturnValue([]);
  mockedDataService.getRootFolderIdByType.mockReturnValue(null);
  mockedDataService.getFile.mockReturnValue(null);
  // 默认 memory 未命中（返回空字符串）
  mockedMemoryBank.buildContextFromMemorySync.mockReturnValue('');
});

// ============== 1. detectTarget 纯函数 ==============

describe('detectTarget', () => {
  describe('关键词匹配', () => {
    it('识别角色类关键词 → character', () => {
      expect(detectTarget('帮我创建一个角色')).toBe('character');
      expect(detectTarget('主角的能力是什么')).toBe('character');
      expect(detectTarget('设计反派配角')).toBe('character');
      expect(detectTarget('character design')).toBe('character');
    });

    it('识别世界观类关键词 → world', () => {
      expect(detectTarget('构建世界观')).toBe('world');
      expect(detectTarget('描述一下地图')).toBe('world');
      expect(detectTarget('势力和组织')).toBe('world');
      expect(detectTarget('魔法体系规则')).toBe('world');
      expect(detectTarget('world building')).toBe('world');
    });

    it('识别时间线类关键词 → timeline', () => {
      expect(detectTarget('整理时间线')).toBe('timeline');
      expect(detectTarget('历史事件')).toBe('timeline');
      expect(detectTarget('timeline sort')).toBe('timeline');
    });

    it('识别章节类关键词 → chapter', () => {
      expect(detectTarget('写第一章章节')).toBe('chapter');
      expect(detectTarget('续写正文')).toBe('chapter');
      expect(detectTarget('写一段描写')).toBe('chapter');
      expect(detectTarget('chapter 1')).toBe('chapter');
    });

    it('识别大纲类关键词 → outline', () => {
      expect(detectTarget('生成大纲')).toBe('outline');
      expect(detectTarget('剧情情节设计')).toBe('outline');
      expect(detectTarget('故事线规划')).toBe('outline');
      expect(detectTarget('outline the plot')).toBe('outline');
    });

    it('无任何关键词时 → general', () => {
      // 注意：'world' / 'character' 等是关键词，不能用作无关文本
      expect(detectTarget('今天天气不错')).toBe('general');
      expect(detectTarget('help me please')).toBe('general');
      expect(detectTarget('')).toBe('general');
    });
  });

  describe('大小写不敏感', () => {
    it('英文关键词大写也应识别', () => {
      expect(detectTarget('CHARACTER design')).toBe('character');
      expect(detectTarget('WORLD building')).toBe('world');
      expect(detectTarget('TIMELINE')).toBe('timeline');
      expect(detectTarget('OUTLINE')).toBe('outline');
      expect(detectTarget('CHAPTER 1')).toBe('chapter');
    });
  });

  describe('优先级（按源码 if 顺序）', () => {
    // 源码顺序：character → world → timeline → chapter → outline → general
    it('character 优先于 world', () => {
      // 同时含"角色"和"世界观" → character 胜出
      expect(detectTarget('角色在世界观中的位置')).toBe('character');
    });

    it('world 优先于 timeline', () => {
      // "世界" + "时间" → world 胜出
      expect(detectTarget('世界的时间线')).toBe('world');
    });

    it('timeline 优先于 chapter', () => {
      // "时间" + "章节" → timeline 胜出
      expect(detectTarget('按时间章节排序')).toBe('timeline');
    });

    it('chapter 优先于 outline', () => {
      // "章节" + "大纲" → chapter 胜出
      expect(detectTarget('章节大纲')).toBe('chapter');
    });
  });
});

// ============== 2. summarizeTask 纯函数 ==============

describe('summarizeTask', () => {
  it('character target → 角色创作', () => {
    expect(summarizeTask('创建角色')).toBe('角色创作');
  });

  it('world target → 世界观构建', () => {
    expect(summarizeTask('构建世界观')).toBe('世界观构建');
  });

  it('timeline target → 时间线规划', () => {
    expect(summarizeTask('整理时间线')).toBe('时间线规划');
  });

  it('outline target → 大纲设计', () => {
    expect(summarizeTask('生成大纲')).toBe('大纲设计');
  });

  it('chapter target → 章节写作', () => {
    expect(summarizeTask('写章节')).toBe('章节写作');
  });

  it('general target → 通用任务', () => {
    expect(summarizeTask('今天天气不错')).toBe('通用任务');
  });

  it('空字符串 → 通用任务', () => {
    expect(summarizeTask('')).toBe('通用任务');
  });
});

// ============== 3. detectCreateIntent 纯函数 ==============

describe('detectCreateIntent', () => {
  describe('应识别为创建意图（create word + target word 都满足）', () => {
    it('创建 + 角色', () => {
      expect(detectCreateIntent('创建一个角色')).toBe(true);
    });

    it('生成 + 世界观', () => {
      expect(detectCreateIntent('生成世界观设定')).toBe(true);
    });

    it('写 + 大纲', () => {
      expect(detectCreateIntent('写大纲')).toBe(true);
    });

    it('设计 + 时间线', () => {
      expect(detectCreateIntent('设计时间线')).toBe(true);
    });

    it('规划 + 势力', () => {
      expect(detectCreateIntent('规划势力分布')).toBe(true);
    });

    it('补全 + 设定', () => {
      expect(detectCreateIntent('补全设定内容')).toBe(true);
    });

    it('帮我 + 档案', () => {
      expect(detectCreateIntent('帮我做档案卡片')).toBe(true);
    });

    it('英文 create + 角色关键词 "character" 不是 target word（target 是中文），返回 false', () => {
      // 注意：源码 targetWords 不含 character（仅含中文）
      expect(detectCreateIntent('create a character')).toBe(false);
    });
  });

  describe('不应识别为创建意图', () => {
    it('仅有 create word 无 target word', () => {
      expect(detectCreateIntent('帮我一下')).toBe(false);
      expect(detectCreateIntent('创建什么呢')).toBe(false);
    });

    it('仅有 target word 无 create word', () => {
      expect(detectCreateIntent('角色列表')).toBe(false);
      expect(detectCreateIntent('世界观展示')).toBe(false);
    });

    it('完全无关文本', () => {
      expect(detectCreateIntent('hello world')).toBe(false);
      expect(detectCreateIntent('')).toBe(false);
    });
  });

  describe('大小写不敏感', () => {
    it('英文小写 create 仍生效（但需匹配中文 target）', () => {
      // 创建/生成等都是中文，英文小写不影响
      expect(detectCreateIntent('创建角色')).toBe(true);
    });
  });
});

// ============== 4. estimateTokenCount 纯函数 ==============

describe('estimateTokenCount', () => {
  it('空字符串 → 0', () => {
    expect(estimateTokenCount('')).toBe(0);
  });

  it('纯中文：每字 2 token，向上取整', () => {
    // 3 个中文字 = 6 token → ceil(6) = 6
    expect(estimateTokenCount('你好吗')).toBe(6);
  });

  it('纯英文：每字符 0.25 token，向上取整', () => {
    // 4 个英文字符 = 1 token
    expect(estimateTokenCount('test')).toBe(1);
    // 5 个字符 = 1.25 → ceil = 2
    expect(estimateTokenCount('hello')).toBe(2);
  });

  it('中英混合：分别累加后取整', () => {
    // "你好" (4) + "hi" (0.5) = 4.5 → ceil = 5
    expect(estimateTokenCount('你好hi')).toBe(5);
  });

  it('空格不计入 token', () => {
    // 仅空格 → 0
    expect(estimateTokenCount('   ')).toBe(0);
  });

  it('含空格的英文句子', () => {
    // "hello world" = 10 字符 × 0.25 = 2.5 → ceil = 3
    expect(estimateTokenCount('hello world')).toBe(3);
  });

  it('扩展汉字区字符也算中文（2 token）', () => {
    // 使用 CJK 扩展 A 区字符 丠（\u4e20）
    expect(estimateTokenCount('丠')).toBe(2);
  });

  it('长文本正确累加', () => {
    // 10 个中文字 = 20 token
    expect(estimateTokenCount('一二三四五六七八九十')).toBe(20);
  });
});

// ============== 5. buildFileTreeDescription ==============

describe('buildFileTreeDescription', () => {
  it('空项目（无文件无文件夹）→ 返回 "（空项目）"', () => {
    mockedDataService.getChildren.mockReturnValue([]);
    expect(buildFileTreeDescription()).toBe('（空项目）');
  });

  it('应递归输出文件夹和文件', () => {
    const folder = createFolder({ id: 'f1', name: '角色文件夹' });
    const file = createFile({ id: 'file1', name: '主角.md', parentId: 'f1', content: '内容' });
    // 根调用返回 folder，folder 内调用返回 file
    mockedDataService.getChildren.mockImplementation((parentId: string | null) => {
      if (parentId === null) return [folder];
      if (parentId === 'f1') return [file];
      return [];
    });
    const result = buildFileTreeDescription();
    expect(result).toContain('📁 角色文件夹 [id:f1]');
    expect(result).toContain('📄 主角.md [id:file1]');
    expect(result).toContain('2字'); // content.length=2
  });

  it('文件夹应显示文件数量', () => {
    const folder = createFolder({ id: 'f1', name: '大纲' });
    const file1 = createFile({ id: 'a', parentId: 'f1', name: 'a.md' });
    const file2 = createFile({ id: 'b', parentId: 'f1', name: 'b.md' });
    mockedDataService.getChildren.mockImplementation((pid: string | null) => {
      if (pid === null) return [folder];
      if (pid === 'f1') return [file1, file2];
      return [];
    });
    const result = buildFileTreeDescription();
    expect(result).toContain('(2个文件)');
  });

  it('文件应显示 favorited 星标和 tags', () => {
    const file = createFile({
      id: 'file1',
      name: '主角.md',
      content: '内容',
      metadata: { favorited: true, tags: ['主角', 'card'], folderType: 'characters', aiGenerated: false, wordCount: 2, cardType: '', references: [], batchId: null, sortOrder: 0 },
    });
    mockedDataService.getChildren.mockReturnValue([file]);
    const result = buildFileTreeDescription();
    expect(result).toContain('⭐');
    expect(result).toContain('#主角');
    expect(result).toContain('#card');
  });

  it('空内容文件应显示 "空"', () => {
    const file = createFile({ id: 'file1', name: '空文件.md', content: '' });
    mockedDataService.getChildren.mockReturnValue([file]);
    const result = buildFileTreeDescription();
    expect(result).toContain('空');
  });
});

// ============== 6. buildForTarget ==============

describe('buildForTarget', () => {
  it('无活跃项目时返回默认 header', () => {
    mockedDataService.getActiveProject.mockReturnValue(null);
    const result = buildForTarget('general');
    expect(result).toContain('## 当前项目');
    expect(result).toContain('（无活跃项目）');
  });

  it('有项目无 memory 命中时返回 header + 灵感 + 方案 + 进度', () => {
    const project = createProject({
      inspiration: { text: '一段灵感', tags: [], promptHistory: [] },
      outline: '大纲内容',
    });
    mockedDataService.getActiveProject.mockReturnValue(project);
    mockedMemoryBank.buildContextFromMemorySync.mockReturnValue('');
    mockedDataService.getChildren.mockReturnValue([]); // 无文件 → 进度显示空类型

    const result = buildForTarget('general');
    expect(result).toContain('## 当前项目');
    expect(result).toContain('测试项目');
    expect(result).toContain('💡 灵感来源');
    expect(result).toContain('一段灵感');
    expect(result).toContain('## 📋 创作进度');
  });

  it('memory 命中时优先使用 memory context（不调用 target 分支）', () => {
    const project = createProject();
    mockedDataService.getActiveProject.mockReturnValue(project);
    mockedMemoryBank.buildContextFromMemorySync.mockReturnValue('## 📋 memory 上下文内容');
    mockedDataService.getChildren.mockReturnValue([]);

    const result = buildForTarget('character');
    expect(result).toContain('memory 上下文内容');
    // 不会调用 buildCharacterContext（getFilesByFolderType 不会被触发到 character target 的分支）
    // 注：buildProgress 仍会调用 getChildren(null)，但那是根目录而非 character 文件夹
  });

  it('memory 抛错时回退到 target 分支', () => {
    const project = createProject();
    mockedDataService.getActiveProject.mockReturnValue(project);
    mockedMemoryBank.buildContextFromMemorySync.mockImplementation(() => {
      throw new Error('memory error');
    });
    mockedDataService.getChildren.mockReturnValue([]);

    // 不应抛错
    const result = buildForTarget('character');
    expect(result).toContain('## 当前项目');
  });

  it('character target 在 memory 未命中时调用 buildCharacterContext（无文件 → 暂无角色）', () => {
    const project = createProject();
    mockedDataService.getActiveProject.mockReturnValue(project);
    mockedMemoryBank.buildContextFromMemorySync.mockReturnValue('');
    mockedDataService.getRootFolderIdByType.mockReturnValue(null); // 无 characters 文件夹
    mockedDataService.getChildren.mockReturnValue([]);

    const result = buildForTarget('character');
    expect(result).toContain('暂无角色设定');
  });

  it('outline target 在 memory 未命中时调用 buildOutlineContext', () => {
    const project = createProject();
    mockedDataService.getActiveProject.mockReturnValue(project);
    mockedMemoryBank.buildContextFromMemorySync.mockReturnValue('');
    mockedDataService.getRootFolderIdByType.mockReturnValue(null);
    mockedDataService.getChildren.mockReturnValue([]);

    const result = buildForTarget('outline');
    // buildOutlineContext 在 outline 和 chapter 文件夹都无文件时返回空字符串
    // 但 buildOutline 仍会输出"尚未创建"或大纲内容
    expect(result).toContain('## 当前项目');
  });

  it('includeInspiration=false 时不输出灵感部分', () => {
    const project = createProject({
      inspiration: { text: '一段灵感', tags: [], promptHistory: [] },
    });
    mockedDataService.getActiveProject.mockReturnValue(project);
    mockedDataService.getChildren.mockReturnValue([]);

    const result = buildForTarget('general', { includeInspiration: false });
    expect(result).not.toContain('💡 灵感来源');
  });

  it('已选创作方案应输出完整方案信息', () => {
    const project = createProject({
      novelSchemes: [
        {
          id: 'scheme-1',
          title: '方案A',
          genre: '玄幻',
          tone: '热血',
          intro: '故事简介A',
          coreConflict: '核心冲突A',
          highlights: '亮点A',
        } as any,
      ],
      selectedSchemeId: 'scheme-1',
    });
    mockedDataService.getActiveProject.mockReturnValue(project);
    mockedDataService.getChildren.mockReturnValue([]);

    const result = buildForTarget('general');
    expect(result).toContain('🎯 已选创作方案');
    expect(result).toContain('方案A');
    expect(result).toContain('玄幻');
    expect(result).toContain('热血');
    expect(result).toContain('核心冲突A');
  });
});

// ============== 7. buildFullContext ==============

describe('buildFullContext', () => {
  it('无项目时仅返回 header', () => {
    mockedDataService.getActiveProject.mockReturnValue(null);
    const result = buildFullContext();
    expect(result).toContain('## 当前项目');
    expect(result).toContain('（无活跃项目）');
  });

  it('有项目时拼接所有 section', () => {
    const project = createProject({
      inspiration: { text: '灵感', tags: [], promptHistory: [] },
      outline: '大纲',
    });
    mockedDataService.getActiveProject.mockReturnValue(project);
    mockedDataService.getChildren.mockReturnValue([]);
    mockedDataService.getRootFolderIdByType.mockReturnValue(null);

    const result = buildFullContext();
    expect(result).toContain('## 当前项目');
    expect(result).toContain('💡 灵感来源');
    expect(result).toContain('## 📋 创作进度');
  });

  it('空 section 应被过滤', () => {
    const project = createProject({
      inspiration: { text: '', tags: [], promptHistory: [] }, // 灵感为空
    });
    mockedDataService.getActiveProject.mockReturnValue(project);
    mockedDataService.getChildren.mockReturnValue([]);

    const result = buildFullContext();
    expect(result).not.toContain('💡 灵感来源');
  });
});
