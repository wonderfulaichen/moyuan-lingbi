'use client';

import React, { useState, useEffect, useCallback } from 'react';

interface PetState {
  name: string;
  hunger: number;
  happiness: number;
  energy: number;
  cleanliness: number;
  exp: number;
  level: number;
}

interface Animation {
  type: 'idle' | 'eat' | 'play' | 'sleep' | 'clean' | 'happy' | 'sad';
  duration: number;
}

export default function DesktopPet() {
  const [pet, setPet] = useState<PetState>({
    name: '小墨',
    hunger: 80,
    happiness: 90,
    energy: 85,
    cleanliness: 75,
    exp: 0,
    level: 1,
  });

  const [currentAnimation, setCurrentAnimation] = useState<Animation>({
    type: 'idle',
    duration: 2000,
  });
  const [showActions, setShowActions] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const messages = {
    eat: ['好吃！', '谢谢投喂~', '肚子饱饱的', '再来一口！'],
    play: ['好开心！', '嘿嘿~', '玩耍最快乐！', '继续继续！'],
    sleep: ['晚安...', 'zzZ...', '休息一下', '做个好梦'],
    clean: ['清爽！', '干干净净', '好舒服~', '焕然一新'],
    happy: ['爱你哟~', '主人最好了！', '开心开心！', '今天也要加油！'],
    sad: ['呜呜...', '有点难过', '需要陪伴', '好孤单'],
  };

  const showMessage = useCallback((type: keyof typeof messages) => {
    const msgs = messages[type];
    const randomMsg = msgs[Math.floor(Math.random() * msgs.length)];
    setMessage(randomMsg);
    setTimeout(() => setMessage(null), 2000);
  }, []);

  const playAnimation = useCallback((type: Animation['type'], duration: number = 2000) => {
    setCurrentAnimation({ type, duration });
    showMessage(type === 'idle' ? 'happy' : type);
    setTimeout(() => {
      setCurrentAnimation({ type: 'idle', duration: 2000 });
    }, duration);
  }, [showMessage]);

  const handleFeed = useCallback(() => {
    setPet(prev => {
      const newHunger = Math.min(100, prev.hunger + 20);
      const newExp = prev.exp + 10;
      const expNeeded = prev.level * 100;
      const leveledUp = newExp >= expNeeded;
      
      return {
        ...prev,
        hunger: newHunger,
        exp: leveledUp ? newExp - expNeeded : newExp,
        level: leveledUp ? prev.level + 1 : prev.level,
      };
    });
    playAnimation('eat', 1500);
    setShowActions(false);
  }, [playAnimation]);

  const handlePlay = useCallback(() => {
    setPet(prev => {
      const newHappiness = Math.min(100, prev.happiness + 15);
      const newEnergy = Math.max(0, prev.energy - 10);
      const newHunger = Math.max(0, prev.hunger - 5);
      const newExp = prev.exp + 15;
      const expNeeded = prev.level * 100;
      const leveledUp = newExp >= expNeeded;
      
      return {
        ...prev,
        happiness: newHappiness,
        energy: newEnergy,
        hunger: newHunger,
        exp: leveledUp ? newExp - expNeeded : newExp,
        level: leveledUp ? prev.level + 1 : prev.level,
      };
    });
    playAnimation('play', 2000);
    setShowActions(false);
  }, [playAnimation]);

  const handleSleep = useCallback(() => {
    setPet(prev => {
      const newEnergy = Math.min(100, prev.energy + 30);
      const newHappiness = Math.max(0, prev.happiness - 5);
      const newExp = prev.exp + 5;
      const expNeeded = prev.level * 100;
      const leveledUp = newExp >= expNeeded;
      
      return {
        ...prev,
        energy: newEnergy,
        happiness: newHappiness,
        exp: leveledUp ? newExp - expNeeded : newExp,
        level: leveledUp ? prev.level + 1 : prev.level,
      };
    });
    playAnimation('sleep', 3000);
    setShowActions(false);
  }, [playAnimation]);

  const handleClean = useCallback(() => {
    setPet(prev => {
      const newCleanliness = Math.min(100, prev.cleanliness + 25);
      const newExp = prev.exp + 8;
      const expNeeded = prev.level * 100;
      const leveledUp = newExp >= expNeeded;
      
      return {
        ...prev,
        cleanliness: newCleanliness,
        exp: leveledUp ? newExp - expNeeded : newExp,
        level: leveledUp ? prev.level + 1 : prev.level,
      };
    });
    playAnimation('clean', 1500);
    setShowActions(false);
  }, [playAnimation]);

  useEffect(() => {
    const interval = setInterval(() => {
      setPet(prev => ({
        ...prev,
        hunger: Math.max(0, prev.hunger - 1),
        happiness: Math.max(0, prev.happiness - 0.5),
        energy: prev.energy < 30 ? prev.energy + 2 : Math.max(0, prev.energy - 0.3),
        cleanliness: Math.max(0, prev.cleanliness - 0.2),
      }));
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (pet.hunger < 20 || pet.happiness < 20) {
      playAnimation('sad', 1000);
    }
  }, [pet.hunger, pet.happiness, playAnimation]);

  const getStatColor = (value: number) => {
    if (value >= 70) return 'bg-emerald-400';
    if (value >= 40) return 'bg-amber-400';
    return 'bg-rose-400';
  };

  const getPetEmoji = () => {
    if (pet.hunger < 20) return '😢';
    if (pet.energy < 30) return '😴';
    if (pet.happiness > 80) return '🥰';
    return '😊';
  };

  const getAnimationStyle = () => {
    switch (currentAnimation.type) {
      case 'eat':
        return 'animate-bounce';
      case 'play':
        return 'animate-spin';
      case 'sleep':
        return 'animate-pulse opacity-70';
      case 'clean':
        return 'animate-ping';
      case 'happy':
        return 'animate-bounce';
      case 'sad':
        return 'animate-pulse';
      default:
        return 'animate-pulse';
    }
  };

  const expProgress = (pet.exp / (pet.level * 100)) * 100;

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-100 via-purple-50 to-indigo-100 p-8">
      <div className="max-w-md mx-auto">
        {/* 状态栏 */}
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl p-6 mb-6 border border-purple-100">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-400 to-indigo-500 flex items-center justify-center text-2xl shadow-lg">
                {getPetEmoji()}
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-800">{pet.name}</h2>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 bg-gradient-to-r from-amber-400 to-orange-400 text-white text-xs font-bold rounded-full shadow">
                    Lv.{pet.level}
                  </span>
                  <span className="text-xs text-gray-500">墨渊灵笔助手</span>
                </div>
              </div>
            </div>
            <button
              onClick={() => setShowActions(!showActions)}
              className="w-10 h-10 rounded-full bg-gradient-to-r from-purple-500 to-indigo-500 text-white flex items-center justify-center shadow-lg hover:shadow-xl transition-all active:scale-95"
            >
              <span className="text-lg">⚡</span>
            </button>
          </div>

          {/* 属性条 */}
          <div className="space-y-3">
            {[
              { label: '饱食度', value: pet.hunger, icon: '🍖' },
              { label: '快乐值', value: pet.happiness, icon: '💖' },
              { label: '体力值', value: pet.energy, icon: '⚡' },
              { label: '清洁度', value: pet.cleanliness, icon: '✨' },
            ].map((stat) => (
              <div key={stat.label} className="flex items-center gap-3">
                <span className="text-lg">{stat.icon}</span>
                <span className="w-16 text-sm font-medium text-gray-600">{stat.label}</span>
                <div className="flex-1 h-3 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${getStatColor(stat.value)}`}
                    style={{ width: `${stat.value}%` }}
                  />
                </div>
                <span className="w-10 text-sm font-bold text-gray-700">{Math.round(stat.value)}%</span>
              </div>
            ))}
          </div>

          {/* 经验条 */}
          <div className="mt-4 pt-4 border-t border-purple-100">
            <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
              <span>经验值</span>
              <span>{pet.exp} / {pet.level * 100}</span>
            </div>
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-purple-500 to-indigo-500 rounded-full transition-all duration-500"
                style={{ width: `${expProgress}%` }}
              />
            </div>
          </div>
        </div>

        {/* 宠物区域 */}
        <div className="relative bg-white/60 backdrop-blur-sm rounded-3xl shadow-2xl p-8 border border-purple-100">
          <div className="flex flex-col items-center">
            {/* 宠物本体 */}
            <div
              className={`relative cursor-pointer transition-transform hover:scale-105 ${getAnimationStyle()}`}
              onClick={() => playAnimation('happy')}
            >
              <div className="text-8xl filter drop-shadow-lg">
                {getPetEmoji()}
              </div>
              
              {/* 动画效果 */}
              {currentAnimation.type === 'eat' && (
                <div className="absolute -top-4 left-1/2 transform -translate-x-1/2 text-2xl animate-bounce">
                  🍖➡️👄
                </div>
              )}
              {currentAnimation.type === 'play' && (
                <>
                  <div className="absolute -top-2 -left-4 text-xl animate-bounce">⭐</div>
                  <div className="absolute -top-2 -right-4 text-xl animate-bounce delay-100">💫</div>
                </>
              )}
              {currentAnimation.type === 'sleep' && (
                <div className="absolute -top-2 left-1/2 transform -translate-x-1/2 text-xl">
                  💤
                </div>
              )}
              {currentAnimation.type === 'clean' && (
                <>
                  <div className="absolute -top-4 left-1/2 transform -translate-x-1/2 text-xl animate-ping">✨</div>
                  <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -mt-2 text-xl">💧</div>
                </>
              )}
            </div>

            {/* 消息气泡 */}
            {message && (
              <div className="mt-4 px-4 py-2 bg-gradient-to-r from-purple-500 to-indigo-500 text-white rounded-full shadow-lg animate-fade-in">
                <span className="font-medium">{message}</span>
              </div>
            )}

            {/* 动作按钮 */}
            {showActions && (
              <div className="mt-6 grid grid-cols-2 gap-3 w-full animate-fade-in">
                <button
                  onClick={handleFeed}
                  disabled={pet.hunger >= 100}
                  className="flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-orange-400 to-amber-400 text-white rounded-xl shadow-lg hover:shadow-xl transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className="text-lg">🍖</span>
                  <span className="font-medium">喂食</span>
                </button>
                <button
                  onClick={handlePlay}
                  disabled={pet.energy < 10}
                  className="flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-pink-400 to-rose-400 text-white rounded-xl shadow-lg hover:shadow-xl transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className="text-lg">🎮</span>
                  <span className="font-medium">玩耍</span>
                </button>
                <button
                  onClick={handleSleep}
                  disabled={pet.energy >= 100}
                  className="flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-blue-400 to-cyan-400 text-white rounded-xl shadow-lg hover:shadow-xl transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className="text-lg">😴</span>
                  <span className="font-medium">休息</span>
                </button>
                <button
                  onClick={handleClean}
                  disabled={pet.cleanliness >= 100}
                  className="flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-emerald-400 to-teal-400 text-white rounded-xl shadow-lg hover:shadow-xl transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className="text-lg">🛁</span>
                  <span className="font-medium">清洁</span>
                </button>
              </div>
            )}

            {/* 提示文字 */}
            {!showActions && (
              <p className="mt-4 text-sm text-gray-500">
                点击宠物或右上角按钮进行互动
              </p>
            )}
          </div>
        </div>

        {/* 底部装饰 */}
        <div className="mt-6 flex justify-center gap-2">
          <div className="px-3 py-1 bg-white/60 rounded-full text-xs text-purple-600 font-medium">
            墨渊灵笔 AI助手
          </div>
        </div>
      </div>
    </div>
  );
}
