import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Project, ModelConfig, PromptTemplate } from '../../../shared/types';
import { aiService } from '../../shared/services/aiService';
import { useAIStatus } from '../../shared/contexts/AIStatusContext';
import AIProgressButton from '../../shared/components/AIProgressButton';
import { useToast } from '../../shared/contexts/ToastContext';
import { useUIStore } from '../../shared/stores/uiStore';
import CharacterQuickView from './components/CharacterQuickView';
import WhiteNoisePanel from './components/WhiteNoisePanel';
import FormatToolbar from './components/FormatToolbar';
import ConsistencyPanel from './components/ConsistencyPanel';
import InspirationPanel from './components/InspirationPanel';
import WellnessToast from './components/WellnessToast';
import { useSmartFormat, FormatType, SmartFormatOptions } from '../../shared/hooks/useSmartFormat';
import { useUndoRedo } from '../../shared/hooks/useUndoRedo';
import { wellnessService, WellnessMessage } from '../../shared/services/WellnessService';

interface WritingEditorProps {
  project: Project;
  prompts: PromptTemplate[];
  activeModel: ModelConfig;
  onUpdate: (updates: Partial<Project>) => void;
  onOpenSettings: () => void;
  editingChapterId: string | null;
  onBackToChapters: () => void;
}

type ImmersiveTheme = 'default' | 'parchment' | 'dark' | 'zen';
type TypewriterMode = 'off' | 'current-line' | 'paragraph';
type WritingMode = 'continue' | 'multi' | 'smart' | 'polish' | 'expand' | 'compress';

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
  const [writingMode, setWritingMode] = useState<WritingMode>('continue');
  const [showModeMenu, setShowModeMenu] = useState(false);
  const [multiOptions, setMultiOptions] = useState<string[]>([]);
  const [showMultiPanel, setShowMultiPanel] = useState(false);
  const [isImmersiveMode, setIsImmersiveMode] = useState(false);
  const [immersiveTheme, setImmersiveTheme] = useState<ImmersiveTheme>('default');
  const [typewriterMode, setTypewriterMode] = useState<TypewriterMode>('off');
  const [showToolbar, setShowToolbar] = useState(true);
  const [wordCount, setWordCount] = useState(0);
  const [charCount, setCharCount] = useState(0);
  const [cursorPosition, setCursorPosition] = useState(0);
  const [showWhiteNoise, setShowWhiteNoise] = useState(false);
  const [formatOptions, setFormatOptions] = useState<SmartFormatOptions>({
    autoIndent: true,
    autoClose: true,
    smartQuote: true,
  });
  const [showConsistency, setShowConsistency] = useState(false);
  const [showInspiration, setShowInspiration] = useState(false);
  const [wellnessMessage, setWellnessMessage] = useState<WellnessMessage | null>(null);

  const { handleKeyDown: handleSmartFormat, formatSelection } = useSmartFormat(formatOptions);

  const { value: editorContent, setValue: setEditorContent, undo, redo, canUndo, canRedo } = useUndoRedo<string>({
    initialValue: '',
  });

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const { setGenerating, setProgress, setStatusMessage, setComplete, setError: setAIError, addTask, setTokenUsage, status } = useAIStatus();
  const { showToast } = useToast();
  const { updateWritingStats } = useUIStore();

  const editingChapter = project.chapters.find(c => c.id === editingChapterId);
  const writingPrompts = prompts.filter(p => p.category === 'writing');
  const editPrompts = prompts.filter(p => p.category === 'edit');

  const currentContent = editingChapter?.content ?? '';
  const [localContent, setLocalContent] = useState(currentContent);

  useEffect(() => {
    setLocalContent(currentContent);
    setEditorContent(currentContent, true);
  }, [editingChapterId, currentContent]);

  const handleContentChange = useCallback((newContent: string) => {
    setLocalContent(newContent);
    setEditorContent(newContent);
  }, [setEditorContent]);

  const handleSaveContent = useCallback(() => {
    if (editingChapterId && localContent !== currentContent) {
      onUpdate({ chapters: project.chapters.map(c => c.id === editingChapterId ? { ...c, content: localContent } : c) });
    }
  }, [editingChapterId, localContent, currentContent, onUpdate, project.chapters]);

  React.useEffect(() => {
    if (writingPrompts.length > 0 && !selectedPromptId) {
      setSelectedPromptId(writingPrompts[0].id);
    }
  }, [writingPrompts, selectedPromptId]);

  // 启动健康服务
  useEffect(() => {
    wellnessService.startSession();
  }, []);

  // 更新写作统计和健康服务
  useEffect(() => {
    const words = localContent.trim().split(/\s+/).filter(Boolean).length;
    const chars = localContent.length;
    setWordCount(words);
    setCharCount(chars);
    wellnessService.updateActivity(words);
    updateWritingStats({ wordCount: words, charCount: chars });
  }, [localContent]);

  // 定期检查健康消息
  useEffect(() => {
    const interval = setInterval(() => {
      const message = wellnessService.checkForMessages();
      if (message) {
        setWellnessMessage(message);
      }
    }, 30000); // 每30秒检查一次

    return () => clearInterval(interval);
  }, []);

  // 打字机模式滚动
  useEffect(() => {
    if (typewriterMode === 'off' || !textareaRef.current) return;

    const textarea = textareaRef.current;
    const cursorPos = textarea.selectionStart;
    const textBeforeCursor = localContent.substring(0, cursorPos);
    const linesBeforeCursor = textBeforeCursor.split('\n').length;
    const lineHeight = 28;
    const scrollTop = textarea.scrollTop;
    const targetScrollTop = (linesBeforeCursor - 5) * lineHeight;

    if (Math.abs(targetScrollTop - scrollTop) > lineHeight * 2) {
      textarea.scrollTop = Math.max(0, targetScrollTop);
    }
  }, [localContent, typewriterMode]);

  // 自动保存（停止输入 2 秒后保存）
  useEffect(() => {
    if (!editingChapterId || localContent === currentContent) return;

    const timer = setTimeout(() => {
      handleSaveContent();
    }, 2000);

    return () => clearTimeout(timer);
  }, [localContent, editingChapterId, handleSaveContent]);

  // 键盘快捷键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSaveContent();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        if (!isGenerating) handleGenerate();
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'F') {
        e.preventDefault();
        setIsImmersiveMode(!isImmersiveMode);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'I') {
        e.preventDefault();
        setShowInspiration(true);
      }
      if (e.key === 'Escape' && isImmersiveMode) {
        e.preventDefault();
        setIsImmersiveMode(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isGenerating, isImmersiveMode]);

  const handleFormat = useCallback((formatType: FormatType) => {
    if (!textareaRef.current || !editingChapterId) return;

    const textarea = textareaRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const currentContent = localContent;

    const result = formatSelection(currentContent, start, end, formatType);

    handleContentChange(result.newText);

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(result.newCursorPosition, result.newCursorPosition);
    }, 0);
  }, [localContent, formatSelection]);

  const handleApplyInspiration = useCallback((text: string) => {
    if (!textareaRef.current || !editingChapterId) return;

    const textarea = textareaRef.current;
    const start = textarea.selectionStart;
    const currentContent = localContent;
    const newContent = currentContent.substring(0, start) + text + currentContent.substring(start);

    handleContentChange(newContent);

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + text.length, start + text.length);
    }, 0);
  }, [editingChapterId, editingChapter?.content]);

  // 沉浸式主题样式
  const getImmersiveThemeStyles = () => {
    switch (immersiveTheme) {
      case 'parchment':
        return {
          background: 'linear-gradient(135deg, #f5e6d3 0%, #e8d4b8 100%)',
          color: '#3d2914',
          editorBg: 'rgba(245, 230, 211, 0.9)',
          borderColor: '#c4a57d',
        };
      case 'dark':
        return {
          background: 'linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)',
          color: '#e5e5e5',
          editorBg: 'rgba(30, 30, 30, 0.95)',
          borderColor: '#404040',
        };
      case 'zen':
        return {
          background: 'linear-gradient(135deg, #1a1f2e 0%, #2d3748 100%)',
          color: '#e2e8f0',
          editorBg: 'rgba(26, 31, 46, 0.95)',
          borderColor: '#4a5568',
        };
      default:
        return {
          background: 'var(--bg-primary)',
          color: 'var(--text-primary)',
          editorBg: 'var(--bg-secondary)',
          borderColor: 'var(--border-color)',
        };
    }
  };

  // AI生成处理
  const handleGenerate = async () => {
    if (!editingChapter || !activeModel) return;

    setIsGenerating(true);
    setGenerating(true);
    abortRef.current = new AbortController();

    try {
      const prompt = writingPrompts.find(p => p.id === selectedPromptId);
      if (!prompt) return;

      const result = await aiService.generate({
        model: activeModel,
        prompt: prompt.template.replace('{{content}}', localContent),
        signal: abortRef.current.signal,
      });

      if (result.text) {
        handleContentChange(localContent + result.text);
        showToast('AI续写完成', 'success');
      }
    } catch (error) {
      if (error.name !== 'AbortError') {
        showToast('生成失败: ' + error.message, 'error');
      }
    } finally {
      setIsGenerating(false);
      setGenerating(false);
      abortRef.current = null;
    }
  };

  const handleAbort = () => {
    abortRef.current?.abort();
    setIsGenerating(false);
    setGenerating(false);
  };

  if (!editingChapter) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <i className="fas fa-book text-4xl mb-4 text-gray-400" />
          <p className="text-gray-500">选择一个章节开始写作</p>
        </div>
      </div>
    );
  }

  const themeStyles = getImmersiveThemeStyles();

  return (
    <div className="flex h-full relative">
      {/* 角色速查卡片 */}
      <CharacterQuickView
        characters={project.characters}
        content={editingChapter?.content || ''}
        cursorPosition={cursorPosition}
      />

      {/* 主编辑区 */}
      <div className="flex-1 flex flex-col h-full">
        {/* 工具栏 */}
        <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--border-color)' }}>
          <div className="flex items-center gap-4">
            <button
              onClick={onBackToChapters}
              className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700"
            >
              <i className="fas fa-arrow-left" />
              返回章节列表
            </button>
            <h2 className="font-medium">{editingChapter.title}</h2>
          </div>

          <div className="flex items-center gap-3">
            {/* AI模式选择 */}
            <div className="relative">
              <button
                onClick={() => setShowModeMenu(!showModeMenu)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm border"
                style={{ borderColor: 'var(--border-color)' }}
              >
                <i className="fas fa-magic" />
                {writingMode === 'continue' ? 'AI续写' : writingMode === 'multi' ? '多选项' : writingMode === 'smart' ? '智能续写' : writingMode === 'polish' ? '润色' : writingMode === 'expand' ? '扩写' : '精简'}
                <i className="fas fa-chevron-down text-xs" />
              </button>

              {showModeMenu && (
                <div className="absolute top-full right-0 mt-1 w-40 py-1 rounded-lg shadow-lg border z-50" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}>
                  {[
                    { id: 'continue', label: 'AI续写', icon: 'fa-pen' },
                    { id: 'multi', label: '多选项', icon: 'fa-list' },
                    { id: 'smart', label: '智能续写', icon: 'fa-brain' },
                    { id: 'polish', label: '润色', icon: 'fa-sparkles' },
                    { id: 'expand', label: '扩写', icon: 'fa-expand' },
                    { id: 'compress', label: '精简', icon: 'fa-compress' },
                  ].map(mode => (
                    <button
                      key={mode.id}
                      onClick={() => {
                        setWritingMode(mode.id as WritingMode);
                        setShowModeMenu(false);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-white/5"
                    >
                      <i className={`fas ${mode.icon}`} />
                      {mode.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <AIProgressButton
              onClick={handleGenerate}
              isGenerating={isGenerating}
              progress={status.progress}
              label="生成"
              generatingLabel="生成中..."
              icon="fa-magic"
            />

            {isGenerating && (
              <button onClick={handleAbort} className="px-3 py-1.5 text-sm text-red-500 hover:text-red-600">
                <i className="fas fa-stop" />
              </button>
            )}

            <button
              onClick={() => setIsImmersiveMode(true)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm border"
              style={{ borderColor: 'var(--border-color)' }}
            >
              <i className="fas fa-expand" />
              沉浸模式
            </button>
          </div>
        </div>

        {/* 编辑器 */}
        <div className="flex-1 overflow-hidden">
          <textarea
            ref={textareaRef}
            value={localContent}
            onChange={(e) => {
              handleContentChange(e.target.value);
              setCursorPosition(e.target.selectionStart);
            }}
            onSelect={(e) => {
              setCursorPosition((e.target as HTMLTextAreaElement).selectionStart);
            }}
            onKeyUp={(e) => {
              setCursorPosition((e.target as HTMLTextAreaElement).selectionStart);
            }}
            onKeyDown={(e) => {
              if (!isGenerating) {
                const result = handleSmartFormat(e, localContent, (e.target as HTMLTextAreaElement).selectionStart);
                if (result?.consumed) {
                  e.preventDefault();
                  handleContentChange(result.newText);
                  setTimeout(() => {
                    textareaRef.current?.focus();
                    textareaRef.current?.setSelectionRange(result.newCursorPosition, result.newCursorPosition);
                  }, 0);
                }
              }
            }}
            placeholder="开始你的创作..."
            className="w-full h-full resize-none outline-none p-6 text-lg leading-relaxed"
            style={{
              background: 'transparent',
              color: 'var(--text-primary)',
            }}
          />
        </div>

        {/* 底部状态栏 */}
        <div className="flex items-center justify-between px-4 py-2 border-t text-sm" style={{ borderColor: 'var(--border-color)' }}>
          <div className="flex items-center gap-4 text-gray-500">
            <span>{wordCount} 字</span>
            <span>{charCount} 字符</span>
          </div>
          <div className="flex items-center gap-2">
            <FormatToolbar
              onFormat={handleFormat}
              options={formatOptions}
              onOptionsChange={(opts) => setFormatOptions(prev => ({ ...prev, ...opts }))}
              canUndo={canUndo}
              canRedo={canRedo}
              onUndo={undo}
              onRedo={redo}
            />
          </div>
        </div>
      </div>

      {/* 白噪音面板 */}
      <WhiteNoisePanel
        isOpen={showWhiteNoise}
        onClose={() => setShowWhiteNoise(false)}
      />

      {/* 一致性检查面板 */}
      <ConsistencyPanel
        isOpen={showConsistency}
        onClose={() => setShowConsistency(false)}
        content={editingChapter?.content || ''}
        characters={project.characters}
      />

      {/* 灵感捕捉面板 */}
      <InspirationPanel
        isOpen={showInspiration}
        onClose={() => setShowInspiration(false)}
        onAddToEditor={handleApplyInspiration}
      />

      {/* 情绪关怀提示 */}
      <WellnessToast
        message={wellnessMessage}
        onDismiss={() => setWellnessMessage(null)}
        onAction={() => {
          if (wellnessMessage?.type === 'break' || wellnessMessage?.type === 'fatigue') {
            wellnessService.recordBreak();
          }
        }}
      />
    </div>
  );
};

export default WritingEditor;
