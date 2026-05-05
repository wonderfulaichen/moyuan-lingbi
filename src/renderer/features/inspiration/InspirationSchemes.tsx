import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Project, ModelConfig, NovelScheme, SchemeGroup, SchemeHistory, InspirationTag } from '../../../shared/types';
import { generateSchemesStreaming } from './inspirationService';
import { aiService } from '../../shared/services/aiService';
import { useAIStatus } from '../../shared/contexts/AIStatusContext';
import AIProgressButton from '../../shared/components/AIProgressButton';
import SchemeCard from './components/SchemeCard';
import SchemePreviewModal from './components/SchemePreviewModal';
import HistoryPanel from './components/HistoryPanel';
import FavoritesPanel from './components/FavoritesPanel';

type CardLayout = 'grid' | 'list';
type ExtraPanel = 'none' | 'history' | 'favorites';

interface InspirationSchemesProps {
  project: Project | null;
  activeModel: ModelConfig;
  schemePrompt: string;
  inspiration: string;
  tags: InspirationTag[];
  selectedTags: InspirationTag[];
  onUpdate: (updates: Partial<Project>) => void;
  onBackToIncubation: () => void;
  onConfirmScheme?: () => void;
}

const InspirationSchemes: React.FC<InspirationSchemesProps> = ({
  project,
  activeModel,
  schemePrompt,
  inspiration,
  tags,
  selectedTags,
  onUpdate,
  onBackToIncubation,
  onConfirmScheme,
}) => {
  const [schemes, setSchemes] = useState<NovelScheme[]>(project?.novelSchemes || []);
  const SCHEME_COUNT_KEY = 'moyuan-scheme-count';
  const [schemeCount, setSchemeCount] = useState(() => {
    try { const s = localStorage.getItem(SCHEME_COUNT_KEY); return s ? parseInt(s, 10) : 3; } catch { return 3; }
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cardLayout, setCardLayout] = useState<CardLayout>('grid');
  const [extraPanel, setExtraPanel] = useState<ExtraPanel>('none');
  const [streamContent, setStreamContent] = useState<string | null>(null);
  const [tokenUsage, setTokenUsage] = useState<string | null>(null);
  const [selectedScheme, setSelectedScheme] = useState<NovelScheme | null>(null);
  const [viewingScheme, setViewingScheme] = useState<NovelScheme | null>(null);
  const [schemePromptHistory, setSchemePromptHistory] = useState<string[]>(project?.schemePromptHistory || []);
  const [supplementaryPrompt, setSupplementaryPrompt] = useState('');  // 补充提示词
  const aiStatus = useAIStatus();
  const streamEndRef = useRef<HTMLDivElement>(null);

  const hasSelectedScheme = schemes.find(s => s.selected) || null;
  const favoritedSchemes = schemes.filter(s => s.favorited);
  const schemeHistory = project?.schemeHistory || [];
  const schemeGroups = project?.schemeGroups || [];

  // 从 project 同步
  useEffect(() => {
    if (project) {
      setSchemes(project.novelSchemes || []);
      setSchemePromptHistory(project.schemePromptHistory || []);
    }
  }, [project?.id, project?.novelSchemes, project?.schemePromptHistory]);

  // schemeCount 持久化
  useEffect(() => {
    try { localStorage.setItem(SCHEME_COUNT_KEY, String(schemeCount)); } catch {}
  }, [schemeCount]);

  // 自动滚动流式内容
  useEffect(() => {
    if (streamContent && streamEndRef.current) {
      streamEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [streamContent]);

  // ===== 生成/重新生成方案（合并去重） =====
  const doGenerateSchemes = useCallback(async (isRegenerate: boolean) => {
    if (!isRegenerate && selectedTags.length === 0) {
      setError('请至少选择一个标签');
      return;
    }
    if (!activeModel) {
      setError('请先配置AI模型');
      return;
    }

    setIsGenerating(true);
    setError(null);
    setStreamContent('');
    setTokenUsage(null);
    aiStatus.setGenerating(activeModel.name || activeModel.modelName, isRegenerate ? '重新构思方案...' : '构思小说方案...', isRegenerate ? 'regenerateSchemes' : 'generateSchemes');

    // 保存方案提示到历史
    const promptDesc = `标签: ${selectedTags.map(t => t.text).join(', ')}（${schemeCount}个方案）`;
    const updatedSchemeHistory = schemePromptHistory.length > 0 && schemePromptHistory[schemePromptHistory.length - 1] === promptDesc
      ? schemePromptHistory
      : [...schemePromptHistory, promptDesc].slice(-20);
    setSchemePromptHistory(updatedSchemeHistory);

    // 将补充提示词合并到灵感中
    const enrichedInspiration = supplementaryPrompt.trim()
      ? `${inspiration}\n\n补充要求：${supplementaryPrompt}`
      : inspiration;
    try {
      await generateSchemesStreaming(
        enrichedInspiration, selectedTags, activeModel, schemePrompt, schemeCount,
        {
          onToken: (text) => {
            setStreamContent(text);
            const estimatedProgress = Math.min(95, Math.floor(text.length / 20));
            aiStatus.setProgress(estimatedProgress);
          },
          onComplete: (generatedSchemes) => {
            if (!isRegenerate && generatedSchemes.length === 0) {
              setError('AI未能生成有效方案，请重试或调整标签');
              setStreamContent(null);
              setIsGenerating(false);
              aiStatus.setError('未生成有效方案');
              aiStatus.setComplete();
              return;
            }
            if (generatedSchemes.length > 0) {
              const historyEntry: SchemeHistory = {
                id: `history-${Date.now()}`,
                schemes: generatedSchemes,
                tags: selectedTags,
                inspiration,
                createdAt: Date.now(),
                groupId: null,
              };
              const newHistory = [historyEntry, ...schemeHistory].slice(0, 50);
              setSchemes(generatedSchemes);
              setSelectedScheme(null);
              onUpdate(isRegenerate
                ? { novelSchemes: generatedSchemes, schemeHistory: newHistory }
                : { inspirationTags: tags, novelSchemes: generatedSchemes, schemeHistory: newHistory }
              );
            }
            setStreamContent(null);
            setIsGenerating(false);
            aiStatus.setComplete();
          },
          onError: (errMsg) => {
            if (errMsg === '已中断生成') {
              isRegenerate ? aiStatus.resetStatus() : setError(null);
            } else {
              setError(errMsg);
              aiStatus.setError(errMsg);
              aiStatus.setComplete();
            }
            setStreamContent(null);
            setIsGenerating(false);
          },
          onTokenUsage: (tokens) => {
            aiStatus.setTokenUsage(tokens);
            const tokenStr = `Token 用量 - Prompt: ${tokens.prompt.toLocaleString()} | Completion: ${tokens.completion.toLocaleString()} | 总计: ${tokens.total.toLocaleString()}`;
            setTokenUsage(tokenStr);
          },
        }
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : `${isRegenerate ? '重新生成' : '生成'}方案失败`;
      if (msg !== '已中断生成') {
        setError(msg);
        aiStatus.setError(msg);
        aiStatus.setComplete();
      }
      setStreamContent(null);
      setIsGenerating(false);
    }
  }, [inspiration, selectedTags, tags, activeModel, schemePrompt, schemeCount, onUpdate, schemeHistory, aiStatus, schemePromptHistory, supplementaryPrompt]);

  const handleGenerateSchemes = useCallback(() => doGenerateSchemes(false), [doGenerateSchemes]);
  const handleRegenerate = useCallback(() => doGenerateSchemes(true), [doGenerateSchemes]);

  // ===== 方案交互 =====
  const handleSelectScheme = (schemeId: string) => {
    const updated = schemes.map(s =>
      s.id === schemeId ? { ...s, selected: !s.selected } : { ...s, selected: false }
    );
    setSchemes(updated);
    setSelectedScheme(updated.find(s => s.selected) || null);
  };

  const handleToggleFavorite = (schemeId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const updatedSchemes = schemes.map(s =>
      s.id === schemeId ? { ...s, favorited: !s.favorited } : s
    );
    setSchemes(updatedSchemes);
    onUpdate({ novelSchemes: updatedSchemes });
  };

  const handleConfirmScheme = () => {
    if (!hasSelectedScheme) {
      setError('请选择一个方案');
      return;
    }

    onUpdate({
      title: hasSelectedScheme.title,
      intro: hasSelectedScheme.intro,
      inspiration,
      inspirationTags: tags,
      novelSchemes: schemes,
      selectedSchemeId: hasSelectedScheme.id,
    });

    // 立刻跳转到"内容设定"
    setTimeout(() => onConfirmScheme?.(), 100);
  };

  const handleAssignSchemeToGroup = (schemeId: string, groupId: string | null) => {
    const updatedSchemes = schemes.map(s =>
      s.id === schemeId ? { ...s, groupId } : s
    );
    setSchemes(updatedSchemes);
    onUpdate({ novelSchemes: updatedSchemes });
  };

  // ===== 预览/编辑 =====
  const handleViewScheme = (scheme: NovelScheme) => {
    setViewingScheme(scheme);
  };

  const handleSaveScheme = (updatedScheme: NovelScheme) => {
    const updatedSchemes = schemes.map(s =>
      s.id === updatedScheme.id ? updatedScheme : s
    );
    setSchemes(updatedSchemes);
    setViewingScheme(null);
    onUpdate({ novelSchemes: updatedSchemes });
  };

  // ===== 历史管理 =====
  const handleRestoreFromHistory = (history: SchemeHistory) => {
    setSchemes(history.schemes);
    setSelectedScheme(null);
    onUpdate({
      novelSchemes: history.schemes,
      inspirationTags: history.tags,
    });
    setExtraPanel('none');
  };

  const handleClearHistory = () => {
    onUpdate({ schemeHistory: [] });
  };

  // ===== 分组管理 =====
  const handleCreateGroup = (name: string) => {
    const newGroup: SchemeGroup = {
      id: `group-${Date.now()}`,
      name,
      createdAt: Date.now(),
    };
    onUpdate({
      schemeGroups: [...schemeGroups, newGroup],
    });
  };

  const handleDeleteGroup = (groupId: string) => {
    const updatedSchemes = schemes.map(s =>
      s.groupId === groupId ? { ...s, groupId: null } : s
    );
    setSchemes(updatedSchemes);
    onUpdate({
      schemeGroups: schemeGroups.filter(g => g.id !== groupId),
      novelSchemes: updatedSchemes,
    });
  };

  // ===== 中止 =====
  const handleAbort = useCallback(() => {
    aiService.abort();
    setIsGenerating(false);
    setStreamContent(null);
    aiStatus.resetStatus();
  }, [aiStatus]);

  // ===== 生成进度 =====
  const renderGenerationProgress = () => {
    if (!isGenerating || !streamContent) return null;
    return (
      <div className="glass-card rounded-2xl p-5 animate-fade-in-up mb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></div>
            <span className="text-sm font-bold" style={{ color: 'var(--color-text-primary)' }}>AI 正在构思方案...</span>
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

  // ===== 加载态 =====
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
    <div className="max-w-6xl animate-fade-in-up">
      {/* 标题栏 */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'rgba(251,191,36,0.15)' }}>
            <i className="fas fa-scroll text-sm" style={{ color: '#f59e0b' }}></i>
          </div>
          <h3 className="text-lg font-bold" style={{ color: 'var(--color-text-primary)' }}>灵感方案</h3>
          <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>根据选定标签生成方案</span>
        </div>

        <div className="flex items-center gap-2">
          {/* 布局切换 */}
          <div className="glass-card-inset rounded-lg p-0.5 flex">
            <button
              onClick={() => setCardLayout('grid')}
              className="px-2.5 py-1 rounded text-xs transition-all"
              style={{
                backgroundColor: cardLayout === 'grid' ? 'var(--color-primary-100)' : 'transparent',
                color: cardLayout === 'grid' ? 'var(--color-primary-300)' : 'var(--color-text-tertiary)',
              }}
              title="网格视图"
            >
              <i className="fas fa-th-large"></i>
            </button>
            <button
              onClick={() => setCardLayout('list')}
              className="px-2.5 py-1 rounded text-xs transition-all"
              style={{
                backgroundColor: cardLayout === 'list' ? 'var(--color-primary-100)' : 'transparent',
                color: cardLayout === 'list' ? 'var(--color-primary-300)' : 'var(--color-text-tertiary)',
              }}
              title="列表视图"
            >
              <i className="fas fa-list"></i>
            </button>
          </div>

          {/* 收藏筛选 */}
          {favoritedSchemes.length > 0 && (
            <button
              onClick={() => setExtraPanel(extraPanel === 'favorites' ? 'none' : 'favorites')}
              className="px-2.5 py-1 rounded-lg text-xs transition-all flex items-center gap-1.5"
              style={{
                backgroundColor: extraPanel === 'favorites' ? 'rgba(251,191,36,0.15)' : undefined,
                color: extraPanel === 'favorites' ? '#fbbf24' : 'var(--color-text-tertiary)',
                border: extraPanel === 'favorites' ? '1px solid rgba(251,191,36,0.3)' : '1px solid var(--color-border-default)',
              }}
            >
              <i className="fas fa-star"></i>
              <span>{favoritedSchemes.length}</span>
            </button>
          )}

          {/* 历史记录 */}
          <button
            onClick={() => setExtraPanel(extraPanel === 'history' ? 'none' : 'history')}
            className="px-3 py-1.5 rounded-lg text-xs transition-all flex items-center gap-1.5"
            style={{
              backgroundColor: extraPanel === 'history' ? 'var(--color-primary-100)' : undefined,
              color: extraPanel === 'history' ? 'var(--color-primary-300)' : 'var(--color-text-tertiary)',
              border: extraPanel === 'history' ? '1px solid var(--color-primary-200)' : '1px solid var(--color-border-default)',
            }}
          >
            <i className="fas fa-history"></i>
            <span>历史</span>
            {schemeHistory.length > 0 && (
              <span className="px-1.5 rounded-full text-[10px]" style={{ backgroundColor: 'var(--color-primary-100)', color: 'var(--color-primary-300)' }}>{schemeHistory.length}</span>
            )}
          </button>
        </div>
      </div>

      {/* 已选标签展示 */}
      {selectedTags.length > 0 && (
        <div className="glass-card rounded-2xl p-4 mb-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--color-primary-100)' }}>
              <i className="fas fa-tags text-xs" style={{ color: 'var(--color-primary-400)' }}></i>
            </div>
            <h4 className="text-sm font-bold" style={{ color: 'var(--color-text-primary)' }}>已选标签</h4>
            <span className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>{selectedTags.length} 个</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {selectedTags.map(tag => (
              <span
                key={tag.id}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium"
                style={{
                  backgroundColor: 'var(--color-primary-100)',
                  color: 'var(--color-primary-300)',
                  border: '1px solid var(--color-primary-200)',
                }}
              >
                {tag.source === 'user' && <i className="fas fa-pen text-[8px] text-amber-400"></i>}
                {tag.text}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 生成配置区域 */}
      <div className="glass-card rounded-2xl p-5 mb-4 card-float-hover">
        {/* 补充提示词 */}
        <div className="mb-4">
          <label className="block text-xs mb-1.5" style={{ color: 'var(--color-text-tertiary)' }}>
            <i className="fas fa-pen mr-1" style={{ color: 'var(--color-primary-400)' }}></i>
            补充提示（可选）
          </label>
          <textarea
            value={supplementaryPrompt}
            onChange={(e) => setSupplementaryPrompt(e.target.value)}
            placeholder="可在此补充对方案的额外要求，如：偏向科幻风格、希望剧情反转强烈..."
            className="neumorphic-input w-full rounded-xl px-4 py-2.5 text-sm resize-none h-16"
            style={{ color: 'var(--color-text-primary)' }}
          />
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>方案数量:</span>
            <div className="glass-card-inset rounded-lg p-0.5 flex items-center gap-1">
              {[1, 2, 3, 4, 5].map(n => (
                <button
                  key={n}
                  onClick={() => setSchemeCount(n)}
                  className={`w-7 h-7 rounded text-xs font-bold transition-all`}
                  style={{
                    backgroundColor: schemeCount === n ? 'var(--color-primary-100)' : 'transparent',
                    color: schemeCount === n ? 'var(--color-primary-300)' : 'var(--color-text-tertiary)',
                  }}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <AIProgressButton
              onClick={handleGenerateSchemes}
              isGenerating={isGenerating}
              progress={aiStatus.status.progress}
              label="AI 生成方案"
              generatingLabel="AI构思中..."
              icon="fa-scroll"
              disabled={selectedTags.length === 0}
            />
          </div>
        </div>
      </div>

      {renderGenerationProgress()}
      {renderLoadingState()}

      {/* 历史记录面板 */}
      {extraPanel === 'history' && (
        <HistoryPanel
          title="生成历史"
          icon="fa-history"
          iconColor="var(--color-primary-400)"
          histories={schemeHistory.filter(h => h.schemes.length > 0)}
          onRestore={handleRestoreFromHistory}
          onClear={handleClearHistory}
          emptyText="暂无历史记录"
        />
      )}

      {/* 收藏/分组面板 */}
      {extraPanel === 'favorites' && (
        <FavoritesPanel
          favoritedSchemes={favoritedSchemes}
          schemeGroups={schemeGroups}
          onSelectScheme={(schemeId) => {
            setSchemes(prev => prev.map(s => ({
              ...s,
              selected: s.id === schemeId
            })));
            setSelectedScheme(schemes.find(s => s.id === schemeId) || null);
          }}
          onToggleFavorite={handleToggleFavorite}
          onCreateGroup={handleCreateGroup}
          onDeleteGroup={handleDeleteGroup}
        />
      )}

      {/* Token 用量提示 */}
      {tokenUsage && (
        <div className="glass-card-inset rounded-lg px-4 py-2 mb-4 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
          <i className="fas fa-chart-simple mr-1.5" style={{ color: 'var(--color-primary-400)' }}></i>
          {tokenUsage}
        </div>
      )}

      {/* 方案卡片 */}
      <div className={
        cardLayout === 'grid'
          ? 'grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4'
          : 'space-y-3'
      }>
        {schemes.length === 0 ? (
          <div className="col-span-full text-center py-12">
            <i className="fas fa-scroll text-4xl mb-3" style={{ color: 'var(--color-text-tertiary)', opacity: 0.3 }}></i>
            <p className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>暂无方案，请先生成</p>
          </div>
        ) : (
          schemes.map((scheme, index) => (
            <SchemeCard
              key={scheme.id}
              scheme={scheme}
              index={index}
              layout={cardLayout}
              schemeGroups={schemeGroups}
              onSelect={handleSelectScheme}
              onToggleFavorite={handleToggleFavorite}
              onAssignGroup={handleAssignSchemeToGroup}
              onView={handleViewScheme}
            />
          ))
        )}
      </div>

      {error && (
        <div className="mt-4 px-4 py-2 rounded-lg text-sm" style={{ backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }}>
          <i className="fas fa-exclamation-circle mr-2"></i>{error}
        </div>
      )}

      {/* 方案预览/编辑弹窗 */}
      {viewingScheme && (
        <SchemePreviewModal
          scheme={viewingScheme}
          index={schemes.findIndex(s => s.id === viewingScheme.id)}
          onClose={() => setViewingScheme(null)}
          onSave={handleSaveScheme}
        />
      )}

      {/* 底部操作栏 - sticky 固定 */}
      <div className="sticky bottom-0 z-10 pt-3 pb-1">
      <div className="flex items-center justify-end">
        <div className="flex items-center gap-3">
          <AIProgressButton
            onClick={handleRegenerate}
            isGenerating={isGenerating}
            progress={aiStatus.status.progress}
            label="重新生成"
            generatingLabel="重新生成中..."
            icon="fa-redo"
            variant="outline"
          />
          <button
            onClick={handleConfirmScheme}
            disabled={!hasSelectedScheme}
            className={`px-6 py-2.5 text-white rounded-xl disabled:opacity-40 disabled:cursor-not-allowed transition-all font-medium text-sm ${
              isGenerating ? 'btn-loading-ring' : 'card-float-hover'
            }`}
            style={{
              background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-primary-600))',
              boxShadow: '0 4px 20px var(--color-primary-100)',
            }}
          >
            <i className="fas fa-check mr-2"></i>确认选择此方案
          </button>
        </div>
        </div>

      {/* 已确认方案提示 */}
      {project?.selectedSchemeId && (
        <div className="mt-3">
          <div className="rounded-xl p-3 flex items-center justify-between" style={{ backgroundColor: 'var(--color-primary-100)', border: '1px solid var(--color-primary-200)' }}>
            <div className="flex items-center gap-3">
              <i className="fas fa-check-circle" style={{ color: 'var(--color-primary-400)' }}></i>
              <span className="text-sm" style={{ color: 'var(--color-primary-300)' }}>
                已选择方案：<strong>{hasSelectedScheme?.title || project.title}</strong>
              </span>
            </div>
            <button
              onClick={() => {
                onUpdate({ selectedSchemeId: undefined });
              }}
              className="text-xs transition-colors" style={{ color: 'var(--color-text-tertiary)' }}
            >
              重新选择
            </button>
          </div>
        </div>
      )}
      </div>
    </div>
  );
};

export default InspirationSchemes;
