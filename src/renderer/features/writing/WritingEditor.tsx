import React, { useState, useCallback, useRef } from 'react';
import { Project, ModelConfig, PromptTemplate } from '../../../shared/types';
import { aiService } from '../../shared/services/aiService';
import { useAIStatus } from '../../shared/contexts/AIStatusContext';
import AIProgressButton from '../../shared/components/AIProgressButton';
import { useToast } from '../../shared/contexts/ToastContext';

interface WritingEditorProps {
  project: Project;
  prompts: PromptTemplate[];
  activeModel: ModelConfig;
  onUpdate: (updates: Partial<Project>) => void;
  onOpenSettings: () => void;
  editingChapterId: string | null;
  onBackToChapters: () => void;
}

const WritingEditor: React.FC<WritingEditorProps> = ({
  project,
  prompts,
  activeModel,
  onUpdate,
  onOpenSettings,
  editingChapterId,
  onBackToChapters,
}) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedPromptId, setSelectedPromptId] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const { setGenerating, setProgress, setStatusMessage, setComplete, setError, status } = useAIStatus();
  const { showToast } = useToast();

  const editingChapter = project.chapters.find(c => c.id === editingChapterId);
  const writingPrompts = prompts.filter(p => p.category === 'writing');
  const editPrompts = prompts.filter(p => p.category === 'edit');

  // 自动选择第一个提示词模板
  React.useEffect(() => {
    if (writingPrompts.length > 0 && !selectedPromptId) {
      setSelectedPromptId(writingPrompts[0].id);
    }
  }, [writingPrompts, selectedPromptId]);

  const handleContentChange = (content: string) => {
    if (!editingChapterId) return;
    onUpdate({
      chapters: project.chapters.map(c =>
        c.id === editingChapterId ? { ...c, content } : c
      ),
    });
  };

  // ---------- AI 续写 ----------
  const handleGenerate = useCallback(async () => {
    if (!activeModel || !editingChapter) {
      showToast('请先配置AI模型', 'warning');
      return;
    }
    if (!selectedPromptId) {
      showToast('请选择一个写作模板', 'warning');
      return;
    }
    const template = prompts.find(p => p.id === selectedPromptId);
    if (!template) return;

    setIsGenerating(true);
    const taskId = `writing-${Date.now()}`;
    setGenerating(activeModel.name, 'AI 续写中...', taskId);

    // 构建上下文 - 整合所有可用信息
    const existingContent = editingChapter.content || '';
    const summary = editingChapter.summary || '';

    // 角色清单：包含性格/背景等关键信息
    const charContext = project.characters.length > 0
      ? '\n角色设定：\n' + project.characters
          .filter(c => c.name !== '新角色')
          .map(c => {
            const parts = [`- ${c.name}（${c.role}）`];
            if (c.personality) parts.push(`性格：${c.personality}`);
            if (c.background) parts.push(`背景：${c.background.slice(0, 100)}`);
            if (c.motivation) parts.push(`动机：${c.motivation}`);
            return parts.join('\n  ');
          })
          .join('\n')
      : '';

    // 地点清单：包含描述
    const locationContext = project.locations.length > 0
      ? '\n重要地点：\n' + project.locations
          .filter(l => l.name !== '新地点')
          .map(l => `- ${l.name}${l.description ? `：${l.description.slice(0, 80)}` : ''}`)
          .join('\n')
      : '';

    // 当前编辑章节之前的章节细纲（提供上下文连贯性）
    const prevChapterContext = (() => {
      const sorted = [...project.chapters].sort((a, b) => a.order - b.order);
      const idx = sorted.findIndex(c => c.id === editingChapterId);
      if (idx > 0) {
        const prev = sorted[idx - 1];
        return `\n上一章概要：第${prev.order + 1}章「${prev.title}」- ${(prev.summary || '').slice(0, 200)}`;
      }
      return '';
    })();

    // 处理模板占位符
    let promptContent = template.content
      .replace('{title}', project.title)
      .replace('{outline}', project.outline || '暂无')
      .replace('{summary}', summary)
      .replace('{content}', existingContent)
      .replace('{characters}', charContext)
      .replace('{locations}', locationContext);

    // 追加综合上下文
    promptContent += prevChapterContext;
    promptContent += locationContext;
    if (existingContent.length > 0) {
      promptContent += `\n\n## 已写内容（最近3000字）\n${existingContent.slice(-3000)}\n\n请以上述已写内容的结尾为起点进行续写，保持人物性格、叙事视角和行文风格严格一致。`;
    } else {
      promptContent += `\n\n请从零开始创作本章内容，严格按照章节细纲推进情节，注重人物对话的个性化和场景描写的画面感。`;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    let accumulatedContent = existingContent;

    try {
      await aiService.generateWithContext(
        { model: activeModel, prompt: promptContent, signal: controller.signal },
        (response) => {
          if (response.content) {
            const newContent = response.content;
            const merged = existingContent
              ? existingContent + '\n\n' + newContent
              : newContent;
            handleContentChange(merged);
            setStatusMessage(`AI 写作中... (${newContent.length} 字符)`);
          }
          if (response.isComplete) {
            setComplete();
            setIsGenerating(false);
          }
          if (response.error) {
            setError(response.error);
            setIsGenerating(false);
          }
        },
        taskId
      );
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setError(err.message || '续写失败');
        setIsGenerating(false);
      }
    }
  }, [activeModel, editingChapter, project, selectedPromptId, prompts, onUpdate, editingChapterId, setGenerating, setStatusMessage, setComplete, setError]);

  // ---------- AI 编辑（润色/扩写等）----------
  const handleEditAction = useCallback(async (template: PromptTemplate) => {
    if (!activeModel || !editingChapter) {
      showToast('请先配置AI模型', 'warning');
      return;
    }
    setIsGenerating(true);
    const taskId = `edit-${Date.now()}`;
    setGenerating(activeModel.name, `AI ${template.name}中...`, taskId);

    const charContext = project.characters.length > 0
      ? '\n角色：' + project.characters.map(c => c.name).join('、')
      : '';

    let promptContent = template.content
      .replace('{title}', project.title)
      .replace('{content}', editingChapter.content || '')
      .replace('{characters}', charContext);

    try {
      await aiService.generateWithContext(
        { model: activeModel, prompt: promptContent },
        (response) => {
          if (response.content && response.isComplete) {
            handleContentChange(response.content);
            setComplete();
            setIsGenerating(false);
          }
          if (response.error) {
            setError(response.error);
            setIsGenerating(false);
          }
        },
        taskId
      );
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setError(err.message || '编辑失败');
        setIsGenerating(false);
      }
    }
  }, [activeModel, editingChapter, project, onUpdate, editingChapterId, setGenerating, setComplete, setError]);

  const handleAbort = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    aiService.abort();
    setIsGenerating(false);
  }, []);

  if (!editingChapter) {
    return (
      <div className="flex flex-col items-center justify-center h-full" style={{ color: 'var(--color-text-tertiary)' }}>
        <i className="fas fa-pen-nib text-5xl mb-4" style={{ color: 'var(--color-primary-200)', opacity: 0.5 }}></i>
        <p className="font-bold text-lg">请从章节细纲中选择一个章节进行写作</p>
        <button
          onClick={onBackToChapters}
          className="mt-4 px-6 py-2.5 text-white rounded-xl transition-all duration-300 card-float-hover"
          style={{ background: `linear-gradient(135deg, var(--color-primary-500), var(--color-primary-600))` }}
        >
          返回章节列表
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* 主编辑区 */}
      <div className="flex-1 flex flex-col">
        {/* 顶部工具栏 */}
        <div className="flex items-center justify-between px-6 py-3 border-b header-glass">
          <div className="flex items-center gap-3">
            <button
              onClick={onBackToChapters}
              className="text-gray-400 hover:text-theme-primary transition-colors"
            >
              <i className="fas fa-arrow-left mr-2"></i>
              <span className="text-sm">返回章节</span>
            </button>
            <div className="h-4 w-px bg-white/10"></div>
            <span className="text-sm font-bold" style={{ color: 'var(--color-text-primary)' }}>{editingChapter.title}</span>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={selectedPromptId}
              onChange={(e) => setSelectedPromptId(e.target.value)}
              className="neumorphic-input rounded-lg px-3 py-1.5 text-xs appearance-none cursor-pointer pr-6"
              style={{ color: 'var(--color-text-secondary)' }}>
              {writingPrompts.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            {isGenerating ? (
              <button onClick={handleAbort}
                className="px-3 py-1.5 text-xs text-red-400 rounded-lg border border-red-400/30 hover:bg-red-400/10 transition-colors">
                <i className="fas fa-stop mr-1"></i>停止
              </button>
            ) : (
              <AIProgressButton
                onClick={handleGenerate}
                isGenerating={false}
                progress={0}
                label="AI续写"
                icon="fa-magic"
                disabled={!activeModel}
              />
            )}
          </div>
        </div>

        {/* 编辑区 - 电子墨水屏风格 */}
        <div className="flex-1 overflow-y-auto p-8">
          <div className="max-w-3xl mx-auto eink-output">
            <textarea
              value={editingChapter.content}
              onChange={(e) => handleContentChange(e.target.value)}
              placeholder="开始你的创作...&#10;&#10;你可以直接在这里写作，也可以使用AI辅助生成内容。"
              className="eink-textarea"
            />
            {isGenerating && (
              <div className="flex items-center gap-2 mt-3 text-xs" style={{ color: 'var(--color-primary-400)' }}>
                <i className="fas fa-spinner fa-spin"></i>
                <span>AI 正在续写中...</span>
              </div>
            )}
          </div>
        </div>

        {/* 底部状态栏 */}
        <div className="flex items-center justify-between px-6 py-2 border-t border-white/5 header-glass text-xs"
          style={{ color: 'var(--color-text-tertiary)' }}>
          <span>字数：{editingChapter.content.length}</span>
          <span>章节：{editingChapter.title}</span>
        </div>
      </div>

      {/* 右侧面板 - 章节细纲参考 (玻璃卡片) */}
      <div className="w-72 border-l border-white/5 flex flex-col shrink-0 glass-card rounded-none border-t-0 border-b-0 border-r-0">
        <div className="p-4 border-b border-white/5">
          <h3 className="text-sm font-bold" style={{ color: 'var(--color-text-secondary)' }}>章节细纲</h3>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <div className="text-sm whitespace-pre-wrap" style={{ color: 'var(--color-text-tertiary)' }}>
            {editingChapter.summary || '暂无细纲内容'}
          </div>
        </div>

        <div className="p-4 border-t border-white/5">
          <h3 className="text-sm font-bold mb-2" style={{ color: 'var(--color-text-secondary)' }}>编辑工具</h3>
          <div className="space-y-2">
            {editPrompts.length === 0 ? (
              <p className="text-xs text-gray-600 italic">无可用编辑模板</p>
            ) : (
              editPrompts.map(p => (
                <button
                  key={p.id}
                  onClick={() => handleEditAction(p)}
                  disabled={isGenerating || !activeModel}
                  className="w-full text-left px-3 py-2 text-xs rounded-xl transition-all card-float-hover disabled:opacity-40"
                  style={{ color: 'var(--color-text-tertiary)' }}
                >
                  <i className="fas fa-wand-magic-sparkles mr-2" style={{ color: 'var(--color-primary-300)' }}></i>
                  {p.name}
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default WritingEditor;
