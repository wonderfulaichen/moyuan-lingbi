import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

export type ThemeId = 'purple' | 'blue' | 'emerald' | 'amber' | 'rose' | 'gray' | 'brown' | 'jade' | 'paper' | 'bamboo' | 'cinnabar' | 'indigo';
export type ThemeMode = 'dark' | 'light';

export interface ThemeInfo {
  id: ThemeId;
  label: string;
  icon: string;
  gradient: string;
  color: string;
  description: string;
}

export const THEME_LIST: ThemeInfo[] = [
  // 按颜色光谱排列：红→粉→橙→黄→棕→绿→青→蓝→靛→紫→灰
  { id: 'cinnabar', label: '朱砂红', icon: 'fa-dragon', gradient: 'from-red-700/30 to-amber-700/20', color: 'text-red-400', description: '端庄华贵的中国传统风' },
  { id: 'rose', label: '丹霞绯', icon: 'fa-heart', gradient: 'from-rose-600/30 to-pink-600/20', color: 'text-rose-400', description: '浪漫热情的玫瑰绯红' },
  { id: 'amber', label: '暖阳金', icon: 'fa-sun', gradient: 'from-amber-600/30 to-orange-600/20', color: 'text-amber-400', description: '温暖如曦的琥珀金辉' },
  { id: 'paper', label: '宣纸白', icon: 'fa-scroll', gradient: 'from-amber-100/30 to-yellow-100/20', color: 'text-amber-700', description: '古典雅致的宣纸书卷风' },
  { id: 'brown', label: '檀木褐', icon: 'fa-tree', gradient: 'from-amber-800/30 to-yellow-900/20', color: 'text-amber-600', description: '暖意木质的大地色系' },
  { id: 'emerald', label: '灵韵翠', icon: 'fa-leaf', gradient: 'from-emerald-600/30 to-green-600/20', color: 'text-emerald-400', description: '生机盎然的青翠色调' },
  { id: 'bamboo', label: '竹青', icon: 'fa-seedling', gradient: 'from-green-600/30 to-teal-600/20', color: 'text-green-400', description: '清雅自然的竹林意境' },
  { id: 'jade', label: '墨玉黑', icon: 'fa-moon', gradient: 'from-gray-800/40 to-emerald-900/30', color: 'text-emerald-300', description: '沉稳内敛的墨玉文学风' },
  { id: 'blue', label: '星河蓝', icon: 'fa-water', gradient: 'from-blue-600/30 to-cyan-600/20', color: 'text-blue-400', description: '如星河般清澈的蓝色系' },
  { id: 'indigo', label: '黛蓝', icon: 'fa-feather', gradient: 'from-indigo-700/30 to-violet-800/20', color: 'text-indigo-400', description: '典雅沉静的靛蓝风韵' },
  { id: 'purple', label: '墨渊紫', icon: 'fa-gem', gradient: 'from-purple-600/30 to-violet-600/20', color: 'text-purple-400', description: '深邃优雅的紫韵主调' },
  { id: 'gray', label: '霜白灰', icon: 'fa-snowflake', gradient: 'from-slate-500/30 to-gray-600/20', color: 'text-slate-300', description: '素雅极简的冷淡灰调' },
];

const THEME_STORAGE_KEY = 'moyuan-theme';
const MODE_STORAGE_KEY = 'moyuan-theme-mode';

interface ThemeContextType {
  theme: ThemeId;
  setTheme: (theme: ThemeId) => void;
  themeInfo: ThemeInfo;
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  toggleMode: () => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'purple',
  setTheme: () => {},
  themeInfo: THEME_LIST[0],
  mode: 'light',
  setMode: () => {},
  toggleMode: () => {},
});

export const useTheme = () => useContext(ThemeContext);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<ThemeId>(() => {
    try {
      const saved = localStorage.getItem(THEME_STORAGE_KEY);
      if (saved && THEME_LIST.some(t => t.id === saved)) {
        return saved as ThemeId;
      }
    } catch { /* ignore */ }
    return 'paper';
  });

  const [mode, setModeState] = useState<ThemeMode>(() => {
    try {
      const saved = localStorage.getItem(MODE_STORAGE_KEY);
      if (saved === 'light' || saved === 'dark') {
        return saved;
      }
    } catch { /* ignore */ }
    return 'light'; // 默认白天模式
  });

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
  }, []);

  const toggleMode = useCallback(() => {
    setModeState(prev => prev === 'dark' ? 'light' : 'dark');
  }, []);

  // 同步 data-theme 和 data-theme-mode 到 document.documentElement
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme-mode', mode);
  }, [mode]);

  const themeInfo = THEME_LIST.find(t => t.id === theme) || THEME_LIST[0];

  return (
    <ThemeContext.Provider value={{ theme, setTheme, themeInfo, mode, setMode, toggleMode }}>
      {children}
    </ThemeContext.Provider>
  );
};

export default ThemeContext;
