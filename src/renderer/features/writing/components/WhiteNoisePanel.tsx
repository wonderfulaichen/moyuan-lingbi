import React, { useState, useEffect, useCallback } from 'react';
import { whiteNoiseService, NOISE_PROFILES, NoiseType } from '../../../shared/services/WhiteNoiseService';
import { useTheme } from '../../../shared/contexts/ThemeContext';
import { useUIStore } from '../../../shared/stores/uiStore';

interface WhiteNoisePanelProps {
  isOpen: boolean;
  onClose: () => void;
}

const WhiteNoisePanel: React.FC<WhiteNoisePanelProps> = ({ isOpen, onClose }) => {
  const [masterVolume, setMasterVolume] = useState(50);
  const [activeNoises, setActiveNoises] = useState<Map<NoiseType, number>>(new Map());
  const [isPlaying, setIsPlaying] = useState(false);
  const { themeInfo } = useTheme();
  const { animationLevel } = useUIStore();
  const hasAnimations = animationLevel !== 'none';

  useEffect(() => {
    setActiveNoises(whiteNoiseService.getCurrentMix());
    setIsPlaying(whiteNoiseService.getIsPlaying());
    setMasterVolume(whiteNoiseService.getMasterVolume() * 100);
  }, []);

  const handleNoiseToggle = useCallback((type: NoiseType) => {
    const currentVolume = activeNoises.get(type) || 0;
    const newVolume = currentVolume > 0 ? 0 : 0.5;

    if (newVolume > 0) {
      whiteNoiseService.startNoise(type, newVolume);
      setActiveNoises(prev => new Map(prev).set(type, newVolume));
    } else {
      whiteNoiseService.stopNoise(type);
      setActiveNoises(prev => {
        const next = new Map(prev);
        next.delete(type);
        return next;
      });
    }
    setIsPlaying(whiteNoiseService.getIsPlaying());
  }, [activeNoises]);

  const handleNoiseVolume = useCallback((type: NoiseType, volume: number) => {
    const normalizedVolume = volume / 100;
    if (normalizedVolume > 0) {
      whiteNoiseService.startNoise(type, normalizedVolume);
      setActiveNoises(prev => new Map(prev).set(type, normalizedVolume));
    } else {
      whiteNoiseService.stopNoise(type);
      setActiveNoises(prev => {
        const next = new Map(prev);
        next.delete(type);
        return next;
      });
    }
    setIsPlaying(whiteNoiseService.getIsPlaying());
  }, []);

  const handleMasterVolume = useCallback((volume: number) => {
    setMasterVolume(volume);
    whiteNoiseService.setMasterVolume(volume / 100);
  }, []);

  const handleStopAll = useCallback(() => {
    whiteNoiseService.stopAll();
    setActiveNoises(new Map());
    setIsPlaying(false);
  }, []);

  const handlePreset = useCallback((preset: 'focus' | 'relax' | 'nature') => {
    handleStopAll();

    const presets: Record<string, Array<{ type: NoiseType; volume: number }>> = {
      focus: [
        { type: 'rain', volume: 0.4 },
        { type: 'coffee', volume: 0.2 },
      ],
      relax: [
        { type: 'ocean', volume: 0.5 },
        { type: 'wind', volume: 0.2 },
      ],
      nature: [
        { type: 'forest', volume: 0.4 },
        { type: 'river', volume: 0.3 },
      ],
    };

    presets[preset].forEach(({ type, volume }) => {
      whiteNoiseService.startNoise(type, volume);
    });

    setActiveNoises(whiteNoiseService.getCurrentMix());
    setIsPlaying(true);
  }, [handleStopAll]);

  if (!isOpen) return null;

  return (
    <div
      className={`
        fixed inset-0 z-50 flex items-center justify-center
        ${hasAnimations ? 'animate-fade-in' : ''}
      `}
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
      onClick={onClose}
    >
      <div
        className={`
          w-[420px] max-h-[80vh] rounded-2xl overflow-hidden
          ${hasAnimations ? 'animate-scale-in' : ''}
        `}
        style={{
          background: 'var(--glass-bg)',
          backdropFilter: 'blur(20px)',
          border: `1px solid ${themeInfo.primaryColor}30`,
        }}
        onClick={e => e.stopPropagation()}
      >
        <div
          className="h-1 w-full"
          style={{ background: `linear-gradient(90deg, ${themeInfo.primaryColor}, transparent)` }}
        />

        <div className="p-5">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{
                  background: `linear-gradient(135deg, ${themeInfo.primaryColor}30, ${themeInfo.primaryColor}10)`,
                }}
              >
                <i className={`fas fa-headphones text-lg`} style={{ color: themeInfo.primaryColor }} />
              </div>
              <div>
                <h3 className="font-bold text-lg" style={{ color: 'var(--text-primary)' }}>
                  白噪音
                </h3>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  沉浸式写作环境
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
              style={{
                background: 'var(--bg-tertiary)',
                color: 'var(--text-muted)',
              }}
            >
              <i className="fas fa-times" />
            </button>
          </div>

          <div className="mb-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                主音量
              </span>
              <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
                {masterVolume}%
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={masterVolume}
              onChange={e => handleMasterVolume(Number(e.target.value))}
              className="w-full h-2 rounded-full appearance-none cursor-pointer"
              style={{
                background: `linear-gradient(to right, ${themeInfo.primaryColor} ${masterVolume}%, var(--bg-tertiary) ${masterVolume}%)`,
              }}
            />
          </div>

          <div className="flex gap-2 mb-5">
            <button
              onClick={() => handlePreset('focus')}
              className="flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all"
              style={{
                background: 'var(--bg-tertiary)',
                color: 'var(--text-secondary)',
                border: `1px solid var(--border-color)`,
              }}
            >
              <i className="fas fa-bullseye mr-1" />专注
            </button>
            <button
              onClick={() => handlePreset('relax')}
              className="flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all"
              style={{
                background: 'var(--bg-tertiary)',
                color: 'var(--text-secondary)',
                border: `1px solid var(--border-color)`,
              }}
            >
              <i className="fas fa-spa mr-1" />放松
            </button>
            <button
              onClick={() => handlePreset('nature')}
              className="flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all"
              style={{
                background: 'var(--bg-tertiary)',
                color: 'var(--text-secondary)',
                border: `1px solid var(--border-color)`,
              }}
            >
              <i className="fas fa-leaf mr-1" />自然
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-5 max-h-60 overflow-y-auto pr-1">
            {NOISE_PROFILES.map(profile => {
              const volume = activeNoises.get(profile.id) || 0;
              const isActive = volume > 0;

              return (
                <div
                  key={profile.id}
                  className={`
                    p-3 rounded-xl cursor-pointer transition-all
                    ${hasAnimations && isActive ? 'ring-2' : ''}
                  `}
                  style={{
                    background: isActive ? `${profile.color}15` : 'var(--bg-tertiary)',
                    border: `1px solid ${isActive ? profile.color : 'var(--border-color)'}`,
                    boxShadow: isActive ? `0 0 0 1px ${profile.color}` : 'none',
                  }}
                  onClick={() => handleNoiseToggle(profile.id)}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center"
                      style={{
                        background: `${profile.color}20`,
                        color: profile.color,
                      }}
                    >
                      <i className={`fas ${profile.icon}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>
                        {profile.name}
                      </div>
                      <div className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                        {profile.description}
                      </div>
                    </div>
                  </div>

                  {isActive && (
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={volume * 100}
                      onChange={e => {
                        e.stopPropagation();
                        handleNoiseVolume(profile.id, Number(e.target.value));
                      }}
                      onClick={e => e.stopPropagation()}
                      className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                      style={{
                        background: `linear-gradient(to right, ${profile.color} ${volume * 100}%, var(--bg-secondary) ${volume * 100}%)`,
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex gap-2">
            {isPlaying && (
              <button
                onClick={handleStopAll}
                className="flex-1 py-2.5 rounded-xl font-medium transition-all"
                style={{
                  background: 'var(--bg-tertiary)',
                  color: 'var(--text-secondary)',
                  border: '1px solid var(--border-color)',
                }}
              >
                <i className="fas fa-stop mr-2" />停止全部
              </button>
            )}
            <button
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl font-medium transition-all"
              style={{
                background: `linear-gradient(135deg, ${themeInfo.primaryColor}, ${themeInfo.secondaryColor})`,
                color: 'var(--color-text-inverse, #fff)',
              }}
            >
              {isPlaying ? '继续播放' : '关闭'}
            </button>
          </div>
        </div>

        {isPlaying && (
          <div
            className="px-5 py-3 text-center text-xs"
            style={{
              background: 'var(--bg-tertiary)',
              color: 'var(--text-muted)',
            }}
          >
            <i className="fas fa-music mr-1" style={{ color: themeInfo.primaryColor }} />
            白噪音将在后台持续播放
          </div>
        )}
      </div>
    </div>
  );
};

export default WhiteNoisePanel;
