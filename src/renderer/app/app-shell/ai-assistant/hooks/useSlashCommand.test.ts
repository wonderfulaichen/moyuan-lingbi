/**
 * useSlashCommand Hook 单元测试
 *
 * 测试目标：
 * - parseInput: 各类输入触发正确的浮层状态
 * - handleKeyDown: 键盘导航与执行
 * - selectItem: 鼠标点击执行
 * - close: 关闭浮层
 * - lastAction: 执行结果通知
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSlashCommand } from './useSlashCommand';
import type { AIAgent } from '../../../../../shared/types/fileSystem';

// ============================================================
// 测试数据
// ============================================================

const mockAgents: AIAgent[] = [
  {
    id: 'agent-general',
    name: '通用助手',
    description: '通用 AI 助手',
    icon: 'fa-robot',
    color: '#10b981',
  } as AIAgent,
  {
    id: 'agent-sub-writer',
    name: '章节写手',
    description: '专注章节正文生成',
    icon: 'fa-feather',
    color: '#8b5cf6',
  } as AIAgent,
  {
    id: 'agent-sub-reviewer',
    name: '审校员',
    description: '专注章节质量审校',
    icon: 'fa-clipboard-check',
    color: '#f59e0b',
  } as AIAgent,
];

// ============================================================
// 辅助
// ============================================================

function createWrapper(agents: AIAgent[] = mockAgents) {
  return () => useSlashCommand({ agents });
}

function createKeyboardEvent(key: string, opts: { shiftKey?: boolean } = {}): React.KeyboardEvent {
  return {
    key,
    shiftKey: opts.shiftKey ?? false,
    preventDefault: vi.fn(),
  } as unknown as React.KeyboardEvent;
}

// ============================================================
// 测试
// ============================================================

describe('useSlashCommand', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ----------------------------------------------------------------
  // 初始状态
  // ----------------------------------------------------------------

  describe('初始状态', () => {
    it('浮层类型应为 null', () => {
      const { result } = renderHook(createWrapper());
      expect(result.current.overlayKind).toBeNull();
    });

    it('浮层项应为空数组', () => {
      const { result } = renderHook(createWrapper());
      expect(result.current.overlayItems).toEqual([]);
    });

    it('selectedIndex 应为 0', () => {
      const { result } = renderHook(createWrapper());
      expect(result.current.selectedIndex).toBe(0);
    });

    it('lastAction 应为 null', () => {
      const { result } = renderHook(createWrapper());
      expect(result.current.lastAction).toBeNull();
    });
  });

  // ----------------------------------------------------------------
  // parseInput: 非 / 开头
  // ----------------------------------------------------------------

  describe('parseInput - 非 / 开头', () => {
    it('普通文本不触发浮层', () => {
      const { result } = renderHook(createWrapper());
      act(() => result.current.parseInput('普通文本'));
      expect(result.current.overlayKind).toBeNull();
      expect(result.current.overlayItems).toEqual([]);
    });

    it('空字符串不触发浮层', () => {
      const { result } = renderHook(createWrapper());
      act(() => result.current.parseInput(''));
      expect(result.current.overlayKind).toBeNull();
    });

    it('已有浮层时输入普通文本应关闭', () => {
      const { result } = renderHook(createWrapper());
      act(() => result.current.parseInput('/'));
      expect(result.current.overlayKind).toBe('commands');
      act(() => result.current.parseInput('普通文本'));
      expect(result.current.overlayKind).toBeNull();
    });
  });

  // ----------------------------------------------------------------
  // parseInput: / 单独
  // ----------------------------------------------------------------

  describe('parseInput - / 单独', () => {
    it('输入 / 应列出所有指令', () => {
      const { result } = renderHook(createWrapper());
      act(() => result.current.parseInput('/'));
      expect(result.current.overlayKind).toBe('commands');
      expect(result.current.overlayItems).toHaveLength(4);
      expect(result.current.overlayItems.map(i => i.label)).toEqual(['/clear', '/new', '/agent', '/help']);
    });
  });

  // ----------------------------------------------------------------
  // parseInput: 指令前缀匹配
  // ----------------------------------------------------------------

  describe('parseInput - 指令前缀匹配', () => {
    it('输入 /c 应只匹配 /clear', () => {
      const { result } = renderHook(createWrapper());
      act(() => result.current.parseInput('/c'));
      expect(result.current.overlayKind).toBe('commands');
      expect(result.current.overlayItems).toHaveLength(1);
      expect(result.current.overlayItems[0].label).toBe('/clear');
    });

    it('输入 /n 应只匹配 /new', () => {
      const { result } = renderHook(createWrapper());
      act(() => result.current.parseInput('/n'));
      expect(result.current.overlayItems).toHaveLength(1);
      expect(result.current.overlayItems[0].label).toBe('/new');
    });

    it('输入 /a 应只匹配 /agent', () => {
      const { result } = renderHook(createWrapper());
      act(() => result.current.parseInput('/a'));
      expect(result.current.overlayItems).toHaveLength(1);
      expect(result.current.overlayItems[0].label).toBe('/agent');
    });

    it('输入 /h 应只匹配 /help', () => {
      const { result } = renderHook(createWrapper());
      act(() => result.current.parseInput('/h'));
      expect(result.current.overlayItems).toHaveLength(1);
      expect(result.current.overlayItems[0].label).toBe('/help');
    });

    it('输入未知前缀应关闭浮层', () => {
      const { result } = renderHook(createWrapper());
      act(() => result.current.parseInput('/xyz'));
      expect(result.current.overlayKind).toBeNull();
      expect(result.current.overlayItems).toEqual([]);
    });
  });

  // ----------------------------------------------------------------
  // parseInput: /agent <关键词>
  // ----------------------------------------------------------------

  describe('parseInput - /agent <关键词>', () => {
    it('输入 /agent（无空格）应显示 agents 浮层（源码 startsWith 分支命中）', () => {
      const { result } = renderHook(createWrapper());
      act(() => result.current.parseInput('/agent'));
      // 源码：text === '/agent' 命中 startsWith('/agent') 第一个 if，显示 agents 浮层
      expect(result.current.overlayKind).toBe('agents');
      expect(result.current.overlayItems).toHaveLength(3);
    });

    it('输入 /agent 应显示所有 agents', () => {
      const { result } = renderHook(createWrapper());
      act(() => result.current.parseInput('/agent '));
      expect(result.current.overlayKind).toBe('agents');
      expect(result.current.overlayItems).toHaveLength(3);
      expect(result.current.overlayItems.map(i => i.label)).toEqual(['通用助手', '章节写手', '审校员']);
    });

    it('输入 /agent 写 应过滤出"章节写手"', () => {
      const { result } = renderHook(createWrapper());
      act(() => result.current.parseInput('/agent 写'));
      expect(result.current.overlayKind).toBe('agents');
      expect(result.current.overlayItems).toHaveLength(1);
      expect(result.current.overlayItems[0].label).toBe('章节写手');
    });

    it('输入 /agent reviewer 应按 id 过滤', () => {
      const { result } = renderHook(createWrapper());
      act(() => result.current.parseInput('/agent reviewer'));
      expect(result.current.overlayItems).toHaveLength(1);
      expect(result.current.overlayItems[0].data).toBe('agent-sub-reviewer');
    });

    it('输入 /agent 未知关键词应返回空列表', () => {
      const { result } = renderHook(createWrapper());
      act(() => result.current.parseInput('/agent 未知xyz'));
      expect(result.current.overlayKind).toBe('agents');
      expect(result.current.overlayItems).toEqual([]);
    });

    it('agents 浮层项应包含 icon 和 color', () => {
      const { result } = renderHook(createWrapper());
      act(() => result.current.parseInput('/agent '));
      const item = result.current.overlayItems[0];
      expect(item.icon).toBe('fa-robot');
      expect(item.color).toBe('#10b981');
      expect(item.action).toBe('switchAgent');
      expect(item.data).toBe('agent-general');
    });
  });

  // ----------------------------------------------------------------
  // parseInput: /help
  // ----------------------------------------------------------------

  describe('parseInput - /help', () => {
    it('输入 /help 应显示帮助浮层', () => {
      const { result } = renderHook(createWrapper());
      act(() => result.current.parseInput('/help'));
      expect(result.current.overlayKind).toBe('help');
      expect(result.current.overlayItems).toHaveLength(4);
      // help 浮层项的 action 应为 noop
      expect(result.current.overlayItems.every(i => i.action === 'noop')).toBe(true);
    });

    it('help 浮层应显示带参数占位符的 label', () => {
      const { result } = renderHook(createWrapper());
      act(() => result.current.parseInput('/help'));
      const agentItem = result.current.overlayItems.find(i => i.key === 'agent');
      expect(agentItem?.label).toBe('/agent <关键词>');
    });
  });

  // ----------------------------------------------------------------
  // handleKeyDown: 浮层关闭时
  // ----------------------------------------------------------------

  describe('handleKeyDown - 浮层关闭时', () => {
    it('浮层关闭时 Enter 应返回 false（交还宿主）', () => {
      const { result } = renderHook(createWrapper());
      let consumed: boolean;
      act(() => { consumed = result.current.handleKeyDown(createKeyboardEvent('Enter')); });
      expect(consumed!).toBe(false);
    });

    it('浮层关闭时 ArrowDown 应返回 false', () => {
      const { result } = renderHook(createWrapper());
      let consumed: boolean;
      act(() => { consumed = result.current.handleKeyDown(createKeyboardEvent('ArrowDown')); });
      expect(consumed!).toBe(false);
    });
  });

  // ----------------------------------------------------------------
  // handleKeyDown: 浮层开启时
  // ----------------------------------------------------------------

  describe('handleKeyDown - 浮层开启时', () => {
    it('ArrowDown 应下移选中项', () => {
      const { result } = renderHook(createWrapper());
      act(() => result.current.parseInput('/'));
      expect(result.current.selectedIndex).toBe(0);
      act(() => result.current.handleKeyDown(createKeyboardEvent('ArrowDown')));
      expect(result.current.selectedIndex).toBe(1);
    });

    it('ArrowDown 在末尾应回绕到 0', () => {
      const { result } = renderHook(createWrapper());
      act(() => result.current.parseInput('/'));
      // 移到末尾
      act(() => result.current.handleKeyDown(createKeyboardEvent('ArrowDown')));
      act(() => result.current.handleKeyDown(createKeyboardEvent('ArrowDown')));
      act(() => result.current.handleKeyDown(createKeyboardEvent('ArrowDown')));
      expect(result.current.selectedIndex).toBe(3); // 4 项，末尾索引 3
      act(() => result.current.handleKeyDown(createKeyboardEvent('ArrowDown')));
      expect(result.current.selectedIndex).toBe(0);
    });

    it('ArrowUp 应上移选中项', () => {
      const { result } = renderHook(createWrapper());
      act(() => result.current.parseInput('/'));
      act(() => result.current.handleKeyDown(createKeyboardEvent('ArrowDown')));
      expect(result.current.selectedIndex).toBe(1);
      act(() => result.current.handleKeyDown(createKeyboardEvent('ArrowUp')));
      expect(result.current.selectedIndex).toBe(0);
    });

    it('ArrowUp 在首位应回绕到末尾', () => {
      const { result } = renderHook(createWrapper());
      act(() => result.current.parseInput('/'));
      expect(result.current.selectedIndex).toBe(0);
      act(() => result.current.handleKeyDown(createKeyboardEvent('ArrowUp')));
      expect(result.current.selectedIndex).toBe(3); // 4 项，末尾索引 3
    });

    it('Escape 应关闭浮层', () => {
      const { result } = renderHook(createWrapper());
      act(() => result.current.parseInput('/'));
      expect(result.current.overlayKind).toBe('commands');
      let consumed: boolean;
      act(() => { consumed = result.current.handleKeyDown(createKeyboardEvent('Escape')); });
      expect(consumed!).toBe(true);
      expect(result.current.overlayKind).toBeNull();
      expect(result.current.overlayItems).toEqual([]);
    });

    it('Enter 应触发 lastAction', () => {
      const { result } = renderHook(createWrapper());
      act(() => result.current.parseInput('/'));
      let consumed: boolean;
      act(() => { consumed = result.current.handleKeyDown(createKeyboardEvent('Enter')); });
      expect(consumed!).toBe(true);
      expect(result.current.lastAction).not.toBeNull();
      expect(result.current.lastAction?.action).toBe('clear'); // 首项是 /clear
    });

    it('Enter + ShiftKey 不应触发（保留换行）', () => {
      const { result } = renderHook(createWrapper());
      act(() => result.current.parseInput('/'));
      let consumed: boolean;
      act(() => { consumed = result.current.handleKeyDown(createKeyboardEvent('Enter', { shiftKey: true })); });
      expect(consumed!).toBe(false);
      expect(result.current.lastAction).toBeNull();
    });

    it('Enter 后 selectedIndex 对应的项应被触发', () => {
      const { result } = renderHook(createWrapper());
      act(() => result.current.parseInput('/'));
      // 移到第二项 (/new)
      act(() => result.current.handleKeyDown(createKeyboardEvent('ArrowDown')));
      expect(result.current.selectedIndex).toBe(1);
      act(() => result.current.handleKeyDown(createKeyboardEvent('Enter')));
      expect(result.current.lastAction?.action).toBe('new');
    });

    it('其他按键应返回 false（不消费）', () => {
      const { result } = renderHook(createWrapper());
      act(() => result.current.parseInput('/'));
      let consumed: boolean;
      act(() => { consumed = result.current.handleKeyDown(createKeyboardEvent('a')); });
      expect(consumed!).toBe(false);
    });
  });

  // ----------------------------------------------------------------
  // selectItem
  // ----------------------------------------------------------------

  describe('selectItem', () => {
    it('鼠标点击项应触发 lastAction', () => {
      const { result } = renderHook(createWrapper());
      act(() => result.current.parseInput('/'));
      const item = result.current.overlayItems[2]; // /agent
      act(() => result.current.selectItem(item));
      expect(result.current.lastAction?.action).toBe('agent');
    });

    it('点击 switchAgent 项应携带 data', () => {
      const { result } = renderHook(createWrapper());
      act(() => result.current.parseInput('/agent '));
      const item = result.current.overlayItems[1]; // 章节写手
      act(() => result.current.selectItem(item));
      expect(result.current.lastAction?.action).toBe('switchAgent');
      expect(result.current.lastAction?.data).toBe('agent-sub-writer');
    });

    it('点击 help 项 action 应为 noop', () => {
      const { result } = renderHook(createWrapper());
      act(() => result.current.parseInput('/help'));
      const item = result.current.overlayItems[0];
      act(() => result.current.selectItem(item));
      expect(result.current.lastAction?.action).toBe('noop');
    });
  });

  // ----------------------------------------------------------------
  // close
  // ----------------------------------------------------------------

  describe('close', () => {
    it('close 应清空浮层状态', () => {
      const { result } = renderHook(createWrapper());
      act(() => result.current.parseInput('/'));
      expect(result.current.overlayKind).toBe('commands');
      act(() => result.current.close());
      expect(result.current.overlayKind).toBeNull();
      expect(result.current.overlayItems).toEqual([]);
    });
  });

  // ----------------------------------------------------------------
  // setSelectedIndex
  // ----------------------------------------------------------------

  describe('setSelectedIndex', () => {
    it('应直接设置选中索引', () => {
      const { result } = renderHook(createWrapper());
      act(() => result.current.parseInput('/'));
      act(() => result.current.setSelectedIndex(2));
      expect(result.current.selectedIndex).toBe(2);
    });
  });

  // ----------------------------------------------------------------
  // 边界场景
  // ----------------------------------------------------------------

  describe('边界场景', () => {
    it('空 agents 列表时 /agent 应返回空浮层项', () => {
      const { result } = renderHook(createWrapper([]));
      act(() => result.current.parseInput('/agent '));
      expect(result.current.overlayKind).toBe('agents');
      expect(result.current.overlayItems).toEqual([]);
    });

    it('agents 浮层为空时 Enter 不应触发 lastAction', () => {
      const { result } = renderHook(createWrapper([]));
      act(() => result.current.parseInput('/agent '));
      let consumed: boolean;
      act(() => { consumed = result.current.handleKeyDown(createKeyboardEvent('Enter')); });
      // overlayItems.length === 0 时 Enter 不消费
      expect(consumed!).toBe(false);
      expect(result.current.lastAction).toBeNull();
    });

    it('连续 parseInput 应正确切换浮层类型', () => {
      const { result } = renderHook(createWrapper());
      act(() => result.current.parseInput('/'));
      expect(result.current.overlayKind).toBe('commands');
      act(() => result.current.parseInput('/agent '));
      expect(result.current.overlayKind).toBe('agents');
      act(() => result.current.parseInput('/help'));
      expect(result.current.overlayKind).toBe('help');
      act(() => result.current.parseInput(''));
      expect(result.current.overlayKind).toBeNull();
    });
  });
});
