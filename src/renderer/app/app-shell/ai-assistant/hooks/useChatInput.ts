import { useState, useRef, useCallback, useEffect } from 'react';
import { ModelConfig } from '../../../../../shared/types';
import { aiAssistant } from '../../../../shared/services/AIAssistantService';
import { useAIStatus } from '../../../../shared/contexts/AIStatusContext';

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

export function useChatInput(activeModel: ModelConfig | null, onOpenSettings: () => void) {
  const [input, setInputState] = useState(loadDraft);
  const [attachedFiles, setAttachedFiles] = useState<{ name: string; content: string; size: number }[]>([]);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { setGenerating } = useAIStatus();

  const setInput = useCallback((value: string | ((prev: string) => string)) => {
    if (typeof value === 'function') {
      setInputState(prev => {
        const next = value(prev);
        saveDraft(next);
        return next;
      });
    } else {
      saveDraft(value);
      setInputState(value);
    }
  }, []);

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
  }, [input, attachedFiles, activeModel, onOpenSettings, setGenerating, clearAttachedFiles]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }, [handleSend]);

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

  return {
    input, setInput, attachedFiles, inputRef, fileInputRef,
    handleSend, handleKeyDown, handleFileAttach, removeAttachedFile, clearAttachedFiles,
  };
}
