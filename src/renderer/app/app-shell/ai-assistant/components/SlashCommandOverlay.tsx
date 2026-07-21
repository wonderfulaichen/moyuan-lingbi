/**
 * SlashCommandOverlay
 *
 * 输入栏 `/` 指令浮层 UI 组件。
 *
 * 展示位置：textarea 上方（避免遮挡底部信息栏）
 * 展示内容：
 * - commands: 命令列表（/clear /new /agent /help）
 * - agents: 智能体过滤列表（来自 useSlashCommand）
 * - help: 指令帮助列表
 *
 * 交互：
 * - 高亮当前选中项（selectedIndex，由 useSlashCommand 管理）
 * - 鼠标 hover 同步 selectedIndex
 * - 鼠标点击触发 selectItem
 */

import React from 'react';
import type { OverlayItem, OverlayKind } from '../hooks/useSlashCommand';

interface SlashCommandOverlayProps {
  /** 浮层类型（null 时不渲染） */
  kind: OverlayKind;
  /** 浮层项 */
  items: OverlayItem[];
  /** 当前高亮项索引 */
  selectedIndex: number;
  /** 同步高亮项索引（鼠标 hover 时） */
  onHover: (index: number) => void;
  /** 点击项时执行 */
  onSelect: (item: OverlayItem) => void;
}

export const SlashCommandOverlay: React.FC<SlashCommandOverlayProps> = ({
  kind,
  items,
  selectedIndex,
  onHover,
  onSelect,
}) => {
  if (kind === null || items.length === 0) return null;

  const titleMap: Record<NonNullable<OverlayKind>, string> = {
    commands: '快捷指令',
    agents: '切换智能体',
    help: '指令帮助',
  };

  return (
    <div
      className="absolute bottom-full left-0 right-0 mb-1 z-50 rounded-xl shadow-xl border overflow-hidden animate-fade-in"
      style={{
        maxHeight: 260,
        backgroundColor: 'var(--color-surface-base)',
        borderColor: 'var(--color-border-default)',
      }}
    >
      <div
        className="px-2.5 py-1 text-[9px] font-semibold uppercase tracking-wide border-b"
        style={{ color: 'var(--color-text-muted)', borderColor: 'var(--color-border-default)' }}
      >
        {titleMap[kind]}
      </div>
      <div className="p-1 flex flex-col gap-0.5 max-h-[220px] overflow-auto">
        {items.map((item, idx) => {
          const isActive = idx === selectedIndex;
          return (
            <button
              key={item.key}
              onMouseEnter={() => onHover(idx)}
              onClick={() => onSelect(item)}
              className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-all border-none cursor-pointer w-full"
              style={{
                background: isActive ? 'var(--color-surface-hover)' : 'transparent',
                color: isActive
                  ? (item.color || 'var(--color-primary-400)')
                  : 'var(--color-text-primary)',
              }}
            >
              {item.icon && (
                <div
                  className="w-6 h-6 rounded-md flex items-center justify-center shrink-0"
                  style={{
                    background: `${item.color || 'var(--color-primary-400)'}20`,
                    color: item.color || 'var(--color-primary-400)',
                  }}
                >
                  <i className={`fas ${item.icon} text-[9px]`} />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-medium leading-tight font-mono">{item.label}</p>
                {item.description && (
                  <p className="text-[8px] opacity-60 truncate">{item.description}</p>
                )}
              </div>
              {isActive && <i className="fas fa-arrow-turn-down text-[8px] opacity-70" />}
            </button>
          );
        })}
      </div>
    </div>
  );
};
