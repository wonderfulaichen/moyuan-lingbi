/**
 * AgentRegistry 单元测试
 *
 * 覆盖范围：
 * - 单例初始化（10 个内置 Agent：5 主 + 5 子）
 * - register / registerOrUpdate
 * - get / exists
 * - list / listByFilter（taskType / includeHidden / searchQuery）
 * - getByTask
 * - unregister（含内置保护）
 * - getCount / getBuiltInCount / getBuiltInIds
 * - _clearForTest 重置
 *
 * 关键设计点：
 * - 单例模式：全局唯一 agentRegistry 实例
 * - 内置 Agent 受保护，不允许注销（返回 false + 警告）
 * - _clearForTest 清除所有并重新注册内置 Agent
 * - listByFilter 的 hiddenOfDefault 默认隐藏
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { agentRegistry } from './AgentRegistry';
import type { AgentDefinition, AgentFilterOptions } from './types';
import type { TaskType } from '../ModelRouter';

// ============ Mock 依赖 ============

vi.mock('../../../../shared/prompts/agents', () => ({
  BUILT_IN_AGENTS: {
    'agent-general': {
      name: '通用助手',
      icon: 'fa-robot',
      color: '#6b7280',
      description: '通用 Agent',
      content: '通用系统提示词',
    },
    'agent-worldbuilder': {
      name: '世界观构建师',
      icon: 'fa-globe',
      color: '#10b981',
      description: '世界观',
      content: '世界观系统提示词',
    },
    'agent-character': {
      name: '角色设计师',
      icon: 'fa-user',
      color: '#3b82f6',
      description: '角色',
      content: '角色系统提示词',
    },
    'agent-plotter': {
      name: '剧情规划师',
      icon: 'fa-sitemap',
      color: '#f59e0b',
      description: '剧情',
      content: '剧情系统提示词',
    },
    'agent-editor': {
      name: '审校编辑',
      icon: 'fa-clipboard-check',
      color: '#ef4444',
      description: '审校',
      content: '审校系统提示词',
    },
  },
}));

// ============ 测试工具 ============

const createAgentDef = (overrides: Partial<AgentDefinition> = {}): AgentDefinition => ({
  id: 'agent-custom',
  name: '自定义 Agent',
  icon: 'fa-star',
  color: '#8b5cf6',
  description: '自定义描述',
  systemPrompt: '你是自定义 Agent',
  compatibleTasks: ['general'],
  allowedToolCategories: ['file'],
  maxRetries: 3,
  hiddenOfDefault: false,
  ...overrides,
});

// ============ 测试主体 ============

describe('AgentRegistry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 每次测试前重置注册表到初始状态
    agentRegistry._clearForTest();
  });

  // ============ 1. 单例与初始化 ============

  describe('单例与初始化', () => {
    it('构造后内置 Agent 数 = 10（5 主 + 5 子）', () => {
      expect(agentRegistry.getCount()).toBe(10);
    });

    it('getBuiltInCount 返回 10', () => {
      expect(agentRegistry.getBuiltInCount()).toBe(10);
    });

    it('getBuiltInIds 包含所有 10 个 id', () => {
      const ids = agentRegistry.getBuiltInIds();
      expect(ids.length).toBe(10);
      expect(ids).toContain('agent-general');
      expect(ids).toContain('agent-worldbuilder');
      expect(ids).toContain('agent-character');
      expect(ids).toContain('agent-plotter');
      expect(ids).toContain('agent-editor');
      expect(ids).toContain('agent-sub-writer');
      expect(ids).toContain('agent-sub-planner');
      expect(ids).toContain('agent-sub-memory');
      expect(ids).toContain('agent-sub-researcher');
      expect(ids).toContain('agent-sub-reviewer');
    });

    it('get 返回内置 Agent 定义', () => {
      const agent = agentRegistry.get('agent-general');
      expect(agent).toBeDefined();
      expect(agent!.name).toBe('通用助手');
      expect(agent!.systemPrompt).toBe('通用系统提示词');
    });

    it('内置 Agent 有正确的 compatibleTasks', () => {
      const agent = agentRegistry.get('agent-general')!;
      expect(agent.compatibleTasks).toEqual(['general', 'inspiration']);
    });

    it('内置 Agent 有正确的 allowedToolCategories', () => {
      const agent = agentRegistry.get('agent-general')!;
      expect(agent.allowedToolCategories).toEqual(['file', 'search', 'memory', 'ai']);
    });

    it('内置 Agent maxRetries=3', () => {
      const agent = agentRegistry.get('agent-general')!;
      expect(agent.maxRetries).toBe(3);
    });

    it('子 Agent agent-sub-writer 正确注册', () => {
      const agent = agentRegistry.get('agent-sub-writer');
      expect(agent).toBeDefined();
      expect(agent!.name).toBe('章节写手');
      expect(agent!.compatibleTasks).toEqual(['writing']);
    });
  });

  // ============ 2. register ============

  describe('register', () => {
    it('注册新 Agent 成功', () => {
      const def = createAgentDef({ id: 'agent-new' });
      agentRegistry.register(def);
      expect(agentRegistry.get('agent-new')).toBeDefined();
      expect(agentRegistry.getCount()).toBe(11);
    });

    it('注册已存在 id 抛错', () => {
      const def = createAgentDef({ id: 'agent-general' });
      expect(() => agentRegistry.register(def)).toThrow('Agent "agent-general" 已存在');
    });

    it('register 时进行浅拷贝（修改原对象不影响注册表）', () => {
      const def = createAgentDef({ id: 'agent-new', name: '原名' });
      agentRegistry.register(def);
      def.name = '改名';
      expect(agentRegistry.get('agent-new')!.name).toBe('原名');
    });
  });

  // ============ 3. registerOrUpdate ============

  describe('registerOrUpdate', () => {
    it('新 id 等同 register', () => {
      const def = createAgentDef({ id: 'agent-new' });
      agentRegistry.registerOrUpdate(def);
      expect(agentRegistry.get('agent-new')).toBeDefined();
    });

    it('已存在 id 覆盖更新', () => {
      const original = agentRegistry.get('agent-general')!;
      const updated = createAgentDef({
        id: 'agent-general',
        name: '改名通用助手',
        systemPrompt: '新提示词',
      });
      agentRegistry.registerOrUpdate(updated);
      const after = agentRegistry.get('agent-general')!;
      expect(after.name).toBe('改名通用助手');
      expect(after.systemPrompt).toBe('新提示词');
    });

    it('registerOrUpdate 不抛错即使 id 已存在', () => {
      const def = createAgentDef({ id: 'agent-general' });
      expect(() => agentRegistry.registerOrUpdate(def)).not.toThrow();
    });
  });

  // ============ 4. get / exists ============

  describe('get / exists', () => {
    it('get 已存在 Agent 返回定义', () => {
      const agent = agentRegistry.get('agent-general');
      expect(agent).toBeDefined();
      expect(agent!.id).toBe('agent-general');
    });

    it('get 不存在 Agent 返回 undefined', () => {
      expect(agentRegistry.get('unknown')).toBeUndefined();
    });

    it('exists 已存在返回 true', () => {
      expect(agentRegistry.exists('agent-general')).toBe(true);
    });

    it('exists 不存在返回 false', () => {
      expect(agentRegistry.exists('unknown')).toBe(false);
    });
  });

  // ============ 5. list / listByFilter ============

  describe('list / listByFilter', () => {
    it('list 返回所有 Agent（含 hidden）', () => {
      const all = agentRegistry.list();
      expect(all.length).toBe(10);
    });

    it('listByFilter taskType 过滤', () => {
      const writers = agentRegistry.listByFilter({ taskType: 'writing' });
      // agent-sub-writer 兼容 writing；agent-plotter 兼容 outline+writing
      expect(writers.some(a => a.id === 'agent-sub-writer')).toBe(true);
      expect(writers.some(a => a.id === 'agent-plotter')).toBe(true);
    });

    it('listByFilter includeHidden=false 过滤 hiddenOfDefault=true', () => {
      // 先注册一个 hidden Agent
      agentRegistry.register(createAgentDef({ id: 'agent-hidden', hiddenOfDefault: true }));
      const visible = agentRegistry.listByFilter({ includeHidden: false });
      expect(visible.some(a => a.id === 'agent-hidden')).toBe(false);
      const all = agentRegistry.listByFilter({ includeHidden: true });
      expect(all.some(a => a.id === 'agent-hidden')).toBe(true);
    });

    it('listByFilter searchQuery 匹配 name', () => {
      const results = agentRegistry.listByFilter({ searchQuery: '通用' });
      expect(results.some(a => a.id === 'agent-general')).toBe(true);
    });

    it('listByFilter searchQuery 匹配 description', () => {
      const results = agentRegistry.listByFilter({ searchQuery: '世界观' });
      expect(results.some(a => a.id === 'agent-worldbuilder')).toBe(true);
    });

    it('listByFilter searchQuery 匹配 id', () => {
      const results = agentRegistry.listByFilter({ searchQuery: 'agent-character' });
      expect(results.some(a => a.id === 'agent-character')).toBe(true);
    });

    it('listByFilter searchQuery 大小写不敏感', () => {
      const results = agentRegistry.listByFilter({ searchQuery: 'AGENT-GENERAL' });
      expect(results.some(a => a.id === 'agent-general')).toBe(true);
    });

    it('listByFilter 无选项返回全部非隐藏 Agent', () => {
      const all = agentRegistry.listByFilter({});
      // 内置 Agent 默认 hiddenOfDefault=false，所以应返回全部 10 个
      expect(all.length).toBe(10);
    });

    it('listByFilter 组合 taskType + searchQuery', () => {
      const results = agentRegistry.listByFilter({
        taskType: 'writing',
        searchQuery: '写手',
      });
      expect(results.some(a => a.id === 'agent-sub-writer')).toBe(true);
    });
  });

  // ============ 6. getByTask ============

  describe('getByTask', () => {
    it('返回兼容该 taskType 的 Agent', () => {
      const writers = agentRegistry.getByTask('writing');
      expect(writers.some(a => a.id === 'agent-sub-writer')).toBe(true);
      expect(writers.some(a => a.id === 'agent-plotter')).toBe(true);
    });

    it('无匹配返回空数组', () => {
      const results = agentRegistry.getByTask('unknown-task' as TaskType);
      expect(results).toEqual([]);
    });

    it('getByTask 与 listByFilter(taskType) 结果一致', () => {
      const byTask = agentRegistry.getByTask('review');
      const byFilter = agentRegistry.listByFilter({ taskType: 'review', includeHidden: true });
      expect(byTask.length).toBe(byFilter.length);
    });
  });

  // ============ 7. unregister ============

  describe('unregister', () => {
    it('注销自定义 Agent 成功', () => {
      agentRegistry.register(createAgentDef({ id: 'agent-custom' }));
      expect(agentRegistry.unregister('agent-custom')).toBe(true);
      expect(agentRegistry.exists('agent-custom')).toBe(false);
    });

    it('注销内置 Agent 返回 false', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      expect(agentRegistry.unregister('agent-general')).toBe(false);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('不允许注销内置 Agent'));
      expect(agentRegistry.exists('agent-general')).toBe(true);
      warnSpy.mockRestore();
    });

    it('注销子 Agent（也是内置）返回 false', () => {
      expect(agentRegistry.unregister('agent-sub-writer')).toBe(false);
      expect(agentRegistry.exists('agent-sub-writer')).toBe(true);
    });

    it('注销不存在 Agent 返回 false', () => {
      expect(agentRegistry.unregister('unknown')).toBe(false);
    });
  });

  // ============ 8. _clearForTest ============

  describe('_clearForTest', () => {
    it('清除所有自定义 Agent 重新注册内置', () => {
      agentRegistry.register(createAgentDef({ id: 'agent-custom1' }));
      agentRegistry.register(createAgentDef({ id: 'agent-custom2' }));
      expect(agentRegistry.getCount()).toBe(12);

      agentRegistry._clearForTest();

      expect(agentRegistry.getCount()).toBe(10);
      expect(agentRegistry.exists('agent-custom1')).toBe(false);
      expect(agentRegistry.exists('agent-custom2')).toBe(false);
      expect(agentRegistry.exists('agent-general')).toBe(true);
    });

    it('_clearForTest 可多次调用', () => {
      agentRegistry._clearForTest();
      agentRegistry._clearForTest();
      expect(agentRegistry.getCount()).toBe(10);
    });
  });
});
