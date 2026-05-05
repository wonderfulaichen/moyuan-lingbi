import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Project, ModelConfig, InspirationTag, SchemeHistory } from '../../../shared/types';
import { generateTags } from './inspirationService';
import { aiService } from '../../shared/services/aiService';
import { useAIStatus } from '../../shared/contexts/AIStatusContext';
import AIProgressButton from '../../shared/components/AIProgressButton';
import TagCloud from './components/TagCloud';
import HistoryPanel from './components/HistoryPanel';

interface InspirationIncubationProps {
  project: Project | null;
  activeModel: ModelConfig;
  tagPrompt: string;
  onTagsGenerated: (tags: InspirationTag[]) => void;
  onProceedToSchemes: (tags: InspirationTag[]) => void;
  onUpdate: (updates: Partial<Project>) => void;
}

const InspirationIncubation: React.FC<InspirationIncubationProps> = ({
  project,
  activeModel,
  tagPrompt,
  onTagsGenerated,
  onProceedToSchemes,
  onUpdate,
}) => {
  const [inspiration, setInspiration] = useState(project?.inspiration || '');
  const [tags, setTags] = useState<InspirationTag[]>(project?.inspirationTags || []);
  const TAG_COUNT_KEY = 'moyuan-tag-count';
  const [tagCount, setTagCount] = useState(() => {
    try { const s = localStorage.getItem(TAG_COUNT_KEY); return s ? parseInt(s, 10) : 3; } catch { return 3; }
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [streamContent, setStreamContent] = useState<string | null>(null);
  const [tokenUsage, setTokenUsage] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  // 从历史记录中勾选的标签（不影响 TagCloud）
  const [historySelected, setHistorySelected] = useState<InspirationTag[]>([]);
  const [showPromptHistory, setShowPromptHistory] = useState(false);
  const [promptHistory, setPromptHistory] = useState<string[]>(project?.promptHistory || []);
  const aiStatus = useAIStatus();
  const streamEndRef = useRef<HTMLDivElement>(null);

  const selectedTags = tags.filter(t => t.selected);
  // 所有已选标签 = AI 生成的选中 + 历史勾选的
  const allSelected = [...selectedTags, ...historySelected.filter(h => !selectedTags.some(s => s.text === h.text))];
  const schemeHistory = project?.schemeHistory || [];

  // 从 project 同步
  useEffect(() => {
    if (project) {
      setInspiration(project.inspiration || '');
      setTags(project.inspirationTags || []);
      setPromptHistory(project.promptHistory || []);
    }
  }, [project?.id, project?.inspiration, project?.inspirationTags, project?.promptHistory]);

  // tagCount 持久化
  useEffect(() => {
    try { localStorage.setItem(TAG_COUNT_KEY, String(tagCount)); } catch {}
  }, [tagCount]);

  // 自动滚动流式内容
  useEffect(() => {
    if (streamContent && streamEndRef.current) {
      streamEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [streamContent]);

  // ===== 进度模拟（非流式生成时显示进度动画） =====
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (isGenerating && !streamContent) {
      // 非流式生成：模拟进度到 85%
      aiStatus.setProgress(5);
      let p = 5;
      progressTimerRef.current = setInterval(() => {
        p += Math.random() * 6 + 1;
        if (p >= 85) {
          p = 85;
          if (progressTimerRef.current) clearInterval(progressTimerRef.current);
        }
        aiStatus.setProgress(Math.floor(p));
      }, 800);
    } else if (isGenerating && streamContent) {
      // 流式内容到达后：按字符数估算进度
      aiStatus.setProgress(Math.min(85, Math.floor((streamContent.length || 0) / 3)));
    }
    return () => {
      if (progressTimerRef.current) {
        clearInterval(progressTimerRef.current);
        progressTimerRef.current = null;
      }
    };
  }, [isGenerating]);

  // ===== 生成标签 =====
  const handleGenerateTags = useCallback(async () => {
    if (!inspiration.trim() || !activeModel) {
      setError('请先输入灵感内容，并确保已配置AI模型');
      return;
    }

    setIsGenerating(true);
    setError(null);
    setStreamContent('');
    setTokenUsage(null);
    setShowPromptHistory(false);
    aiStatus.setGenerating(activeModel.name || activeModel.modelName, '生成灵感标签...', 'generateTags');

    // 保存当前提示到历史（去重 & 最多20条）
    const updatedHistory = promptHistory.length > 0 && promptHistory[promptHistory.length - 1] === inspiration
      ? promptHistory
      : [...promptHistory, inspiration].slice(-20);
    setPromptHistory(updatedHistory);

    try {
      const generatedTags = await generateTags(
        inspiration, activeModel, tagPrompt,
        (text) => { setStreamContent(text); },
        undefined,
        (tokens) => {
          aiStatus.setTokenUsage(tokens);
          const tokenStr = `Token 用量 - Prompt: ${tokens.prompt.toLocaleString()} | Completion: ${tokens.completion.toLocaleString()} | 总计: ${tokens.total.toLocaleString()}`;
          setTokenUsage(tokenStr);
        },
        tagCount,
      );
      setTags(generatedTags);
      setStreamContent(null);
      aiStatus.setComplete();
      onTagsGenerated(generatedTags);
      // 同时记录到 schemeHistory，保证历史面板能显示标签记录
      const historyEntry: SchemeHistory = {
        id: `hist-tag-${Date.now()}`,
        schemes: [],
        tags: generatedTags,
        inspiration,
        createdAt: Date.now(),
        groupId: null,
      };
      onUpdate({
        inspiration,
        inspirationTags: generatedTags,
        promptHistory: updatedHistory,
        schemeHistory: [...(project?.schemeHistory || []), historyEntry].slice(-50),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '生成标签失败';
      if (msg === '已中断生成') {
        setError(null);
        aiStatus.resetStatus();
      } else {
        setError(msg);
        aiStatus.setError(msg);
        aiStatus.setComplete();
      }
    } finally {
      setIsGenerating(false);
      setStreamContent(null);
    }
  }, [inspiration, activeModel, tagPrompt, onUpdate, onTagsGenerated, aiStatus, promptHistory, tagCount]);

  // ===== 标签交互 =====
  const handleToggleTag = (tagId: string) => {
    setTags(prev => prev.map(t =>
      t.id === tagId ? { ...t, selected: !t.selected } : t
    ));
  };

  const handleAddCustomTag = (text: string) => {
    const newTag: InspirationTag = {
      id: `tag-custom-${Date.now()}`,
      text,
      selected: true,
      source: 'user',
    };
    setTags(prev => [...prev, newTag]);
  };

  const handleRemoveTag = (tagId: string) => {
    setTags(prev => prev.filter(t => t.id !== tagId));
  };

  // ===== 中止 =====
  const handleAbort = useCallback(() => {
    aiService.abort();
    setIsGenerating(false);
    setStreamContent(null);
    aiStatus.resetStatus();
  }, [aiStatus]);

  // ===== 从历史记录恢复（将历史标签全部添加为已选中，不影响 TagCloud） =====
  const handleRestoreFromHistory = (history: SchemeHistory) => {
    setHistorySelected(prev => {
      const merged = [...prev];
      for (const tag of history.tags) {
        if (!merged.some(t => t.text === tag.text)) {
          merged.push({
            ...tag,
            id: `tag-hist-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          });
        }
      }
      return merged;
    });
  };

  // ===== 取消选中该历史的所有标签 =====
  const handleDeselectAllFromHistory = (history: SchemeHistory) => {
    const texts = new Set(history.tags.map(t => t.text));
    setHistorySelected(prev => prev.filter(t => !texts.has(t.text)));
  };

  // ===== 从历史记录切换单个标签选中（不影响 TagCloud） =====
  const handleToggleHistoryTag = (tag: InspirationTag) => {
    setHistorySelected(prev => {
      const idx = prev.findIndex(t => t.text === tag.text);
      if (idx >= 0) return prev.filter((_, i) => i !== idx);
      return [...prev, { ...tag, id: `tag-hist-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` }];
    });
  };

  // ===== 从已选标签框移除标签 =====
  const handleRemoveFromSelected = (tag: InspirationTag) => {
    // 检查是否在 historySelected 中
    const inHistory = historySelected.some(t => t.text === tag.text);
    if (inHistory) {
      setHistorySelected(prev => prev.filter(t => t.text !== tag.text));
    } else {
      // 在 AI 标签池中 → toggle 取消选中
      setTags(prev => prev.map(t => t.id === tag.id ? { ...t, selected: false } : t));
    }
  };

  // ===== 清空历史记录 =====
  const handleClearHistory = () => {
    onUpdate({ schemeHistory: [] });
  };

  // ===== 生成进度/流式输出 =====
  const renderGenerationProgress = () => {
    if (!isGenerating || !streamContent) return null;
    return (
      <div className="glass-card rounded-2xl p-5 animate-fade-in-up mb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></div>
            <span className="text-sm font-bold" style={{ color: 'var(--color-text-primary)' }}>AI 正在生成...</span>
            <span className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
              已接收 {streamContent.length} 字符
            </span>
          </div>
          <button
            onClick={handleAbort}
            className="px-3 py-1.5 rounded-lg hover:bg-red-600/30 transition-colors text-xs flex items-center gap-1.5"
            style={{ backgroundColor: 'rgba(239,68,68,0.15)', color: '#f87171' }}
          >
            <i className="fas fa-stop-circle"></i>
            <span>停止生成</span>
          </button>
        </div>
        <div className="glass-card-inset rounded-xl p-4 max-h-64 overflow-y-auto font-mono text-xs leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--color-text-tertiary)' }}>
          {streamContent}
          <span className="inline-block w-1.5 h-4 animate-pulse ml-0.5 align-text-bottom" style={{ backgroundColor: 'var(--color-primary-400)' }}></span>
          <div ref={streamEndRef} />
        </div>
      </div>
    );
  };

  // ===== 简单加载态 =====
  const renderLoadingState = () => {
    if (!isGenerating || streamContent) return null;
    return (
      <div className="glass-card-inset rounded-xl px-4 py-3 mb-4 flex items-center gap-3">
        <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: 'var(--color-primary-400)' }}></div>
        <span className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>AI 思考中...</span>
        <button
          onClick={handleAbort}
          className="ml-auto px-2.5 py-1 rounded-lg hover:bg-red-600/30 transition-colors text-xs"
          style={{ backgroundColor: 'rgba(239,68,68,0.15)', color: '#f87171' }}
        >
          <i className="fas fa-stop mr-1"></i>停止
        </button>
      </div>
    );
  };

  return (
    <div className="max-w-4xl animate-fade-in-up">
      {/* 输入区域 */}
      <div className="glass-card rounded-2xl p-6 card-float-hover">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'var(--color-primary-100)' }}>
            <i className="fas fa-lightbulb" style={{ color: 'var(--color-primary-400)' }}></i>
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-bold" style={{ color: 'var(--color-text-primary)' }}>灵感萌发</h3>
            <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>写下你的灵感，AI 将帮你发散构思</p>
          </div>
          {/* 提示历史按钮 */}
          {promptHistory.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setShowPromptHistory(!showPromptHistory)}
                className="px-2.5 py-1.5 rounded-lg text-xs transition-all flex items-center gap-1.5"
                style={{
                  backgroundColor: showPromptHistory ? 'var(--color-primary-100)' : 'transparent',
                  color: showPromptHistory ? 'var(--color-primary-300)' : 'var(--color-text-tertiary)',
                  border: showPromptHistory ? '1px solid var(--color-primary-200)' : '1px solid var(--color-border-default)',
                }}
              >
                <i className="fas fa-history text-[10px]"></i>
                <span>历史提示</span>
                <span className="px-1.5 rounded-full text-[9px]" style={{ backgroundColor: 'var(--color-primary-100)', color: 'var(--color-primary-300)' }}>{promptHistory.length}</span>
              </button>

              {/* 历史提示下拉 */}
              {showPromptHistory && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowPromptHistory(false)} />
                  <div
                    className="absolute right-0 top-full mt-1 z-20 w-72 max-h-60 overflow-y-auto rounded-xl border shadow-2xl backdrop-blur-xl"
                    style={{
                      backgroundColor: 'var(--color-surface-overlay)',
                      borderColor: 'var(--color-border-default)',
                    }}
                  >
                    <div className="px-3 py-2 border-b text-[10px] font-medium flex items-center justify-between" style={{ borderColor: 'var(--color-border-default)', color: 'var(--color-text-tertiary)' }}>
                      <span><i className="fas fa-history mr-1"></i>历史灵感提示</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setPromptHistory([]);
                          onUpdate({ promptHistory: [] });
                          setShowPromptHistory(false);
                        }}
                        className="text-[9px] px-1.5 py-0.5 rounded hover:bg-red-600/20 transition-colors"
                        style={{ color: '#f87171' }}
                      >
                        <i className="fas fa-trash-alt mr-0.5"></i>清空
                      </button>
                    </div>
                    {[...promptHistory].reverse().map((text, idx) => (
                      <button
                        key={idx}
                        onClick={() => {
                          setInspiration(text);
                          setShowPromptHistory(false);
                        }}
                        className="w-full text-left px-3 py-2 text-[11px] transition-colors border-b last:border-b-0 hover:opacity-80"
                        style={{
                          borderColor: 'var(--color-border-default)',
                          color: 'var(--color-text-secondary)',
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--color-primary-100)'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                      >
                        <span className="line-clamp-2">{text}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        <textarea
          value={inspiration}
          onChange={(e) => setInspiration(e.target.value)}
          placeholder="输入你的小说灵感...&#10;例如：一个古代刺客穿越到现代都市，意外卷入一场阴谋..."
          className="neumorphic-input w-full h-32 rounded-xl px-4 py-3 text-sm resize-none"
        />

        <div className="flex items-center justify-between mt-4">
          <div className="flex items-center gap-3">
            <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>标签数量:</span>
            <div className="glass-card-inset rounded-lg p-0.5 flex items-center gap-1">
              {[3, 5, 8, 10, 15, 20].map(n => (
                <button
                  key={n}
                  onClick={() => setTagCount(n)}
                  className={`w-8 h-7 rounded text-xs font-bold transition-all`}
                  style={{
                    backgroundColor: tagCount === n ? 'var(--color-primary-100)' : 'transparent',
                    color: tagCount === n ? 'var(--color-primary-300)' : 'var(--color-text-tertiary)',
                  }}
                >
                  {n}
                </button>
              ))}
              {/* 自定义输入 */}
              <div className="relative flex items-center">
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={tagCount}
                  onChange={(e) => {
                    const v = Math.max(1, Math.min(50, parseInt(e.target.value) || 5));
                    setTagCount(v);
                  }}
                  className="w-10 h-7 rounded bg-transparent text-center text-xs font-bold outline-none"
                  style={{
                    color: [3,5,8,10,15,20].includes(tagCount) ? 'var(--color-text-tertiary)' : 'var(--color-primary-300)',
                  }}
                  title="自定义标签数量 (1-50)"
                />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>{inspiration.length} 字符</span>
            <AIProgressButton
              onClick={handleGenerateTags}
              isGenerating={isGenerating}
              progress={aiStatus.status.progress}
              label="AI 发散标签"
              generatingLabel="AI 分析中..."
              icon="fa-wand-magic-sparkles"
              disabled={!inspiration.trim()}
            />
          </div>
        </div>
      </div>

      {renderGenerationProgress()}
      {renderLoadingState()}

      {error && (
        <div className="mt-4 px-4 py-2 rounded-lg text-sm" style={{ backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }}>
          <i className="fas fa-exclamation-circle mr-2"></i>{error}
        </div>
      )}

      {/* 标签生成区 */}
      {tags.length > 0 && (
        <div className="mt-6">
          {/* 全部标签（可切换选中） */}
          <TagCloud
            tags={tags}
            selectedTags={selectedTags}
            onToggleTag={handleToggleTag}
            onRemoveTag={handleRemoveTag}
            onAddCustomTag={handleAddCustomTag}
            isGenerating={isGenerating}
          />

          {/* 已选标签区域（常驻显示，合并 AI 选中 + 历史勾选） */}
          <div className={`glass-card rounded-2xl p-4 mb-4 ${allSelected.length > 0 ? 'card-float-hover' : ''}`}>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--color-primary-100)' }}>
                <i className="fas fa-check-circle text-xs" style={{ color: 'var(--color-primary-400)' }}></i>
              </div>
              <h4 className="text-sm font-bold" style={{ color: 'var(--color-text-primary)' }}>已选标签</h4>
              <span className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>{allSelected.length} 个</span>
              {allSelected.length === 0 && <span className="text-[9px]" style={{ color: 'var(--color-text-tertiary)' }}>点击标签或从历史勾选</span>}
            </div>
            {allSelected.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {allSelected.map(tag => (
                  <span
                    key={`sel-${tag.text}`}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium"
                    style={{
                      backgroundColor: 'var(--color-primary-100)',
                      color: 'var(--color-primary-300)',
                      border: '1px solid var(--color-primary-200)',
                    }}
                  >
                    {tag.source === 'user' && <i className="fas fa-pen text-[8px] text-amber-400"></i>}
                    {tag.text}
                    <button
                      onClick={() => handleRemoveFromSelected(tag)}
                      className="ml-0.5 hover:text-red-400 transition-colors"
                    >
                      <i className="fas fa-xmark text-[8px]"></i>
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* 刷新/历史/收藏 操作栏 + 进入方案 */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex gap-2">
              <AIProgressButton
                onClick={handleGenerateTags}
                isGenerating={isGenerating}
                progress={aiStatus.status.progress}
                label="重新生成标签"
                generatingLabel="重新发散"
                icon="fa-redo"
                variant="outline"
              />
            </div>

            <div className="flex gap-2">
              <div className="relative">
                <button
                  onClick={() => setShowHistory(!showHistory)}
                  className="px-3 py-2 rounded-lg text-xs transition-all flex items-center gap-1.5"
                  style={{
                    backgroundColor: showHistory ? 'var(--color-primary-100)' : undefined,
                    color: showHistory ? 'var(--color-primary-300)' : 'var(--color-text-tertiary)',
                    border: showHistory ? '1px solid var(--color-primary-200)' : '1px solid var(--color-border-default)',
                  }}
                >
                  <i className="fas fa-history"></i>
                  <span>历史标签</span>
                  {schemeHistory.length > 0 && (
                    <span className="px-1.5 rounded-full text-[10px]" style={{ backgroundColor: 'var(--color-primary-100)', color: 'var(--color-primary-300)' }}>{schemeHistory.length}</span>
                  )}
                </button>
              </div>
              <button
                onClick={() => onProceedToSchemes(allSelected)}
                disabled={allSelected.length === 0}
                className={`px-6 py-2.5 text-white rounded-xl disabled:opacity-40 disabled:cursor-not-allowed transition-all font-medium text-sm card-float-hover`}
                style={{
                  background: !allSelected.length ? undefined : 'linear-gradient(135deg, var(--color-primary-500), var(--color-primary-600))',
                  boxShadow: allSelected.length ? '0 4px 20px var(--color-primary-100)' : undefined,
                  backgroundColor: !allSelected.length ? 'var(--color-surface-muted)' : undefined,
                  color: !allSelected.length ? 'var(--color-text-tertiary)' : undefined,
                  border: !allSelected.length ? '1px solid var(--color-border-default)' : undefined,
                }}
              >
                <i className="fas fa-scroll mr-2"></i>进入方案构思
              </button>
            </div>
          </div>

          {/* 历史记录面板 */}
          {showHistory && (
            <HistoryPanel
              title="历史标签记录"
              icon="fa-history"
              iconColor="var(--color-primary-400)"
              histories={schemeHistory.filter(h => h.tags.length > 0 && h.schemes.length === 0)}
              onRestore={handleRestoreFromHistory}
              onDeselectAll={handleDeselectAllFromHistory}
              onClear={handleClearHistory}
              emptyText="暂无历史标签记录"
              selectedTagTexts={allSelected.map(t => t.text)}
              onToggleTag={handleToggleHistoryTag}
            />
          )}

          {/* Token 用量 */}
          {tokenUsage && (
            <div className="glass-card-inset rounded-lg px-4 py-2 mb-4 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
              <i className="fas fa-chart-simple mr-1.5" style={{ color: 'var(--color-primary-400)' }}></i>
              {tokenUsage}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default InspirationIncubation;
