import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useUIStore } from '../stores/uiStore';

export type ThemeId = 'purple' | 'blue' | 'emerald' | 'amber' | 'rose' | 'gray' | 'brown' | 'paper' | 'cinnabar' | 'indigo' | 'teal' | 'bamboo';
export type ThemeMode = 'dark' | 'light';

export interface ThemeInfo {
  id: ThemeId;
  label: string;
  icon: string;
  gradient: string;
  color: string;
  description: string;
  primaryColor: string;
  secondaryColor: string;
}

export const THEME_LIST: ThemeInfo[] = [
  /* 按色轮顺序: 红 → 橙 → 黄 → 绿 → 青 → 蓝 → 紫 → 粉 → 灰 */
  { id: 'cinnabar', label: '朱砂红', icon: 'fa-dragon', gradient: 'from-red-500/40 to-red-700/30', color: 'text-red-400', description: '端庄华贵的中国红', primaryColor: '#e74c3c', secondaryColor: '#c0392b' },
  { id: 'rose', label: '丹霞绯', icon: 'fa-heart', gradient: 'from-rose-500/40 to-pink-600/30', color: 'text-rose-400', description: '浪漫热情的玫瑰绯红', primaryColor: '#e91e63', secondaryColor: '#c2185b' },
  { id: 'amber', label: '琥珀橙', icon: 'fa-sun', gradient: 'from-orange-500/40 to-amber-600/30', color: 'text-orange-400', description: '温暖如曦的琥珀橙', primaryColor: '#e67e22', secondaryColor: '#d35400' },
  { id: 'paper', label: '银杏黄', icon: 'fa-scroll', gradient: 'from-yellow-500/40 to-amber-500/30', color: 'text-yellow-400', description: '古典雅致的银杏黄', primaryColor: '#f1c40f', secondaryColor: '#d4ac0d' },
  { id: 'bamboo', label: '竹青', icon: 'fa-leaf', gradient: 'from-lime-500/40 to-green-600/30', color: 'text-lime-400', description: '清雅自然的竹林青', primaryColor: '#7cb342', secondaryColor: '#558b2f' },
  { id: 'emerald', label: '翡翠绿', icon: 'fa-gem', gradient: 'from-emerald-500/40 to-teal-600/30', color: 'text-emerald-400', description: '清雅自然的翡翠绿', primaryColor: '#27ae60', secondaryColor: '#1e8449' },
  { id: 'teal', label: '青瓷', icon: 'fa-droplet', gradient: 'from-teal-500/40 to-cyan-600/30', color: 'text-teal-400', description: '沉静内敛的青瓷色', primaryColor: '#16a085', secondaryColor: '#117a65' },
  { id: 'blue', label: '星河蓝', icon: 'fa-water', gradient: 'from-blue-500/40 to-cyan-600/30', color: 'text-blue-400', description: '如星河般清澈的蓝', primaryColor: '#3498db', secondaryColor: '#2980b9' },
  { id: 'indigo', label: '黛蓝', icon: 'fa-feather', gradient: 'from-indigo-500/40 to-blue-700/30', color: 'text-indigo-400', description: '典雅沉静的靛蓝', primaryColor: '#5d6d7e', secondaryColor: '#34495e' },
  { id: 'purple', label: '墨渊紫', icon: 'fa-moon', gradient: 'from-purple-500/40 to-violet-700/30', color: 'text-purple-400', description: '深邃优雅的紫韵', primaryColor: '#9b59b6', secondaryColor: '#7d3c98' },
  { id: 'brown', label: '檀木褐', icon: 'fa-tree', gradient: 'from-stone-600/40 to-amber-800/30', color: 'text-stone-400', description: '暖意木质的大地褐', primaryColor: '#8d6e63', secondaryColor: '#6d4c41' },
  { id: 'gray', label: '霜白灰', icon: 'fa-snowflake', gradient: 'from-slate-400/40 to-gray-600/30', color: 'text-slate-300', description: '素雅极简的冷淡灰', primaryColor: '#95a5a6', secondaryColor: '#7f8c8d' },
];

const THEME_STORAGE_KEY = 'moyuan-theme';
const MODE_STORAGE_KEY = 'moyuan-theme-mode';

// 辅助函数：解析时间字符串 "HH:MM" 为小时和分钟
const parseTime = (timeStr: string): { hours: number; minutes: number } => {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return { hours, minutes };
};

// 辅助函数：判断当前是否是白天时间
const isDayTime = (dayStart: string, nightStart: string): boolean => {
  const now = new Date();
  const currentHours = now.getHours();
  const currentMinutes = now.getMinutes();
  const { hours: dayHours, minutes: dayMinutes } = parseTime(dayStart);
  const { hours: nightHours, minutes: nightMinutes } = parseTime(nightStart);
  
  const currentTotal = currentHours * 60 + currentMinutes;
  const dayTotal = dayHours * 60 + dayMinutes;
  const nightTotal = nightHours * 60 + nightMinutes;
  
  if (dayTotal < nightTotal) {
    return currentTotal >= dayTotal && currentTotal < nightTotal;
  } else {
    return currentTotal >= dayTotal || currentTotal < nightTotal;
  }
};

interface ThemeContextType {
  theme: ThemeId;
  setTheme: (theme: ThemeId) => void;
  themeInfo: ThemeInfo;
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  toggleMode: () => void;
  isAutoMode: boolean;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'purple',
  setTheme: () => {},
  themeInfo: THEME_LIST[0],
  mode: 'light',
  setMode: () => {},
  toggleMode: () => {},
  isAutoMode: false,
});

export const useTheme = () => useContext(ThemeContext);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { autoThemeMode, dayTimeStart, nightTimeStart, setAutoThemeMode } = useUIStore();
  
  const [theme, setThemeState] = useState<ThemeId>(() => {
    try {
      const saved = localStorage.getItem(THEME_STORAGE_KEY);
      if (saved && THEME_LIST.some(t => t.id === saved)) {
        return saved as ThemeId;
      }
    } catch { /* ignore */ }
    return 'gray'; // 默认霜白灰主题
  });

  const [mode, setModeState] = useState<ThemeMode>(() => {
    try {
      const saved = localStorage.getItem(MODE_STORAGE_KEY);
      if (saved === 'light' || saved === 'dark') {
        return saved;
      }
    } catch { /* ignore */ }
    return 'dark'; // 默认夜晚模式
  });

  const [isAutoMode, setIsAutoMode] = useState(autoThemeMode !== 'off');

  const setTheme = useCallback((newTheme: ThemeId) => {
    setThemeState(newTheme);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, newTheme);
    } catch { /* ignore */ }
  }, []);

  const setMode = useCallback((newMode: ThemeMode) => {
    setModeState(newMode);
    try {
      localStorage.setItem(MODE_STORAGE_KEY, newMode);
    } catch { /* ignore */ }
    // 如果用户手动切换了模式，关闭自动模式
    if (autoThemeMode !== 'off') {
      setAutoThemeMode('off');
    }
  }, [autoThemeMode, setAutoThemeMode]);

  const toggleMode = useCallback(() => {
    setModeState(prev => prev === 'dark' ? 'light' : 'dark');
    // 如果用户手动切换了模式，关闭自动模式
    if (autoThemeMode !== 'off') {
      setAutoThemeMode('off');
    }
  }, [autoThemeMode, setAutoThemeMode]);

  // 自动主题切换逻辑
  useEffect(() => {
    if (autoThemeMode === 'off') {
      setIsAutoMode(false);
      return;
    }

    setIsAutoMode(true);

    const checkAndUpdateMode = () => {
      let newMode: ThemeMode;
      
      if (autoThemeMode === 'system') {
        // 跟随系统主题
        if (typeof window !== 'undefined' && window.matchMedia) {
          newMode = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        } else {
          newMode = isDayTime(dayTimeStart, nightTimeStart) ? 'light' : 'dark';
        }
      } else {
        // 按时间切换
        newMode = isDayTime(dayTimeStart, nightTimeStart) ? 'light' : 'dark';
      }
      
      setModeState(newMode);
      try {
        localStorage.setItem(MODE_STORAGE_KEY, newMode);
      } catch { /* ignore */ }
    };

    // 初始检查
    checkAndUpdateMode();

    // 定时检查（每分钟）
    const intervalId = setInterval(checkAndUpdateMode, 60000);

    // 监听系统主题变化（仅在 system 模式下）
    let mediaQueryList: MediaQueryList | undefined;
    if (autoThemeMode === 'system' && typeof window !== 'undefined' && window.matchMedia) {
      mediaQueryList = window.matchMedia('(prefers-color-scheme: dark)');
      const handleSystemThemeChange = () => {
        checkAndUpdateMode();
      };
      mediaQueryList.addEventListener('change', handleSystemThemeChange);
      
      return () => {
        clearInterval(intervalId);
        mediaQueryList?.removeEventListener('change', handleSystemThemeChange);
      };
    }

    return () => {
      clearInterval(intervalId);
    };
  }, [autoThemeMode, dayTimeStart, nightTimeStart]);

  // 同步 data-theme 和 data-theme-mode 到 document.documentElement
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme-mode', mode);
  }, [mode]);

  const themeInfo = THEME_LIST.find(t => t.id === theme) || THEME_LIST[0];

  return (
    <ThemeContext.Provider value={{ theme, setTheme, themeInfo, mode, setMode, toggleMode, isAutoMode }}>
      {children}
    </ThemeContext.Provider>
  );
};

export default ThemeContext;
