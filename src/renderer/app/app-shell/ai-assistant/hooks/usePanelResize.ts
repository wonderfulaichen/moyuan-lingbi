import { useState, useCallback } from 'react';

export function usePanelResize() {
  const [panelWidth, setPanelWidth] = useState(() => {
    try { return Number(localStorage.getItem('moyuan-ai-panel-width')) || 360; } catch { return 360; }
  });
  const [isExpanded, setIsExpanded] = useState(() => {
    try { return localStorage.getItem('moyuan-ai-panel-expanded') === 'true'; } catch { return false; }
  });
  const [isResizing, setIsResizing] = useState(false);

  const toggleExpanded = useCallback(() => {
    setIsExpanded(prev => {
      const next = !prev;
      try { localStorage.setItem('moyuan-ai-panel-expanded', String(next)); } catch {}
      return next;
    });
  }, []);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    const startX = e.clientX;
    const startWidth = panelWidth;
    const onMove = (ev: MouseEvent) => {
      const delta = startX - ev.clientX;
      const newW = Math.max(280, Math.min(900, startWidth + delta));
      setPanelWidth(newW);
    };
    const onUp = () => {
      setIsResizing(false);
      try { localStorage.setItem('moyuan-ai-panel-width', String(panelWidth)); } catch {}
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [panelWidth]);

  return { panelWidth, isExpanded, isResizing, toggleExpanded, handleResizeStart };
}
