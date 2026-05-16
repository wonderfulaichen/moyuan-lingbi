export type WellnessMessageType = 'encouragement' | 'break' | 'milestone' | 'fatigue' | 'creativity';

export interface WellnessMessage {
  id: string;
  type: WellnessMessageType;
  title: string;
  message: string;
  icon: string;
  color: string;
  action?: string;
}

export interface WritingStats {
  sessionStartTime: number;
  totalWords: number;
  lastActivityTime: number;
  breakCount: number;
  milestoneReached: number[];
}

const ENCOURAGEMENT_MESSAGES: Array<{ title: string; message: string }> = [
  { title: '写得真棒！', message: '每一个字都是通往好故事的砖石，继续加油！' },
  { title: '灵感在流淌', message: '你的文字充满生命力，保持这个节奏！' },
  { title: '渐入佳境', message: '故事的轮廓越来越清晰了，相信自己！' },
  { title: '创作力满满', message: '今天的你特别有创造力，享受这个过程吧！' },
  { title: '笔下生辉', message: '你的文字正在构建一个精彩的世界！' },
  { title: '文思泉涌', message: '思路清晰，表达流畅，继续保持！' },
  { title: '匠心独运', message: '每一个细节的打磨都让作品更加出色！' },
  { title: '笔耕不辍', message: '坚持就是胜利，你的努力终将开花结果！' },
];

const BREAK_REMINDERS: Array<{ title: string; message: string }> = [
  { title: '该休息一下了', message: '你已经专注写作一段时间了，起来活动活动吧！' },
  { title: '眼睛需要放松', message: '远眺一下窗外的风景，让眼睛休息片刻。' },
  { title: '喝杯水吧', message: '保持水分充足有助于保持清晰的思维。' },
  { title: '伸展一下', message: '简单的伸展运动可以缓解久坐的疲劳。' },
  { title: '深呼吸', message: '闭上眼睛，做几次深呼吸，让大脑充氧。' },
];

const MILESTONE_MESSAGES: Record<number, { title: string; message: string }> = {
  100: { title: '突破100字！', message: '好的开始是成功的一半，继续写下去！' },
  500: { title: '突破500字！', message: '已经写了这么多，故事正在成形！' },
  1000: { title: '突破1000字！', message: '千字里程碑达成，你的坚持令人敬佩！' },
  2000: { title: '突破2000字！', message: '两千字！这是一个充实的写作 session！' },
  5000: { title: '突破5000字！', message: '五千字！今天的创作量令人惊艳！' },
  10000: { title: '突破10000字！', message: '一万字！你是真正的写作战士！' },
};

const FATIGUE_MESSAGES: Array<{ title: string; message: string }> = [
  { title: '感觉有些累了？', message: '写作是马拉松，不是短跑。适当休息，回来会更好。' },
  { title: '瓶颈期很正常', message: '每个创作者都会遇到，放轻松，灵感会回来的。' },
  { title: '不要给自己太大压力', message: '写作应该是一件快乐的事，慢慢来。' },
  { title: '你已经很棒了', message: '无论写多少，重要的是你在创作，这本身就值得骄傲。' },
  { title: '休息一下再出发', message: '有时候最好的创作来自充分的休息。' },
];

const CREATIVITY_BOOSTERS: Array<{ title: string; message: string }> = [
  { title: '换个角度试试？', message: '如果卡住了，试着从角色的视角重新思考这段情节。' },
  { title: '添加一些冲突', message: '故事需要张力，考虑一下让主角面临什么挑战？' },
  { title: '描写感官细节', message: '试着加入一些视觉、听觉或嗅觉的细节描写。' },
  { title: '让人物对话', message: '对话可以展现性格，试试让人物说点什么？' },
  { title: '回忆一下初衷', message: '这个故事最初打动你的是什么？试着找回那种感觉。' },
];

class WellnessService {
  private sessionStartTime: number = Date.now();
  private lastActivityTime: number = Date.now();
  private totalWords: number = 0;
  private breakCount: number = 0;
  private milestoneReached: Set<number> = new Set();
  private lastMessageTime: number = 0;
  private messageCooldown: number = 5 * 60 * 1000; // 5分钟冷却

  startSession(): void {
    this.sessionStartTime = Date.now();
    this.lastActivityTime = Date.now();
    this.totalWords = 0;
    this.breakCount = 0;
    this.milestoneReached.clear();
    this.lastMessageTime = 0;
  }

  updateActivity(wordCount: number): void {
    this.lastActivityTime = Date.now();
    
    const previousWords = this.totalWords;
    this.totalWords = wordCount;
    
    // 检查里程碑
    for (const milestone of [100, 500, 1000, 2000, 5000, 10000]) {
      if (wordCount >= milestone && previousWords < milestone && !this.milestoneReached.has(milestone)) {
        this.milestoneReached.add(milestone);
      }
    }
  }

  recordBreak(): void {
    this.breakCount++;
    this.lastActivityTime = Date.now();
  }

  getSessionDuration(): number {
    return Date.now() - this.sessionStartTime;
  }

  getIdleTime(): number {
    return Date.now() - this.lastActivityTime;
  }

  getStats(): WritingStats {
    return {
      sessionStartTime: this.sessionStartTime,
      totalWords: this.totalWords,
      lastActivityTime: this.lastActivityTime,
      breakCount: this.breakCount,
      milestoneReached: Array.from(this.milestoneReached),
    };
  }

  private canShowMessage(): boolean {
    return Date.now() - this.lastMessageTime > this.messageCooldown;
  }

  private markMessageShown(): void {
    this.lastMessageTime = Date.now();
  }

  checkForMessages(): WellnessMessage | null {
    if (!this.canShowMessage()) return null;

    const sessionDuration = this.getSessionDuration();
    const idleTime = this.getIdleTime();

    // 长时间未活动（疲劳检测）
    if (idleTime > 10 * 60 * 1000 && sessionDuration > 30 * 60 * 1000) {
      this.markMessageShown();
      const msg = FATIGUE_MESSAGES[Math.floor(Math.random() * FATIGUE_MESSAGES.length)];
      return {
        id: `fatigue-${Date.now()}`,
        type: 'fatigue',
        title: msg.title,
        message: msg.message,
        icon: 'fa-bed',
        color: '#f59e0b',
        action: '休息一下',
      };
    }

    // 连续写作1小时提醒休息
    if (sessionDuration > 60 * 60 * 1000 && this.breakCount === 0) {
      this.markMessageShown();
      const msg = BREAK_REMINDERS[Math.floor(Math.random() * BREAK_REMINDERS.length)];
      return {
        id: `break-${Date.now()}`,
        type: 'break',
        title: msg.title,
        message: msg.message,
        icon: 'fa-coffee',
        color: '#3b82f6',
        action: '去休息',
      };
    }

    // 检查里程碑
    for (const milestone of [10000, 5000, 2000, 1000, 500, 100]) {
      if (this.milestoneReached.has(milestone) && this.canShowMessage()) {
        this.milestoneReached.delete(milestone);
        this.markMessageShown();
        const msg = MILESTONE_MESSAGES[milestone];
        return {
          id: `milestone-${milestone}-${Date.now()}`,
          type: 'milestone',
          title: msg.title,
          message: msg.message,
          icon: 'fa-trophy',
          color: '#8b5cf6',
        };
      }
    }

    // 随机鼓励（每30分钟）
    if (sessionDuration > 30 * 60 * 1000 && Math.random() < 0.3) {
      this.markMessageShown();
      const msg = ENCOURAGEMENT_MESSAGES[Math.floor(Math.random() * ENCOURAGEMENT_MESSAGES.length)];
      return {
        id: `encouragement-${Date.now()}`,
        type: 'encouragement',
        title: msg.title,
        message: msg.message,
        icon: 'fa-heart',
        color: '#ec4899',
      };
    }

    // 创意提示（长时间未突破）
    if (sessionDuration > 45 * 60 * 1000 && this.totalWords < 500) {
      this.markMessageShown();
      const msg = CREATIVITY_BOOSTERS[Math.floor(Math.random() * CREATIVITY_BOOSTERS.length)];
      return {
        id: `creativity-${Date.now()}`,
        type: 'creativity',
        title: msg.title,
        message: msg.message,
        icon: 'fa-lightbulb',
        color: '#10b981',
        action: '试试看',
      };
    }

    return null;
  }

  getRandomEncouragement(): WellnessMessage {
    const msg = ENCOURAGEMENT_MESSAGES[Math.floor(Math.random() * ENCOURAGEMENT_MESSAGES.length)];
    return {
      id: `encouragement-${Date.now()}`,
      type: 'encouragement',
      title: msg.title,
      message: msg.message,
      icon: 'fa-heart',
      color: '#ec4899',
    };
  }

  formatDuration(ms: number): string {
    const minutes = Math.floor(ms / 60000);
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    
    if (hours > 0) {
      return `${hours}小时${remainingMinutes}分钟`;
    }
    return `${minutes}分钟`;
  }
}

export const wellnessService = new WellnessService();
