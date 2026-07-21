import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AIAssistantState, AgentPhase } from '../../../shared/types/fileSystem';
import { ModelConfig } from '../../../shared/types';
import { getKnownModelSpec } from '../../../shared/constants';
import { aiAssistant } from '../../shared/services/AIAssistantService';
import { memoryMaintenanceAgent } from '../../shared/services/memory-bank/MemoryMaintenanceAgent';
import { dataService } from '../../shared/services/DataService';
import { useAIAssistantState, useChatInput, useChatScroll, useMessageActions, usePanelResize } from './ai-assistant/hooks';
import { ChatHistory, MessageBubble, PendingPromptRenderer, AgentMenu, TodoListDisplay, SlashCommandOverlay } from './ai-assistant/components';
import { useTheme } from '../../shared/contexts/ThemeContext';
import { useUIStore } from '../../shared/stores/uiStore';

interface AIAssistantPanelProps {
  activeModel: ModelConfig;
  models: ModelConfig[];
  activeModelId: string;
  onSelectModel: (id: string) => void;
  onOpenSettings: () => void;
}

type Tab = 'chat' | 'check';

function estimateTokens(text: string): number {
  if (!text) return 0;
  let count = 0;
  for (const ch of text) {
    if (/[\u4e00-\u9fff\u3400-\u4dbf]/.test(ch)) count += 2;
    else if (ch > ' ') count += 0.25;
  }
  return Math.ceil(count);
}

const AIAssistantPanel: React.FC<AIAssistantPanelProps> = ({ activeModel, models, activeModelId, onSelectModel, onOpenSettings }) => {
  const { themeInfo } = useTheme();
  const { animationLevel } = useUIStore();
  const hasAnimations = animationLevel !== 'none';
  
  const state = useAIAssistantState();
  // fallback：state.agents 可能因 React state 时序问题暂未加载，直接从 aiAssistant 获取最新值
  const agents = state.agents.length > 0 ? state.agents : aiAssistant.getState().agents;
  const { input, setInput, attachedFiles, inputRef, fileInputRef, handleSend, handleKeyDown, handleFileAttach, removeAttachedFile, clearAttachedFiles, slashCommand, handleSelectItem } = useChatInput(activeModel, onOpenSettings, agents);
  const { messagesEndRef, chatContainerRef, handleChatScroll } = useChatScroll([state.messages.length, state.pendingPrompt, state.streamingContent]);
  const { editingMsgId, editContent, setEditContent, collapsedIds, copyToast, handleCopy, handleEdit, handleEditCancel, handleEditSubmit, handleRegenerate, toggleCollapse, isLongContent } = useMessageActions(activeModel);
  const { panelWidth, isExpanded, toggleExpanded, handleResizeStart } = usePanelResize();

  const [tab, setTab] = useState<Tab>('chat');
  const [inputAnswer, setInputAnswer] = useState('');
  const [selectedChoices, setSelectedChoices] = useState<string[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showAgentMenu, setShowAgentMenu] = useState(false);
  const [showJumpMenu, setShowJumpMenu] = useState(false);
  const [isAutoChecking, setIsAutoChecking] = useState(false);
  const inputAnswerRef = useRef<HTMLInputElement>(null);
  const messageRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  useEffect(() => {
    if (state.pendingPrompt?.type === 'input') {
      setInputAnswer('');
      setTimeout(() => inputAnswerRef.current?.focus(), 100);
    }
    if (state.pendingPrompt?.type === 'choice') {
      setSelectedChoices([]);
    }
  }, [state.pendingPrompt]);

  const prevProcessingRef = useRef(state.isProcessing);
  useEffect(() => {
    if (prevProcessingRef.current && !state.isProcessing) {
      const project = dataService.getActiveProject();
      if (project?.id && activeModel?.modelName) {
        setIsAutoChecking(true);
        memoryMaintenanceAgent.checkConsistency(project.id, '', activeModel)
          .then(issues => {
            if (issues.length > 0) {
              const checkIssues = issues.map((desc, i) => ({
                id: `check-${Date.now()}-${i}`,
                description: desc,
                category: 'consistency' as const,
                selected: true,
                fixed: false,
              }));
              aiAssistant.setCheckIssues(checkIssues);
            }
          })
          .catch(() => {})
          .finally(() => setIsAutoChecking(false));
      }
    }
    prevProcessingRef.current = state.isProcessing;
  }, [state.isProcessing, activeModel]);

  const handleInputAnswerKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && inputAnswer.trim()) {
      aiAssistant.answerInput(inputAnswer.trim());
    }
  }, [inputAnswer]);

  const handleNewConversation = useCallback(() => {
    aiAssistant.newConversation();
  }, []);

  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;

  return (
    <div
      className={`flex shrink-0 animate-fade-in relative ${isExpanded && !isMobile ? 'fixed inset-4 z-[200] rounded-2xl shadow-2xl border' : isMobile ? '' : 'border-l'}`}
      style={{
        width: isMobile ? '100%' : (isExpanded ? 'calc(100% - 32px)' : (showHistory ? panelWidth + 160 : panelWidth)),
        height: isMobile ? '100%' : (isExpanded ? 'calc(100% - 32px)' : undefined),
        backgroundColor: isExpanded && !isMobile ? 'var(--color-surface-overlay)' : 'rgba(255, 255, 255, 0.02)',
        backdropFilter: 'blur(16px)',
        borderColor: 'var(--color-border-default)',
      }}
    >
      {isExpanded && !isMobile && (
        <button
          onClick={() => { toggleExpanded(); }}
          className="absolute top-3 right-3 z-50 w-7 h-7 rounded-full flex items-center justify-center border-none cursor-pointer transition-all"
          style={{ background: 'var(--color-surface-muted)', color: 'var(--color-text-muted)' }}
          title="关闭大窗口"
          aria-label="关闭大窗口"
        >
          <i className="fas fa-xmark text-xs" />
        </button>
      )}
      {!isExpanded && !isMobile && (
        <div
          onMouseDown={handleResizeStart}
          className="absolute left-0 top-0 bottom-0 w-[4px] z-10 cursor-col-resize transition-colors"
          style={{ left: 0, background: 'transparent' }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--color-primary-200)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          title="拖拽调整宽度"
        />
      )}

      {showHistory && (
        <ChatHistory
          conversations={state.conversations}
          activeConversationId={state.activeConversationId}
          onNewConversation={handleNewConversation}
        />
      )}

      <div className="flex flex-col flex-1 min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2.5 border-b shrink-0 relative" style={{ borderColor: 'var(--color-border-default)' }}>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowHistory(v => !v)} className="flex items-center gap-1 px-2 py-1 rounded-lg border-none cursor-pointer transition-all text-[10px] font-medium"
              style={{ background: showHistory ? 'var(--color-primary-100)' : 'var(--color-surface-muted)', color: showHistory ? 'var(--color-primary-400)' : 'var(--color-text-secondary)' }}
              title="对话历史">
              <i className={`fas ${showHistory ? 'fa-chevron-right' : 'fa-clock-rotate-left'}`} />
              {showHistory ? '' : '历史'}
            </button>
            <button onClick={toggleExpanded}
              className="flex items-center gap-1 px-2 py-1 rounded-lg border-none cursor-pointer transition-all text-[10px] font-medium"
              style={{ background: 'var(--color-surface-muted)', color: 'var(--color-text-secondary)' }}
              title={isExpanded ? '收缩窗口' : '展开大窗口'}
            >
              <i className={`fas ${isExpanded ? 'fa-compress' : 'fa-expand'}`} />
            </button>

            <AgentMenu
              agents={agents}
              activeAgentId={state.activeAgentId}
              showAgentMenu={showAgentMenu}
              setShowAgentMenu={setShowAgentMenu}
              activeModel={activeModel}
            />

            <span className="text-xs font-bold truncate max-w-[90px]" style={{ color: 'var(--color-text-primary)' }}>
              {state.conversations.find(c => c.id === state.activeConversationId)?.title || 'AI 创作助手'}
            </span>
            {state.isProcessing && (
              <span className="text-[9px] flex items-center gap-1" style={{ color: 'var(--color-primary-400)' }}>
                <i className={`fas ${state.agentState.phase === AgentPhase.SELF_CORRECTING ? 'fa-rotate' : state.agentState.phase === AgentPhase.VALIDATING ? 'fa-check-double' : state.agentState.phase === AgentPhase.EXECUTING ? 'fa-play' : 'fa-spinner fa-spin'} text-[8px]`} />
                {state.agentState.currentTask || '思考中'}
                {state.agentState.progress > 0 && (
                  <span className="inline-flex items-center gap-0.5">
                    <span className="inline-block w-8 h-1 rounded-full overflow-hidden" style={{ background: 'var(--color-surface-muted)' }}>
                      <span className="block h-full rounded-full transition-all duration-500" style={{ width: `${state.agentState.progress}%`, background: 'var(--color-primary-400)' }} />
                    </span>
                    <span className="text-[8px] opacity-60">{state.agentState.progress}%</span>
                  </span>
                )}
              </span>
            )}
            <div className="relative ml-auto">
              <button onClick={() => setShowJumpMenu(v => !v)}
                className="flex items-center gap-1 px-2 py-1 rounded-lg border-none cursor-pointer transition-all text-[10px] font-medium"
                style={{ background: showJumpMenu ? 'var(--color-primary-100)' : 'var(--color-surface-muted)', color: showJumpMenu ? 'var(--color-primary-400)' : 'var(--color-text-secondary)' }}
                title="跳转到对话"
              >
                <i className="fas fa-list-ul text-[9px]" />
              </button>
              {showJumpMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowJumpMenu(false)} />
                  <div className="absolute right-0 top-full mt-1 z-50 rounded-xl shadow-xl border overflow-hidden animate-fade-in" style={{
                    width: 240, maxHeight: 320, backgroundColor: 'var(--color-surface-base)', borderColor: 'var(--color-border-default)',
                  }}>
                    <div className="px-3 py-2 border-b" style={{ borderColor: 'var(--color-border-default)' }}>
                      <span className="text-[10px] font-semibold" style={{ color: 'var(--color-text-secondary)' }}>对话导航</span>
                    </div>
                    <div className="overflow-auto max-h-[280px] p-1.5 flex flex-col gap-0.5">
                      {state.messages.filter(m => m.role === 'user').map((msg, i) => (
                        <button key={msg.id}
                          onClick={() => {
                            const el = messageRefs.current.get(msg.id);
                            if (el) {
                              el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                              el.style.boxShadow = '0 0 0 3px var(--color-primary-400)';
                              setTimeout(() => { el.style.boxShadow = ''; }, 1500);
                            }
                            setShowJumpMenu(false);
                          }}
                          className="text-left px-2.5 py-2 rounded-lg transition-all border-none cursor-pointer w-full"
                          style={{ background: 'transparent', color: 'var(--color-text-primary)' }}
                          onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--color-surface-muted)'}
                          onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
                        >
                          <span className="text-[9px] font-semibold mr-1.5" style={{ color: 'var(--color-text-muted)' }}>#{i + 1}</span>
                          <span className="text-[10px] leading-snug" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{msg.content.slice(0, 80)}</span>
                        </button>
                      ))}
                      {state.messages.filter(m => m.role === 'user').length === 0 && (
                        <p className="text-[10px] text-center py-3" style={{ color: 'var(--color-text-muted)' }}>暂无对话</p>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 border-b shrink-0" style={{ borderColor: 'var(--color-border-default)', background: 'var(--color-surface-muted)' }}>
          {(['chat', 'check'] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 text-[11px] font-medium border-none cursor-pointer transition-all py-1.5 rounded-lg ${hasAnimations ? 'hover:scale-105' : ''}`}
              style={{
                background: tab === t ? themeInfo.gradient : 'transparent',
                color: tab === t ? '#fff' : 'var(--color-text-muted)',
                boxShadow: tab === t ? '0 2px 8px var(--color-primary-100)' : 'none',
              }}
            >
              <i className={`fas ${t === 'chat' ? 'fa-comments' : 'fa-check-double'} mr-1`} />
              {t === 'chat' ? '对话' : `系统粗查${state.checkIssues.length > 0 ? ` (${state.checkIssues.length})` : ''}`}
            </button>
          ))}
        </div>

        {tab === 'chat' ? (
          <>
            {/* Messages */}
            <div ref={chatContainerRef} onScroll={handleChatScroll} className="flex-1 overflow-auto p-3 flex flex-col gap-2.5">
              {state.messages.length === 0 && !state.pendingPrompt && (
                <div className="flex flex-col items-center justify-center h-full text-center px-4" style={{ color: 'var(--color-text-muted)' }}>
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4" style={{ background: themeInfo.gradient, boxShadow: '0 4px 12px var(--color-primary-100)' }}>
                    <i className="fas fa-wand-magic-sparkles text-xl text-white" />
                  </div>
                  <p className="text-sm font-semibold mb-1" style={{ color: 'var(--color-text-secondary)' }}>AI小说智能体</p>
                  <p className="text-[11px] leading-relaxed mb-4">我可以直接帮你操作项目文件</p>
                  <div className="flex flex-col gap-1.5 w-full max-w-[260px]">
                    {['帮我生成5个世界观设定文件', '为角色文件夹创建主角设定', '搜索所有包含魔法的文件', '帮我规划小说的世界观体系'].map(h => (
                      <button key={h} onClick={() => { setInput(h); inputRef.current?.focus(); }}
                        className={`glass-card-inset text-left text-[10px] px-3 py-2 rounded-lg cursor-pointer transition-all border-none ${hasAnimations ? 'hover:scale-102' : ''}`}
                        style={{ 
                          borderColor: 'transparent', 
                          color: 'var(--color-text-secondary)',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                        }}
                        onMouseEnter={e => {
                          e.currentTarget.style.borderColor = themeInfo.primaryColor + '40';
                          e.currentTarget.style.background = themeInfo.primaryColor + '10';
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.borderColor = 'transparent';
                          e.currentTarget.style.background = 'transparent';
                        }}
                      >
                        <i className="fas fa-arrow-right text-[8px] mr-1.5" style={{ color: themeInfo.primaryColor }} />{h}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {state.messages.map((msg, msgIdx) => (
                <MessageBubble
                  key={msg.id}
                  msg={msg}
                  msgIdx={msgIdx}
                  totalMsgIds={state.messages.map(m => m.id)}
                  isEditing={editingMsgId === msg.id}
                  editContent={editContent}
                  setEditContent={setEditContent}
                  onEditSubmit={handleEditSubmit}
                  isCollapsed={collapsedIds.has(msg.id) && isLongContent(msg.content)}
                  isLastAssistant={msg.role === 'assistant' && msgIdx === state.messages.map(m => m.id).lastIndexOf(msg.id)}
                  copyToast={copyToast}
                  onCopy={handleCopy}
                  onEdit={handleEdit}
                  onEditCancel={handleEditCancel}
                  onRegenerate={handleRegenerate}
                  onToggleCollapse={toggleCollapse}
                  isLongContent={isLongContent}
                  isProcessing={state.isProcessing}
                  messageRef={(el) => {
                    if (el) messageRefs.current.set(msg.id, el);
                    else messageRefs.current.delete(msg.id);
                  }}
                  todos={state.todoList}
                />
              ))}

              {(state.streamingContent !== null || state.streamingThinking !== null) && (
                <div className="flex gap-1.5 items-start">
                  <div className="w-6 h-6 rounded-lg shrink-0 flex items-center justify-center" style={{ background: 'var(--color-surface-muted)' }}>
                    <i className="fas fa-robot text-[9px]" style={{ color: 'var(--color-primary-400)' }} />
                  </div>
                  <div className="relative max-w-[85%]">
                    {state.streamingThinking !== null && (
                      <div className="mb-1.5">
                        <div className="flex items-center gap-1.5 px-2 py-1 rounded-t-lg text-[9px] border-b"
                          style={{
                            background: 'var(--color-p-alpha-10)',
                            color: 'var(--color-text-muted)',
                            borderColor: 'var(--color-p-alpha-15)',
                          }}>
                          <i className="fas fa-brain text-[8px]" style={{ color: 'var(--color-primary-400)' }} />
                          <span style={{ color: 'var(--color-text-secondary)' }}>思考过程</span>
                        </div>
                        <div className="rounded-b-lg px-2 py-1.5 text-[9px] leading-relaxed whitespace-pre-wrap break-words max-h-24 overflow-y-auto"
                          style={{ 
                            background: 'var(--color-p-alpha-06)', 
                            color: 'var(--color-text-tertiary)',
                            borderLeft: '2px solid var(--color-primary-400)',
                            borderRight: '1px solid var(--color-p-alpha-15)',
                            borderBottom: '1px solid var(--color-p-alpha-15)',
                            fontStyle: 'italic',
                          }}>
                          {state.streamingThinking}
                          <span className="inline-block w-1 h-3 ml-0.5 align-middle animate-pulse" style={{ background: 'var(--color-primary-400)', borderRadius: '1px' }} />
                        </div>
                      </div>
                    )}
                    {state.todoList.length > 0 && (
                      <TodoListDisplay todos={state.todoList} compact={true} />
                    )}
                    {state.streamingContent !== null && (
                      <div className="rounded-xl px-3 py-2 text-[11px] leading-relaxed whitespace-pre-wrap break-words"
                        style={{ color: 'var(--color-text-secondary)', backgroundColor: 'var(--color-surface-muted)', border: '1px solid var(--color-primary-200)' }}>
                        {state.streamingContent}
                        <span className="inline-block w-1.5 h-3.5 ml-0.5 align-middle" style={{ background: 'var(--color-primary-400)', animation: 'blink 1s step-end infinite', borderRadius: '1px' }} />
                      </div>
                    )}
                    {state.streamingContent === null && state.streamingThinking !== null && (
                      <div className="rounded-xl px-3 py-2 text-[10px]" style={{ color: 'var(--color-text-muted)', backgroundColor: 'var(--color-surface-muted)', border: '1px solid var(--color-border-default)' }}>
                        <i className="fas fa-pen text-[8px] mr-1 animate-pulse" />
                        正在生成回复中…
                      </div>
                    )}
                  </div>
                </div>
              )}

              {state.isProcessing && state.streamingContent === null && (
                <div className="flex gap-1.5 items-start">
                  <div className="w-6 h-6 rounded-lg shrink-0 flex items-center justify-center" style={{ background: 'var(--color-surface-muted)' }}>
                    <i className="fas fa-robot text-[9px]" style={{ color: 'var(--color-text-muted)' }} />
                  </div>
                  <div className="rounded-xl px-3 py-2 text-[11px] border" style={{ color: 'var(--color-text-muted)', backgroundColor: 'var(--color-surface-muted)', borderColor: 'var(--color-border-default)' }}>
                    <div className="flex items-center gap-1.5">
                      <i className={`fas ${state.agentState.phase === AgentPhase.SELF_CORRECTING ? 'fa-rotate fa-spin' : state.agentState.phase === AgentPhase.VALIDATING ? 'fa-check-double' : state.agentState.phase === AgentPhase.EXECUTING ? 'fa-play' : 'fa-spinner fa-spin'}`} />
                      <span>
                        {state.agentState.phase === AgentPhase.ANALYZING ? '分析需求中…' :
                         state.agentState.phase === AgentPhase.SELF_CORRECTING ? `格式纠正中（第${state.agentState.iteration}次）…` :
                         state.agentState.phase === AgentPhase.VALIDATING ? '校验输出格式…' :
                         state.agentState.phase === AgentPhase.EXECUTING ? '执行文件操作…' :
                         '思考中…'}
                      </span>
                    </div>
                    {state.agentState.progress > 0 && (
                      <div className="mt-1.5 flex items-center gap-1.5">
                        <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: 'var(--color-border-default)' }}>
                          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${state.agentState.progress}%`, background: 'var(--color-primary-400)' }} />
                        </div>
                        <span className="text-[9px] opacity-60">{state.agentState.progress}%</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {state.pendingPrompt && (
                <PendingPromptRenderer
                  prompt={state.pendingPrompt}
                  inputAnswer={inputAnswer}
                  setInputAnswer={setInputAnswer}
                  inputAnswerRef={inputAnswerRef}
                  handleInputAnswerKeyDown={handleInputAnswerKeyDown}
                  selectedChoices={selectedChoices}
                  setSelectedChoices={setSelectedChoices}
                />
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="p-2.5 border-t shrink-0" style={{ borderColor: 'var(--color-border-default)' }}>
              <div className="glass-card-inset p-1 rounded-xl relative">
                <SlashCommandOverlay
                  kind={slashCommand.overlayKind}
                  items={slashCommand.overlayItems}
                  selectedIndex={slashCommand.selectedIndex}
                  onHover={slashCommand.setSelectedIndex}
                  onSelect={handleSelectItem}
                />
                <div className="flex gap-1.5 items-end">
                  <input ref={fileInputRef} type="file" multiple accept=".txt,.md,.json,.csv,.xml,.html,.css,.js,.ts,.jsx,.tsx,.py,.java,.c,.cpp,.h,.hpp,.go,.rs,.rb,.php,.sql,.yaml,.yml,.toml,.ini,.log,.sh,.bat,.ps1"
                    onChange={handleFileAttach} className="hidden" />
                  <button onClick={() => fileInputRef.current?.click()}
                    className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-all hover:bg-white/10"
                    style={{ color: 'var(--color-text-muted)' }} title="导入文件（支持 txt/md/json/csv 等，单文件最大 5MB）" aria-label="导入文件">
                    <i className="fas fa-paperclip text-xs" />
                  </button>
                  <textarea ref={inputRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKeyDown}
                    placeholder="输入指令，AI直接操作文件…（输入 / 查看快捷指令）" rows={3}
                    className="flex-1 rounded-lg outline-none border-none resize-none px-2.5 py-2 text-xs min-h-[56px] max-h-[140px]"
                    style={{ color: 'var(--color-text-primary)', backgroundColor: 'transparent', fontFamily: 'inherit', lineHeight: 1.5 }} />
                  <button onClick={handleSend}
                    disabled={!input.trim() && attachedFiles.length === 0 || state.isProcessing}
                    className="btn-gradient rounded-lg text-xs font-semibold px-2.5 py-2 shrink-0"
                    style={{ opacity: (input.trim() || attachedFiles.length > 0) && !state.isProcessing ? 1 : 0.45 }}
                    aria-label="发送消息">
                    <i className="fas fa-paper-plane" />
                  </button>
                  {state.isProcessing && (
                    <button onClick={() => aiAssistant.abort()} className="btn-outline-danger text-[10px] rounded-lg px-2 py-2 shrink-0" aria-label="停止生成">
                      <i className="fas fa-stop" />
                    </button>
                  )}
                </div>
                {attachedFiles.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1 px-1">
                    {attachedFiles.map((f, idx) => (
                      <span key={idx} className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-lg"
                        style={{ background: 'var(--color-primary-100)', color: 'var(--color-primary-400)', border: '1px solid var(--color-primary-200)' }}>
                        <i className="fas fa-file-lines text-[8px]" />
                        <span className="max-w-[120px] truncate">{f.name}</span>
                        <span className="opacity-50">({(f.size / 1024).toFixed(1)}KB)</span>
                        <button onClick={() => removeAttachedFile(idx)} className="ml-0.5 hover:text-red-400 transition-colors" style={{ background: 'none', border: 'none', padding: 0 }}>
                          <i className="fas fa-times text-[8px]" />
                        </button>
                      </span>
                    ))}
                    <button onClick={clearAttachedFiles} className="text-[9px] px-1.5 py-0.5 rounded hover:bg-white/10 transition-colors" style={{ color: 'var(--color-text-muted)', background: 'none', border: 'none' }}>清空全部</button>
                  </div>
                )}
              </div>

              {/* 底部信息栏 */}
              <div className="flex items-center gap-2 px-2 py-0.5 border-t shrink-0 flex-wrap" style={{ borderColor: 'var(--color-border-default)', background: 'var(--color-surface-hover)' }}>
                <select
                  value={activeModelId}
                  onChange={(e) => onSelectModel(e.target.value)}
                  className="text-[8px] font-medium shrink-0 rounded px-1 py-0.5 bg-transparent border cursor-pointer hover:border-primary-300 max-w-[110px] truncate"
                  style={{ color: 'var(--color-text-secondary)', borderColor: 'var(--color-border-default)' }}
                  title="切换当前模型"
                >
                  {models.map(m => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
                {activeModel?.maxTokens && (
                  <span className="text-[8px] px-1 py-0.5 rounded shrink-0 tabular-nums" style={{ color: 'var(--color-text-muted)', background: 'var(--color-surface-base)', border: '1px solid var(--color-border-default)' }}>
                    输出上限 {activeModel.maxTokens >= 1000 ? `${(activeModel.maxTokens / 1000).toFixed(0)}K` : activeModel.maxTokens}
                  </span>
                )}
                {activeModel?.contextWindow ? (() => {
                  const spec = getKnownModelSpec(activeModel.modelName);
                  const fromTable = !!spec;
                  const maxCtx = spec?.contextWindow || activeModel.contextWindow;
                  const msgTokens = state.messages.reduce((sum, m) => sum + estimateTokens(m.content), 0);
                  const systemOverhead = Math.max(state.messages.length * 30, 200);
                  const used = msgTokens + systemOverhead;
                  const pct = Math.min(Math.round((used / maxCtx) * 100), 99);
                  const barColor = pct > 80 ? '#ef4444' : pct > 50 ? '#f59e0b' : 'var(--color-primary-400)';
                  const ctxLabel = maxCtx >= 1000000
                    ? `${(maxCtx / 1000000).toFixed(0)}M`
                    : maxCtx >= 1000
                      ? `${(maxCtx / 1000).toFixed(0)}K`
                      : `${maxCtx}`;
                  return (
                    <span className="text-[8px] px-1.5 py-0.5 rounded shrink-0 tabular-nums inline-flex items-center gap-1.5"
                      style={{
                        color: fromTable ? 'var(--color-accent-emerald)' : 'var(--color-text-muted)',
                        background: 'var(--color-surface-base)',
                        border: `1px solid ${fromTable ? 'var(--color-p-alpha-30)' : 'var(--color-border-default)'}`,
                        ...(fromTable ? { boxShadow: 'var(--shadow-glow-emerald)' } : {}),
                      }}
                      title={fromTable
                        ? `来自规格表: ${activeModel.modelName} = ${maxCtx.toLocaleString()} tokens`
                        : `使用保存值: ${activeModel.modelName} = ${maxCtx.toLocaleString()} tokens（规格表中无此模型）`}
                    >
                      <span>上下文 {ctxLabel}</span>
                      <span className="inline-flex items-center gap-1">
                        <span className="inline-block w-10 h-1 rounded-full overflow-hidden" style={{ background: 'var(--color-border-default)' }}>
                          <span className="block h-full rounded-full transition-all duration-300" style={{ width: `${pct}%`, background: barColor }} />
                        </span>
                        <span style={{ color: pct > 80 ? '#ef4444' : pct > 50 ? '#f59e0b' : 'var(--color-text-secondary)' }}>{pct}%</span>
                      </span>
                    </span>
                  );
                })() : null}
                {state.tokenUsage && state.tokenUsage.total > 0 ? (
                  <span className="text-[8px] tabular-nums shrink-0" style={{ color: 'var(--color-primary-300)' }}>
                    本次 {state.tokenUsage.total >= 1000 ? `${(state.tokenUsage.total / 1000).toFixed(1)}K` : state.tokenUsage.total} tokens（入{state.tokenUsage.prompt.toLocaleString()} / 出{state.tokenUsage.completion.toLocaleString()}）
                  </span>
                ) : (
                  <span className="text-[8px] shrink-0" style={{ color: 'var(--color-text-muted)', opacity: 0.5 }}>等待生成…</span>
                )}
                {isAutoChecking && (
                  <span className="text-[8px] px-1.5 py-0.5 rounded-full animate-pulse shrink-0"
                    style={{ background: 'var(--color-p-alpha-15)', color: 'var(--color-accent-blue)', border: '1px solid var(--color-p-alpha-20)' }}>
                    <i className="fas fa-spinner fa-spin mr-0.5" />粗查中
                  </span>
                )}
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="flex-1 overflow-auto p-2.5">
              {(() => {
                const total = state.checkIssues.length;
                const fixed = state.checkIssues.filter(i => i.fixed).length;
                const pending = total - fixed;
                const selected = state.checkIssues.filter(i => i.selected && !i.fixed).length;
                const charIssues = state.checkIssues.filter(i => i.category === 'character' && !i.fixed).length;
                const plotIssues = state.checkIssues.filter(i => i.category === 'plot' && !i.fixed).length;
                const worldIssues = state.checkIssues.filter(i => i.category === 'world' && !i.fixed).length;
                const consistencyIssues = state.checkIssues.filter(i => i.category === 'consistency' && !i.fixed).length;

                return (
                  <>
                    <div className="mb-3 p-3 rounded-xl" style={{
                      background: 'linear-gradient(135deg, var(--color-p-alpha-08), var(--color-p-alpha-06))',
                      border: '1px solid var(--color-p-alpha-15)',
                    }}>
                      <div className="flex items-center gap-2 mb-2">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${isAutoChecking ? 'animate-pulse' : ''}`}
                          style={{ background: total > 0 ? (pending > 0 ? 'rgba(251,191,36,0.15)' : 'rgba(52,211,153,0.15)') : 'rgba(99,102,241,0.12)' }}>
                          <i className={`fas ${isAutoChecking ? 'fa-spinner fa-spin' : total === 0 ? 'fa-shield-check' : pending > 0 ? 'fa-exclamation-triangle' : 'fa-check-circle'} text-sm`}
                            style={{ color: total === 0 ? '#6366f1' : pending > 0 ? '#fbbf24' : '#34d399' }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-bold" style={{ color: 'var(--color-text-primary)' }}>
                            {isAutoChecking ? '正在系统粗查…' : total === 0 ? '系统粗查就绪' : pending > 0 ? `发现 ${pending} 个待处理问题` : '全部问题已处理'}
                          </p>
                          <p className="text-[9px]" style={{ color: 'var(--color-text-muted)' }}>
                            {total === 0 && !isAutoChecking
                              ? 'AI 完成任务后会自动粗查，也可手动触发'
                              : `共 ${total} 个 · 已修复 ${fixed}${selected > 0 ? ` · 已选 ${selected}` : ''}`}
                          </p>
                        </div>
                        <button
                          onClick={async () => {
                            const project = dataService.getActiveProject();
                            if (!project?.id || !activeModel?.modelName) {
                              console.warn('[AI粗查] 无法开始检查: project.id=', project?.id, 'activeModel.modelName=', activeModel?.modelName);
                              return;
                            }
                            setIsAutoChecking(true);
                            try {
                              const issues = await memoryMaintenanceAgent.checkConsistency(project.id, '', activeModel);
                              if (issues.length > 0) {
                                const checkIssues = issues.map((desc, i) => ({
                                  id: `check-${Date.now()}-${i}`,
                                  description: desc,
                                  category: 'consistency' as const,
                                  selected: true,
                                  fixed: false,
                                }));
                                aiAssistant.setCheckIssues(checkIssues);
                              }
                            } catch (e) {
                              console.error('[AI粗查] 检查失败:', e);
                            } finally { setIsAutoChecking(false); }
                          }}
                          disabled={isAutoChecking || !activeModel?.modelName}
                          className="px-2 py-1 rounded-lg text-[9px] font-medium border-none cursor-pointer transition-all"
                          style={{ background: isAutoChecking ? 'transparent' : 'var(--color-primary-100)', color: 'var(--color-primary-400)' }}
                        >
                          <i className={`fas ${isAutoChecking ? 'fa-spinner fa-spin' : total > 0 ? 'fa-redo' : 'fa-play'} mr-0.5`} />
                          {isAutoChecking ? '检查中…' : total > 0 ? '重新检查' : '开始检查'}
                        </button>
                      </div>
                      {total > 0 && (
                        <div className="grid grid-cols-4 gap-1.5 mt-2 pt-2" style={{ borderTop: '1px solid var(--color-p-alpha-15)' }}>
                          {[
                            { icon: 'fa-user', label: '角色', value: charIssues, color: 'var(--color-primary-300)', bg: 'var(--color-p-alpha-12)' },
                            { icon: 'fa-route', label: '剧情', value: plotIssues, color: 'var(--color-accent-blue)', bg: 'var(--color-p-alpha-12)' },
                            { icon: 'fa-globe', label: '世界观', value: worldIssues, color: 'var(--color-accent-emerald)', bg: 'var(--color-p-alpha-12)' },
                            { icon: 'fa-equals', label: '一致性', value: consistencyIssues, color: 'var(--color-accent-amber)', bg: 'rgba(251,191,36,0.10)' },
                          ].map(item => (
                            <div key={item.label} className="text-center py-1.5 rounded-lg" style={{ background: item.bg }}>
                              <p className="text-base font-black tabular-nums leading-none" style={{ color: item.color }}>{item.value}</p>
                              <p className="text-[8px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{item.label}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                );
              })()}
              {state.checkIssues.length > 0 && (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
                      <i className="fas fa-exclamation-triangle mr-1" style={{ color: 'var(--color-warning-400)' }} />
                      发现 {state.checkIssues.length} 个潜在问题
                    </span>
                    <button
                      onClick={() => {
                        const allSelected = state.checkIssues.every(i => i.selected);
                        state.checkIssues.forEach(i => aiAssistant.toggleCheckIssue(i.id));
                        if (allSelected) {
                          state.checkIssues.forEach(i => { if (i.selected) aiAssistant.toggleCheckIssue(i.id); });
                        } else {
                          state.checkIssues.forEach(i => { if (!i.selected) aiAssistant.toggleCheckIssue(i.id); });
                        }
                      }}
                      className="text-[9px] px-2 py-0.5 rounded border-none cursor-pointer transition-all"
                      style={{ background: 'transparent', color: 'var(--color-text-muted)', border: '1px solid var(--color-border-default)' }}
                    >
                      {state.checkIssues.every(i => i.selected) ? '取消全选' : '全选'}
                    </button>
                  </div>
                  {state.checkIssues.map(issue => (
                    <div
                      key={issue.id}
                      className={`glass-card-inset p-2.5 rounded-lg transition-all ${issue.fixed ? 'opacity-50' : ''}`}
                      style={issue.fixed ? { borderLeft: '3px solid var(--color-emerald-400)' } : {}}
                    >
                      <div className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          checked={issue.selected}
                          disabled={issue.fixed}
                          onChange={() => aiAssistant.toggleCheckIssue(issue.id)}
                          className="mt-0.5 shrink-0"
                          style={{ accentColor: 'var(--color-primary-400)' }}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] leading-relaxed" style={{
                            color: issue.fixed ? 'var(--color-text-muted)' : 'var(--color-text-primary)',
                            textDecoration: issue.fixed ? 'line-through' : 'none',
                          }}>
                            {issue.description}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[8px] px-1.5 py-0.5 rounded-full" style={{
                              background: issue.category === 'character' ? 'rgba(168,85,247,0.12)' :
                                issue.category === 'plot' ? 'rgba(59,130,246,0.12)' :
                                issue.category === 'world' ? 'rgba(34,197,94,0.12)' :
                                'rgba(251,191,36,0.12)',
                              color: issue.category === 'character' ? '#a855f7' :
                                issue.category === 'plot' ? '#3b82f6' :
                                issue.category === 'world' ? '#22c55e' : '#fbbf24',
                            }}>
                              {issue.category === 'character' ? '角色' :
                               issue.category === 'plot' ? '剧情' :
                               issue.category === 'world' ? '世界观' : '一致性'}
                            </span>
                            {issue.fixed && (
                              <span className="text-[8px] flex items-center gap-0.5" style={{ color: 'var(--color-emerald-400)' }}>
                                <i className="fas fa-check" />已修复
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="p-2 border-t shrink-0 flex gap-2" style={{ borderColor: 'var(--color-border-default)' }}>
              <button
                onClick={async () => {
                  const selectedIssues = state.checkIssues.filter(i => i.selected && !i.fixed);
                  if (selectedIssues.length === 0 || !activeModel?.modelName) return;
                  const project = dataService.getActiveProject();
                  if (!project?.id) return;
                  setIsAutoChecking(true);
                  try {
                    const issueList = selectedIssues.map((i, idx) => `${idx + 1}. ${i.description}`).join('\n');
                    const context = dataService.buildAIContext(8000);
                    const fixPrompt = `以下是系统粗查发现的问题，请逐一修复：

${issueList}

已有设定内容供参考：
${context || '（暂无）'}

请针对每个问题，给出具体的修复建议或直接修改相关文件内容。使用 tool 格式操作文件。`;

                    aiAssistant.sendCommand(fixPrompt, activeModel, { silent: true, label: '修复选中的一致性问题' });
                    selectedIssues.forEach(i => aiAssistant.markIssueFixed(i.id));
                  } catch {} finally { setIsAutoChecking(false); }
                }}
                disabled={state.checkIssues.filter(i => i.selected && !i.fixed).length === 0 || isAutoChecking || !activeModel?.modelName}
                className="flex-1 px-3 py-1.5 rounded-lg text-[10px] font-medium transition-all border-none cursor-pointer disabled:opacity-40"
                style={{ background: 'var(--color-primary-400)', color: 'white' }}
              >
                <i className="fas fa-wrench mr-1" />
                修复选中 ({state.checkIssues.filter(i => i.selected && !i.fixed).length})
              </button>
              <button
                onClick={() => aiAssistant.clearCheckIssues()}
                className="px-3 py-1.5 rounded-lg text-[10px] font-medium transition-all border-none cursor-pointer"
                style={{ background: 'var(--color-surface-muted)', color: 'var(--color-text-muted)' }}
              >
                <i className="fas fa-trash mr-1" />清空
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default AIAssistantPanel;
