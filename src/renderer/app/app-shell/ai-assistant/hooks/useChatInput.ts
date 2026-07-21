import { useState, useRef, useCallback, useEffect } from 'react';
import { ModelConfig } from '../../../../../shared/types';
import type { AIAgent } from '../../../../../shared/types/fileSystem';
import { aiAssistant } from '../../../../shared/services/AIAssistantService';
import { useAIStatus } from '../../../../shared/contexts/AIStatusContext';
import { useSlashCommand } from './useSlashCommand';
import type { OverlayItem } from './useSlashCommand';

const DRAFT_KEY = 'moyuan-chat-draft';

function saveDraft(text: string): void {
  try {
    if (text.trim()) {
      localStorage.setItem(DRAFT_KEY, text);
    } else {
      localStorage.removeItem(DRAFT_KEY);
    }
  } catch {}
}

function loadDraft(): string {
  try {
    return localStorage.getItem(DRAFT_KEY) || '';
  } catch {
    return '';
  }
}

function clearDraft(): void {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {}
}

export function useChatInput(activeModel: ModelConfig | null, onOpenSettings: () => void, agents: AIAgent[]) {
  const [input, setInputState] = useState(loadDraft);
  const [attachedFiles, setAttachedFiles] = useState<{ name: string; content: string; size: number }[]>([]);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { setGenerating } = useAIStatus();

  // 快捷指令解析
  const slashCommand = useSlashCommand({ agents });

  const setInput = useCallback((value: string | ((prev: string) => string)) => {
    if (typeof value === 'function') {
      setInputState(prev => {
        const next = value(prev);
        saveDraft(next);
        // 解析新值以更新浮层
        slashCommand.parseInput(next);
        return next;
      });
    } else {
      saveDraft(value);
      setInputState(value);
      slashCommand.parseInput(value);
    }
  }, [slashCommand]);

  const clearAttachedFiles = useCallback(() => {
    setAttachedFiles([]);
  }, []);

  const handleSend = useCallback(() => {
    if (!input.trim() && attachedFiles.length === 0) return;
    if (!activeModel?.modelName) { onOpenSettings(); return; }
    setGenerating(activeModel.name, 'AI 助手执行中...', 'ai-assistant');
    let finalInput = input.trim();
    if (attachedFiles.length > 0) {
      const fileContext = attachedFiles.map(f => `【附件：${f.name}】\n${f.content}`).join('\n\n---\n\n');
      finalInput = `${fileContext}\n\n${finalInput || '请分析以上文件内容'}`;
      clearAttachedFiles();
    }
    aiAssistant.sendMessage(finalInput, activeModel);
    setInput('');
    clearDraft();
    slashCommand.close();
  }, [input, attachedFiles, activeModel, onOpenSettings, setGenerating, clearAttachedFiles, slashCommand]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // 优先交给快捷指令浮层处理（↑↓/Esc/Enter）
    if (slashCommand.handleKeyDown(e)) return;
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }, [handleSend, slashCommand]);

  const handleFileAttach = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach(file => {
      if (file.size > 5 * 1024 * 1024) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const content = ev.target?.result as string;
        setAttachedFiles(prev => [...prev, { name: file.name, content, size: file.size }]);
      };
      reader.readAsText(file);
    });
    e.target.value = '';
  }, []);

  const removeAttachedFile = useCallback((idx: number) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== idx));
  }, []);

  // ============================================================
  // 快捷指令执行：消费 lastAction
  // ============================================================
  //
  // BUG 修复：原实现依赖 [slashCommand, setInput]，而 slashCommand 每次渲染都是
  // 新对象（useSlashCommand 返回未 memo 的对象），导致 effect 每次渲染都执行。
  // 又因为 lastAction 从不清除，action 被无限重复消费 → 内存溢出/浏览器卡死。
  //
  // 修复方案：用 ref 跟踪已消费的 timestamp，跳过已处理的 action。
  // 保留原依赖数组以避免 ESLint 误报（close/setInput 均为稳定回调）。

  const consumedTimestampRef = useRef<number | null>(null);

  useEffect(() => {
    if (!slashCommand.lastAction) return;
    const { action, data, timestamp } = slashCommand.lastAction;
    // 跳过已消费的 action（防止无限循环）
    if (consumedTimestampRef.current === timestamp) return;
    consumedTimestampRef.current = timestamp;

    switch (action) {
      case 'clear':
        aiAssistant.clearChat();
        setInput('');
        clearDraft();
        slashCommand.close();
        break;
      case 'new':
        aiAssistant.newConversation();
        setInput('');
        clearDraft();
        slashCommand.close();
        break;
      case 'switchAgent':
        if (data) {
          aiAssistant.switchAgent(data);
          setInput('');
          clearDraft();
        }
        slashCommand.close();
        break;
      case 'help':
        // /help 浮层已经展示，不做后续操作
        break;
      case 'noop':
      default:
        break;
    }
  }, [slashCommand, setInput]);

  /** 鼠标点击浮层项时执行 */
  const handleSelectItem = useCallback((item: OverlayItem) => {
    slashCommand.selectItem(item);
  }, [slashCommand]);

  return {
    input, setInput, attachedFiles, inputRef, fileInputRef,
    handleSend, handleKeyDown, handleFileAttach, removeAttachedFile, clearAttachedFiles,
    // 快捷指令相关
    slashCommand,
    handleSelectItem,
  };
}
