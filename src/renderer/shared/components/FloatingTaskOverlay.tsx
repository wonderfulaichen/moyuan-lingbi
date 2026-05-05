import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAIStatus } from '../contexts/AIStatusContext';
import { aiService } from '../services/aiService';

/**
 * 悬浮任务小弹窗 —— 全局悬浮窗
 *
 * 交互方式：
 *   - 收缩状态：显示任务状态（图标 + 消息 + 时间）
 *   - 展开状态：主界面为聊天面板（类似 AI 网页端交互）
 *     - 顶部紧凑任务状态条（生成时显示进度）
 *     - 聊天对话界面（消息列表 + 输入框）
 *     - 新建话题 / 话题历史管理
 *   - 长按（>300ms）任意位置：进入拖拽模式
 */

// ---- 话题类型 ----
interface ChatTopic {
  id: string;
  title: string;
  messages: { role: 'user' | 'ai'; text: string }[];
  createdAt: number;
}

/** 生成空话题 */
function createTopic(title?: string): ChatTopic {
  return {
    id: `topic-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    title: title || `新话题 ${new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`,
    messages: [],
    createdAt: Date.now(),
  };
}

const FloatingTaskOverlay: React.FC = () => {
  const { status, resetStatus, setActiveTask, clearCompletedTasks } = useAIStatus();
  const {
    isGenerating, statusMessage, progress, tokenUsage, modelName, error,
    currentTask, tasks, activeTaskId,
  } = status;

  // ---- UI 状态 ----
  const [isMinimized, setIsMinimized] = useState(false);
  const [isHidden, setIsHidden] = useState(false);

  // ---- 拖拽状态 ----
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const panelRef = useRef<HTMLDivElement>(null);
  const initPosDone = useRef(false);

  // ---- 长按检测 ----
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLongPress = useRef(false);

  // ---- 计时器 ----
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const finishTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---- 聊天状态（话题系统）----
  const [topics, setTopics] = useState<ChatTopic[]>(() => [createTopic('默认对话')]);
  const [activeTopicId, setActiveTopicId] = useState<string>(topics[0]?.id || '');
  const [chatInput, setChatInput] = useState('');
  const [showTopicHistory, setShowTopicHistory] = useState(false);
  const [showTaskDetail, setShowTaskDetail] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const activeTopic = topics.find(t => t.id === activeTopicId) || topics[0];
  const chatMessages = activeTopic?.messages || [];

  // ---- 初始化位置（右下角）----
  useEffect(() => {
    if (!initPosDone.current) {
      setPosition({
        x: window.innerWidth - 400,
        y: window.innerHeight - 400,
      });
      initPosDone.current = true;
    }
  }, []);

  // ---- 生成期间的计时器 ----
  useEffect(() => {
    if (isGenerating) {
      setElapsed(0);
      timerRef.current = setInterval(() => {
        setElapsed(prev => prev + 1);
      }, 1000);
      setIsMinimized(false);
      setIsHidden(false);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isGenerating]);

  // ---- 完成时自动收缩（延迟）----
  useEffect(() => {
    if (!isGenerating && (statusMessage || progress > 0)) {
      if (finishTimerRef.current) clearTimeout(finishTimerRef.current);
      finishTimerRef.current = setTimeout(() => {
        setIsMinimized(true);
      }, 8000);
    }
    return () => {
      if (finishTimerRef.current) clearTimeout(finishTimerRef.current);
    };
  }, [isGenerating, statusMessage, progress]);

  // ---- 拖拽逻辑 ----
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      setPosition({
        x: Math.max(0, Math.min(window.innerWidth - 360, e.clientX - dragOffset.x)),
        y: Math.max(0, Math.min(window.innerHeight - 100, e.clientY - dragOffset.y)),
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragOffset]);

  // ---- 鼠标按下：启动长按检测 ----
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    if ((e.target as HTMLElement).closest('input')) return;
    if ((e.target as HTMLElement).closest('textarea')) return;

    isLongPress.current = false;
    longPressTimer.current = setTimeout(() => {
      isLongPress.current = true;
      setIsDragging(true);
      setDragOffset({
        x: e.clientX - position.x,
        y: e.clientY - position.y,
      });
    }, 300);
  }, [position]);

  // ---- 鼠标松开（仅最小化模式下点击展开）----
  const handleMouseUp = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    if (!isDragging && !isLongPress.current && isMinimized) {
      setIsMinimized(false);
    }
    setTimeout(() => { isLongPress.current = false; }, 0);
  }, [isDragging, isMinimized]);

  // ---- 中止生成 ----
  const handleAbort = useCallback((taskId?: string) => {
    aiService.abort(taskId);
    if (!taskId || taskId === activeTaskId) {
      setIsMinimized(true);
      setTimeout(() => resetStatus(), 100);
    }
  }, [resetStatus, activeTaskId]);

  // ---- 新建话题 ----
  const handleNewTopic = useCallback(() => {
    const newTopic = createTopic();
    setTopics(prev => [newTopic, ...prev]);
    setActiveTopicId(newTopic.id);
    setShowTopicHistory(false);
  }, []);

  // ---- 切换话题 ----
  const handleSwitchTopic = useCallback((topicId: string) => {
    setActiveTopicId(topicId);
    setShowTopicHistory(false);
  }, []);

  // ---- 删除话题 ----
  const handleDeleteTopic = useCallback((topicId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setTopics(prev => {
      const filtered = prev.filter(t => t.id !== topicId);
      if (filtered.length === 0) {
        const newTopic = createTopic('默认对话');
        setActiveTopicId(newTopic.id);
        return [newTopic];
      }
      if (activeTopicId === topicId) {
        setActiveTopicId(filtered[0].id);
      }
      return filtered;
    });
  }, [activeTopicId]);

  // ---- 发送聊天消息 ----
  const handleSendChat = useCallback(() => {
    if (!chatInput.trim()) return;
    const text = chatInput.trim();
    setChatInput('');

    // 添加用户消息
    setTopics(prev => prev.map(t =>
      t.id === activeTopicId
        ? { ...t, messages: [...t.messages, { role: 'user' as const, text }] }
        : t
    ));

    // 自动重命名话题（第一条消息后）
    setTopics(prev => prev.map(t => {
      if (t.id === activeTopicId && t.messages.length === 0 && t.title.startsWith('新话题')) {
        return { ...t, title: text.slice(0, 20) + (text.length > 20 ? '...' : '') };
      }
      return t;
    }));

    // 模拟 AI 响应（后续可对接真实 AI 服务）
    setTimeout(() => {
      setTopics(prev => prev.map(t =>
        t.id === activeTopicId
          ? { ...t, messages: [...t.messages, { role: 'ai' as const, text: `收到你的消息。"${text}"\n\n当前 AI 任务正在处理中，完成后可以查看结果。` }] }
          : t
      ));
    }, 500);
  }, [chatInput, activeTopicId]);

  // ---- 聊天自动滚动 ----
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages]);

  // ---- 格式化时间 ----
  const formatElapsed = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const formatTime = (ts: number): string => {
    const d = new Date(ts);
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  };

  const formatTopicTime = (ts: number): string => {
    const d = new Date(ts);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) return formatTime(ts);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };

  // ---- 任务图标 ----
  const getTaskIcon = (task?: string): string => {
    switch (task || currentTask) {
      case 'generateTags': return 'fa-tags';
      case 'generateSchemes':
      case 'regenerateSchemes': return 'fa-wand-magic-sparkles';
      default: return 'fa-brain';
    }
  };

  // ---- 决定是否可见 ----
  const show = isGenerating || !!statusMessage || progress > 0 || tasks.length > 0;

  // ==================== 右侧任务栏模式（悬浮窗隐藏时） ====================
  if (isHidden && show) {
    const runningCount = tasks.filter(t => t.status === 'running').length;
    return (
      <div className="fixed right-0 top-1/2 -translate-y-1/2 z-[9998]">
        <div
          className="flex flex-col items-center gap-1.5 py-3 px-1.5 rounded-l-xl shadow-2xl backdrop-blur-xl border border-r-0 cursor-pointer transition-all duration-300 hover:px-2.5"
          style={{
            backgroundColor: 'var(--color-surface-overlay)',
            borderColor: isGenerating
              ? 'var(--color-primary-200, rgba(168, 85, 247, 0.4))'
              : error
                ? 'rgba(248, 113, 113, 0.3)'
                : 'var(--color-border-default)',
          }}
          onClick={() => { setIsHidden(false); setIsMinimized(false); }}
          title="点击展开 AI 助手"
        >
          {/* AI 图标 */}
          <div className="relative w-7 h-7 flex items-center justify-center rounded-lg transition-colors"
            style={{ backgroundColor: isGenerating ? 'var(--color-primary-100)' : 'var(--color-surface-hover)' }}
          >
            {isGenerating ? (
              <>
                <i className={`fas ${getTaskIcon()} text-xs animate-spin`} style={{ color: 'var(--color-primary-300)' }} />
                <div className="absolute inset-0 rounded-lg animate-ping opacity-20" style={{ backgroundColor: 'var(--color-primary-300)' }} />
              </>
            ) : error ? (
              <i className="fas fa-exclamation-circle text-xs" style={{ color: 'var(--color-accent-rose, #f87171)' }} />
            ) : (
              <i className="fas fa-check-circle text-xs" style={{ color: 'var(--color-accent-emerald, #34d399)' }} />
            )}
          </div>

          {/* 垂直进度条 */}
          {isGenerating && (
            <div className="w-1.5 h-16 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--color-surface-hover)' }}>
              <div
                className="w-full rounded-full transition-all duration-500 ease-out"
                style={{
                  height: `${Math.max(progress, 5)}%`,
                  background: `linear-gradient(180deg, var(--color-primary-200, #a855f7), var(--color-primary-400, #7c3aed))`,
                  marginTop: 'auto',
                  position: 'relative',
                  top: `${100 - Math.max(progress, 5)}%`,
                }}
              />
            </div>
          )}

          {/* 任务数 */}
          {tasks.length > 0 && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full font-medium"
              style={{ backgroundColor: 'var(--color-primary-100)', color: 'var(--color-primary-300)' }}>
              {runningCount > 0 ? runningCount : tasks.length}
            </span>
          )}

          {/* Token 计数 */}
          {tokenUsage && (
            <span className="text-[8px] tabular-nums" style={{ color: 'var(--color-text-tertiary)' }}>
              {tokenUsage.total >= 1000 ? `${(tokenUsage.total / 1000).toFixed(1)}K` : tokenUsage.total}
            </span>
          )}

          {/* 展开箭头 */}
          <i className="fas fa-chevron-left text-[8px]" style={{ color: 'var(--color-text-tertiary)' }} />
        </div>
      </div>
    );
  }

  if (!show) return null;

  // ==================== 最小化模式（收缩态：显示任务状态） ====================
  if (isMinimized) {
    const runningCount = tasks.filter(t => t.status === 'running').length;
    return (
      <div
        ref={panelRef}
        className="fixed z-[9999] select-none"
        style={{ left: position.x, top: position.y }}
      >
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-xl shadow-2xl backdrop-blur-xl border transition-all duration-200 hover:scale-105 cursor-pointer"
          style={{
            backgroundColor: 'var(--color-surface-overlay)',
            borderColor: isGenerating
              ? 'var(--color-primary-200, rgba(168, 85, 247, 0.4))'
              : error
                ? 'rgba(248, 113, 113, 0.3)'
                : 'var(--color-border-default)',
          }}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
        >
          <div className="relative w-5 h-5 flex items-center justify-center">
            {isGenerating ? (
              <i
                className={`fas ${getTaskIcon()} text-xs animate-spin`}
                style={{ color: 'var(--color-primary-300)' }}
              />
            ) : error ? (
              <i className="fas fa-exclamation-circle text-xs" style={{ color: 'var(--color-accent-rose, #f87171)' }} />
            ) : (
              <i className="fas fa-check-circle text-xs" style={{ color: 'var(--color-accent-emerald, #34d399)' }} />
            )}
            {isGenerating && (
              <div
                className="absolute inset-0 rounded-full animate-ping opacity-30"
                style={{ backgroundColor: 'var(--color-primary-300)' }}
              />
            )}
          </div>

          <span
            className="text-xs font-medium truncate max-w-[120px]"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            {error || (isGenerating ? statusMessage : statusMessage || '生成完成')}
          </span>

          {isGenerating && (
            <span className="text-[10px] tabular-nums" style={{ color: 'var(--color-text-tertiary)' }}>
              {formatElapsed(elapsed)}
            </span>
          )}

          {progress > 0 && isGenerating && (
            <div className="w-12 h-1 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--color-surface-hover)' }}>
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${Math.max(progress, 5)}%`,
                  backgroundColor: 'var(--color-primary-300)',
                }}
              />
            </div>
          )}

          {tasks.length > 1 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: 'var(--color-primary-100)', color: 'var(--color-primary-300)' }}>
              {runningCount > 0 ? `${runningCount}个进行中` : `${tasks.length}个任务`}
            </span>
          )}

          {tokenUsage && !isGenerating && (
            <span className="text-[10px] tabular-nums" style={{ color: 'var(--color-text-tertiary)' }}>
              {tokenUsage.total.toLocaleString()} tokens
            </span>
          )}
        </div>
      </div>
    );
  }

  // ==================== 展开模式（主界面：聊天面板） ====================
  const activeTask = tasks.find(t => t.id === activeTaskId) || null;
  const runningTasks = tasks.filter(t => t.status === 'running');
  const completedTasks = tasks.filter(t => t.status !== 'running');

  return (
    <div
      ref={panelRef}
      className="fixed z-[9999] select-none"
      style={{ left: position.x, top: position.y }}
    >
      <div
        className="w-[360px] flex flex-col rounded-2xl shadow-2xl backdrop-blur-xl border overflow-hidden transition-all duration-300"
        style={{
          maxHeight: 'min(600px, calc(100vh - 40px))',
          backgroundColor: 'var(--color-surface-overlay)',
          borderColor: error
            ? 'rgba(248, 113, 113, 0.3)'
            : isGenerating
              ? 'var(--color-primary-200, rgba(168, 85, 247, 0.25))'
              : 'var(--color-border-default)',
        }}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
      >
        {/* ======== 标题栏 ======== */}
        <div
          className="flex items-center justify-between px-3 py-2 border-b shrink-0"
          style={{ borderColor: 'var(--color-border-default)' }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <div className="relative w-4 h-4 flex items-center justify-center shrink-0">
              {isGenerating ? (
                <i className={`fas ${getTaskIcon()} text-[10px] animate-spin`} style={{ color: 'var(--color-primary-300)' }} />
              ) : error ? (
                <i className="fas fa-exclamation-circle text-[10px]" style={{ color: 'var(--color-accent-rose, #f87171)' }} />
              ) : (
                <i className="fas fa-check-circle text-[10px]" style={{ color: 'var(--color-accent-emerald, #34d399)' }} />
              )}
            </div>
            <span className="text-[11px] font-semibold truncate" style={{ color: 'var(--color-text-primary)' }}>
              {isGenerating ? statusMessage : error || statusMessage || 'AI 助手'}
            </span>
            {isGenerating && (
              <span className="text-[9px] tabular-nums shrink-0" style={{ color: 'var(--color-text-tertiary)' }}>
                {formatElapsed(elapsed)}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {/* 新建话题 */}
            <button
              onClick={(e) => { e.stopPropagation(); handleNewTopic(); }}
              className="w-6 h-6 flex items-center justify-center rounded-md transition-colors"
              style={{ color: 'var(--color-text-tertiary)' }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--color-surface-hover)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
              title="新建话题"
            >
              <i className="fas fa-plus text-[10px]" />
            </button>
            {/* 话题历史 */}
            <button
              onClick={(e) => { e.stopPropagation(); setShowTopicHistory(!showTopicHistory); }}
              className="w-6 h-6 flex items-center justify-center rounded-md transition-colors relative"
              style={{ color: showTopicHistory ? 'var(--color-primary-300)' : 'var(--color-text-tertiary)' }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--color-surface-hover)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
              title="话题历史"
            >
              <i className="fas fa-history text-[10px]" />
              {topics.length > 1 && (
                <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full text-[6px] flex items-center justify-center"
                  style={{ backgroundColor: 'var(--color-primary-300)', color: 'var(--color-primary-50)' }}>
                  {topics.length}
                </span>
              )}
            </button>
            {/* 任务详情切换 */}
            <button
              onClick={(e) => { e.stopPropagation(); setShowTaskDetail(!showTaskDetail); }}
              className="w-6 h-6 flex items-center justify-center rounded-md transition-colors"
              style={{ color: showTaskDetail ? 'var(--color-primary-300)' : 'var(--color-text-tertiary)' }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--color-surface-hover)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
              title={showTaskDetail ? '隐藏任务详情' : '显示任务详情'}
            >
              <i className="fas fa-list-check text-[10px]" />
            </button>
            {/* 最小化 */}
            <button
              onClick={(e) => { e.stopPropagation(); setIsMinimized(true); }}
              className="w-5 h-5 flex items-center justify-center rounded-md transition-colors"
              style={{ color: 'var(--color-text-tertiary)' }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--color-surface-hover)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
              title="最小化"
            >
              <i className="fas fa-minus text-[7px]" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setIsHidden(true); }}
              className="w-5 h-5 flex items-center justify-center rounded-md transition-colors"
              style={{ color: 'var(--color-text-tertiary)' }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--color-surface-hover)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
              title="关闭（可在右侧任务栏重新打开）"
            >
              <i className="fas fa-times text-[7px]" />
            </button>
          </div>
        </div>

        {/* ======== 任务状态条（生成时显示紧凑进度） ======== */}
        {isGenerating && (
          <div
            className="px-3 py-1.5 border-b shrink-0"
            style={{ borderColor: 'var(--color-border-default)', backgroundColor: 'var(--color-primary-100, rgba(168,85,247,0.04))' }}
          >
            <div className="flex items-center gap-2 mb-1">
              <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--color-surface-hover)' }}>
                <div
                  className="h-full rounded-full transition-all duration-500 ease-out"
                  style={{
                    width: `${Math.max(progress, isGenerating ? 5 : 0)}%`,
                    background: `linear-gradient(90deg, var(--color-primary-200, #a855f7), var(--color-primary-400, #7c3aed))`,
                  }}
                />
              </div>
              <span className="text-[9px] tabular-nums shrink-0" style={{ color: 'var(--color-text-tertiary)' }}>
                {progress}%
              </span>
              {modelName && (
                <span className="text-[9px] truncate max-w-[80px] shrink-0" style={{ color: 'var(--color-text-tertiary)' }}>
                  {modelName}
                </span>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); handleAbort(activeTaskId || undefined); }}
                className="shrink-0 px-1.5 py-0.5 rounded text-[9px] transition-colors"
                style={{ backgroundColor: 'rgba(239,68,68,0.15)', color: '#f87171' }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(239,68,68,0.25)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(239,68,68,0.15)'; }}
              >
                <i className="fas fa-stop mr-0.5" />停止
              </button>
            </div>
            {/* Token 用量（紧凑） */}
            {tokenUsage && (
              <div className="flex items-center gap-2 text-[9px]" style={{ color: 'var(--color-text-tertiary)' }}>
                <i className="fas fa-file-lines text-[8px]" />
                <span>P:{tokenUsage.prompt.toLocaleString()}</span>
                <span className="opacity-30">|</span>
                <span>C:{tokenUsage.completion.toLocaleString()}</span>
                <span className="opacity-30">|</span>
                <span style={{ color: 'var(--color-primary-400)' }}>T:{tokenUsage.total.toLocaleString()}</span>
              </div>
            )}
          </div>
        )}

        {/* ======== 任务详情面板（点击任务详情按钮切换） ======== */}
        {showTaskDetail && (
          <div
            className="px-3 py-2 border-b shrink-0 max-h-[200px] overflow-y-auto"
            style={{ borderColor: 'var(--color-border-default)' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* 任务列表 */}
            {tasks.length > 0 && (
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-medium" style={{ color: 'var(--color-text-tertiary)' }}>任务列表</span>
                  {completedTasks.length > 2 && (
                    <button
                      onClick={(e) => { e.stopPropagation(); clearCompletedTasks(); }}
                      className="text-[9px] px-1.5 py-0.5 rounded transition-colors"
                      style={{ color: 'var(--color-text-tertiary)' }}
                    >
                      <i className="fas fa-trash-alt mr-0.5" />清除
                    </button>
                  )}
                </div>
                {tasks.slice(0, 15).map(task => (
                  <div
                    key={task.id}
                    className="flex items-center justify-between px-2 py-1 rounded-lg text-[10px] cursor-pointer transition-colors"
                    style={{
                      backgroundColor: task.id === activeTaskId ? 'var(--color-primary-100)' : 'var(--color-surface-hover)',
                    }}
                    onClick={(e) => { e.stopPropagation(); setActiveTask(task.id); }}
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <i className={`fas ${
                        task.status === 'running' ? 'fa-spinner fa-spin' :
                        task.status === 'complete' ? 'fa-check-circle' :
                        task.status === 'error' ? 'fa-exclamation-circle' : 'fa-stop-circle'
                      } text-[8px]`} style={{
                        color: task.status === 'running' ? 'var(--color-primary-300)' :
                               task.status === 'complete' ? '#34d399' :
                               task.status === 'error' ? '#f87171' : '#fbbf24',
                      }} />
                      <span className="truncate" style={{ color: 'var(--color-text-secondary)' }}>
                        {task.statusMessage}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {task.tokenUsage && (
                        <span className="text-[8px]" style={{ color: 'var(--color-text-tertiary)' }}>
                          {task.tokenUsage.total.toLocaleString()} tok
                        </span>
                      )}
                      {task.endTime && (
                        <span className="text-[8px]" style={{ color: 'var(--color-text-tertiary)' }}>
                          {formatTime(task.endTime)}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* 非生成时的状态信息 */}
            {!isGenerating && error && (
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] mt-1"
                style={{ backgroundColor: 'rgba(239,68,68,0.08)', color: '#f87171' }}>
                <i className="fas fa-exclamation-circle" />
                <span>{error}</span>
              </div>
            )}
            {!isGenerating && tokenUsage && (
              <div className="flex items-center gap-2 px-2 py-1 rounded-lg text-[10px] mt-1"
                style={{ backgroundColor: 'var(--color-surface-hover)', color: 'var(--color-text-tertiary)' }}>
                <i className="fas fa-file-lines text-[9px]" style={{ color: 'var(--color-primary-400)' }} />
                <span>Prompt: {tokenUsage.prompt.toLocaleString()}</span>
                <span className="opacity-30">|</span>
                <span>Completion: {tokenUsage.completion.toLocaleString()}</span>
                <span className="opacity-30">|</span>
                <span style={{ color: 'var(--color-primary-400)' }}>Total: {tokenUsage.total.toLocaleString()}</span>
              </div>
            )}
          </div>
        )}

        {/* ======== 话题历史面板 ======== */}
        {showTopicHistory && (
          <div
            className="border-b animate-fade-in"
            style={{ borderColor: 'var(--color-border-default)', maxHeight: '180px', overflowY: 'auto' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-3 py-1.5 flex items-center justify-between">
              <span className="text-[10px] font-medium" style={{ color: 'var(--color-text-tertiary)' }}>话题历史</span>
              <button
                onClick={(e) => { e.stopPropagation(); handleNewTopic(); }}
                className="text-[9px] px-2 py-0.5 rounded transition-colors flex items-center gap-1"
                style={{ color: 'var(--color-primary-300)', backgroundColor: 'var(--color-primary-100)' }}
              >
                <i className="fas fa-plus" />新话题
              </button>
            </div>
            <div className="space-y-0.5 px-2 pb-2">
              {topics.map(topic => (
                <div
                  key={topic.id}
                  className={`flex items-center justify-between px-2 py-1.5 rounded-lg cursor-pointer transition-all text-[10px] ${
                    topic.id === activeTopicId ? 'ring-1' : ''
                  }`}
                  style={{
                    backgroundColor: topic.id === activeTopicId ? 'var(--color-primary-100)' : 'var(--color-surface-hover)',
                    borderColor: topic.id === activeTopicId ? 'var(--color-primary-200)' : 'transparent',
                  }}
                  onClick={() => handleSwitchTopic(topic.id)}
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <i className="fas fa-comment text-[8px]" style={{ color: topic.id === activeTopicId ? 'var(--color-primary-300)' : 'var(--color-text-tertiary)' }} />
                    <span className="truncate" style={{ color: topic.id === activeTopicId ? 'var(--color-primary-300)' : 'var(--color-text-secondary)' }}>
                      {topic.title}
                    </span>
                    <span className="text-[8px] shrink-0" style={{ color: 'var(--color-text-tertiary)' }}>
                      {topic.messages.length}条
                    </span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-[8px]" style={{ color: 'var(--color-text-tertiary)' }}>
                      {formatTopicTime(topic.createdAt)}
                    </span>
                    <button
                      onClick={(e) => handleDeleteTopic(topic.id, e)}
                      className="w-4 h-4 flex items-center justify-center rounded hover:bg-red-600/20 transition-colors"
                      style={{ color: 'var(--color-text-tertiary)' }}
                    >
                      <i className="fas fa-times text-[7px]" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ======== 聊天消息主体区域 ======== */}
        <div
          className="flex-1 overflow-y-auto px-3 py-2 space-y-2 min-h-[120px]"
          style={{ backgroundColor: 'var(--color-surface-muted)' }}
          onClick={(e) => e.stopPropagation()}
        >
          {chatMessages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-8">
              <div
                className="w-10 h-10 rounded-2xl flex items-center justify-center mb-3"
                style={{ backgroundColor: 'var(--color-primary-100)' }}
              >
                <i className="fas fa-comment-dots" style={{ color: 'var(--color-primary-300)' }} />
              </div>
              <span className="text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>
                {isGenerating ? 'AI 正在生成中...' : '开始与 AI 对话吧'}
              </span>
              <span className="text-[9px] mt-1" style={{ color: 'var(--color-text-tertiary)' }}>
                {isGenerating ? '可在下方发送消息与 AI 讨论' : '发送消息或查看任务状态'}
              </span>
              {!isGenerating && tasks.length > 0 && (
                <button
                  onClick={(e) => { e.stopPropagation(); setShowTaskDetail(true); }}
                  className="mt-3 px-3 py-1.5 rounded-lg text-[10px] transition-all"
                  style={{
                    backgroundColor: 'var(--color-primary-100)',
                    color: 'var(--color-primary-300)',
                  }}
                >
                  <i className="fas fa-list-check mr-1" />查看任务详情
                </button>
              )}
            </div>
          ) : (
            chatMessages.map((msg, i) => (
              <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : ''}`}>
                {msg.role === 'ai' && (
                  <div
                    className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                    style={{ backgroundColor: 'var(--color-primary-100)' }}
                  >
                    <i className="fas fa-robot text-[9px]" style={{ color: 'var(--color-primary-300)' }} />
                  </div>
                )}
                <div
                  className={`px-2.5 py-1.5 rounded-xl text-[11px] max-w-[85%] leading-relaxed whitespace-pre-wrap ${
                    msg.role === 'user' ? '' : ''
                  }`}
                  style={{
                    backgroundColor: msg.role === 'user'
                      ? 'var(--color-primary-100)'
                      : 'var(--color-surface-hover)',
                    color: msg.role === 'user'
                      ? 'var(--color-primary-300)'
                      : 'var(--color-text-secondary)',
                    border: msg.role === 'ai' ? '1px solid var(--color-border-default)' : 'none',
                  }}
                >
                  {msg.text}
                </div>
                {msg.role === 'user' && (
                  <div
                    className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                    style={{ backgroundColor: 'var(--color-surface-hover)' }}
                  >
                    <i className="fas fa-user text-[9px]" style={{ color: 'var(--color-text-tertiary)' }} />
                  </div>
                )}
              </div>
            ))
          )}
          <div ref={chatEndRef} />
        </div>

        {/* ======== 输入区域 ======== */}
        <div
          className="shrink-0 px-3 py-2 border-t"
          style={{ borderColor: 'var(--color-border-default)' }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex gap-2 items-end">
            <div className="flex-1 relative">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendChat();
                  }
                }}
                placeholder="输入消息，Enter 发送..."
                className="w-full rounded-xl px-3 py-2 text-[11px] outline-none transition-all"
                style={{
                  backgroundColor: 'var(--color-surface-hover)',
                  color: 'var(--color-text-primary)',
                  border: '1px solid var(--color-border-default)',
                }}
              />
            </div>
            <button
              onClick={handleSendChat}
              disabled={!chatInput.trim()}
              className="px-3 py-2 rounded-xl disabled:opacity-40 transition-all text-[11px]"
              style={{
                backgroundColor: chatInput.trim() ? 'var(--color-primary-100)' : 'var(--color-surface-hover)',
                color: chatInput.trim() ? 'var(--color-primary-400)' : 'var(--color-text-tertiary)',
              }}
            >
              <i className="fas fa-paper-plane" />
            </button>
          </div>
          {/* 底部提示 */}
          <div className="flex items-center justify-between mt-1">
            <span className="text-[8px]" style={{ color: 'var(--color-text-tertiary)' }}>
              {activeTopic?.title && `当前: ${activeTopic.title}`}
              {activeTopic && ` · ${activeTopic.messages.length} 条消息`}
            </span>
            {isGenerating && (
              <button
                onClick={(e) => { e.stopPropagation(); handleAbort(activeTaskId || undefined); }}
                className="text-[8px] px-1.5 py-0.5 rounded transition-colors flex items-center gap-1"
                style={{ backgroundColor: 'rgba(239,68,68,0.12)', color: '#f87171' }}
              >
                <i className="fas fa-stop" />中止生成
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default FloatingTaskOverlay;
