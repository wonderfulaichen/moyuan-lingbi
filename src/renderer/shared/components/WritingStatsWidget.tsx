import React, { useEffect, useCallback } from 'react';
import { useUIStore } from '../stores/uiStore';
import { useTheme } from '../contexts/ThemeContext';

const WritingStatsWidget: React.FC = () => {
  const { writingStats, updateWritingStats } = useUIStore();
  const { themeInfo } = useTheme();

  // 简单的字数统计模拟（实际项目中应该从编辑器获取）
  const handleWordCountUpdate = useCallback((newWords: number) => {
    const today = new Date().toDateString();
    const lastDate = writingStats.lastSession ? new Date(writingStats.lastSession).toDateString() : null;
    
    let todayWords = writingStats.todayWords;
    let sessions = writingStats.sessions;
    
    if (lastDate !== today) {
      todayWords = 0;
      sessions += 1;
    }
    
    updateWritingStats({
      totalWords: writingStats.totalWords + newWords,
      totalCharacters: writingStats.totalCharacters + newWords * 5, // 估算字符数
      todayWords: todayWords + newWords,
      sessions,
      lastSession: Date.now(),
    });
  }, [writingStats, updateWritingStats]);

  const progress = Math.min(100, (writingStats.todayWords / writingStats.dailyGoal) * 100);
  const isGoalAchieved = writingStats.todayWords >= writingStats.dailyGoal;

  return (
    <div className="rounded-xl border p-4 transition-all duration-300 card-hover" style={{
      background: 'var(--color-surface-card)',
      borderColor: 'var(--color-border-default)'
    }}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center border" style={{
            background: themeInfo.gradient,
            borderColor: 'var(--color-border-default)'
          }}>
            <i className="fas fa-chart-line text-xs" style={{ color: 'var(--color-primary-300)' }}></i>
          </div>
          <div>
            <h4 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>今日写作</h4>
            <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
              {isGoalAchieved ? '🎉 目标达成！' : `还需 ${writingStats.dailyGoal - writingStats.todayWords} 字`}
            </p>
          </div>
        </div>
        <span className="text-xs px-2 py-1 rounded-full" style={{
          background: 'var(--color-surface-muted)',
          color: 'var(--color-text-tertiary)'
        }}>
          {writingStats.sessions} 次
        </span>
      </div>

      {/* 进度条 */}
      <div className="mb-3">
        <div className="flex justify-between text-xs mb-1.5" style={{ color: 'var(--color-text-muted)' }}>
          <span>{writingStats.todayWords.toLocaleString()} 字</span>
          <span>{writingStats.dailyGoal.toLocaleString()} 字</span>
        </div>
        <div className="h-2 rounded-full overflow-hidden" style={{
          background: 'var(--color-surface-muted)'
        }}>
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ 
              width: `${progress}%`,
              background: isGoalAchieved 
                ? 'linear-gradient(90deg, #10b981, #34d399)' 
                : themeInfo.gradient
            }}
          />
        </div>
      </div>

      {/* 详细统计 */}
      <div className="grid grid-cols-3 gap-2">
        <div className="p-2 rounded-lg text-center" style={{
          background: 'var(--color-surface-muted)'
        }}>
          <p className="text-[9px] mb-0.5" style={{ color: 'var(--color-text-muted)' }}>今日</p>
          <p className="text-sm font-bold" style={{
            color: isGoalAchieved ? '#34d399' : 'var(--color-primary-300)'
          }}>
            {writingStats.todayWords.toLocaleString()}
          </p>
        </div>
        <div className="p-2 rounded-lg text-center" style={{
          background: 'var(--color-surface-muted)'
        }}>
          <p className="text-[9px] mb-0.5" style={{ color: 'var(--color-text-muted)' }}>总计</p>
          <p className="text-sm font-bold" style={{ color: '#60a5fa' }}>
            {writingStats.totalWords.toLocaleString()}
          </p>
        </div>
        <div className="p-2 rounded-lg text-center" style={{
          background: 'var(--color-surface-muted)'
        }}>
          <p className="text-[9px] mb-0.5" style={{ color: 'var(--color-text-muted)' }}>完成度</p>
          <p className="text-sm font-bold" style={{ color: '#f59e0b' }}>
            {Math.round(progress)}%
          </p>
        </div>
      </div>
    </div>
  );
};

export default WritingStatsWidget;
