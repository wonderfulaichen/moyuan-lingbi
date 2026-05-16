import { Character } from '../../shared/types';

export type ConsistencyIssueType = 'personality' | 'speech' | 'behavior' | 'appearance';

export interface ConsistencyIssue {
  id: string;
  type: ConsistencyIssueType;
  severity: 'low' | 'medium' | 'high';
  characterName: string;
  description: string;
  suggestion: string;
  context: {
    text: string;
    line: number;
    position: { start: number; end: number };
  };
}

interface PersonalityTrait {
  trait: string;
  keywords: string[];
  conflictingKeywords: string[];
}

const PERSONALITY_TRAITS: Record<string, PersonalityTrait> = {
  gentle: {
    trait: '温柔',
    keywords: ['温柔', '温和', '体贴', '善良', '和蔼', '慈祥', '宽厚', '宽容'],
    conflictingKeywords: ['暴躁', '粗鲁', '蛮横', '刻薄', '冷酷', '残忍', '恶毒'],
  },
  hotheaded: {
    trait: '暴躁',
    keywords: ['暴躁', '易怒', '火爆', '冲动', '急躁', '鲁莽', '火气大'],
    conflictingKeywords: ['冷静', '沉稳', '温和', '耐心', '平和'],
  },
  intelligent: {
    trait: '聪明',
    keywords: ['聪明', '机智', '睿智', '精明', '敏锐', '洞察', '深刻'],
    conflictingKeywords: ['愚蠢', '笨', '迟钝', '愚昧', '糊涂'],
  },
  arrogant: {
    trait: '傲慢',
    keywords: ['傲慢', '自大', '自负', '目中无人', '嚣张', '狂妄'],
    conflictingKeywords: ['谦虚', '谦逊', '低调', '谦和', '虚心'],
  },
  kind: {
    trait: '善良',
    keywords: ['善良', '好心', '好心肠', '乐于助人', '慷慨', '无私'],
    conflictingKeywords: ['恶毒', '残忍', '自私', '刻薄', '无情'],
  },
  cowardly: {
    trait: '胆小',
    keywords: ['胆小', '懦弱', '害怕', '恐惧', '退缩', '畏缩'],
    conflictingKeywords: ['勇敢', '无畏', '大胆', '勇猛', '英勇'],
  },
  confident: {
    trait: '自信',
    keywords: ['自信', '坚定', '从容', '镇定', '有信心'],
    conflictingKeywords: ['自卑', '胆怯', '犹豫', '不安'],
  },
  shy: {
    trait: '害羞',
    keywords: ['害羞', '腼腆', '内向', '含蓄', '羞涩'],
    conflictingKeywords: ['外向', '开朗', '大方', '健谈'],
  },
  honest: {
    trait: '诚实',
    keywords: ['诚实', '正直', '真诚', '坦率', '直言'],
    conflictingKeywords: ['撒谎', '虚伪', '狡猾', '欺骗', '隐瞒'],
  },
  loyal: {
    trait: '忠诚',
    keywords: ['忠诚', '忠心', '可靠', '守信', '坚定'],
    conflictingKeywords: ['背叛', '不忠', '变心', '不可靠'],
  },
};

const SPEECH_PATTERNS: Record<string, { keywords: string[]; description: string }> = {
  formal: {
    keywords: ['阁下', '尊驾', '贵方', '在下', '鄙人', '承蒙', '谨此', '恭请'],
    description: '正式用语',
  },
  casual: {
    keywords: ['嗨', '喂', '哈', '哟', '嘛', '呗', '嘞', '哒'],
    description: '口语化表达',
  },
  archaic: {
    keywords: ['之', '乎', '者', '也', '矣', '哉', '焉', '乎哉'],
    description: '古文风格',
  },
  modern: {
    keywords: ['OK', 'okay', '搞', '整', '怼', '躺平', '内卷'],
    description: '现代网络用语',
  },
};

class ConsistencyService {
  private generateId(): string {
    return `issue-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private extractDialogues(text: string): Array<{ text: string; line: number; position: { start: number; end: number } }> {
    const dialogues: Array<{ text: string; line: number; position: { start: number; end: number } }> = [];
    const lines = text.split('\n');
    let charOffset = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const dialogueMatch = line.match(/[「"『]([^「"』]+)[」"』]/);
      
      if (dialogueMatch) {
        const startInLine = line.indexOf(dialogueMatch[0]);
        dialogues.push({
          text: dialogueMatch[1],
          line: i + 1,
          position: {
            start: charOffset + startInLine,
            end: charOffset + startInLine + dialogueMatch[0].length,
          },
        });
      }
      
      charOffset += line.length + 1;
    }

    return dialogues;
  }

  private findCharacterByName(characters: Character[], name: string): Character | undefined {
    return characters.find(char => 
      char.name && name.includes(char.name) || 
      char.name && char.name.includes(name)
    );
  }

  private detectPersonalityConflict(character: Character, text: string): string | null {
    if (!character.personality) return null;

    const personalityLower = character.personality.toLowerCase();
    const textLower = text.toLowerCase();

    for (const [key, trait] of Object.entries(PERSONALITY_TRAITS)) {
      if (personalityLower.includes(trait.trait)) {
        for (const keyword of trait.conflictingKeywords) {
          if (textLower.includes(keyword)) {
            return `${character.name}的性格设定是${trait.trait}，但对话中出现了"${keyword}"这样的描述，可能存在性格不一致。`;
          }
        }
      }
    }

    return null;
  }

  private detectSpeechStyleConflict(character: Character, text: string): string | null {
    if (!character.speechStyle) return null;

    const speechStyle = character.speechStyle.toLowerCase();
    const textLower = text.toLowerCase();

    let detectedStyle: string | null = null;

    for (const [key, pattern] of Object.entries(SPEECH_PATTERNS)) {
      if (pattern.keywords.some(k => textLower.includes(k))) {
        detectedStyle = pattern.description;
        break;
      }
    }

    if (detectedStyle) {
      const isFormal = speechStyle.includes('正式') || speechStyle.includes('文雅') || speechStyle.includes('礼貌');
      const isCasual = speechStyle.includes('随意') || speechStyle.includes('口语') || speechStyle.includes('直率');
      const isArchaic = speechStyle.includes('古风') || speechStyle.includes('文言') || speechStyle.includes('古典');

      if (isFormal && detectedStyle === '口语化表达') {
        return `${character.name}的说话风格设定为正式文雅，但这段对话显得比较口语化。`;
      }
      if (isCasual && detectedStyle === '正式用语') {
        return `${character.name}的说话风格设定为随意口语化，但这段对话显得过于正式。`;
      }
      if (isArchaic && detectedStyle === '现代网络用语') {
        return `${character.name}的说话风格设定为古风，但对话中出现了现代用语。`;
      }
    }

    return null;
  }

  private detectBehaviorConflict(character: Character, text: string): string | null {
    if (!character.emotionalPatterns) return null;

    const emotions = character.emotionalPatterns.toLowerCase();
    const textLower = text.toLowerCase();

    if (emotions.includes('冷静') && textLower.includes('暴怒')) {
      return `${character.name}的情绪模式设定为冷静，但对话中表现出暴怒的情绪。`;
    }
    if (emotions.includes('温和') && textLower.includes('怒吼')) {
      return `${character.name}的情绪模式设定为温和，但对话中出现怒吼的行为。`;
    }
    if (emotions.includes('胆小') && textLower.includes('勇敢')) {
      return `${character.name}的性格设定为胆小，但行为表现得很勇敢。`;
    }
    if (emotions.includes('自私') && textLower.includes('无私')) {
      return `${character.name}的性格设定为自私，但行为表现得很无私。`;
    }

    return null;
  }

  private detectCharacterNameInText(text: string, characters: Character[]): Array<{ character: Character; matches: Array<{ start: number; end: number; text: string }> }> {
    const results: Array<{ character: Character; matches: Array<{ start: number; end: number; text: string }> }> = [];

    for (const character of characters) {
      if (!character.name) continue;

      const matches: Array<{ start: number; end: number; text: string }> = [];
      const regex = new RegExp(character.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      let match;

      while ((match = regex.exec(text)) !== null) {
        matches.push({
          start: match.index,
          end: match.index + match[0].length,
          text: match[0],
        });
      }

      if (matches.length > 0) {
        results.push({ character, matches });
      }
    }

    return results;
  }

  checkConsistency(text: string, characters: Character[]): ConsistencyIssue[] {
    const issues: ConsistencyIssue[] = [];

    const charMatches = this.detectCharacterNameInText(text, characters);

    for (const { character, matches } of charMatches) {
      const dialogues = this.extractDialogues(text);

      for (const dialogue of dialogues) {
        const personalityIssue = this.detectPersonalityConflict(character, dialogue.text);
        if (personalityIssue) {
          issues.push({
            id: this.generateId(),
            type: 'personality',
            severity: 'high',
            characterName: character.name || '',
            description: personalityIssue,
            suggestion: `建议检查${character.name}的性格设定是否与当前行为相符。`,
            context: dialogue,
          });
        }

        const speechIssue = this.detectSpeechStyleConflict(character, dialogue.text);
        if (speechIssue) {
          issues.push({
            id: this.generateId(),
            type: 'speech',
            severity: 'medium',
            characterName: character.name || '',
            description: speechIssue,
            suggestion: `建议调整对话风格以符合${character.name}的说话设定。`,
            context: dialogue,
          });
        }

        const behaviorIssue = this.detectBehaviorConflict(character, dialogue.text);
        if (behaviorIssue) {
          issues.push({
            id: this.generateId(),
            type: 'behavior',
            severity: 'medium',
            characterName: character.name || '',
            description: behaviorIssue,
            suggestion: `建议确认${character.name}的行为是否符合其性格设定。`,
            context: dialogue,
          });
        }
      }
    }

    for (const character of characters) {
      if (!character.appearance) continue;

      const appearanceWords = character.appearance.toLowerCase().split(/[，,。.、\s]+/);
      const textLower = text.toLowerCase();

      for (const word of appearanceWords) {
        if (word.length < 2) continue;
        
        if (!textLower.includes(word)) {
          issues.push({
            id: this.generateId(),
            type: 'appearance',
            severity: 'low',
            characterName: character.name || '',
            description: `${character.name}的外貌特征中提到了"${word}"，但当前内容中没有体现。`,
            suggestion: `可以考虑在描写中加入${character.name}的外貌特征。`,
            context: {
              text: text.substring(0, 50) + '...',
              line: 1,
              position: { start: 0, end: 50 },
            },
          });
        }
      }
    }

    return issues;
  }

  getIssueTypeLabel(type: ConsistencyIssueType): string {
    const labels: Record<ConsistencyIssueType, string> = {
      personality: '性格一致性',
      speech: '对话风格',
      behavior: '行为逻辑',
      appearance: '外貌描写',
    };
    return labels[type];
  }

  getSeverityLabel(severity: ConsistencyIssue['severity']): string {
    const labels: Record<ConsistencyIssue['severity'], string> = {
      low: '建议',
      medium: '注意',
      high: '警告',
    };
    return labels[severity];
  }

  getSeverityColor(severity: ConsistencyIssue['severity']): string {
    const colors: Record<ConsistencyIssue['severity'], string> = {
      low: '#22c55e',
      medium: '#f59e0b',
      high: '#ef4444',
    };
    return colors[severity];
  }
}

export const consistencyService = new ConsistencyService();
