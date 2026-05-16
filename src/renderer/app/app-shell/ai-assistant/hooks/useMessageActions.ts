import { useState, useCallback } from 'react';
import { ModelConfig } from '../../../../../shared/types';
import { aiAssistant } from '../../../../shared/services/AIAssistantService';
import { useAIStatus } from '../../../../shared/contexts/AIStatusContext';

export function useMessageActions(activeModel: ModelConfig | null) {
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const [copyToast, setCopyToast] = useState<string | null>(null);
  const { setGenerating } = useAIStatus();

  const handleCopy = useCallback((content: string, msgId: string) => {
    navigator.clipboard.writeText(content).then(() => {
      setCopyToast(msgId);
      setTimeout(() => setCopyToast(null), 1500);
    });
  }, []);

  const handleEdit = useCallback((msgId: string, content: string) => {
    setEditingMsgId(msgId);
    setEditContent(content);
  }, []);

  const handleEditCancel = useCallback(() => {
    setEditingMsgId(null);
    setEditContent('');
  }, []);

  const handleEditSubmit = useCallback(() => {
    if (!editingMsgId || !editContent.trim() || !activeModel?.modelName) return;
    setGenerating(activeModel.name, 'AI 助手执行中...', 'ai-assistant');
    aiAssistant.editAndResend(editingMsgId, editContent.trim(), activeModel);
    setEditingMsgId(null);
    setEditContent('');
  }, [editingMsgId, editContent, activeModel, setGenerating]);

  const handleRegenerate = useCallback(() => {
    if (!activeModel?.modelName) return;
    setGenerating(activeModel.name, 'AI 助手执行中...', 'ai-assistant');
    aiAssistant.regenerateLast(activeModel);
  }, [activeModel, setGenerating]);

  const toggleCollapse = useCallback((msgId: string) => {
    setCollapsedIds(prev => {
      const next = new Set(prev);
      if (next.has(msgId)) next.delete(msgId); else next.add(msgId);
      return next;
    });
  }, []);

  const isLongContent = (text: string) => text.length > 300;

  return {
    editingMsgId, editContent, setEditContent, collapsedIds, copyToast,
    handleCopy, handleEdit, handleEditCancel, handleEditSubmit, handleRegenerate, toggleCollapse, isLongContent,
  };
}
