import { describe, it, expect } from 'vitest';
import { BUILT_IN_AGENTS, SYSTEM_PROMPT } from './systemPrompt';

/**
 * systemPrompt 测试
 *
 * 覆盖两个导出：
 * - BUILT_IN_AGENTS：5 个内置 agent 配置完整性
 * - SYSTEM_PROMPT：工具调用格式说明完整性
 */

describe('BUILT_IN_AGENTS', () => {
  it('应有 5 个内置 agent', () => {
    expect(BUILT_IN_AGENTS).toHaveLength(5);
  });

  it('所有 agent 的 id 应唯一', () => {
    const ids = BUILT_IN_AGENTS.map(a => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('所有 agent 应满足 isBuiltIn=true 且 createdAt=0', () => {
    for (const agent of BUILT_IN_AGENTS) {
      expect(agent.isBuiltIn).toBe(true);
      expect(agent.createdAt).toBe(0);
    }
  });

  it('所有 agent 应有非空的 name/icon/description', () => {
    for (const agent of BUILT_IN_AGENTS) {
      expect(agent.name).toBeTruthy();
      expect(agent.icon).toBeTruthy();
      expect(agent.description).toBeTruthy();
    }
  });

  describe('agent-general 通用助手', () => {
    it('应配置为全能型助手，无 systemPrompt 与 color', () => {
      const agent = BUILT_IN_AGENTS.find(a => a.id === 'agent-general');
      expect(agent).toBeDefined();
      expect(agent!.name).toBe('通用助手');
      expect(agent!.icon).toBe('fa-robot');
      expect(agent!.color).toBe('');
      expect(agent!.systemPrompt).toBe('');
      expect(agent!.description).toContain('任何操作');
    });
  });

  describe('agent-worldbuilder 世界观架构师', () => {
    it('应配置地理/势力/规则/历史背景专长', () => {
      const agent = BUILT_IN_AGENTS.find(a => a.id === 'agent-worldbuilder');
      expect(agent).toBeDefined();
      expect(agent!.name).toBe('世界观架构师');
      expect(agent!.icon).toBe('fa-globe');
      expect(agent!.color).toBe('#10b981');
      expect(agent!.systemPrompt).toContain('世界观架构师');
      expect(agent!.description).toContain('地理');
      expect(agent!.description).toContain('势力');
    });
  });

  describe('agent-character 角色设计师', () => {
    it('应配置外貌/性格/背景/关系网/成长弧线专长', () => {
      const agent = BUILT_IN_AGENTS.find(a => a.id === 'agent-character');
      expect(agent).toBeDefined();
      expect(agent!.name).toBe('角色设计师');
      expect(agent!.icon).toBe('fa-user-pen');
      expect(agent!.color).toBe('#3b82f6');
      expect(agent!.systemPrompt).toContain('角色设计师');
      expect(agent!.description).toContain('性格');
      expect(agent!.description).toContain('成长弧线');
    });
  });

  describe('agent-plotter 剧情策划师', () => {
    it('应配置大纲/冲突/节奏/转折/高潮专长', () => {
      const agent = BUILT_IN_AGENTS.find(a => a.id === 'agent-plotter');
      expect(agent).toBeDefined();
      expect(agent!.name).toBe('剧情策划师');
      expect(agent!.icon).toBe('fa-feather-pointed');
      expect(agent!.color).toBe('#f59e0b');
      expect(agent!.systemPrompt).toContain('剧情策划师');
      expect(agent!.description).toContain('大纲');
      expect(agent!.description).toContain('高潮');
    });
  });

  describe('agent-editor 文字润色师', () => {
    it('应配置修辞/节奏/文风统一/描写增强专长', () => {
      const agent = BUILT_IN_AGENTS.find(a => a.id === 'agent-editor');
      expect(agent).toBeDefined();
      expect(agent!.name).toBe('文字润色师');
      expect(agent!.icon).toBe('fa-spell-check');
      expect(agent!.color).toBe('#ec4899');
      expect(agent!.systemPrompt).toContain('文字润色师');
      expect(agent!.description).toContain('文风统一');
      expect(agent!.description).toContain('描写增强');
    });
  });

  it('agent 顺序应为 general → worldbuilder → character → plotter → editor', () => {
    const ids = BUILT_IN_AGENTS.map(a => a.id);
    expect(ids).toEqual([
      'agent-general',
      'agent-worldbuilder',
      'agent-character',
      'agent-plotter',
      'agent-editor',
    ]);
  });
});

describe('SYSTEM_PROMPT', () => {
  it('应以"墨渊灵笔"AI 创作助手开头，含核心原则', () => {
    expect(SYSTEM_PROMPT).toContain('墨渊灵笔');
    expect(SYSTEM_PROMPT).toContain('AI 创作助手');
    expect(SYSTEM_PROMPT).toContain('少说废话');
  });

  it('应包含工具调用格式章节', () => {
    expect(SYSTEM_PROMPT).toContain('工具调用格式');
  });

  it('应说明所有文件操作必须放在 content 字段', () => {
    expect(SYSTEM_PROMPT).toContain('content');
    expect(SYSTEM_PROMPT).toContain('完整内容');
  });

  describe('工具 action 类型完整性', () => {
    it('应包含 create_file 工具示例', () => {
      expect(SYSTEM_PROMPT).toContain('"action": "create_file"');
      expect(SYSTEM_PROMPT).toContain('parentId');
      expect(SYSTEM_PROMPT).toContain('name');
    });

    it('应包含 read_file 工具示例', () => {
      expect(SYSTEM_PROMPT).toContain('"action": "read_file"');
      expect(SYSTEM_PROMPT).toContain('fileId');
    });

    it('应包含 update_file 工具示例', () => {
      expect(SYSTEM_PROMPT).toContain('"action": "update_file"');
    });

    it('应包含 delete_file 工具示例', () => {
      expect(SYSTEM_PROMPT).toContain('"action": "delete_file"');
    });

    it('应包含 search 工具示例', () => {
      expect(SYSTEM_PROMPT).toContain('"action": "search"');
      expect(SYSTEM_PROMPT).toContain('query');
    });

    it('应包含 ask_input 工具示例', () => {
      expect(SYSTEM_PROMPT).toContain('"action": "ask_input"');
      expect(SYSTEM_PROMPT).toContain('question');
    });

    it('应包含 update_todo_list 工具示例', () => {
      expect(SYSTEM_PROMPT).toContain('"action": "update_todo_list"');
      expect(SYSTEM_PROMPT).toContain('todos');
    });
  });

  it('应包含文件夹类型映射', () => {
    expect(SYSTEM_PROMPT).toContain('characters');
    expect(SYSTEM_PROMPT).toContain('world');
    expect(SYSTEM_PROMPT).toContain('timeline');
    expect(SYSTEM_PROMPT).toContain('outline');
    expect(SYSTEM_PROMPT).toContain('custom');
    expect(SYSTEM_PROMPT).toContain('角色');
    expect(SYSTEM_PROMPT).toContain('世界观');
    expect(SYSTEM_PROMPT).toContain('时间线');
    expect(SYSTEM_PROMPT).toContain('大纲');
    expect(SYSTEM_PROMPT).toContain('自定义');
  });

  it('应说明回复模式：多文件任务必须先规划', () => {
    expect(SYSTEM_PROMPT).toContain('回复模式');
    expect(SYSTEM_PROMPT).toContain('update_todo_list');
    expect(SYSTEM_PROMPT).toContain('先规划');
  });

  it('应说明 update_file 与 create_file 的使用场景区分', () => {
    expect(SYSTEM_PROMPT).toContain('已有文件用 update_file');
    expect(SYSTEM_PROMPT).toContain('新文件用 create_file');
  });

  it('应强调 content 字段必须包含完整文件内容', () => {
    expect(SYSTEM_PROMPT).toContain('完整文件内容');
  });
});
