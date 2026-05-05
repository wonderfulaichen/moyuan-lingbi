import React, { useState, useCallback, useRef } from 'react';
import { Project, ModelConfig, PromptTemplate, Chapter } from '../../../shared/types';
import { aiService } from '../../shared/services/aiService';
import { useAIStatus } from '../../shared/contexts/AIStatusContext';
import AIProgressButton from '../../shared/components/AIProgressButton';
import { useToast } from '../../shared/contexts/ToastContext';

interface DetailedOutlineViewProps {
  project: Project;
  prompts: PromptTemplate[];
  activeModel: ModelConfig;
  onUpdate: (updates: Partial<Project>) => void;
  onOpenSettings: () => void;
}

const DetailedOutlineView: React.FC<DetailedOutlineViewProps> = ({
  project,
  prompts,
  activeModel,
  onUpdate,
}) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedPromptId, setSelectedPromptId] = useState('');
  const [generatingChapterId, setGeneratingChapterId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const { setGenerating, setProgress, setStatusMessage, setComplete, setError, status } = useAIStatus();
  const { showToast } = useToast();

  const chapterPrompts = prompts.filter(p => p.category === 'chapter');
  const writingPrompts = prompts.filter(p => p.category === 'writing');

  // 自动选择第一个提示词模板
  React.useEffect(() => {
    if (chapterPrompts.length > 0 && !selectedPromptId) {
      setSelectedPromptId(chapterPrompts[0].id);
    }
  }, [chapterPrompts, selectedPromptId]);

  // 解析 AI 输出的章节文本
  const parseChapters = (text: string, existingCount: number): Chapter[] => {
    const chapterRegex = /第\s*([0-9一二三四五六七八九十百]+)\s*章[:：]?\s*([^\n]+)([\s\S]*?)(?=第\s*[0-9一二三四五六七八九十百]+\s*章|---|$(?![\s\S]))/gi;
    const matches = Array.from(text.matchAll(chapterRegex));

    return matches.map((match, idx) => {
      const titleRaw = match[2].trim();
      let bodyRaw = match[3].trim();
      const title = titleRaw.replace(/[#*]/g, '').trim();

      let summary = bodyRaw;
      const summaryMarkers = ['剧情细纲[:：]', '内容[:：]', '情节[:：]', '本章细纲[:：]'];
      for (const marker of summaryMarkers) {
        const regex = new RegExp(marker, 'i');
        const markerMatch = bodyRaw.match(regex);
        if (markerMatch && markerMatch.index !== undefined) {
          summary = bodyRaw.substring(markerMatch.index + markerMatch[0].length).trim();
          break;
        }
      }
      summary = summary.split('---')[0].trim();

      return {
        id: Math.random().toString(36).substr(2, 9),
        title: title || `第${existingCount + idx + 1}章`,
        summary: summary || '待补充细纲...',
        content: '',
        order: existingCount + idx,
      };
    });
  };

  const handleAddChapter = () => {
    const newChapter: Chapter = {
      id: Date.now().toString(),
      title: `第${project.chapters.length + 1}章`,
      summary: '',
      content: '',
      order: project.chapters.length,
      keyEvents: [],
      characters: [],
    };
    onUpdate({ chapters: [...project.chapters, newChapter] });
  };

  const handleUpdateChapter = (id: string, updates: Partial<Chapter>) => {
    onUpdate({
      chapters: project.chapters.map(c =>
        c.id === id ? { ...c, ...updates } : c
      ),
    });
  };

  const handleDeleteChapter = (id: string) => {
    onUpdate({
      chapters: project.chapters.filter(c => c.id !== id).map((c, i) => ({ ...c, order: i })),
    });
  };

  const handleGenerateChapterContent = useCallback(async (chapterId: string) => {
    if (!activeModel) {
      showToast('请先在设置中配置AI模型', 'warning');
      return;
    }

    const chapter = project.chapters.find(c => c.id === chapterId);
    if (!chapter || !chapter.summary) {
      showToast('请先为该章节填写细纲内容', 'warning');
      return;
    }

    const writingTemplate = writingPrompts[0];
    if (!writingTemplate) {
      showToast('未找到写作提示词模板', 'warning');
      return;
    }

    setGeneratingChapterId(chapterId);
    const taskId = `write-chapter-${chapterId}-${Date.now()}`;
    setGenerating(activeModel.name, `AI 撰写「${chapter.title}」中...`, taskId);

    const folderChars = (project.folders || [])
      .filter(f => f.type === 'characters')
      .flatMap(f => f.contentCards || [])
      .filter(c => c.isFavorited && c.content)
      .map(c => `【${c.title}】\n${c.content.slice(0, 500)}`);
    const legacyChars = project.characters
      .filter(c => c.name !== '新角色')
      .map(c => `【${c.name}】(${c.role})\n- 性格：${c.personality}\n- 背景：${c.background}`);
    const charDetails = [...folderChars, ...legacyChars].join('\n\n');

    const finalPrompt = writingTemplate.content
      .replace('{title}', project.title)
      .replace('{chapter_title}', chapter.title)
      .replace('{summary}', chapter.summary)
      .replace('{characters}', charDetails || '暂无角色信息')
      .replace('{content}', chapter.content || '（新章节，无已有内容）');

    let accumulatedContent = '';

    try {
      await aiService.generateWithContext(
        { model: activeModel, prompt: finalPrompt },
        (response) => {
          if (response.content) {
            accumulatedContent += response.content;
            setStatusMessage(`AI 撰写「${chapter.title}」中... (${accumulatedContent.length} 字)`);
          }
          if (response.isComplete) {
            onUpdate({
              chapters: project.chapters.map(c =>
                c.id === chapterId ? { ...c, content: accumulatedContent } : c
              ),
            });
            setComplete();
            setGeneratingChapterId(null);
            showToast(`「${chapter.title}」撰写完成`, 'success');
          }
          if (response.error) {
            setError(response.error);
            setGeneratingChapterId(null);
            showToast(`撰写失败：${response.error}`, 'error');
          }
        },
      );
    } catch (err: any) {
      setError(err.message || '撰写失败');
      setGeneratingChapterId(null);
      showToast(`撰写失败：${err.message}`, 'error');
    }
  }, [activeModel, project, writingPrompts, setGenerating, setStatusMessage, setComplete, setError, showToast, onUpdate]);

  const handleGenerateDetailed = useCallback(async () => {
    if (!activeModel) {
      showToast('请先在设置中配置AI模型', 'warning');
      return;
    }
    if (!project.outline) {
      showToast('请先在大纲视图中编写故事大纲', 'warning');
      return;
    }

    const template = prompts.find(p => p.id === selectedPromptId);
    if (!template) {
      showToast('请选择一个章节生成模板', 'warning');
      return;
    }

    setIsGenerating(true);
    setStreamingContent('');
    const taskId = `detailed-outline-${Date.now()}`;
    setGenerating(activeModel.name, 'AI 生成章节细纲中...', taskId);

    // 构建角色上下文
    // 合并文件夹角色卡片 + 旧版角色数据
    const folderChars = (project.folders || [])
      .filter(f => f.type === 'characters')
      .flatMap(f => f.contentCards || [])
      .filter(c => c.isFavorited && c.content)
      .map(c => `【${c.title}】\n${c.content.slice(0, 500)}`);
    const legacyChars = project.characters
      .filter(c => c.name !== '新角色')
      .map(c => `【${c.name}】(${c.role})\n- 性格：${c.personality}\n- 背景：${c.background}`);
    const charDetails = [...folderChars, ...legacyChars].join('\n\n');

    let finalPrompt = template.content
      .replace('{title}', project.title)
      .replace('{intro}', project.intro || '暂无简介')
      .replace('{outline}', project.outline)
      .replace('{characters}', charDetails || '暂无角色');

    if (project.chapters.length > 0) {
      const existingChaptersStr = project.chapters
        .sort((a, b) => a.order - b.order)
        .map((c, i) => `第${i + 1}章：${c.title}\n细纲：${c.summary}`)
        .join('\n\n');
      finalPrompt += `\n\n### 已有章节\n${existingChaptersStr}\n\n请在此基础上继续生成后续章节。`;
    }

    let accumulatedContent = '';

    try {
      await aiService.generateWithContext(
        { model: activeModel, prompt: finalPrompt },
        (response) => {
          if (response.content) {
            accumulatedContent += response.content;
            setStreamingContent(accumulatedContent);
            setStatusMessage(`AI 生成章节细纲中... (${accumulatedContent.length} 字符)`);
          }
          if (response.isComplete) {
            // 解析章节
            const existingCount = project.chapters.length;
            const parsedChapters = parseChapters(accumulatedContent, existingCount);

            if (parsedChapters.length > 0) {
              onUpdate({
                chapters: [...project.chapters, ...parsedChapters],
              });
            } else if (accumulatedContent.trim()) {
              // 没解析出章节结构，但生成了一些内容，创建一个默认章节
              const newChapter: Chapter = {
                id: Date.now().toString(),
                title: `第${existingCount + 1}章`,
                summary: accumulatedContent.trim().substring(0, 500),
                content: '',
                order: existingCount,
              };
              onUpdate({
                chapters: [...project.chapters, newChapter],
              });
            }
            setComplete();
            setIsGenerating(false);
            setStreamingContent('');
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
        console.error('Detailed outline generation failed:', err);
        setError(err.message || '细纲生成失败');
        setIsGenerating(false);
      }
    }
  }, [activeModel, project, prompts, selectedPromptId, onUpdate, setGenerating, setStatusMessage, setComplete, setError]);

  const handleAddKeyEvent = (chapterId: string, event: string) => {
    const chapter = project.chapters.find(c => c.id === chapterId);
    if (!chapter) return;
    const events = chapter.keyEvents || [];
    handleUpdateChapter(chapterId, { keyEvents: [...events, event] });
  };

  const handleRemoveKeyEvent = (chapterId: string, index: number) => {
    const chapter = project.chapters.find(c => c.id === chapterId);
    if (!chapter) return;
    const events = chapter.keyEvents || [];
    handleUpdateChapter(chapterId, {
      keyEvents: events.filter((_, i) => i !== index),
    });
  };

  const sortedChapters = [...project.chapters].sort((a, b) => a.order - b.order);

  return (
    <div className="h-full flex flex-col">
      {/* 顶部操作栏 */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-white/5 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: 'var(--color-primary-100)' }}>
            <i className="fas fa-list-tree text-xs" style={{ color: 'var(--color-primary-400)' }}></i>
          </div>
          <div>
            <h3 className="text-base font-bold" style={{ color: 'var(--color-text-primary)' }}>章节细纲</h3>
            <p className="text-xs text-gray-500">将大纲细化为每一章的剧情走向</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={selectedPromptId}
            onChange={(e) => setSelectedPromptId(e.target.value)}
            className="neumorphic-input rounded-lg px-3 py-1.5 text-xs appearance-none cursor-pointer pr-6"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            {chapterPrompts.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          {isGenerating ? (
            <button
              onClick={() => {
                if (abortRef.current) { abortRef.current.abort(); abortRef.current = null; }
                aiService.abort();
                setIsGenerating(false);
              }}
              className="px-3 py-1.5 text-xs text-red-400 rounded-lg border border-red-400/30 hover:bg-red-400/10 transition-colors"
            >
              <i className="fas fa-stop mr-1"></i>停止
            </button>
          ) : (
            <AIProgressButton
              onClick={handleGenerateDetailed}
              isGenerating={isGenerating}
              progress={status.progress}
              label="AI生成细纲"
              generatingLabel="生成中..."
              icon="fa-magic"
              disabled={!activeModel || !project.outline}
            />
          )}
          <button
            onClick={handleAddChapter}
            className="px-4 py-1.5 glass-card-inset rounded-lg transition-all text-xs font-medium card-float-hover"
            style={{ color: 'var(--color-primary-300)' }}
          >
            <i className="fas fa-plus mr-1.5"></i>手动添加
          </button>
        </div>
      </div>

      {/* 流式输出显示 */}
      {streamingContent && (
        <div className="shrink-0 px-6 py-3 border-b border-white/5">
          <div className="glass-card rounded-xl p-4 max-h-48 overflow-y-auto">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></div>
              <span className="text-xs font-medium" style={{ color: 'var(--color-text-primary)' }}>AI 正在生成章节细纲...</span>
              <span className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
                ({streamingContent.length} 字符)
              </span>
            </div>
            <pre className="text-xs whitespace-pre-wrap font-mono leading-relaxed" style={{ color: 'var(--color-text-tertiary)' }}>
              {streamingContent}
              <span className="inline-block w-1.5 h-4 animate-pulse ml-0.5 align-text-bottom" style={{ backgroundColor: 'var(--color-primary-400)' }}></span>
            </pre>
          </div>
        </div>
      )}

      {/* 章节细纲列表 */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl space-y-3">
          {sortedChapters.length === 0 ? (
            <div className="glass-card rounded-2xl p-12 text-center">
              <i className="fas fa-list-ol text-4xl mb-4" style={{ color: 'var(--color-text-muted)' }}></i>
              <p className="font-bold text-lg" style={{ color: 'var(--color-text-secondary)' }}>尚未创建章节细纲</p>
              <p className="text-sm mt-1" style={{ color: 'var(--color-text-tertiary)' }}>
                使用AI基于大纲生成细纲，或手动添加章节
              </p>
              {!project.outline && (
                <p className="text-xs mt-3" style={{ color: 'var(--color-primary-400)' }}>
                  <i className="fas fa-info-circle mr-1"></i>
                  建议先在大纲视图中编写故事大纲
                </p>
              )}
            </div>
          ) : (
            sortedChapters.map((chapter, index) => (
              <div
                key={chapter.id}
                className="glass-card rounded-2xl overflow-hidden transition-all duration-200 animate-card-enter"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                {/* 章节头 */}
                <div
                  className="flex items-center gap-3 px-5 py-3 cursor-pointer hover:bg-white/5 transition-colors"
                  onClick={() => setExpandedId(expandedId === chapter.id ? null : chapter.id)}
                >
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 font-bold text-xs text-white"
                    style={{
                      background: `linear-gradient(135deg, var(--color-primary-400), var(--color-primary-500))`
                    }}>
                    {index + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <input
                      type="text"
                      value={chapter.title}
                      onChange={(e) => {
                        e.stopPropagation();
                        handleUpdateChapter(chapter.id, { title: e.target.value });
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="w-full bg-transparent font-bold text-sm focus:outline-none border-b border-transparent focus:border-theme-active transition-all pb-0.5"
                      style={{ color: 'var(--color-text-primary)' }}
                    />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-gray-500">
                      {(chapter.keyEvents?.length || 0)} 个事件
                    </span>
                    {chapter.content ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-400">
                        {chapter.content.length}字
                      </span>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleGenerateChapterContent(chapter.id);
                        }}
                        disabled={generatingChapterId === chapter.id}
                        className="px-2.5 py-1 rounded-lg text-[10px] font-medium transition-all duration-200 flex items-center gap-1"
                        style={{
                          background: generatingChapterId === chapter.id
                            ? 'var(--color-primary-100)'
                            : 'linear-gradient(135deg, var(--color-primary-400), var(--color-primary-500))',
                          color: generatingChapterId === chapter.id
                            ? 'var(--color-primary-400)'
                            : '#fff',
                          opacity: generatingChapterId === chapter.id ? 0.7 : 1,
                        }}
                      >
                        {generatingChapterId === chapter.id ? (
                          <>
                            <span className="inline-block w-2.5 h-2.5 border border-current border-t-transparent rounded-full animate-spin"></span>
                            撰写中
                          </>
                        ) : (
                          <>
                            <i className="fas fa-magic text-[9px]"></i>
                            AI撰写
                          </>
                        )}
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteChapter(chapter.id);
                      }}
                      className="p-1.5 transition-colors hover:text-red-400"
                      style={{ color: 'var(--color-text-muted)' }}
                    >
                      <i className="fas fa-trash text-xs"></i>
                    </button>
                    <i className={`fas fa-chevron-down text-xs transition-transform duration-200 ${
                      expandedId === chapter.id ? 'rotate-180' : ''
                    }`} style={{ color: 'var(--color-text-muted)' }}></i>
                  </div>
                </div>

                {/* 展开的细纲内容 */}
                {expandedId === chapter.id && (
                  <div className="px-5 pb-5 space-y-4 border-t border-white/5 pt-4">
                    {/* 细纲文本 */}
                    <div>
                      <label className="text-xs font-medium text-gray-500 mb-1.5 flex items-center gap-1.5">
                        <i className="fas fa-align-left text-[10px]"></i>
                        章节细纲
                      </label>
                      <textarea
                        value={chapter.summary}
                        onChange={(e) => handleUpdateChapter(chapter.id, { summary: e.target.value })}
                        placeholder="输入本章节的细纲内容..."
                        className="w-full neumorphic-input rounded-xl px-4 py-3 text-sm h-24 resize-none focus:outline-none transition-all"
                        style={{ color: 'var(--color-text-secondary)' }}
                      />
                    </div>

                    {/* 关键事件 */}
                    <div>
                      <label className="text-xs font-medium text-gray-500 mb-1.5 flex items-center gap-1.5">
                        <i className="fas fa-bolt text-[10px]"></i>
                        关键事件
                      </label>
                      <div className="space-y-1.5 mb-2">
                        {(chapter.keyEvents || []).map((event, ei) => (
                          <div key={ei} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5">
                            <span className="w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                              style={{ background: 'var(--color-primary-400)' }}>
                              {ei + 1}
                            </span>
                            <span className="text-xs flex-1" style={{ color: 'var(--color-text-secondary)' }}>{event}</span>
                            <button
                              onClick={() => handleRemoveKeyEvent(chapter.id, ei)}
                              className="text-gray-500 hover:text-red-400 transition-colors"
                            >
                              <i className="fas fa-times text-[10px]"></i>
                            </button>
                          </div>
                        ))}
                      </div>
                      <div className="flex gap-1.5">
                        <input
                          type="text"
                          placeholder="添加关键事件..."
                          className="flex-1 neumorphic-input rounded-lg px-3 py-1.5 text-xs focus:outline-none"
                          style={{ color: 'var(--color-text-secondary)' }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                              handleAddKeyEvent(chapter.id, e.currentTarget.value.trim());
                              e.currentTarget.value = '';
                            }
                          }}
                        />
                      </div>
                    </div>

                    {/* 涉及角色 */}
                    <div>
                      <label className="text-xs font-medium text-gray-500 mb-1.5 flex items-center gap-1.5">
                        <i className="fas fa-user text-[10px]"></i>
                        涉及角色
                      </label>
                      <div className="flex flex-wrap gap-1.5">
                        {(chapter.characters || []).length === 0 ? (
                          <span className="text-xs text-gray-600 italic">暂无</span>
                        ) : (
                          (chapter.characters || []).map((charId, ci) => {
                            const char = project.characters.find(c => c.id === charId);
                            return (
                              <span key={ci} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium"
                                style={{
                                  background: 'var(--color-primary-100)',
                                  color: 'var(--color-primary-400)',
                                }}>
                                <i className="fas fa-user"></i>
                                {char?.name || charId}
                              </span>
                            );
                          })
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default DetailedOutlineView;
