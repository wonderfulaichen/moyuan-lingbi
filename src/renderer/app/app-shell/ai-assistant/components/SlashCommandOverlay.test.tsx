/**
 * SlashCommandOverlay 组件测试
 *
 * 测试目标：
 * - 渲染逻辑：kind=null 时不渲染 / 空列表显示"无匹配项" / 正常列表渲染
 * - 标题映射：commands/agents/help 对应正确标题
 * - 高亮项：selectedIndex 对应的项有视觉区分
 * - 交互：鼠标 hover 触发 onHover / 鼠标点击触发 onSelect
 * - 图标和颜色：有 icon/color 的项正确渲染
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { SlashCommandOverlay } from './SlashCommandOverlay';
import type { OverlayItem, OverlayKind } from '../hooks/useSlashCommand';

// ============================================================
// 测试数据
// ============================================================

const commandItems: OverlayItem[] = [
  { key: 'clear', label: '/clear', description: '清空当前对话历史', action: 'clear' },
  { key: 'new', label: '/new', description: '新建对话', action: 'new' },
  { key: 'agent', label: '/agent', description: '切换智能体', action: 'agent' },
  { key: 'help', label: '/help', description: '显示指令帮助', action: 'help' },
];

const agentItems: OverlayItem[] = [
  { key: 'agent-general', label: '通用助手', description: '通用 AI 助手', icon: 'fa-robot', color: '#10b981', action: 'switchAgent', data: 'agent-general' },
  { key: 'agent-sub-writer', label: '章节写手', description: '专注章节正文生成', icon: 'fa-feather', color: '#8b5cf6', action: 'switchAgent', data: 'agent-sub-writer' },
];

const helpItems: OverlayItem[] = [
  { key: 'clear', label: '/clear', description: '清空当前对话历史', action: 'noop' },
  { key: 'agent', label: '/agent <关键词>', description: '切换智能体', action: 'noop' },
];

// ============================================================
// 辅助
// ============================================================

function renderOverlay(props: Partial<React.ComponentProps<typeof SlashCommandOverlay>> = {}) {
  const defaultProps = {
    kind: 'commands' as OverlayKind,
    items: commandItems,
    selectedIndex: 0,
    onHover: vi.fn(),
    onSelect: vi.fn(),
  };
  const merged = { ...defaultProps, ...props };
  return render(<SlashCommandOverlay {...merged} />);
}

// ============================================================
// 测试
// ============================================================

describe('SlashCommandOverlay', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ----------------------------------------------------------------
  // 渲染逻辑
  // ----------------------------------------------------------------

  describe('渲染逻辑', () => {
    it('kind=null 时不渲染任何内容', () => {
      const { container } = renderOverlay({ kind: null });
      expect(container.firstChild).toBeNull();
    });

    it('commands 类型应显示"快捷指令"标题', () => {
      renderOverlay({ kind: 'commands' });
      expect(screen.getByText('快捷指令')).toBeInTheDocument();
    });

    it('agents 类型应显示"切换智能体"标题', () => {
      renderOverlay({ kind: 'agents', items: agentItems });
      expect(screen.getByText('切换智能体')).toBeInTheDocument();
    });

    it('help 类型应显示"指令帮助"标题', () => {
      renderOverlay({ kind: 'help', items: helpItems });
      expect(screen.getByText('指令帮助')).toBeInTheDocument();
    });

    it('空列表应显示"无匹配项"提示', () => {
      renderOverlay({ kind: 'agents', items: [] });
      expect(screen.getByText('无匹配项')).toBeInTheDocument();
    });

    it('空列表不应渲染任何选项', () => {
      renderOverlay({ kind: 'agents', items: [] });
      expect(screen.queryByRole('option')).not.toBeInTheDocument();
    });

    it('应渲染所有列表项', () => {
      renderOverlay({ kind: 'commands', items: commandItems });
      expect(screen.getByText('/clear')).toBeInTheDocument();
      expect(screen.getByText('/new')).toBeInTheDocument();
      expect(screen.getByText('/agent')).toBeInTheDocument();
      expect(screen.getByText('/help')).toBeInTheDocument();
    });

    it('应渲染项的描述文本', () => {
      renderOverlay({ kind: 'commands', items: commandItems });
      expect(screen.getByText('清空当前对话历史')).toBeInTheDocument();
      expect(screen.getByText('新建对话')).toBeInTheDocument();
    });
  });

  // ----------------------------------------------------------------
  // 高亮项
  // ----------------------------------------------------------------

  describe('高亮项', () => {
    it('selectedIndex=0 时第一项应有高亮样式', () => {
      renderOverlay({ selectedIndex: 0 });
      const buttons = screen.getAllByRole('option');
      const firstButton = buttons[0];
      // 高亮项的 background 应为 var(--color-surface-hover)
      expect(firstButton.style.background).toBe('var(--color-surface-hover)');
    });

    it('selectedIndex=1 时第二项应有高亮样式', () => {
      renderOverlay({ selectedIndex: 1 });
      const buttons = screen.getAllByRole('option');
      expect(buttons[0].style.background).toBe('transparent');
      expect(buttons[1].style.background).toBe('var(--color-surface-hover)');
    });

    it('非高亮项 background 应为 transparent', () => {
      renderOverlay({ selectedIndex: 0 });
      const buttons = screen.getAllByRole('option');
      expect(buttons[1].style.background).toBe('transparent');
      expect(buttons[2].style.background).toBe('transparent');
      expect(buttons[3].style.background).toBe('transparent');
    });

    it('高亮项应显示箭头图标（fa-arrow-turn-down）', () => {
      renderOverlay({ selectedIndex: 0 });
      const buttons = screen.getAllByRole('option');
      const firstButton = buttons[0];
      const arrow = firstButton.querySelector('.fa-arrow-turn-down');
      expect(arrow).not.toBeNull();
    });

    it('非高亮项不应显示箭头图标', () => {
      renderOverlay({ selectedIndex: 0 });
      const buttons = screen.getAllByRole('option');
      const secondButton = buttons[1];
      const arrow = secondButton.querySelector('.fa-arrow-turn-down');
      expect(arrow).toBeNull();
    });
  });

  // ----------------------------------------------------------------
  // 图标和颜色
  // ----------------------------------------------------------------

  describe('图标和颜色', () => {
    it('有 icon 的项应渲染图标容器', () => {
      renderOverlay({ kind: 'agents', items: agentItems });
      const buttons = screen.getAllByRole('option');
      const iconContainer = buttons[0].querySelector('.w-6.h-6');
      expect(iconContainer).not.toBeNull();
    });

    it('有 icon 的项应渲染对应的 FontAwesome 图标', () => {
      renderOverlay({ kind: 'agents', items: agentItems });
      const buttons = screen.getAllByRole('option');
      const robotIcon = buttons[0].querySelector('.fa-robot');
      const featherIcon = buttons[1].querySelector('.fa-feather');
      expect(robotIcon).not.toBeNull();
      expect(featherIcon).not.toBeNull();
    });

    it('有 color 的项高亮时文字颜色应为该 color', () => {
      renderOverlay({ kind: 'agents', items: agentItems, selectedIndex: 0 });
      const buttons = screen.getAllByRole('option');
      // jsdom 将 #10b981 转换为 rgb(16, 185, 129)
      expect(buttons[0].style.color).toBe('rgb(16, 185, 129)');
    });

    it('有 color 的项图标容器背景色应包含该 color + 透明度后缀', () => {
      renderOverlay({ kind: 'agents', items: agentItems });
      const buttons = screen.getAllByRole('option');
      const iconContainer = buttons[0].querySelector('.w-6.h-6') as HTMLElement;
      // jsdom 将 #10b98120 转换为 rgba(16, 185, 129, 0.125)
      expect(iconContainer.style.background).toBe('rgba(16, 185, 129, 0.125)');
    });

    it('无 icon 的项不应渲染图标容器', () => {
      renderOverlay({ kind: 'commands', items: commandItems });
      const buttons = screen.getAllByRole('option');
      const iconContainer = buttons[0].querySelector('.w-6.h-6');
      expect(iconContainer).toBeNull();
    });

    it('无 color 的项高亮时应使用默认颜色 var(--color-primary-400)', () => {
      renderOverlay({ kind: 'commands', items: commandItems, selectedIndex: 0 });
      const buttons = screen.getAllByRole('option');
      expect(buttons[0].style.color).toBe('var(--color-primary-400)');
    });
  });

  // ----------------------------------------------------------------
  // 交互：鼠标 hover
  // ----------------------------------------------------------------

  describe('交互 - 鼠标 hover', () => {
    it('hover 第一项应调用 onHover(0)', () => {
      const onHover = vi.fn();
      renderOverlay({ onHover });
      const buttons = screen.getAllByRole('option');
      fireEvent.mouseEnter(buttons[0]);
      expect(onHover).toHaveBeenCalledWith(0);
    });

    it('hover 第三项应调用 onHover(2)', () => {
      const onHover = vi.fn();
      renderOverlay({ onHover });
      const buttons = screen.getAllByRole('option');
      fireEvent.mouseEnter(buttons[2]);
      expect(onHover).toHaveBeenCalledWith(2);
    });

    it('hover 每一项都应触发 onHover', () => {
      const onHover = vi.fn();
      renderOverlay({ onHover });
      const buttons = screen.getAllByRole('option');
      buttons.forEach(btn => fireEvent.mouseEnter(btn));
      expect(onHover).toHaveBeenCalledTimes(4);
      expect(onHover).toHaveBeenNthCalledWith(1, 0);
      expect(onHover).toHaveBeenNthCalledWith(2, 1);
      expect(onHover).toHaveBeenNthCalledWith(3, 2);
      expect(onHover).toHaveBeenNthCalledWith(4, 3);
    });
  });

  // ----------------------------------------------------------------
  // 交互：鼠标点击
  // ----------------------------------------------------------------

  describe('交互 - 鼠标点击', () => {
    it('点击第一项应调用 onSelect 并传入第一项数据', () => {
      const onSelect = vi.fn();
      renderOverlay({ onSelect });
      const buttons = screen.getAllByRole('option');
      fireEvent.click(buttons[0]);
      expect(onSelect).toHaveBeenCalledWith(commandItems[0]);
    });

    it('点击第三项应调用 onSelect 并传入第三项数据', () => {
      const onSelect = vi.fn();
      renderOverlay({ onSelect });
      const buttons = screen.getAllByRole('option');
      fireEvent.click(buttons[2]);
      expect(onSelect).toHaveBeenCalledWith(commandItems[2]);
    });

    it('点击 agent 项应传入包含 data 字段的项', () => {
      const onSelect = vi.fn();
      renderOverlay({ kind: 'agents', items: agentItems, onSelect });
      const buttons = screen.getAllByRole('option');
      fireEvent.click(buttons[1]);
      expect(onSelect).toHaveBeenCalledWith(agentItems[1]);
      expect(onSelect.mock.calls[0][0].data).toBe('agent-sub-writer');
    });
  });

  // ----------------------------------------------------------------
  // 边界场景
  // ----------------------------------------------------------------

  describe('可访问性 (a11y)', () => {
    it('浮层容器应有 role="listbox"', () => {
      const { container } = renderOverlay();
      const listbox = container.querySelector('[role="listbox"]');
      expect(listbox).not.toBeNull();
    });

    it('浮层容器应有 aria-label 对应标题', () => {
      const { container } = renderOverlay({ kind: 'commands' });
      const listbox = container.querySelector('[role="listbox"]') as HTMLElement;
      expect(listbox.getAttribute('aria-label')).toBe('快捷指令');
    });

    it('agents 类型 aria-label 应为"切换智能体"', () => {
      const { container } = renderOverlay({ kind: 'agents', items: agentItems });
      const listbox = container.querySelector('[role="listbox"]') as HTMLElement;
      expect(listbox.getAttribute('aria-label')).toBe('切换智能体');
    });

    it('列表项应有 role="option"', () => {
      renderOverlay();
      const options = screen.getAllByRole('option');
      expect(options).toHaveLength(4);
    });

    it('高亮项应有 aria-selected="true"', () => {
      renderOverlay({ selectedIndex: 0 });
      const options = screen.getAllByRole('option');
      expect(options[0].getAttribute('aria-selected')).toBe('true');
    });

    it('非高亮项应有 aria-selected="false"', () => {
      renderOverlay({ selectedIndex: 0 });
      const options = screen.getAllByRole('option');
      expect(options[1].getAttribute('aria-selected')).toBe('false');
      expect(options[2].getAttribute('aria-selected')).toBe('false');
      expect(options[3].getAttribute('aria-selected')).toBe('false');
    });

    it('切换 selectedIndex 后 aria-selected 应更新', () => {
      const { rerender } = renderOverlay({ selectedIndex: 0 });
      expect(screen.getAllByRole('option')[0].getAttribute('aria-selected')).toBe('true');

      rerender(
        <SlashCommandOverlay
          kind="commands"
          items={commandItems}
          selectedIndex={2}
          onHover={vi.fn()}
          onSelect={vi.fn()}
        />
      );
      const options = screen.getAllByRole('option');
      expect(options[0].getAttribute('aria-selected')).toBe('false');
      expect(options[2].getAttribute('aria-selected')).toBe('true');
    });

    it('空列表的"无匹配项"应有 role="status"', () => {
      renderOverlay({ kind: 'agents', items: [] });
      expect(screen.getByRole('status')).toBeInTheDocument();
    });

    it('高亮项的箭头图标应有 aria-hidden="true"', () => {
      renderOverlay({ selectedIndex: 0 });
      const buttons = screen.getAllByRole('option');
      const arrow = buttons[0].querySelector('.fa-arrow-turn-down');
      expect(arrow?.getAttribute('aria-hidden')).toBe('true');
    });
  });

  describe('边界场景', () => {
    it('单项列表应正常渲染', () => {
      renderOverlay({ items: [commandItems[0]] });
      expect(screen.getAllByRole('option')).toHaveLength(1);
      expect(screen.getByText('/clear')).toBeInTheDocument();
    });

    it('selectedIndex 超出范围时所有项都非高亮', () => {
      renderOverlay({ selectedIndex: 999 });
      const buttons = screen.getAllByRole('option');
      buttons.forEach(btn => {
        expect(btn.style.background).toBe('transparent');
      });
    });

    it('切换 kind 后标题应更新', () => {
      const { rerender } = renderOverlay({ kind: 'commands' });
      expect(screen.getByText('快捷指令')).toBeInTheDocument();

      rerender(
        <SlashCommandOverlay
          kind="agents"
          items={agentItems}
          selectedIndex={0}
          onHover={vi.fn()}
          onSelect={vi.fn()}
        />
      );
      expect(screen.getByText('切换智能体')).toBeInTheDocument();
      expect(screen.queryByText('快捷指令')).not.toBeInTheDocument();
    });

    it('从有列表切换到空列表应显示"无匹配项"', () => {
      const { rerender } = renderOverlay({ kind: 'commands', items: commandItems });
      expect(screen.getByText('/clear')).toBeInTheDocument();

      rerender(
        <SlashCommandOverlay
          kind="agents"
          items={[]}
          selectedIndex={0}
          onHover={vi.fn()}
          onSelect={vi.fn()}
        />
      );
      expect(screen.getByText('无匹配项')).toBeInTheDocument();
      expect(screen.queryByRole('option')).not.toBeInTheDocument();
    });

    it('从 kind=null 切换到 kind=commands 应渲染浮层', () => {
      const { rerender, container } = renderOverlay({ kind: null });
      expect(container.firstChild).toBeNull();

      rerender(
        <SlashCommandOverlay
          kind="commands"
          items={commandItems}
          selectedIndex={0}
          onHover={vi.fn()}
          onSelect={vi.fn()}
        />
      );
      expect(container.firstChild).not.toBeNull();
      expect(screen.getByText('快捷指令')).toBeInTheDocument();
    });
  });
});
