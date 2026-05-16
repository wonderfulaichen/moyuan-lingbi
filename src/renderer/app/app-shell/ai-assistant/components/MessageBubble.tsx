import React, { useState } from 'react';
import { AIChatMessage, AgentPhase } from '../../../../../shared/types/fileSystem';
import { aiAssistant } from '../../../../shared/services/AIAssistantService';
import { TodoListDisplay } from './TodoListDisplay';

interface MessageBubbleProps {
  msg: AIChatMessage;
  msgIdx: number;
  totalMsgIds: string[];
  isEditing: boolean;
  editContent: string;
  setEditContent: (v: string) => void;
  onEditSubmit: () => void;
  isCollapsed: boolean;
  isLastAssistant: boolean;
  copyToast: string | null;
  onCopy: (content: string, msgId: string) => void;
  onEdit: (msgId: string, content: string) => void;
  onEditCancel: () => void;
  onRegenerate: () => void;
  onToggleCollapse: (msgId: string) => void;
  isLongContent: (text: string) => boolean;
  isProcessing: boolean;
  messageRef: (el: HTMLDivElement | null) => void;
  todos?: any[];
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({
  msg, msgIdx, totalMsgIds, isEditing, editContent, setEditContent, onEditSubmit,
  isCollapsed, isLastAssistant, copyToast, onCopy, onEdit, onEditCancel, onRegenerate,
  onToggleCollapse, isLongContent, isProcessing, messageRef, todos = [],
}) => {
  const [thinkingExpanded, setThinkingExpanded] = useState(false);
  const displayContent = isCollapsed ? msg.content.slice(0, 280) + '...' : msg.content;
  const isCompressed = !!msg.compressedSummary;
  const isSummaryMsg = msg.role === 'system' && msg.content.startsWith('【对话已压缩') || msg.content.startsWith('【');
  const hasThinking = msg.thinking && msg.thinking.trim().length > 0;

  return (
    <div className={`group flex gap-1.5 items-start ${msg.role === 'user' ? 'flex-row-reverse' : ''}`} ref={messageRef}>
      <div className="w-6 h-6 rounded-lg shrink-0 flex items-center justify-center mt-0.5"
        style={{ background: isSummaryMsg ? 'var(--color-primary-100)' : msg.role === 'user' ? 'var(--color-primary-100)' : 'var(--color-surface-muted)' }}>
        <i className={`fas ${isSummaryMsg ? 'fa-compress-alt' : msg.role === 'user' ? 'fa-user' : 'fa-robot'} text-[9px]`}
          style={{ color: isSummaryMsg ? 'var(--color-primary-400)' : msg.role === 'user' ? 'var(--color-primary-300)' : 'var(--color-text-muted)' }} />
      </div>
      <div className="relative max-w-[85%] min-w-0">
        {isEditing ? (
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--color-primary-400)' }}>
            <textarea
              value={editContent}
              onChange={e => setEditContent(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onEditSubmit(); } }}
              autoFocus
              rows={Math.min(6, Math.max(2, editContent.split('\n').length))}
              className="w-full px-3 py-2 text-[11px] leading-relaxed resize-none outline-none rounded-xl"
              style={{ color: 'var(--color-text-primary)', backgroundColor: 'var(--color-surface-base)', fontFamily: 'inherit', border: 'none' }}
            />
            <div className="flex justify-end gap-1.5 px-2 py-1.5" style={{ borderTop: '1px solid var(--color-border-default)', backgroundColor: 'var(--color-surface-muted)' }}>
              <button onClick={onEditCancel} className="text-[10px] px-2 py-1 rounded-md border-none cursor-pointer" style={{ color: 'var(--color-text-muted)' }}>取消</button>
              <button onClick={onEditSubmit} disabled={!editContent.trim() || isProcessing}
                className="btn-gradient text-[10px] font-semibold px-2.5 py-1 rounded-md border-none cursor-pointer"
                style={{ opacity: editContent.trim() && !isProcessing ? 1 : 0.45 }}>发送</button>
            </div>
          </div>
        ) : (
          <>
            <div className="rounded-xl px-3 py-2 text-[11px] leading-relaxed whitespace-pre-wrap break-words relative"
              style={{
                color: isSummaryMsg ? 'var(--color-primary-400)' : msg.role === 'user' ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                backgroundColor: isSummaryMsg ? 'var(--color-primary-50)' : msg.role === 'user' ? 'var(--color-primary-100)' : 'var(--color-surface-muted)',
                border: isSummaryMsg ? '1px dashed var(--color-primary-300)' : msg.role === 'user' ? '1px solid var(--color-primary-200)' : '1px solid var(--color-border-default)',
              }}>
              {isCompressed && (
                <div className="flex items-center gap-1 mb-1 px-1.5 py-0.5 rounded text-[8px]" style={{ background: 'var(--color-primary-100)', color: 'var(--color-primary-400)', border: '1px solid var(--color-primary-200)' }}>
                  <i className="fas fa-compress-alt text-[7px]" />
                  <span>已压缩 · 原文 {msg.content.length} 字</span>
                </div>
              )}
              
              {hasThinking && msg.role === 'assistant' && (
                <div className="mb-2">
                  <button
                    onClick={() => setThinkingExpanded(!thinkingExpanded)}
                    className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-[9px] cursor-pointer border-none transition-all w-full"
                    style={{
                      background: thinkingExpanded ? 'var(--color-p-alpha-15)' : 'var(--color-surface-muted)',
                      color: 'var(--color-text-muted)',
                      borderLeft: '2px solid var(--color-primary-400)',
                    }}
                  >
                    <i className={`fas ${thinkingExpanded ? 'fa-chevron-down' : 'fa-chevron-right'} text-[7px]`} />
                    <i className="fas fa-brain text-[8px]" style={{ color: 'var(--color-primary-400)' }} />
                    <span style={{ color: 'var(--color-text-secondary)' }}>思考过程</span>
                    <span className="ml-auto opacity-60">{thinkingExpanded ? '点击收起' : '点击展开'}</span>
                  </button>
                  {thinkingExpanded && (
                    <div className="mt-1.5 p-2 rounded-lg text-[10px] leading-relaxed" 
                      style={{ 
                        background: 'var(--color-p-alpha-08)', 
                        color: 'var(--color-text-tertiary)',
                        border: '1px solid var(--color-border-default)',
                        fontStyle: 'italic',
                      }}>
                      {msg.thinking}
                    </div>
                  )}
                </div>
              )}
              
              {isLastAssistant && (todos.length > 0 || msg.todoList?.length > 0) && (
                <TodoListDisplay todos={msg.todoList?.length > 0 ? msg.todoList : todos} compact={true} />
              )}
              
              {isCompressed ? msg.compressedSummary : displayContent}
              {msg.role === 'user' && !isProcessing && (
                <div className="absolute -left-7 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col gap-0.5">
                  <button onClick={(e) => { e.stopPropagation(); onEdit(msg.id, msg.content); }}
                    title="编辑消息"
                    className="w-5 h-5 rounded flex items-center justify-center cursor-pointer border-none text-[9px] transition-colors"
                    style={{ color: 'var(--color-text-muted)', background: 'transparent' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--color-primary-400)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--color-text-muted)' }}>
                    <i className="fas fa-pen" />
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); aiAssistant.recallMessage(msg.id); }}
                    title="撤回并重新输入"
                    className="w-5 h-5 rounded flex items-center justify-center cursor-pointer border-none text-[9px] transition-colors"
                    style={{ color: 'var(--color-text-muted)', background: 'transparent' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--color-error)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--color-text-muted)' }}>
                    <i className="fas fa-rotate-left" />
                  </button>
                </div>
              )}
            </div>
            {isLongContent(msg.content) && (
              <button onClick={() => onToggleCollapse(msg.id)}
                className="text-[9px] mt-1 px-1.5 py-0.5 rounded cursor-pointer border-none transition-colors"
                style={{ color: 'var(--color-text-muted)', background: 'transparent' }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--color-primary-400)'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--color-text-muted)'}>
                {isCollapsed ? `展开全部 (${msg.content.length}字)` : '收起'}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
};