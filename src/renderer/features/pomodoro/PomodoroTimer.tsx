import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTheme } from '../../shared/contexts/ThemeContext';
import { useUIStore } from '../../shared/stores/uiStore';

interface PomodoroStats {
  completedPomodoros: number;
  completedBreaks: number;
  totalFocusMinutes: number;
  streak: number;
  lastActiveDate?: string;
}

interface PomodoroSettings {
  workMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
  longBreakAfter: number;
  autoStartBreak: boolean;
  autoStartPomodoro: boolean;
  soundEnabled: boolean;
  notificationsEnabled: boolean;
}

const DEFAULT_SETTINGS: PomodoroSettings = {
  workMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  longBreakAfter: 4,
  autoStartBreak: true,
  autoStartPomodoro: false,
  soundEnabled: true,
  notificationsEnabled: true,
};

const DEFAULT_STATS: PomodoroStats = {
  completedPomodoros: 0,
  completedBreaks: 0,
  totalFocusMinutes: 0,
  streak: 0,
};

const PHASES = ['work', 'short_break', 'long_break'] as const;
type Phase = typeof PHASES[number];

const PHASE_LABELS: Record<Phase, string> = {
  work: '专注',
  short_break: '短休息',
  long_break: '长休息',
};

const PHASE_ICONS: Record<Phase, string> = {
  work: 'fa-brain',
  short_break: 'fa-coffee',
  long_break: 'fa-mug-saucer',
};

export const PomodoroTimer: React.FC = () => {
  const { themeInfo } = useTheme();
  const { animationLevel } = useUIStore();
  const hasAnimations = animationLevel !== 'none';
  
  const [settings, setSettings] = useState<PomodoroSettings>(() => {
    try {
      const saved = localStorage.getItem('pomodoro_settings');
      return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : DEFAULT_SETTINGS;
    } catch {
      return DEFAULT_SETTINGS;
    }
  });
  
  const [stats, setStats] = useState<PomodoroStats>(() => {
    try {
      const saved = localStorage.getItem('pomodoro_stats');
      return saved ? { ...DEFAULT_STATS, ...JSON.parse(saved) } : DEFAULT_STATS;
    } catch {
      return DEFAULT_STATS;
    }
  });
  
  const [phase, setPhase] = useState<Phase>('work');
  const [timeLeft, setTimeLeft] = useState(settings.workMinutes * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [sessionCount, setSessionCount] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [showStats, setShowStats] = useState(false);
  
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  
  // 保存设置
  useEffect(() => {
    localStorage.setItem('pomodoro_settings', JSON.stringify(settings));
  }, [settings]);
  
  // 保存统计数据
  useEffect(() => {
    localStorage.setItem('pomodoro_stats', JSON.stringify(stats));
  }, [stats]);
  
  // 更新时间剩余
  useEffect(() => {
    if (isRunning && timeLeft > 0) {
      timerRef.current = setInterval(() => {
        setTimeLeft(prev => prev - 1);
      }, 1000);
    } else if (timeLeft === 0 && isRunning) {
      handlePhaseComplete();
    }
    
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isRunning, timeLeft]);
  
  // 检查每日连续打卡
  useEffect(() => {
    const today = new Date().toDateString();
    if (stats.lastActiveDate && stats.lastActiveDate !== today) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      
      if (stats.lastActiveDate !== yesterday.toDateString()) {
        setStats(prev => ({ ...prev, streak: 0 }));
      }
    }
  }, []);
  
  const playSound = useCallback(() => {
    if (!settings.soundEnabled) return;
    
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      
      const ctx = audioContextRef.current;
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      oscillator.frequency.value = 800;
      oscillator.type = 'sine';
      
      gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
      
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.5);
      
      // 播放三次提示音
      setTimeout(() => {
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.frequency.value = 800;
        gain2.gain.setValueAtTime(0.3, ctx.currentTime + 0.1);
        gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.6);
        osc2.start(ctx.currentTime + 0.1);
        osc2.stop(ctx.currentTime + 0.6);
      }, 600);
      
      setTimeout(() => {
        const osc3 = ctx.createOscillator();
        const gain3 = ctx.createGain();
        osc3.connect(gain3);
        gain3.connect(ctx.destination);
        osc3.frequency.value = 1000;
        gain3.gain.setValueAtTime(0.4, ctx.currentTime + 0.2);
        gain3.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.8);
        osc3.start(ctx.currentTime + 0.2);
        osc3.stop(ctx.currentTime + 0.8);
      }, 1200);
      
    } catch (e) {
      console.error('播放声音失败:', e);
    }
  }, [settings.soundEnabled]);
  
  const showNotification = useCallback((title: string, body: string) => {
    if (!settings.notificationsEnabled) return;
    
    if ('Notification' in window) {
      if (Notification.permission === 'granted') {
        new Notification(title, {
          body,
          icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🍅</text></svg>',
        });
      } else if (Notification.permission !== 'denied') {
        Notification.requestPermission();
      }
    }
  }, [settings.notificationsEnabled]);
  
  const handlePhaseComplete = useCallback(() => {
    setIsRunning(false);
    playSound();
    
    if (phase === 'work') {
      // 完成一个番茄钟
      const today = new Date().toDateString();
      const newStreak = stats.lastActiveDate === today 
        ? stats.streak 
        : stats.streak + 1;
      
      setStats(prev => ({
        ...prev,
        completedPomodoros: prev.completedPomodoros + 1,
        totalFocusMinutes: prev.totalFocusMinutes + settings.workMinutes,
        streak: newStreak,
        lastActiveDate: today,
      }));
      
      setSessionCount(prev => prev + 1);
      showNotification('🎯 番茄钟完成！', '休息一下吧！');
      
      // 判断是否需要长休息
      if ((sessionCount + 1) % settings.longBreakAfter === 0) {
        setPhase('long_break');
        setTimeLeft(settings.longBreakMinutes * 60);
        if (settings.autoStartBreak) {
          setTimeout(() => setIsRunning(true), 1000);
        }
      } else {
        setPhase('short_break');
        setTimeLeft(settings.shortBreakMinutes * 60);
        if (settings.autoStartBreak) {
          setTimeout(() => setIsRunning(true), 1000);
        }
      }
    } else {
      // 完成休息
      setStats(prev => ({
        ...prev,
        completedBreaks: prev.completedBreaks + 1,
      }));
      
      setPhase('work');
      setTimeLeft(settings.workMinutes * 60);
      showNotification('☕ 休息结束！', '开始新的专注吧！');
      
      if (settings.autoStartPomodoro) {
        setTimeout(() => setIsRunning(true), 1000);
      }
    }
  }, [phase, sessionCount, settings, stats, playSound, showNotification]);
  
  const toggleTimer = () => {
    setIsRunning(prev => !prev);
  };
  
  const resetTimer = () => {
    setIsRunning(false);
    if (phase === 'work') {
      setTimeLeft(settings.workMinutes * 60);
    } else if (phase === 'short_break') {
      setTimeLeft(settings.shortBreakMinutes * 60);
    } else {
      setTimeLeft(settings.longBreakMinutes * 60);
    }
  };
  
  const skipPhase = () => {
    setIsRunning(false);
    if (phase === 'work') {
      if ((sessionCount + 1) % settings.longBreakAfter === 0) {
        setPhase('long_break');
        setTimeLeft(settings.longBreakMinutes * 60);
      } else {
        setPhase('short_break');
        setTimeLeft(settings.shortBreakMinutes * 60);
      }
    } else {
      setPhase('work');
      setTimeLeft(settings.workMinutes * 60);
    }
  };
  
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };
  
  const getPhaseColor = (currentPhase: Phase): string => {
    switch (currentPhase) {
      case 'work': return '#f59e0b'; // 橙色
      case 'short_break': return '#34d399'; // 绿色
      case 'long_break': return '#60a5fa'; // 蓝色
      default: return '#6b7280';
    }
  };
  
  const progress = phase === 'work' 
    ? 1 - (timeLeft / (settings.workMinutes * 60))
    : phase === 'short_break'
    ? 1 - (timeLeft / (settings.shortBreakMinutes * 60))
    : 1 - (timeLeft / (settings.longBreakMinutes * 60));
  
  const color = getPhaseColor(phase);
  const circumference = 2 * Math.PI * 90;
  const offset = circumference - progress * circumference;
  
  return (
    <div className="flex flex-col items-center p-6">
      {/* 标题和控制按钮 */}
      <div className="w-full flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" 
            style={{ background: themeInfo.gradient }}>
            <i className="fas fa-clock text-white" />
          </div>
          <h2 className="text-lg font-bold" style={{ color: 'var(--color-text-primary)' }}>番茄钟</h2>
        </div>
        
        <div className="flex gap-2">
          <button
            onClick={() => setShowStats(!showStats)}
            className={`p-2 rounded-lg transition-all ${hasAnimations ? 'hover:scale-105' : ''}`}
            style={{ 
              background: showStats ? themeInfo.gradient : 'var(--color-surface-muted)', 
              color: showStats ? '#fff' : 'var(--color-text-secondary)',
              boxShadow: showStats ? `0 2px 8px ${themeInfo.primaryColor}40` : 'none'
            }}
          >
            <i className="fas fa-chart-line" />
          </button>
          
          <button
            onClick={() => setShowSettings(!showSettings)}
            className={`p-2 rounded-lg transition-all ${hasAnimations ? 'hover:scale-105' : ''}`}
            style={{ 
              background: showSettings ? themeInfo.gradient : 'var(--color-surface-muted)', 
              color: showSettings ? '#fff' : 'var(--color-text-secondary)',
              boxShadow: showSettings ? `0 2px 8px ${themeInfo.primaryColor}40` : 'none'
            }}
          >
            <i className="fas fa-gear" />
          </button>
        </div>
      </div>
      
      {/* 统计数据面板 */}
      {showStats && (
        <div className="w-full glass-card rounded-xl p-4 mb-6 animate-fade-in">
          <h3 className="text-sm font-bold mb-3" style={{ color: 'var(--color-text-primary)' }}>统计数据</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="text-center p-3 rounded-lg" style={{ background: `${color}10` }}>
              <div className="text-2xl font-black" style={{ color }}>{stats.completedPomodoros}</div>
              <div className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>完成番茄钟</div>
            </div>
            <div className="text-center p-3 rounded-lg" style={{ background: `${color}10` }}>
              <div className="text-2xl font-black" style={{ color }}>{stats.streak}</div>
              <div className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>连续打卡</div>
            </div>
            <div className="text-center p-3 rounded-lg" style={{ background: `${color}10` }}>
              <div className="text-2xl font-black" style={{ color }}>{stats.totalFocusMinutes}</div>
              <div className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>专注分钟</div>
            </div>
            <div className="text-center p-3 rounded-lg" style={{ background: `${color}10` }}>
              <div className="text-2xl font-black" style={{ color }}>{sessionCount}</div>
              <div className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>今日番茄钟</div>
            </div>
          </div>
        </div>
      )}
      
      {/* 设置面板 */}
      {showSettings && (
        <div className="w-full glass-card rounded-xl p-4 mb-6 animate-fade-in">
          <h3 className="text-sm font-bold mb-3" style={{ color: 'var(--color-text-primary)' }}>番茄钟设置</h3>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] block mb-1" style={{ color: 'var(--color-text-muted)' }}>专注时间（分钟）</label>
                <input
                  type="number"
                  value={settings.workMinutes}
                  onChange={(e) => setSettings(prev => ({ ...prev, workMinutes: Math.max(1, parseInt(e.target.value) || 25) }))}
                  className="w-full px-3 py-2 rounded-lg text-xs"
                  style={{ background: 'var(--color-surface-muted)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border-default)' }}
                />
              </div>
              <div>
                <label className="text-[10px] block mb-1" style={{ color: 'var(--color-text-muted)' }}>短休息（分钟）</label>
                <input
                  type="number"
                  value={settings.shortBreakMinutes}
                  onChange={(e) => setSettings(prev => ({ ...prev, shortBreakMinutes: Math.max(1, parseInt(e.target.value) || 5) }))}
                  className="w-full px-3 py-2 rounded-lg text-xs"
                  style={{ background: 'var(--color-surface-muted)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border-default)' }}
                />
              </div>
              <div>
                <label className="text-[10px] block mb-1" style={{ color: 'var(--color-text-muted)' }}>长休息（分钟）</label>
                <input
                  type="number"
                  value={settings.longBreakMinutes}
                  onChange={(e) => setSettings(prev => ({ ...prev, longBreakMinutes: Math.max(1, parseInt(e.target.value) || 15) }))}
                  className="w-full px-3 py-2 rounded-lg text-xs"
                  style={{ background: 'var(--color-surface-muted)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border-default)' }}
                />
              </div>
              <div>
                <label className="text-[10px] block mb-1" style={{ color: 'var(--color-text-muted)' }}>长休息间隔</label>
                <input
                  type="number"
                  value={settings.longBreakAfter}
                  onChange={(e) => setSettings(prev => ({ ...prev, longBreakAfter: Math.max(1, parseInt(e.target.value) || 4) }))}
                  className="w-full px-3 py-2 rounded-lg text-xs"
                  style={{ background: 'var(--color-surface-muted)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border-default)' }}
                />
              </div>
            </div>
            
            <div className="space-y-2 pt-2 border-t" style={{ borderColor: 'var(--color-border-default)' }}>
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>自动开始休息</span>
                <input
                  type="checkbox"
                  checked={settings.autoStartBreak}
                  onChange={(e) => setSettings(prev => ({ ...prev, autoStartBreak: e.target.checked }))}
                  className="w-4 h-4"
                />
              </label>
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>自动开始番茄钟</span>
                <input
                  type="checkbox"
                  checked={settings.autoStartPomodoro}
                  onChange={(e) => setSettings(prev => ({ ...prev, autoStartPomodoro: e.target.checked }))}
                  className="w-4 h-4"
                />
              </label>
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>声音提醒</span>
                <input
                  type="checkbox"
                  checked={settings.soundEnabled}
                  onChange={(e) => setSettings(prev => ({ ...prev, soundEnabled: e.target.checked }))}
                  className="w-4 h-4"
                />
              </label>
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>桌面通知</span>
                <input
                  type="checkbox"
                  checked={settings.notificationsEnabled}
                  onChange={(e) => setSettings(prev => ({ ...prev, notificationsEnabled: e.target.checked }))}
                  className="w-4 h-4"
                />
              </label>
            </div>
          </div>
        </div>
      )}
      
      {/* 番茄钟主体 */}
      <div className="relative mb-6">
        {/* 进度圆环 */}
        <svg width="220" height="220" className="transform -rotate-90">
          <circle
            cx="110"
            cy="110"
            r="90"
            fill="none"
            stroke="var(--color-surface-muted)"
            strokeWidth="12"
          />
          <circle
            cx="110"
            cy="110"
            r="90"
            fill="none"
            stroke={color}
            strokeWidth="12"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="transition-all duration-1000"
            style={{
              boxShadow: `0 0 20px ${color}60`,
            }}
          />
        </svg>
        
        {/* 中心内容 */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="flex items-center gap-2 mb-2">
            <i className={`fas ${PHASE_ICONS[phase]}`} style={{ color }} />
            <span className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
              {PHASE_LABELS[phase]}
            </span>
          </div>
          <div className="text-5xl font-black tracking-tight" style={{ color: 'var(--color-text-primary)' }}>
            {formatTime(timeLeft)}
          </div>
          <div className="flex gap-1 mt-2">
            {Array.from({ length: settings.longBreakAfter }).map((_, i) => (
              <div
                key={i}
                className="w-2 h-2 rounded-full"
                style={{
                  background: i < sessionCount % settings.longBreakAfter 
                    ? color 
                    : 'var(--color-surface-muted)',
                  opacity: i < sessionCount % settings.longBreakAfter ? 1 : 0.5,
                  boxShadow: i < sessionCount % settings.longBreakAfter ? `0 0 8px ${color}60` : 'none',
                }}
              />
            ))}
          </div>
        </div>
      </div>
      
      {/* 控制按钮 */}
      <div className="flex items-center gap-4">
        <button
          onClick={resetTimer}
          className={`p-3 rounded-xl transition-all ${hasAnimations ? 'hover:scale-105 active:scale-95' : ''}`}
          style={{ 
            background: 'var(--color-surface-muted)',
            color: 'var(--color-text-secondary)',
            border: '1px solid var(--color-border-default)',
          }}
        >
          <i className="fas fa-rotate-right" />
        </button>
        
        <button
          onClick={toggleTimer}
          className={`px-8 py-3 rounded-xl font-bold transition-all ${hasAnimations ? 'hover:scale-105 active:scale-95' : ''}`}
          style={{ 
            background: themeInfo.gradient,
            color: '#fff',
            boxShadow: `0 4px 12px ${themeInfo.primaryColor}40`,
          }}
        >
          <i className={`fas ${isRunning ? 'fa-pause' : 'fa-play'} mr-2`} />
          {isRunning ? '暂停' : '开始'}
        </button>
        
        <button
          onClick={skipPhase}
          className={`p-3 rounded-xl transition-all ${hasAnimations ? 'hover:scale-105 active:scale-95' : ''}`}
          style={{ 
            background: 'var(--color-surface-muted)',
            color: 'var(--color-text-secondary)',
            border: '1px solid var(--color-border-default)',
          }}
        >
          <i className="fas fa-forward-step" />
        </button>
      </div>
      
      {/* 番茄钟模式切换 */}
      <div className="flex gap-2 mt-6">
        {PHASES.map((p) => (
          <button
            key={p}
            onClick={() => {
              setPhase(p);
              setIsRunning(false);
              if (p === 'work') setTimeLeft(settings.workMinutes * 60);
              else if (p === 'short_break') setTimeLeft(settings.shortBreakMinutes * 60);
              else setTimeLeft(settings.longBreakMinutes * 60);
            }}
            className={`px-4 py-2 rounded-lg text-xs font-medium transition-all ${hasAnimations ? 'hover:scale-105' : ''}`}
            style={phase === p 
              ? { background: `${getPhaseColor(p)}20`, color: getPhaseColor(p), border: `1px solid ${getPhaseColor(p)}40` }
              : { background: 'var(--color-surface-muted)', color: 'var(--color-text-tertiary)', border: '1px solid var(--color-border-default)' }
            }
          >
            <i className={`fas ${PHASE_ICONS[p]} mr-1.5`} />
            {PHASE_LABELS[p]}
          </button>
        ))}
      </div>
    </div>
  );
};

export default PomodoroTimer;
