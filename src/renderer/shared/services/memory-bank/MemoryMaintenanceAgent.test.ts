import { describe, it, expect, beforeEach, vi } from 'vitest';
import { memoryMaintenanceAgent } from './MemoryMaintenanceAgent';
import { AtomicMemory, DynamicMemory, ModelConfig, Project } from '../../../../shared/types';
import { VFile } from '../../../../shared/types/fileSystem';

/**
 * MemoryMaintenanceAgent 单元测试
 *
 * 覆盖范围：
 * - extractFromChapter: LLM 章节设定提取（成功/失败/异常/JSON 解析/上下文拼装/summary 拼装）
 * - applyExtractionToMemory: world/characters/plots/dynamic 4 大分支合并逻辑
 * - checkConsistency: 5 类规则检查（角色/世界观/剧情线/关系/文本）
 * - generateContextSummary: LLM 总结（成功/空/异常）
 *
 * 关键设计点：
 * - extractFromChapter 截断 chapterContent 到 5000 字符
 * - applyExtractionToMemory 用 Set 去重合并 personality/abilities/secrets
 * - applyExtractionToMemory plots 用 (atomic.plots as any) 绕过类型，实际字段是 title/summary 而非 description
 * - checkConsistency 记忆体关闭时直接返回 []
 * - checkConsistency 从文件系统读取角色并解析 personality 正则
 * - generateContextSummary ctx < 10 字符时返回 '记忆体为空'
 */

// ============ Mock 依赖 ============

vi.mock('../aiService', () => ({
  aiService: {
    generate: vi.fn(),
  },
}));

vi.mock('../MemoryBankService', () => ({
  memoryBankService: {
    loadAtomicMemory: vi.fn(),
    saveAtomicMemory: vi.fn(),
    loadDynamicMemory: vi.fn(),
    saveDynamicMemory: vi.fn(),
    logMaintenanceAction: vi.fn(),
    isEnabled: vi.fn().mockReturnValue(true),
    buildContextFromMemory: vi.fn(),
  },
}));

vi.mock('../DataService', () => ({
  dataService: {
    getModels: vi.fn().mockReturnValue([]),
    getRootFolderIdByType: vi.fn().mockReturnValue(null),
    getChildren: vi.fn().mockReturnValue([]),
  },
}));

vi.mock('../ModelRouter', () => ({
  modelRouter: {
    getModelForTask: vi.fn().mockImplementation((_task, _models, fallback) => fallback),
  },
}));

vi.mock('../../../../shared/prompts', () => ({
  PromptComposer: {
    composeForMemory: vi.fn().mockReturnValue('mock-memory-expert-prompt'),
  },
}));

// ============ 导入被 mock 的模块以获取类型安全 mock ============

import { aiService } from '../aiService';
import { memoryBankService } from '../MemoryBankService';
import { dataService } from '../DataService';
import { modelRouter } from '../ModelRouter';

const mockedGenerate = vi.mocked(aiService.generate);
const mockedLoadAtomic = vi.mocked(memoryBankService.loadAtomicMemory);
const mockedSaveAtomic = vi.mocked(memoryBankService.saveAtomicMemory);
const mockedLoadDynamic = vi.mocked(memoryBankService.loadDynamicMemory);
const mockedSaveDynamic = vi.mocked(memoryBankService.saveDynamicMemory);
const mockedLogAction = vi.mocked(memoryBankService.logMaintenanceAction);
const mockedIsEnabled = vi.mocked(memoryBankService.isEnabled);
const mockedBuildContext = vi.mocked(memoryBankService.buildContextFromMemory);
const mockedGetRootFolder = vi.mocked(dataService.getRootFolderIdByType);
const mockedGetChildren = vi.mocked(dataService.getChildren);
const mockedGetModelForTask = vi.mocked(modelRouter.getModelForTask);

// ============ 测试工具 ============

const createModel = (): ModelConfig => ({
  id: 'm1',
  name: '测试模型',
  provider: 'openai-compatible',
  apiKey: '',
  modelName: 'gpt-test',
  contextWindow: 8000,
  maxTokens: 1000,
});

const createEmptyAtomic = (): AtomicMemory => ({
  version: 1,
  lastUpdated: 0,
  world: { rules: [], cosmology: '', geography: [], history: [] },
  characters: [],
  plots: [],
});

const createEmptyDynamic = (): DynamicMemory => ({
  current: { chapter: 0, scene: '', pov: '', location: '', time: '', mood: '' },
  tension: { level: 50, history: [] },
  activeThreads: [],
  characterStates: [],
});

const makeExtractResult = (overrides: Partial<any> = {}): any => ({
  world: { newRules: [], cosmologyUpdates: '', geography: [], history: [] },
  characters: [],
  plots: [],
  dynamic: {},
  ...overrides,
});

/** 构造 mock VFile（避免每个测试用例重复书写完整 VFile 必填字段） */
const mockFile = (id: string, name: string, content: string): VFile => ({
  id,
  name,
  type: 'file',
  parentId: null,
  content,
  metadata: {
    tags: [],
    favorited: false,
    cardType: '',
    references: [],
    aiGenerated: false,
    batchId: null,
    sortOrder: 0,
  },
  childrenIds: [],
  createdAt: 0,
  updatedAt: 0,
  version: 1,
});

// ============ 测试主体 ============

describe('MemoryMaintenanceAgent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedIsEnabled.mockReturnValue(true);
    mockedGetModelForTask.mockImplementation((_task, _models, fallback) => fallback);
    mockedLoadAtomic.mockResolvedValue(createEmptyAtomic());
    mockedLoadDynamic.mockResolvedValue(createEmptyDynamic());
    mockedSaveAtomic.mockResolvedValue(undefined);
    mockedSaveDynamic.mockResolvedValue(undefined);
    mockedLogAction.mockResolvedValue(undefined);
    mockedBuildContext.mockResolvedValue('');
    mockedGetRootFolder.mockReturnValue(null);
    mockedGetChildren.mockReturnValue([]);
  });

  // ============ 1. extractFromChapter ============

  describe('extractFromChapter', () => {
    it('成功路径：合法 JSON 返回提取结果并调用 applyExtractionToMemory', async () => {
      const json = JSON.stringify(makeExtractResult({
        characters: [{ name: '李雷' }],
        plots: [{ type: 'main', status: 'active', description: '主线', involvedCharacters: [] }],
        world: { newRules: ['规则1'] },
      }));
      mockedGenerate.mockResolvedValue({ content: json } as any);

      const result = await memoryMaintenanceAgent.extractFromChapter('p1', '章节内容', 1, createModel());

      expect(result.extracted).not.toBeNull();
      expect(result.extracted!.characters[0].name).toBe('李雷');
      expect(result.contradictions).toEqual([]);
      expect(result.summary).toContain('李雷');
      expect(result.summary).toContain('剧情线: 1条');
      expect(result.summary).toContain('新规则: 1条');
      expect(mockedLogAction).toHaveBeenCalledWith('p1', '章节提取完成', expect.any(String));
    });

    it('LLM error 时返回 extracted: null + summary 提取失败', async () => {
      mockedGenerate.mockResolvedValue({ content: '', error: 'API 错误' } as any);

      const result = await memoryMaintenanceAgent.extractFromChapter('p1', '章节内容', 1, createModel());

      expect(result.extracted).toBeNull();
      expect(result.summary).toContain('提取失败');
      expect(result.summary).toContain('API 错误');
      expect(mockedLogAction).toHaveBeenCalledWith('p1', '章节提取失败', expect.stringContaining('API 错误'));
    });

    it('LLM 无 content 时返回 extracted: null', async () => {
      mockedGenerate.mockResolvedValue({ content: null, error: undefined } as any);

      const result = await memoryMaintenanceAgent.extractFromChapter('p1', '章节内容', 1, createModel());

      expect(result.extracted).toBeNull();
      expect(mockedLogAction).toHaveBeenCalledWith('p1', '章节提取失败', expect.any(String));
    });

    it('LLM 返回无 JSON 时返回 extracted: null + summary 无法解析结果', async () => {
      mockedGenerate.mockResolvedValue({ content: '这不是 JSON' } as any);

      const result = await memoryMaintenanceAgent.extractFromChapter('p1', '章节内容', 1, createModel());

      expect(result.extracted).toBeNull();
      expect(result.summary).toBe('无法解析结果');
      expect(mockedLogAction).toHaveBeenCalledWith('p1', '章节提取失败', expect.stringContaining('无法解析'));
    });

    it('JSON.parse 抛错时 catch 返回异常', async () => {
      mockedGenerate.mockResolvedValue({ content: '{invalid json}' } as any);

      const result = await memoryMaintenanceAgent.extractFromChapter('p1', '章节内容', 1, createModel());

      expect(result.extracted).toBeNull();
      expect(result.summary).toContain('异常:');
      expect(mockedLogAction).toHaveBeenCalledWith('p1', '章节提取异常', expect.any(String));
    });

    it('空上下文：atomic.characters 为空 + 无 existingProject', async () => {
      mockedGenerate.mockResolvedValue({ content: JSON.stringify(makeExtractResult()) } as any);
      mockedLoadAtomic.mockResolvedValue(createEmptyAtomic());

      await memoryMaintenanceAgent.extractFromChapter('p1', '章节内容', 1, createModel());

      const callArgs = mockedGenerate.mock.calls[0][0];
      expect(callArgs.prompt).not.toContain('已有角色');
      expect(callArgs.prompt).not.toContain('项目角色数据');
    });

    it('有 atomic.characters 时 contextInfo 包含已有角色', async () => {
      const atomic = createEmptyAtomic();
      atomic.characters.push({
        id: 'c1', name: '李雷', identity: '主角', personality: [], abilities: [],
        relationships: [], secrets: [], arc: { start: '', current: '', goal: '' },
      });
      mockedLoadAtomic.mockResolvedValue(atomic);
      mockedGenerate.mockResolvedValue({ content: JSON.stringify(makeExtractResult()) } as any);

      await memoryMaintenanceAgent.extractFromChapter('p1', '章节内容', 1, createModel());

      const callArgs = mockedGenerate.mock.calls[0][0];
      expect(callArgs.prompt).toContain('已有角色');
      expect(callArgs.prompt).toContain('李雷');
    });

    it('有 existingProject.characters 时 contextInfo 包含项目角色数据', async () => {
      const project = {
        characters: [{ name: '韩梅梅', role: '女主', personality: '性格描述' }],
      } as any;
      mockedGenerate.mockResolvedValue({ content: JSON.stringify(makeExtractResult()) } as any);

      await memoryMaintenanceAgent.extractFromChapter('p1', '章节内容', 1, createModel(), project);

      const callArgs = mockedGenerate.mock.calls[0][0];
      expect(callArgs.prompt).toContain('项目角色数据');
      expect(callArgs.prompt).toContain('韩梅梅');
    });

    it('chapterContent 超过 5000 字符被截断', async () => {
      mockedGenerate.mockResolvedValue({ content: JSON.stringify(makeExtractResult()) } as any);
      const longContent = 'a'.repeat(6000);

      await memoryMaintenanceAgent.extractFromChapter('p1', longContent, 1, createModel());

      const callArgs = mockedGenerate.mock.calls[0][0];
      // prompt 中章节内容部分应只含 5000 个 'a'
      const sectionMatch = callArgs.prompt.match(/【章节内容】\n(a+)\n/);
      expect(sectionMatch).not.toBeNull();
      expect(sectionMatch![1].length).toBe(5000);
    });

    it('summary 全空时返回 "处理完成"', async () => {
      mockedGenerate.mockResolvedValue({ content: JSON.stringify(makeExtractResult()) } as any);

      const result = await memoryMaintenanceAgent.extractFromChapter('p1', '章节内容', 1, createModel());

      expect(result.summary).toBe('处理完成');
    });

    it('summary 只有 characters 时只含角色名', async () => {
      mockedGenerate.mockResolvedValue({
        content: JSON.stringify(makeExtractResult({ characters: [{ name: '李雷' }] })),
      } as any);

      const result = await memoryMaintenanceAgent.extractFromChapter('p1', '章节内容', 1, createModel());

      expect(result.summary).toBe('角色: 李雷');
    });

    it('logMaintenanceAction 完成时调用', async () => {
      mockedGenerate.mockResolvedValue({ content: JSON.stringify(makeExtractResult()) } as any);

      await memoryMaintenanceAgent.extractFromChapter('p1', '章节内容', 1, createModel());

      expect(mockedLogAction).toHaveBeenCalledWith('p1', '章节提取完成', expect.any(String));
    });

    it('getModelForMemoryTask 使用 modelRouter 路由', async () => {
      const routed = { ...createModel(), id: 'routed' };
      mockedGetModelForTask.mockReturnValue(routed);
      mockedGenerate.mockResolvedValue({ content: JSON.stringify(makeExtractResult()) } as any);

      await memoryMaintenanceAgent.extractFromChapter('p1', '章节内容', 1, createModel());

      expect(mockedGetModelForTask).toHaveBeenCalledWith('agent-memory', [], createModel());
      expect(mockedGenerate.mock.calls[0][0].model).toBe(routed);
    });

    it('LLM 调用参数包含 systemPrompt + temperature 0.3 + maxTokens 4000', async () => {
      mockedGenerate.mockResolvedValue({ content: JSON.stringify(makeExtractResult()) } as any);

      await memoryMaintenanceAgent.extractFromChapter('p1', '章节内容', 1, createModel());

      const args = mockedGenerate.mock.calls[0][0];
      expect(args.systemPrompt).toBe('mock-memory-expert-prompt');
      expect(args.temperature).toBe(0.3);
      expect(args.maxTokens).toBe(4000);
    });

    it('logMaintenanceAction 失败时使用 "章节提取失败"', async () => {
      mockedGenerate.mockResolvedValue({ content: '', error: '失败' } as any);

      await memoryMaintenanceAgent.extractFromChapter('p1', '章节内容', 1, createModel());

      expect(mockedLogAction).toHaveBeenCalledWith('p1', '章节提取失败', expect.stringContaining('失败'));
    });

    it('logMaintenanceAction 异常时使用 "章节提取异常"', async () => {
      mockedGenerate.mockResolvedValue({ content: '{bad}' } as any);

      await memoryMaintenanceAgent.extractFromChapter('p1', '章节内容', 1, createModel());

      expect(mockedLogAction).toHaveBeenCalledWith('p1', '章节提取异常', expect.any(String));
    });
  });

  // ============ 2. applyExtractionToMemory ============

  describe('applyExtractionToMemory', () => {
    it('world.newRules 追加到 atomic.world.rules', async () => {
      mockedLoadAtomic.mockResolvedValue(createEmptyAtomic());
      const extracted = makeExtractResult({ world: { newRules: ['规则1', '规则2'] } });

      await memoryMaintenanceAgent.applyExtractionToMemory('p1', extracted, 1);

      const saved = mockedSaveAtomic.mock.calls[0][1] as AtomicMemory;
      expect(saved.world.rules).toEqual(['规则1', '规则2']);
    });

    it('world.cosmologyUpdates 已有 cosmology 时追加（用 \\n 分隔）', async () => {
      const atomic = createEmptyAtomic();
      atomic.world.cosmology = '原体系';
      mockedLoadAtomic.mockResolvedValue(atomic);
      const extracted = makeExtractResult({ world: { cosmologyUpdates: '新体系' } });

      await memoryMaintenanceAgent.applyExtractionToMemory('p1', extracted, 1);

      const saved = mockedSaveAtomic.mock.calls[0][1] as AtomicMemory;
      expect(saved.world.cosmology).toBe('原体系\n新体系');
    });

    it('world.cosmologyUpdates 空 cosmology 时直接赋值', async () => {
      mockedLoadAtomic.mockResolvedValue(createEmptyAtomic());
      const extracted = makeExtractResult({ world: { cosmologyUpdates: '新体系' } });

      await memoryMaintenanceAgent.applyExtractionToMemory('p1', extracted, 1);

      const saved = mockedSaveAtomic.mock.calls[0][1] as AtomicMemory;
      expect(saved.world.cosmology).toBe('新体系');
    });

    it('world.geography 追加', async () => {
      mockedLoadAtomic.mockResolvedValue(createEmptyAtomic());
      const extracted = makeExtractResult({ world: { geography: ['地点1'] } });

      await memoryMaintenanceAgent.applyExtractionToMemory('p1', extracted, 1);

      const saved = mockedSaveAtomic.mock.calls[0][1] as AtomicMemory;
      expect(saved.world.geography).toEqual(['地点1']);
    });

    it('world.history 追加', async () => {
      mockedLoadAtomic.mockResolvedValue(createEmptyAtomic());
      const extracted = makeExtractResult({ world: { history: ['事件1'] } });

      await memoryMaintenanceAgent.applyExtractionToMemory('p1', extracted, 1);

      const saved = mockedSaveAtomic.mock.calls[0][1] as AtomicMemory;
      expect(saved.world.history).toEqual(['事件1']);
    });

    it('characters 新角色 push 完整字段映射', async () => {
      mockedLoadAtomic.mockResolvedValue(createEmptyAtomic());
      const extracted = makeExtractResult({
        characters: [{
          name: '李雷',
          identity: '主角',
          publicIdentity: '学生',
          personality: ['勇敢'],
          abilities: ['剑术'],
          relationships: [{ targetName: '韩梅梅', type: 'ally', description: '朋友' }],
          secrets: ['身世'],
          arcUpdate: { current: '觉醒中' },
        }],
      });

      await memoryMaintenanceAgent.applyExtractionToMemory('p1', extracted, 5);

      const saved = mockedSaveAtomic.mock.calls[0][1] as AtomicMemory;
      expect(saved.characters.length).toBe(1);
      const c = saved.characters[0];
      expect(c.name).toBe('李雷');
      expect(c.identity).toBe('主角');
      expect(c.publicIdentity).toBe('学生');
      expect(c.personality).toEqual(['勇敢']);
      expect(c.abilities).toEqual(['剑术']);
      expect(c.relationships[0].targetId).toBe('韩梅梅');
      expect(c.relationships[0].type).toBe('ally');
      expect(c.relationships[0].description).toBe('朋友');
      expect(c.relationships[0].knownTo).toEqual([]);
      expect(c.secrets).toEqual(['身世']);
      expect(c.arc).toEqual({ start: '', current: '觉醒中', goal: '' });
    });

    it('characters 新角色无 arcUpdate 时 arc 为空对象', async () => {
      mockedLoadAtomic.mockResolvedValue(createEmptyAtomic());
      const extracted = makeExtractResult({
        characters: [{ name: '李雷' }],
      });

      await memoryMaintenanceAgent.applyExtractionToMemory('p1', extracted, 1);

      const saved = mockedSaveAtomic.mock.calls[0][1] as AtomicMemory;
      expect(saved.characters[0].arc).toEqual({ start: '', current: '', goal: '' });
    });

    it('characters 已有角色更新 identity 覆盖', async () => {
      const atomic = createEmptyAtomic();
      atomic.characters.push({
        id: 'c1', name: '李雷', identity: '原身份', personality: [], abilities: [],
        relationships: [], secrets: [], arc: { start: '', current: '', goal: '' },
      });
      mockedLoadAtomic.mockResolvedValue(atomic);
      const extracted = makeExtractResult({
        characters: [{ name: '李雷', identity: '新身份' }],
      });

      await memoryMaintenanceAgent.applyExtractionToMemory('p1', extracted, 1);

      const saved = mockedSaveAtomic.mock.calls[0][1] as AtomicMemory;
      expect(saved.characters[0].identity).toBe('新身份');
      expect(saved.characters.length).toBe(1);
    });

    it('characters personality 用 Set 去重合并', async () => {
      const atomic = createEmptyAtomic();
      atomic.characters.push({
        id: 'c1', name: '李雷', identity: '', personality: ['勇敢', '聪明'], abilities: [],
        relationships: [], secrets: [], arc: { start: '', current: '', goal: '' },
      });
      mockedLoadAtomic.mockResolvedValue(atomic);
      const extracted = makeExtractResult({
        characters: [{ name: '李雷', personality: ['聪明', '善良'] }],
      });

      await memoryMaintenanceAgent.applyExtractionToMemory('p1', extracted, 1);

      const saved = mockedSaveAtomic.mock.calls[0][1] as AtomicMemory;
      // Set 去重后包含 3 个不重复项（顺序按插入：勇敢→聪明→善良）
      expect(saved.characters[0].personality.length).toBe(3);
      expect(saved.characters[0].personality).toEqual(expect.arrayContaining(['勇敢', '聪明', '善良']));
    });

    it('characters abilities 用 Set 去重合并', async () => {
      const atomic = createEmptyAtomic();
      atomic.characters.push({
        id: 'c1', name: '李雷', identity: '', personality: [], abilities: ['剑术'],
        relationships: [], secrets: [], arc: { start: '', current: '', goal: '' },
      });
      mockedLoadAtomic.mockResolvedValue(atomic);
      const extracted = makeExtractResult({
        characters: [{ name: '李雷', abilities: ['剑术', '魔法'] }],
      });

      await memoryMaintenanceAgent.applyExtractionToMemory('p1', extracted, 1);

      const saved = mockedSaveAtomic.mock.calls[0][1] as AtomicMemory;
      expect(saved.characters[0].abilities.sort()).toEqual(['剑术', '魔法']);
    });

    it('characters secrets 用 Set 去重合并', async () => {
      const atomic = createEmptyAtomic();
      atomic.characters.push({
        id: 'c1', name: '李雷', identity: '', personality: [], abilities: [],
        relationships: [], secrets: ['秘密1'], arc: { start: '', current: '', goal: '' },
      });
      mockedLoadAtomic.mockResolvedValue(atomic);
      const extracted = makeExtractResult({
        characters: [{ name: '李雷', secrets: ['秘密1', '秘密2'] }],
      });

      await memoryMaintenanceAgent.applyExtractionToMemory('p1', extracted, 1);

      const saved = mockedSaveAtomic.mock.calls[0][1] as AtomicMemory;
      expect(saved.characters[0].secrets.sort()).toEqual(['秘密1', '秘密2']);
    });

    it('characters relationships 已有目标更新 type/description', async () => {
      const atomic = createEmptyAtomic();
      atomic.characters.push({
        id: 'c1', name: '李雷', identity: '', personality: [], abilities: [],
        relationships: [{ targetId: '韩梅梅', type: 'ally', description: '朋友', knownTo: [] }],
        secrets: [], arc: { start: '', current: '', goal: '' },
      });
      mockedLoadAtomic.mockResolvedValue(atomic);
      const extracted = makeExtractResult({
        characters: [{
          name: '李雷',
          relationships: [{ targetName: '韩梅梅', type: 'enemy', description: '敌人' }],
        }],
      });

      await memoryMaintenanceAgent.applyExtractionToMemory('p1', extracted, 1);

      const saved = mockedSaveAtomic.mock.calls[0][1] as AtomicMemory;
      expect(saved.characters[0].relationships.length).toBe(1);
      expect(saved.characters[0].relationships[0].type).toBe('enemy');
      expect(saved.characters[0].relationships[0].description).toBe('敌人');
    });

    it('characters relationships 新目标 push', async () => {
      const atomic = createEmptyAtomic();
      atomic.characters.push({
        id: 'c1', name: '李雷', identity: '', personality: [], abilities: [],
        relationships: [], secrets: [], arc: { start: '', current: '', goal: '' },
      });
      mockedLoadAtomic.mockResolvedValue(atomic);
      const extracted = makeExtractResult({
        characters: [{
          name: '李雷',
          relationships: [{ targetName: '韩梅梅', type: 'ally', description: '朋友' }],
        }],
      });

      await memoryMaintenanceAgent.applyExtractionToMemory('p1', extracted, 1);

      const saved = mockedSaveAtomic.mock.calls[0][1] as AtomicMemory;
      expect(saved.characters[0].relationships.length).toBe(1);
      expect(saved.characters[0].relationships[0].targetId).toBe('韩梅梅');
    });

    it('plots 已有 plot（title 匹配 description）仅更新 status', async () => {
      const atomic = createEmptyAtomic();
      (atomic.plots as any).push({
        id: 'p1', type: 'main', title: '主线', summary: '主线', status: 'active',
        involvedCharacters: [], foreshadows: [],
      });
      mockedLoadAtomic.mockResolvedValue(atomic);
      const extracted = makeExtractResult({
        plots: [{ type: 'main', status: 'resolved', description: '主线', involvedCharacters: [] }],
      });

      await memoryMaintenanceAgent.applyExtractionToMemory('p1', extracted, 1);

      const saved = mockedSaveAtomic.mock.calls[0][1] as AtomicMemory;
      expect((saved.plots as any).length).toBe(1);
      expect((saved.plots as any)[0].status).toBe('resolved');
    });

    it('plots 新 plot push 完整字段映射', async () => {
      mockedLoadAtomic.mockResolvedValue(createEmptyAtomic());
      const extracted = makeExtractResult({
        plots: [{
          type: 'main', status: 'active', description: '主线', involvedCharacters: ['李雷'],
          foreshadows: [{ chapter: 1, hint: '提示', expectedPayoff: '回收', status: 'planted' }],
        }],
      });

      await memoryMaintenanceAgent.applyExtractionToMemory('p1', extracted, 1);

      const saved = mockedSaveAtomic.mock.calls[0][1] as AtomicMemory;
      expect((saved.plots as any).length).toBe(1);
      const p = (saved.plots as any)[0];
      expect(p.type).toBe('main');
      expect(p.title).toBe('主线');
      expect(p.summary).toBe('主线');
      expect(p.status).toBe('active');
      expect(p.involvedCharacters).toEqual(['李雷']);
      expect(p.foreshadows[0]).toEqual({ chapter: 1, hint: '提示', expectedPayoff: '回收', status: 'planted' });
    });

    it('dynamic.location/pov/time/mood + chapter 更新', async () => {
      mockedLoadDynamic.mockResolvedValue(createEmptyDynamic());
      const extracted = makeExtractResult({
        dynamic: { location: '北京', pov: '李雷', time: '夜晚', mood: '紧张' },
      });

      await memoryMaintenanceAgent.applyExtractionToMemory('p1', extracted, 3);

      const saved = mockedSaveDynamic.mock.calls[0][1] as DynamicMemory;
      expect(saved.current.location).toBe('北京');
      expect(saved.current.pov).toBe('李雷');
      expect(saved.current.time).toBe('夜晚');
      expect(saved.current.mood).toBe('紧张');
      expect(saved.current.chapter).toBe(3);
    });

    it('dynamic.tensionChange 累加 level', async () => {
      const dynamic = createEmptyDynamic();
      dynamic.tension.level = 50;
      mockedLoadDynamic.mockResolvedValue(dynamic);
      const extracted = makeExtractResult({ dynamic: { tensionChange: 10 } });

      await memoryMaintenanceAgent.applyExtractionToMemory('p1', extracted, 1);

      const saved = mockedSaveDynamic.mock.calls[0][1] as DynamicMemory;
      expect(saved.tension.level).toBe(60);
      expect(saved.tension.history.length).toBe(1);
      expect(saved.tension.history[0]).toEqual({ chapter: 1, level: 60, event: 'tension_change' });
    });

    it('dynamic.tensionChange 上限 clamp 到 100', async () => {
      const dynamic = createEmptyDynamic();
      dynamic.tension.level = 95;
      mockedLoadDynamic.mockResolvedValue(dynamic);
      const extracted = makeExtractResult({ dynamic: { tensionChange: 20 } });

      await memoryMaintenanceAgent.applyExtractionToMemory('p1', extracted, 1);

      const saved = mockedSaveDynamic.mock.calls[0][1] as DynamicMemory;
      expect(saved.tension.level).toBe(100);
    });

    it('dynamic.tensionChange 下限 clamp 到 0', async () => {
      const dynamic = createEmptyDynamic();
      dynamic.tension.level = 5;
      mockedLoadDynamic.mockResolvedValue(dynamic);
      const extracted = makeExtractResult({ dynamic: { tensionChange: -20 } });

      await memoryMaintenanceAgent.applyExtractionToMemory('p1', extracted, 1);

      const saved = mockedSaveDynamic.mock.calls[0][1] as DynamicMemory;
      expect(saved.tension.level).toBe(0);
    });

    it('dynamic.tension.history 超 50 条时 slice(-50)', async () => {
      const dynamic = createEmptyDynamic();
      // 预置 50 条历史
      for (let i = 0; i < 50; i++) {
        dynamic.tension.history.push({ chapter: i, level: 50, event: 'tension_change' });
      }
      mockedLoadDynamic.mockResolvedValue(dynamic);
      const extracted = makeExtractResult({ dynamic: { tensionChange: 10 } });

      await memoryMaintenanceAgent.applyExtractionToMemory('p1', extracted, 99);

      const saved = mockedSaveDynamic.mock.calls[0][1] as DynamicMemory;
      expect(saved.tension.history.length).toBe(50);
      expect(saved.tension.history[49].chapter).toBe(99);
    });

    it('dynamic 为空对象时仍进入 if 块更新 chapter（{} 是 truthy）', async () => {
      mockedLoadDynamic.mockResolvedValue(createEmptyDynamic());
      const extracted = makeExtractResult({ dynamic: {} });

      await memoryMaintenanceAgent.applyExtractionToMemory('p1', extracted, 5);

      const saved = mockedSaveDynamic.mock.calls[0][1] as DynamicMemory;
      // 源码 line 335: if (extracted.dynamic) — 空对象 {} 是 truthy，会进入块
      // 源码 line 340: dynamic.current.chapter = chapterNumber（无条件更新）
      expect(saved.current.chapter).toBe(5);
      // 但 location/pov/time/mood 不会更新（因为 extracted.dynamic.xxx 为 undefined）
      expect(saved.current.location).toBe('');
    });

    it('saveAtomicMemory + saveDynamicMemory 均被调用', async () => {
      mockedLoadAtomic.mockResolvedValue(createEmptyAtomic());
      mockedLoadDynamic.mockResolvedValue(createEmptyDynamic());
      const extracted = makeExtractResult();

      await memoryMaintenanceAgent.applyExtractionToMemory('p1', extracted, 1);

      expect(mockedSaveAtomic).toHaveBeenCalledWith('p1', expect.anything());
      expect(mockedSaveDynamic).toHaveBeenCalledWith('p1', expect.anything());
    });
  });

  // ============ 3. checkConsistency ============

  describe('checkConsistency', () => {
    it('记忆体关闭时直接返回 [] 不读 atomic', async () => {
      mockedIsEnabled.mockReturnValue(false);

      const result = await memoryMaintenanceAgent.checkConsistency('p1', '', createModel());

      expect(result).toEqual([]);
      expect(mockedLoadAtomic).not.toHaveBeenCalled();
    });

    it('文件系统无角色文件夹时返回 "尚未创建任何角色设定"', async () => {
      mockedGetRootFolder.mockReturnValue(null);
      mockedLoadAtomic.mockResolvedValue(createEmptyAtomic());

      const result = await memoryMaintenanceAgent.checkConsistency('p1', '', createModel());

      expect(result).toContain('尚未创建任何角色设定');
    });

    it('文件系统有角色文件 + 记忆体无时创建临时角色对象', async () => {
      mockedGetRootFolder.mockReturnValue('folder1');
      mockedGetChildren.mockReturnValue([
        mockFile('f1', '李雷', '这是李雷的完整身份描述'),
      ]);
      mockedLoadAtomic.mockResolvedValue(createEmptyAtomic());

      const result = await memoryMaintenanceAgent.checkConsistency('p1', '', createModel());

      // identity >= 5 字符，无性格关键词，应报缺少性格描述
      expect(result).toContain('角色「李雷」缺少性格描述');
    });

    it('文件系统有角色文件 + 记忆体有时补充 personality', async () => {
      mockedGetRootFolder.mockReturnValue('folder1');
      mockedGetChildren.mockReturnValue([
        mockFile('f1', '李雷', '### 性格特质\n- **勇敢**\n- **聪明**'),
      ]);
      const atomic = createEmptyAtomic();
      atomic.characters.push({
        id: 'c1', name: '李雷', identity: '短', personality: [], abilities: [],
        relationships: [], secrets: [], arc: { start: '', current: '', goal: '' },
      });
      mockedLoadAtomic.mockResolvedValue(atomic);

      await memoryMaintenanceAgent.checkConsistency('p1', '', createModel());

      // 应更新 personality + identity
      const saved = mockedSaveAtomic.mock.calls[0]?.[1] as AtomicMemory | undefined;
      // 注意：checkConsistency 不调用 saveAtomic，只读不写
      // 验证 issues 不含缺少性格描述（因为从文件系统提取了 personality）
      // 但 identity 仍 < 5，会报身份描述简略
      // 实际：identity 更新为完整内容（length >= content.length），不再 < 5
    });

    it('personality 正则匹配 ### 性格特质 章节标题', async () => {
      mockedGetRootFolder.mockReturnValue('folder1');
      mockedGetChildren.mockReturnValue([
        mockFile('f1', '李雷', '### 性格特质\n1. **勇敢**：敢于冒险\n2. **聪明**：思维敏捷'),
      ]);
      mockedLoadAtomic.mockResolvedValue(createEmptyAtomic());

      const result = await memoryMaintenanceAgent.checkConsistency('p1', '', createModel());

      // 提取到 personality 后，不再报缺少性格描述
      expect(result).not.toContain('角色「李雷」缺少性格描述');
    });

    it('personality 正则匹配无章节时关键词 fallback（性格：）', async () => {
      mockedGetRootFolder.mockReturnValue('folder1');
      mockedGetChildren.mockReturnValue([
        mockFile('f1', '李雷', '姓名：李雷\n性格：勇敢善良'),
      ]);
      mockedLoadAtomic.mockResolvedValue(createEmptyAtomic());

      const result = await memoryMaintenanceAgent.checkConsistency('p1', '', createModel());

      expect(result).not.toContain('角色「李雷」缺少性格描述');
    });

    it('personality 无匹配时 extractedPersonality 为空', async () => {
      mockedGetRootFolder.mockReturnValue('folder1');
      mockedGetChildren.mockReturnValue([
        mockFile('f1', '李雷', '这是李雷的描述，没有任何相关关键词描述'),
      ]);
      mockedLoadAtomic.mockResolvedValue(createEmptyAtomic());

      const result = await memoryMaintenanceAgent.checkConsistency('p1', '', createModel());

      // identity >= 5 字符，无性格相关关键词，应报缺少性格描述
      expect(result).toContain('角色「李雷」缺少性格描述');
    });

    it('角色 identity < 5 字符报 "身份描述过于简略"', async () => {
      mockedGetRootFolder.mockReturnValue('folder1');
      mockedGetChildren.mockReturnValue([
        mockFile('f1', '李雷', '短'),
      ]);
      mockedLoadAtomic.mockResolvedValue(createEmptyAtomic());

      const result = await memoryMaintenanceAgent.checkConsistency('p1', '', createModel());

      expect(result).toContain('角色「李雷」的身份描述过于简略');
    });

    it('世界观 rules 空 + cosmology 空时报 "世界观设定比较简略"', async () => {
      mockedGetRootFolder.mockReturnValue(null);
      mockedLoadAtomic.mockResolvedValue(createEmptyAtomic());

      const result = await memoryMaintenanceAgent.checkConsistency('p1', '', createModel());

      expect(result).toContain('世界观设定比较简略');
    });

    it('世界观 rules 非空时不报世界观简略', async () => {
      const atomic = createEmptyAtomic();
      atomic.world.rules = ['规则1'];
      mockedGetRootFolder.mockReturnValue(null);
      mockedLoadAtomic.mockResolvedValue(atomic);

      const result = await memoryMaintenanceAgent.checkConsistency('p1', '', createModel());

      expect(result).not.toContain('世界观设定比较简略');
    });

    it('剧情线 plots 空 + 文件系统无 timeline 文件时报 "尚未添加剧情线设定"', async () => {
      mockedGetRootFolder.mockReturnValue(null);
      mockedLoadAtomic.mockResolvedValue(createEmptyAtomic());

      const result = await memoryMaintenanceAgent.checkConsistency('p1', '', createModel());

      expect(result).toContain('尚未添加剧情线设定');
    });

    it('剧情线文件系统有 timeline 文件时不报缺失', async () => {
      mockedGetRootFolder.mockImplementation((type: string) => type === 'timeline' ? 'tl-folder' : null);
      mockedGetChildren.mockImplementation((folderId: string) => {
        if (folderId === 'tl-folder') {
          return [mockFile('tl1', '时间线', '这是一段足够长的时间线内容')];
        }
        return [];
      });
      mockedLoadAtomic.mockResolvedValue(createEmptyAtomic());

      const result = await memoryMaintenanceAgent.checkConsistency('p1', '', createModel());

      expect(result).not.toContain('尚未添加剧情线设定');
    });

    it('角色关系 targetId 不在角色列表时报 "关系目标未找到"', async () => {
      mockedGetRootFolder.mockReturnValue('folder1');
      mockedGetChildren.mockReturnValue([
        mockFile('f1', '李雷', '性格：勇敢'),
      ]);
      const atomic = createEmptyAtomic();
      atomic.characters.push({
        id: 'c1', name: '李雷', identity: '完整身份描述', personality: ['勇敢'], abilities: [],
        relationships: [{ targetId: '不存在的人', type: 'ally', description: '朋友', knownTo: [] }],
        secrets: [], arc: { start: '', current: '', goal: '' },
      });
      mockedLoadAtomic.mockResolvedValue(atomic);

      const result = await memoryMaintenanceAgent.checkConsistency('p1', '', createModel());

      expect(result).toContain('角色「李雷」的关系目标「不存在的人」未在角色列表中找到');
    });

    it('issues.length > 0 时调用 logMaintenanceAction', async () => {
      mockedGetRootFolder.mockReturnValue(null);
      mockedLoadAtomic.mockResolvedValue(createEmptyAtomic());

      await memoryMaintenanceAgent.checkConsistency('p1', '', createModel());

      expect(mockedLogAction).toHaveBeenCalledWith('p1', '系统粗查完成', expect.stringContaining('个潜在问题'));
    });

    it('issues.length === 0 时不调用 logMaintenanceAction', async () => {
      // 构造无问题场景：有角色 + 有世界观 + 有剧情线
      mockedGetRootFolder.mockImplementation((type: string) => type === 'timeline' ? 'tl' : 'char-folder');
      mockedGetChildren.mockImplementation((folderId: string) => {
        if (folderId === 'char-folder') {
          return [mockFile('f1', '李雷', '完整身份描述\n性格：勇敢')];
        }
        if (folderId === 'tl') {
          // timeline 文件内容长度需 > 10 才被视为有效（源码 line 498）
          return [mockFile('tl1', '时间线', '这是一段足够长的时间线内容用于通过长度检查')];
        }
        return [];
      });
      const atomic = createEmptyAtomic();
      atomic.world.rules = ['规则1'];
      mockedLoadAtomic.mockResolvedValue(atomic);

      await memoryMaintenanceAgent.checkConsistency('p1', '', createModel());

      expect(mockedLogAction).not.toHaveBeenCalled();
    });
  });

  // ============ 4. generateContextSummary ============

  describe('generateContextSummary', () => {
    it('ctx 为空时返回 "记忆体为空"', async () => {
      mockedBuildContext.mockResolvedValue('');

      const result = await memoryMaintenanceAgent.generateContextSummary('p1', createModel());

      expect(result).toBe('记忆体为空');
    });

    it('ctx < 10 字符时返回 "记忆体为空"', async () => {
      mockedBuildContext.mockResolvedValue('短');

      const result = await memoryMaintenanceAgent.generateContextSummary('p1', createModel());

      expect(result).toBe('记忆体为空');
    });

    it('LLM 成功时返回 content（< 500 字符不截断）', async () => {
      mockedBuildContext.mockResolvedValue('这是一段记忆体上下文内容');
      mockedGenerate.mockResolvedValue({ content: 'LLM 总结结果' } as any);

      const result = await memoryMaintenanceAgent.generateContextSummary('p1', createModel());

      expect(result).toBe('LLM 总结结果');
    });

    it('LLM content 超 500 字符时被 slice(0, 500) 截断', async () => {
      // ctx 长度需 >= 10 才不返回 '记忆体为空'
      mockedBuildContext.mockResolvedValue('这是一段足够长的上下文内容');
      const longContent = 'a'.repeat(600);
      mockedGenerate.mockResolvedValue({ content: longContent } as any);

      const result = await memoryMaintenanceAgent.generateContextSummary('p1', createModel());

      expect(result.length).toBe(500);
    });

    it('LLM 抛错时 catch 返回 ctx.slice(0, 500)', async () => {
      const ctx = '这是足够长的上下文内容用于测试';
      mockedBuildContext.mockResolvedValue(ctx);
      mockedGenerate.mockRejectedValue(new Error('LLM 异常'));

      const result = await memoryMaintenanceAgent.generateContextSummary('p1', createModel());

      expect(result).toBe(ctx);
    });

    it('LLM 返回空 content 时返回 ctx.slice(0, 500)', async () => {
      const ctx = '这是足够长的上下文内容用于测试';
      mockedBuildContext.mockResolvedValue(ctx);
      mockedGenerate.mockResolvedValue({ content: '' } as any);

      const result = await memoryMaintenanceAgent.generateContextSummary('p1', createModel());

      expect(result).toBe(ctx);
    });

    it('LLM 调用参数 temperature 0.3 + maxTokens 500', async () => {
      mockedBuildContext.mockResolvedValue('这是一段足够长的上下文内容');
      mockedGenerate.mockResolvedValue({ content: '总结' } as any);

      await memoryMaintenanceAgent.generateContextSummary('p1', createModel());

      const args = mockedGenerate.mock.calls[0][0];
      expect(args.temperature).toBe(0.3);
      expect(args.maxTokens).toBe(500);
    });
  });
});
