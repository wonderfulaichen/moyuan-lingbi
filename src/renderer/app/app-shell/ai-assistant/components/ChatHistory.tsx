import React, { useState } from 'react';
import { Conversation } from '../../../../../shared/types/fileSystem';
import { aiAssistant } from '../../../../shared/services/AIAssistantService';

function formatTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return '昨天';
  return d.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
}

interface ChatHistoryProps {
  conversations: Conversation[];
  activeConversationId: string | null;
  onNewConversation: () => void;
}

export const ChatHistory: React.FC<ChatHistoryProps> = ({ conversations, activeConversationId, onNewConversation }) => {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  return (
    <div className="w-[160px] border-r flex flex-col shrink-0" style={{ borderColor: 'var(--color-border-default)' }}>
      <div className="flex items-center justify-between px-2.5 py-2 border-b" style={{ borderColor: 'var(--color-border-default)' }}>
        <span className="text-[10px] font-bold" style={{ color: 'var(--color-text-secondary)' }}>对话历史</span>
        <button onClick={onNewConversation} className="btn-icon text-[9px] px-1.5 py-0.5 rounded" title="新对话">
          <i className="fas fa-plus" />
        </button>
      </div>
      <div className="flex-1 overflow-auto p-1.5 flex flex-col gap-0.5">
        {conversations.map(conv => {
          const isActive = conv.id === activeConversationId;
          const isRenaming = renamingId === conv.id;
          return (
            <div
              key={conv.id}
              onClick={() => !isRenaming && aiAssistant.switchToConversation(conv.id)}
              className="group relative rounded-lg px-2 py-1.5 cursor-pointer transition-all text-left"
              style={{
                border: isActive ? '1px solid var(--color-primary-300)' : '1px solid transparent',
                background: isActive ? 'var(--color-primary-100)' : 'transparent',
              }}
            >
              {isRenaming ? (
                <input
                  autoFocus
                  value={renameValue}
                  onChange={e => setRenameValue(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') { aiAssistant.renameConversation(conv.id, renameValue); setRenamingId(null); }
                    if (e.key === 'Escape') setRenamingId(null);
                  }}
                  onBlur={() => { aiAssistant.renameConversation(conv.id, renameValue); setRenamingId(null); }}
                  className="w-full text-[10px] bg-transparent outline-none border rounded px-1 py-0.5"
                  style={{ borderColor: 'var(--color-primary-300)', color: 'var(--color-text-primary)' }}
                />
              ) : (
                <>
                  <p className="text-[10px] font-medium truncate pr-4" style={{ color: isActive ? 'var(--color-primary-300)' : 'var(--color-text-primary)' }}>
                    {conv.title || '新对话'}
                  </p>
                  <p className="text-[8px]" style={{ color: 'var(--color-text-muted)' }}>
                    {conv.messages.length}条 · {formatTime(conv.updatedAt)}
                  </p>
                </>
              )}
              {!isRenaming && (
                <div className="absolute right-1 top-1 hidden group-hover:flex gap-0.5">
                  <button onClick={e => { e.stopPropagation(); setRenamingId(conv.id); setRenameValue(conv.title); }} className="btn-icon text-[7px] px-0.5 py-0" title="重命名">
                    <i className="fas fa-pen text-[7px]" />
                  </button>
                  <button onClick={e => { e.stopPropagation(); aiAssistant.deleteConversation(conv.id); }} className="btn-icon text-[7px] px-0.5 py-0 hover:text-red-400" title="删除">
                    <i className="fas fa-trash text-[7px]" />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
