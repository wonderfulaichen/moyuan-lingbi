import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

// 缩放级别：0.5 ~ 2.0，步进 0.05
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2.0;
const ZOOM_STEP = 0.05;
const ZOOM_STORAGE_KEY = 'moyuan-zoom';

// 预设缩放快捷值
export const ZOOM_PRESETS = [
  { value: 0.75, label: '75%' },
  { value: 0.85, label: '85%' },
  { value: 1.0, label: '100%' },
  { value: 1.15, label: '115%' },
  { value: 1.25, label: '125%' },
  { value: 1.5, label: '150%' },
  { value: 2.0, label: '200%' },
];

interface ZoomContextType {
  zoom: number;
  setZoom: (zoom: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  zoomReset: () => void;
  zoomPercent: number; // 0-100 整数百分比
}

const ZoomContext = createContext<ZoomContextType>({
  zoom: 1,
  setZoom: () => {},
  zoomIn: () => {},
  zoomOut: () => {},
  zoomReset: () => {},
  zoomPercent: 100,
});

export const useZoom = () => useContext(ZoomContext);

export const ZoomProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [zoom, setZoomState] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(ZOOM_STORAGE_KEY);
      if (saved !== null) {
        const parsed = parseFloat(saved);
        if (!isNaN(parsed) && parsed >= MIN_ZOOM && parsed <= MAX_ZOOM) {
          return parsed;
        }
      }
    } catch { /* ignore */ }
    return 1;
  });

  // 持久化 zoom 到 localStorage
  useEffect(() => {
    try {
      localStorage.setItem(ZOOM_STORAGE_KEY, String(zoom));
    } catch { /* ignore */ }
  }, [zoom]);

  // 应用缩放：设置 html font-size，让所有 rem 单位按比例缩放
  useEffect(() => {
    // 基准 16px × zoom → 新的根字体大小
    const baseFontSize = 16 * zoom;
    document.documentElement.style.fontSize = `${baseFontSize}px`;
  }, [zoom]);

  // Ctrl+滚轮缩放
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        e.stopPropagation();
        const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
        setZoomState(prev => {
          const next = Math.round((prev + delta) / ZOOM_STEP) * ZOOM_STEP;
          return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next));
        });
      }
    };
    window.addEventListener('wheel', handleWheel, { passive: false, capture: true });
    return () => window.removeEventListener('wheel', handleWheel, { capture: true });
  }, []);

  const setZoom = useCallback((value: number) => {
    setZoomState(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value)));
  }, []);

  const zoomIn = useCallback(() => {
    setZoomState(prev => Math.min(MAX_ZOOM, Math.round((prev + ZOOM_STEP) / ZOOM_STEP) * ZOOM_STEP));
  }, []);

  const zoomOut = useCallback(() => {
    setZoomState(prev => Math.max(MIN_ZOOM, Math.round((prev - ZOOM_STEP) / ZOOM_STEP) * ZOOM_STEP));
  }, []);

  const zoomReset = useCallback(() => {
    setZoomState(1);
  }, []);

  const zoomPercent = Math.round(zoom * 100);

  return (
    <ZoomContext.Provider value={{ zoom, setZoom, zoomIn, zoomOut, zoomReset, zoomPercent }}>
      {children}
    </ZoomContext.Provider>
  );
};

export default ZoomContext;
