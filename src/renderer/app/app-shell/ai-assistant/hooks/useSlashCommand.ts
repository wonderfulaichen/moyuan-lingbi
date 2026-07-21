/**
 * useSlashCommand
 *
 * 输入栏 `/` 快捷指令解析 Hook。
 *
 * 设计原则：
 * - 最小化：只硬编码 4 个 MVP 指令（/clear /new /agent /help），不引入可扩展注册机制
 * - 非侵入：不改变原 textarea 行为，仅在输入 `/` 开头时叠加浮层逻辑
 * - 键盘优先：支持 ↑↓ 导航 + Enter 执行 + Esc 关闭，兼容鼠标点击
 *
 * 指令清单：
 * - /clear        清空当前对话历史
 * - /new          新建对话
 * - /agent <关键词> 切换智能体（输入空格后弹出 Agent 过滤列表）
 * - /help         显示指令帮助
 */

import { useState, useCallback } from 'react';
import type { AIAgent } from '../../../../../shared/types/fileSystem';

// ============================================================
// 指令定义
// ============================================================

export interface SlashCommand {
  /** 指令名（不含 /） */
  name: string;
  /** 简短说明 */
  description: string;
  /** 是否需要参数（如 /agent 需要） */
  hasArgs: boolean;
  /** 参数占位提示 */
  argsPlaceholder?: string;
}

const COMMANDS: SlashCommand[] = [
  { name: 'clear', description: '清空当前对话历史', hasArgs: false },
  { name: 'new', description: '新建对话', hasArgs: false },
  { name: 'agent', description: '切换智能体', hasArgs: true, argsPlaceholder: '<关键词>' },
  { name: 'help', description: '显示指令帮助', hasArgs: false },
];

// ============================================================
// 浮层状态
// ============================================================

/** 浮层类型 */
export type OverlayKind = 'commands' | 'agents' | 'help' | null;

/** 浮层项 */
export interface OverlayItem {
  /** 唯一 key */
  key: string;
  /** 主标题 */
  label: string;
  /** 副标题（描述） */
  description?: string;
  /** 图标 class（Font Awesome） */
  icon?: string;
  /** 主题色（十六进制） */
  color?: string;
  /** 选中后要执行的操作标识 */
  action: string;
  /** 附加数据（如 agentId） */
  data?: string;
}

// ============================================================
// Hook
// ============================================================

export interface UseSlashCommandOptions {
  /** 可切换的智能体列表（来自 state.agents） */
  agents: AIAgent[];
}

export interface UseSlashCommandResult {
  /** 当前浮层类型（null 表示不显示） */
  overlayKind: OverlayKind;
  /** 浮层中显示的项 */
  overlayItems: OverlayItem[];
  /** 当前高亮项索引 */
  selectedIndex: number;
  /** 设置高亮项索引 */
  setSelectedIndex: (i: number) => void;
  /**
   * 解析输入文本，更新浮层状态
   * 在 textarea onChange 中调用
   */
  parseInput: (text: string) => void;
  /**
   * 键盘事件处理
   * 返回 true 表示已消费事件（应 preventDefault），false 表示未处理（交还宿主）
   */
  handleKeyDown: (e: React.KeyboardEvent) => boolean;
  /** 鼠标点击项时执行 */
  selectItem: (item: OverlayItem) => void;
  /** 关闭浮层 */
  close: () => void;
  /** 执行结果通知（最近一次执行的指令，供宿主做后续 UI 反馈） */
  lastAction: { action: string; data?: string; timestamp: number } | null;
}

export function useSlashCommand(options: UseSlashCommandOptions): UseSlashCommandResult {
  const { agents } = options;
  const [overlayKind, setOverlayKind] = useState<OverlayKind>(null);
  const [overlayItems, setOverlayItems] = useState<OverlayItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [lastAction, setLastAction] = useState<{ action: string; data?: string; timestamp: number } | null>(null);

  // ============================================================
  // 解析输入
  // ============================================================

  const parseInput = useCallback((text: string) => {
    if (!text.startsWith('/')) {
      setOverlayKind(null);
      setOverlayItems([]);
      return;
    }

    // /agent <关键词> 分支
    if (text.startsWith('/agent')) {
      // 必须是 /agent 后跟空格或刚好是 /agent
      if (text === '/agent' || text === '/agent ') {
        setOverlayKind('agents');
        setOverlayItems(buildAgentItems(agents, ''));
        setSelectedIndex(0);
        return;
      }
      if (text.startsWith('/agent ')) {
        const keyword = text.slice('/agent '.length).trim();
        setOverlayKind('agents');
        setOverlayItems(buildAgentItems(agents, keyword));
        setSelectedIndex(0);
        return;
      }
      // 用户正在输入 /agent 但尚未到空格，不显示
      setOverlayKind(null);
      setOverlayItems([]);
      return;
    }

    // /help 分支：始终展示（即使用户继续输入）
    if (text === '/help' || text.startsWith('/help')) {
      setOverlayKind('help');
      setOverlayItems(buildHelpItems());
      setSelectedIndex(0);
      return;
    }

    // 其他指令：输入以 / 开头时，列出所有匹配前缀的指令
    const slash = text.slice(1).split(/\s/)[0] || '';
    const matches = COMMANDS.filter(c => c.name.startsWith(slash));
    if (matches.length > 0) {
      setOverlayKind('commands');
      setOverlayItems(matches.map(c => ({
        key: c.name,
        label: `/${c.name}`,
        description: c.description,
        action: c.name,
      })));
      setSelectedIndex(0);
    } else {
      setOverlayKind(null);
      setOverlayItems([]);
    }
  }, [agents]);

  // ============================================================
  // 键盘导航
  // ============================================================

  const handleKeyDown = useCallback((e: React.KeyboardEvent): boolean => {
    if (overlayKind === null) return false;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => (i + 1) % overlayItems.length);
      return true;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => (i - 1 + overlayItems.length) % overlayItems.length);
      return true;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      setOverlayKind(null);
      setOverlayItems([]);
      return true;
    }
    if (e.key === 'Enter' && !e.shiftKey && overlayItems.length > 0) {
      e.preventDefault();
      const item = overlayItems[selectedIndex];
      if (item) {
        // 通知宿主执行（通过 lastAction 通知，宿主在 useEffect 中消费）
        setLastAction({ action: item.action, data: item.data, timestamp: Date.now() });
      }
      return true;
    }
    return false;
  }, [overlayKind, overlayItems, selectedIndex]);

  // ============================================================
  // 选中项执行
  // ============================================================

  const selectItem = useCallback((item: OverlayItem) => {
    setLastAction({ action: item.action, data: item.data, timestamp: Date.now() });
  }, []);

  const close = useCallback(() => {
    setOverlayKind(null);
    setOverlayItems([]);
  }, []);

  // ============================================================
  // 暴露 API
  // ============================================================

  return {
    overlayKind,
    overlayItems,
    selectedIndex,
    setSelectedIndex,
    parseInput,
    handleKeyDown,
    selectItem,
    close,
    lastAction,
  };
}

// ============================================================
// 辅助：构建浮层项
// ============================================================

function buildAgentItems(agents: AIAgent[], keyword: string): OverlayItem[] {
  const lower = keyword.toLowerCase();
  return agents
    .filter(a => {
      if (!lower) return true;
      return (
        a.name.toLowerCase().includes(lower) ||
        a.id.toLowerCase().includes(lower) ||
        (a.description || '').toLowerCase().includes(lower)
      );
    })
    .map(a => ({
      key: a.id,
      label: a.name,
      description: a.description || '自定义智能体',
      icon: a.icon,
      color: a.color,
      action: 'switchAgent',
      data: a.id,
    }));
}

function buildHelpItems(): OverlayItem[] {
  return COMMANDS.map(c => ({
    key: c.name,
    label: c.hasArgs ? `/${c.name} ${c.argsPlaceholder || '...'}` : `/${c.name}`,
    description: c.description,
    action: 'noop', // /help 浮层点击不执行任何操作
  }));
}
