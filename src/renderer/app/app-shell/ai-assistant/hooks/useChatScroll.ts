import { useState, useRef, useCallback, useEffect } from 'react';

export function useChatScroll(deps: unknown[]) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);

  const checkIsAtBottom = useCallback(() => {
    const el = chatContainerRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  }, []);

  useEffect(() => {
    if (isAtBottom) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, deps);

  const handleChatScroll = useCallback(() => {
    setIsAtBottom(checkIsAtBottom());
  }, [checkIsAtBottom]);

  return { messagesEndRef, chatContainerRef, isAtBottom, handleChatScroll };
}
