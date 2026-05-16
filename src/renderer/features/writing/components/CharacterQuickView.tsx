import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Character } from '../../../../shared/types';
import { useTheme } from '../../../shared/contexts/ThemeContext';
import { useUIStore } from '../../../shared/stores/uiStore';

interface CharacterQuickViewProps {
  characters: Character[];
  content: string;
  cursorPosition: number;
}

interface MatchedCharacter {
  character: Character;
  position: { start: number; end: number };
}

const CharacterQuickView: React.FC<CharacterQuickViewProps> = ({
  characters,
  content,
  cursorPosition,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const { themeInfo } = useTheme();
  const { animationLevel } = useUIStore();

  const hasAnimations = animationLevel !== 'none';

  const validCharacters = useMemo(() =>
    characters.filter(c => c.name && c.name !== '新角色'),
    [characters]
  );

  const detectedCharacters = useMemo<MatchedCharacter[]>(() => {
    if (!content || validCharacters.length === 0) return [];

    const matches: MatchedCharacter[] = [];
    const textBeforeCursor = content.substring(0, cursorPosition);

    for (const character of validCharacters) {
      if (!character.name) continue;

      const regex = new RegExp(character.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
      let match;

      while ((match = regex.exec(textBeforeCursor)) !== null) {
        const endPos = match.index + match[0].length;
        if (endPos <= textBeforeCursor.length) {
          matches.push({
            character,
            position: { start: match.index, end: endPos },
          });
          break;
        }
      }
    }

    return matches.sort((a, b) => b.position.end - a.position.end);
  }, [content, cursorPosition, validCharacters]);

  const currentCharacter = detectedCharacters[0]?.character || null;

  useEffect(() => {
    if (currentCharacter && !isExpanded) {
      setIsExpanded(true);
      setSelectedCharacter(currentCharacter);
    }
  }, [currentCharacter]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
        setIsExpanded(false);
      }
    };

    if (isExpanded) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isExpanded]);

  if (validCharacters.length === 0) return null;

  const roleColors: Record<string, string> = {
    protagonist: 'bg-violet-500/20 text-violet-300 border-violet-500/30',
    antagonist: 'bg-red-500/20 text-red-300 border-red-500/30',
    supporting: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    minor: 'bg-gray-500/20 text-gray-300 border-gray-500/30',
  };

  const getRoleLabel = (role: string) => {
    const labels: Record<string, string> = {
      protagonist: '主角',
      antagonist: '反派',
      supporting: '配角',
      minor: '龙套',
    };
    return labels[role.toLowerCase()] || role;
  };

  if (!currentCharacter && !isExpanded) return null;

  return (
    <div
      ref={cardRef}
      className={`
        fixed right-4 top-1/3 z-50
        w-72 max-h-96 overflow-hidden
        rounded-xl border
        transition-all duration-300
        ${hasAnimations ? 'animate-fade-in' : ''}
        ${isExpanded
          ? 'opacity-100 translate-x-0'
          : 'opacity-0 translate-x-4 pointer-events-none'
        }
      `}
      style={{
        background: 'var(--glass-bg)',
        backdropFilter: 'blur(16px)',
        borderColor: themeInfo.primaryColor + '30',
      }}
    >
      <div
        className="h-1 w-full"
        style={{
          background: `linear-gradient(90deg, ${themeInfo.primaryColor}, transparent)`,
        }}
      />

      <div className="p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold"
              style={{
                background: `linear-gradient(135deg, ${themeInfo.primaryColor}40, ${themeInfo.primaryColor}20)`,
                color: themeInfo.primaryColor,
              }}
            >
              {selectedCharacter?.name?.[0] || '?'}
            </div>
            <div>
              <div className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>
                {selectedCharacter?.name || '选择角色'}
              </div>
              {selectedCharacter?.role && (
                <span
                  className={`text-xs px-1.5 py-0.5 rounded border ${
                    roleColors[selectedCharacter.role.toLowerCase()] ||
                    roleColors.supporting
                  }`}
                >
                  {getRoleLabel(selectedCharacter.role)}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className={`
              w-6 h-6 rounded-full flex items-center justify-center
              transition-all duration-200
              ${hasAnimations ? 'hover:scale-110' : ''}
            `}
            style={{
              background: 'var(--bg-tertiary)',
              color: 'var(--text-muted)',
            }}
          >
            <i className={`fa-solid ${isExpanded ? 'fa-chevron-up' : 'fa-chevron-down'} text-xs`} />
          </button>
        </div>

        {isExpanded && selectedCharacter && (
          <div
            className={`
              space-y-2 mt-3 pt-3 border-t
              ${hasAnimations ? 'animate-fade-in' : ''}
            `}
            style={{ borderColor: 'var(--border-color)' }}
          >
            {selectedCharacter.personality && (
              <div>
                <div
                  className="text-xs font-medium mb-1"
                  style={{ color: 'var(--text-muted)' }}
                >
                  性格特点
                </div>
                <div
                  className="text-sm leading-relaxed"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {selectedCharacter.personality}
                </div>
              </div>
            )}

            {selectedCharacter.speechStyle && (
              <div>
                <div
                  className="text-xs font-medium mb-1"
                  style={{ color: 'var(--text-muted)' }}
                >
                  说话风格
                </div>
                <div
                  className="text-sm leading-relaxed italic"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  "{selectedCharacter.speechStyle}"
                </div>
              </div>
            )}

            {selectedCharacter.appearance && (
              <div>
                <div
                  className="text-xs font-medium mb-1"
                  style={{ color: 'var(--text-muted)' }}
                >
                  外貌特征
                </div>
                <div
                  className="text-sm leading-relaxed"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {selectedCharacter.appearance}
                </div>
              </div>
            )}

            {selectedCharacter.emotionalPatterns && (
              <div>
                <div
                  className="text-xs font-medium mb-1"
                  style={{ color: 'var(--text-muted)' }}
                >
                  情绪模式
                </div>
                <div
                  className="text-sm leading-relaxed"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {selectedCharacter.emotionalPatterns}
                </div>
              </div>
            )}

            {selectedCharacter.background && (
              <div>
                <div
                  className="text-xs font-medium mb-1"
                  style={{ color: 'var(--text-muted)' }}
                >
                  背景故事
                </div>
                <div
                  className="text-sm leading-relaxed line-clamp-3"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {selectedCharacter.background}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {validCharacters.length > 1 && (
        <div
          className="px-3 pb-2 flex flex-wrap gap-1"
          style={{ borderColor: 'var(--border-color)' }}
        >
          {validCharacters.slice(0, 6).map((char) => (
            <button
              key={char.id}
              onClick={() => {
                setSelectedCharacter(char);
                setIsExpanded(true);
              }}
              className={`
                px-2 py-0.5 rounded text-xs
                transition-all duration-200
                ${selectedCharacter?.id === char.id
                  ? 'ring-1'
                  : 'opacity-60 hover:opacity-100'
                }
                ${hasAnimations ? (selectedCharacter?.id === char.id ? 'scale-105' : 'hover:scale-105') : ''}
              `}
              style={{
                background: selectedCharacter?.id === char.id
                  ? themeInfo.primaryColor + '30'
                  : 'var(--bg-tertiary)',
                color: selectedCharacter?.id === char.id
                  ? themeInfo.primaryColor
                  : 'var(--text-muted)',
              }}
            >
              {char.name}
            </button>
          ))}
          {validCharacters.length > 6 && (
            <span
              className="px-2 py-0.5 rounded text-xs"
              style={{
                background: 'var(--bg-tertiary)',
                color: 'var(--text-muted)'
              }}
            >
              +{validCharacters.length - 6}
            </span>
          )}
        </div>
      )}
    </div>
  );
};

export default CharacterQuickView;
