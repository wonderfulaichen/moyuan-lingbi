import React, { useState, useEffect, useMemo } from 'react';
import { useTheme } from '../../shared/contexts/ThemeContext';
import { useUIStore } from '../../shared/stores/uiStore';

interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  category: 'writing' | 'consistency' | 'memory' | 'exploration';
  unlocked: boolean;
  unlockedAt?: number;
  progress?: number;
  progressTarget?: number;
}

interface AchievementStats {
  totalUnlocked: number;
  totalAchievements: number;
  longestStreak: number;
  totalPomodoros: number;
  totalWordsWritten: number;
  daysActive: number;
}

const ACHIEVEMENTS: Achievement[] = [
  // 写作类成就
  {
    id: 'first_steps',
    title: '初露锋芒',
    description: '完成第一个番茄钟',
    icon: 'fa-seedling',
    rarity: 'common',
    category: 'writing',
    unlocked: false,
    progress: 0,
    progressTarget: 1,
  },
  {
    id: 'words_1k',
    title: '千字起步',
    description: '累计写作1000字',
    icon: 'fa-feather',
    rarity: 'common',
    category: 'writing',
    unlocked: false,
    progress: 0,
    progressTarget: 1000,
  },
  {
    id: 'words_10k',
    title: '万字成就',
    description: '累计写作10000字',
    icon: 'fa-book-open',
    rarity: 'rare',
    category: 'writing',
    unlocked: false,
    progress: 0,
    progressTarget: 10000,
  },
  {
    id: 'pomodoro_10',
    title: '专注达人',
    description: '完成10个番茄钟',
    icon: 'fa-clock',
    rarity: 'common',
    category: 'writing',
    unlocked: false,
    progress: 0,
    progressTarget: 10,
  },
  {
    id: 'pomodoro_50',
    title: '番茄大师',
    description: '完成50个番茄钟',
    icon: 'fa-clock-rotate-left',
    rarity: 'rare',
    category: 'writing',
    unlocked: false,
    progress: 0,
    progressTarget: 50,
  },
  
  // 持续性类成就
  {
    id: 'streak_3',
    title: '三日连更',
    description: '连续3天使用墨渊灵笔',
    icon: 'fa-fire',
    rarity: 'common',
    category: 'consistency',
    unlocked: false,
    progress: 0,
    progressTarget: 3,
  },
  {
    id: 'streak_7',
    title: '周更达人',
    description: '连续7天使用墨渊灵笔',
    icon: 'fa-fire-burner',
    rarity: 'rare',
    category: 'consistency',
    unlocked: false,
    progress: 0,
    progressTarget: 7,
  },
  {
    id: 'streak_30',
    title: '月更王者',
    description: '连续30天使用墨渊灵笔',
    icon: 'fa-crown',
    rarity: 'epic',
    category: 'consistency',
    unlocked: false,
    progress: 0,
    progressTarget: 30,
  },
  
  // 记忆体类成就
  {
    id: 'first_memory',
    title: '记忆觉醒',
    description: '初始化记忆体',
    icon: 'fa-brain',
    rarity: 'common',
    category: 'memory',
    unlocked: false,
    progress: 0,
    progressTarget: 1,
  },
  {
    id: 'character_creator',
    title: '角色大师',
    description: '创建5个角色',
    icon: 'fa-users',
    rarity: 'common',
    category: 'memory',
    unlocked: false,
    progress: 0,
    progressTarget: 5,
  },
  {
    id: 'world_builder',
    title: '世界架构师',
    description: '创建10条世界观规则',
    icon: 'fa-globe',
    rarity: 'rare',
    category: 'memory',
    unlocked: false,
    progress: 0,
    progressTarget: 10,
  },
  
  // 探索类成就
  {
    id: 'explorer',
    title: '墨渊探索者',
    description: '访问所有页面',
    icon: 'fa-compass',
    rarity: 'rare',
    category: 'exploration',
    unlocked: false,
    progress: 0,
    progressTarget: 6,
  },
  {
    id: 'first_project',
    title: '项目启动',
    description: '创建第一个项目',
    icon: 'fa-rocket',
    rarity: 'common',
    category: 'exploration',
    unlocked: false,
    progress: 0,
    progressTarget: 1,
  },
  {
    id: 'theme_master',
    title: '主题收藏家',
    description: '使用过所有主题',
    icon: 'fa-palette',
    rarity: 'epic',
    category: 'exploration',
    unlocked: false,
    progress: 0,
    progressTarget: 12,
  },
  
  // 传奇成就
  {
    id: 'legendary_writer',
    title: '传奇作家',
    description: '累计写作100000字',
    icon: 'fa-star',
    rarity: 'legendary',
    category: 'writing',
    unlocked: false,
    progress: 0,
    progressTarget: 100000,
  },
];

const RARITY_COLORS: Record<string, string> = {
  common: '#9ca3af',
  rare: '#60a5fa',
  epic: '#a855f7',
  legendary: '#f59e0b',
};

const RARITY_LABELS: Record<string, string> = {
  common: '普通',
  rare: '稀有',
  epic: '史诗',
  legendary: '传奇',
};

const CATEGORY_LABELS: Record<string, string> = {
  writing: '写作',
  consistency: '坚持',
  memory: '记忆',
  exploration: '探索',
};

const CATEGORY_ICONS: Record<string, string> = {
  writing: 'fa-pen-fancy',
  consistency: 'fa-bolt',
  memory: 'fa-brain',
  exploration: 'fa-compass',
};

export const AchievementSystem: React.FC = () => {
  const { themeInfo } = useTheme();
  const { animationLevel } = useUIStore();
  const hasAnimations = animationLevel !== 'none';
  
  const [achievements, setAchievements] = useState<Achievement[]>(() => {
    try {
      const saved = localStorage.getItem('achievements');
      return saved ? JSON.parse(saved) : ACHIEVEMENTS;
    } catch {
      return ACHIEVEMENTS;
    }
  });
  
  const [stats, setStats] = useState<AchievementStats>(() => {
    try {
      const saved = localStorage.getItem('achievement_stats');
      return saved 
        ? JSON.parse(saved) 
        : {
            totalUnlocked: 0,
            totalAchievements: ACHIEVEMENTS.length,
            longestStreak: 0,
            totalPomodoros: 0,
            totalWordsWritten: 0,
            daysActive: 0,
          };
    } catch {
      return {
        totalUnlocked: 0,
        totalAchievements: ACHIEVEMENTS.length,
        longestStreak: 0,
        totalPomodoros: 0,
        totalWordsWritten: 0,
        daysActive: 0,
      };
    }
  });
  
  const [activeTab, setActiveTab] = useState<'all' | 'writing' | 'consistency' | 'memory' | 'exploration'>('all');
  const [showNewUnlocks, setShowNewUnlocks] = useState<Achievement[]>([]);
  const [filterUnlocked, setFilterUnlocked] = useState<'all' | 'unlocked' | 'locked'>('all');
  
  // 保存数据
  useEffect(() => {
    localStorage.setItem('achievements', JSON.stringify(achievements));
    localStorage.setItem('achievement_stats', JSON.stringify(stats));
  }, [achievements, stats]);
  
  const filteredAchievements = useMemo(() => {
    let filtered = achievements;
    
    if (activeTab !== 'all') {
      filtered = filtered.filter(a => a.category === activeTab);
    }
    
    if (filterUnlocked === 'unlocked') {
      filtered = filtered.filter(a => a.unlocked);
    } else if (filterUnlocked === 'locked') {
      filtered = filtered.filter(a => !a.unlocked);
    }
    
    return filtered.sort((a, b) => {
      if (a.unlocked !== b.unlocked) return a.unlocked ? -1 : 1;
      const rarityOrder = { legendary: 0, epic: 1, rare: 2, common: 3 };
      return rarityOrder[a.rarity] - rarityOrder[b.rarity];
    });
  }, [achievements, activeTab, filterUnlocked]);
  
  const progress = (stats.totalUnlocked / stats.totalAchievements) * 100;
  
  const AchievementCard = ({ achievement }: { achievement: Achievement }) => {
    const color = RARITY_COLORS[achievement.rarity];
    const isUnlocked = achievement.unlocked;
    
    return (
      <div 
        className={`p-4 rounded-xl transition-all ${hasAnimations ? 'hover:scale-[1.02]' : ''}`}
        style={{
          background: isUnlocked 
            ? `linear-gradient(135deg, ${color}20, ${color}10)` 
            : 'var(--color-surface-muted)',
          border: `1px solid ${isUnlocked ? color : 'var(--color-border-default)'}`,
          opacity: isUnlocked ? 1 : 0.6,
          boxShadow: isUnlocked ? `0 4px 12px ${color}30` : 'none',
        }}
      >
        <div className="flex items-start gap-3">
          <div 
            className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
            style={{
              background: isUnlocked 
                ? `linear-gradient(135deg, ${color}40, ${color}20)` 
                : 'var(--color-surface-muted)',
            }}
          >
            <i 
              className={`fas ${achievement.icon} text-xl ${!isUnlocked ? 'opacity-30' : ''}`}
              style={{ color: isUnlocked ? color : 'var(--color-text-muted)' }}
            />
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <span 
                className="text-sm font-bold"
                style={{ color: isUnlocked ? color : 'var(--color-text-muted)' }}
              >
                {achievement.title}
              </span>
              <span 
                className="text-[9px] px-1.5 py-0.5 rounded-full"
                style={{ 
                  background: `${color}20`, 
                  color: color,
                }}
              >
                {RARITY_LABELS[achievement.rarity]}
              </span>
            </div>
            
            <p 
              className="text-[10px] mb-2 leading-relaxed"
              style={{ color: isUnlocked ? 'var(--color-text-secondary)' : 'var(--color-text-muted)' }}
            >
              {achievement.description}
            </p>
            
            {achievement.progressTarget && !isUnlocked && (
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[9px]" style={{ color: 'var(--color-text-muted)' }}>
                    {achievement.progress || 0} / {achievement.progressTarget}
                  </span>
                  <span className="text-[9px]" style={{ color: 'var(--color-text-muted)' }}>
                    {Math.round(((achievement.progress || 0) / achievement.progressTarget) * 100)}%
                  </span>
                </div>
                <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--color-surface-muted)' }}>
                  <div 
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.min(((achievement.progress || 0) / achievement.progressTarget) * 100, 100)}%`,
                      background: color,
                    }}
                  />
                </div>
              </div>
            )}
            
            {isUnlocked && achievement.unlockedAt && (
              <p className="text-[9px]" style={{ color: 'var(--color-text-muted)' }}>
                <i className="fas fa-calendar-check mr-1" />
                {new Date(achievement.unlockedAt).toLocaleDateString('zh-CN')}
              </p>
            )}
          </div>
        </div>
      </div>
    );
  };
  
  const tabs = [
    { key: 'all', label: '全部', icon: 'fa-star' },
    { key: 'writing', label: '写作', icon: 'fa-pen-fancy' },
    { key: 'consistency', label: '坚持', icon: 'fa-bolt' },
    { key: 'memory', label: '记忆', icon: 'fa-brain' },
    { key: 'exploration', label: '探索', icon: 'fa-compass' },
  ];
  
  return (
    <div className="p-6">
      {/* 新解锁成就提示 */}
      {showNewUnlocks.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-fade-in">
          <div className="glass-card rounded-2xl p-6 max-w-sm mx-4 animate-scale-in">
            <h3 className="text-lg font-bold text-center mb-4" style={{ color: 'var(--color-text-primary)' }}>
              🎉 解锁新成就！
            </h3>
            <div className="space-y-3 mb-6">
              {showNewUnlocks.map((achievement) => (
                <div 
                  key={achievement.id}
                  className="p-4 rounded-xl"
                  style={{
                    background: `linear-gradient(135deg, ${RARITY_COLORS[achievement.rarity]}20, ${RARITY_COLORS[achievement.rarity]}10)`,
                    border: `1px solid ${RARITY_COLORS[achievement.rarity]}40`,
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div 
                      className="w-10 h-10 rounded-xl flex items-center justify-center"
                      style={{ background: `linear-gradient(135deg, ${RARITY_COLORS[achievement.rarity]}40, ${RARITY_COLORS[achievement.rarity]}20)` }}
                    >
                      <i className={`fas ${achievement.icon}`} style={{ color: RARITY_COLORS[achievement.rarity] }} />
                    </div>
                    <div>
                      <p className="font-bold" style={{ color: RARITY_COLORS[achievement.rarity] }}>{achievement.title}</p>
                      <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>{achievement.description}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <button
              onClick={() => setShowNewUnlocks([])}
              className="w-full py-2 rounded-lg font-medium"
              style={{ background: themeInfo.gradient, color: 'var(--color-text-inverse, #fff)' }}
            >
              太棒了！
            </button>
          </div>
        </div>
      )}
      
      {/* 头部 */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: themeInfo.gradient }}>
            <i className="fas fa-trophy text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold" style={{ color: 'var(--color-text-primary)' }}>成就系统</h2>
            <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>记录您的创作旅程</p>
          </div>
        </div>
        
        <div className="text-right">
          <p className="text-2xl font-black" style={{ color: themeInfo.primaryColor }}>{stats.totalUnlocked}</p>
          <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>已解锁 / {stats.totalAchievements}</p>
        </div>
      </div>
      
      {/* 总进度条 */}
      <div className="glass-card rounded-xl p-4 mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>总进度</span>
          <span className="text-sm font-bold" style={{ color: themeInfo.primaryColor }}>{Math.round(progress)}%</span>
        </div>
        <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: 'var(--color-surface-muted)' }}>
          <div 
            className="h-full rounded-full transition-all duration-1000"
            style={{ 
              width: `${progress}%`, 
              background: themeInfo.gradient,
            }}
          />
        </div>
      </div>
      
      {/* 统计卡片 */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { label: '最长连续', value: stats.longestStreak, icon: 'fa-fire', color: '#f59e0b' },
          { label: '番茄钟', value: stats.totalPomodoros, icon: 'fa-clock', color: '#34d399' },
          { label: '总字数', value: stats.totalWordsWritten, icon: 'fa-font', color: '#60a5fa' },
        ].map((stat, i) => (
          <div 
            key={i}
            className="glass-card rounded-xl p-3 text-center"
            style={{ background: `${stat.color}10` }}
          >
            <i className={`fas ${stat.icon} text-lg mb-1`} style={{ color: stat.color }} />
            <p className="text-lg font-black" style={{ color: stat.color }}>{stat.value}</p>
            <p className="text-[9px]" style={{ color: 'var(--color-text-muted)' }}>{stat.label}</p>
          </div>
        ))}
      </div>
      
      {/* 标签页切换 */}
      <div className="flex gap-1 mb-4 overflow-x-auto pb-1">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as any)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${hasAnimations ? 'hover:scale-105' : ''}`}
            style={activeTab === tab.key 
              ? { background: themeInfo.gradient, color: '#fff', boxShadow: `0 2px 8px ${themeInfo.primaryColor}40` }
              : { background: 'var(--color-surface-muted)', color: 'var(--color-text-tertiary)' }
            }
          >
            <i className={`fas ${tab.icon} mr-1.5`} />
            {tab.label}
          </button>
        ))}
      </div>
      
      {/* 筛选 */}
      <div className="flex gap-2 mb-4">
        {[
          { key: 'all', label: '全部' },
          { key: 'unlocked', label: '已解锁' },
          { key: 'locked', label: '未解锁' },
        ].map((filter) => (
          <button
            key={filter.key}
            onClick={() => setFilterUnlocked(filter.key as any)}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${hasAnimations ? 'hover:scale-105' : ''}`}
            style={filterUnlocked === filter.key 
              ? { background: 'var(--color-surface-muted)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border-default)' }
              : { background: 'transparent', color: 'var(--color-text-muted)' }
            }
          >
            {filter.label}
          </button>
        ))}
      </div>
      
      {/* 成就列表 */}
      <div className="space-y-3 max-h-96 overflow-y-auto">
        {filteredAchievements.length === 0 ? (
          <div className="text-center py-12">
            <i className="fas fa-inbox text-4xl mb-3 opacity-30" style={{ color: 'var(--color-text-muted)' }} />
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>暂无成就</p>
          </div>
        ) : (
          filteredAchievements.map((achievement) => (
            <AchievementCard key={achievement.id} achievement={achievement} />
          ))
        )}
      </div>
    </div>
  );
};

export default AchievementSystem;
