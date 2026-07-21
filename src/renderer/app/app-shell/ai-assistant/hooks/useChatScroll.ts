import { useState, useRef, useCallback, useEffect } from 'react';

export function useChatScroll(deps: unknown[]) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  // RAF 节流：scroll 事件高频触发，用 RAF 合并到每帧一次
  const rafIdRef = useRef<number | null>(null);

  const checkIsAtBottom = useCallback(() => {
    const el = chatContainerRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  }, []);

  useEffect(() => {
    if (isAtBottom) {
      // 流式输出高频更新时用瞬时滚动，避免 smooth 动画堆积导致卡顿
      messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
    }
  }, deps);

  const handleChatScroll = useCallback(() => {
    if (rafIdRef.current !== null) return;
    rafIdRef.current = requestAnimationFrame(() => {
      rafIdRef.current = null;
      // 只在值变化时更新 state，避免冗余 re-render
      const next = checkIsAtBottom();
      setIsAtBottom(prev => prev === next ? prev : next);
    });
  }, [checkIsAtBottom]);

  // 清理 pending RAF
  useEffect(() => {
    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, []);

  return { messagesEndRef, chatContainerRef, isAtBottom, handleChatScroll };
}
