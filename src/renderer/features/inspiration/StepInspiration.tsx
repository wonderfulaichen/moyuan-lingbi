import React, { useState, useCallback, useEffect, useRef } from 'react';
import { InspirationTag, ModelConfig, PromptTemplate } from '../../../shared/types';
import { NovelScheme } from '../../../shared/types/fileSystem';
import { dataService } from '../../shared/services/DataService';
import { generateTags, generateSchemesStreaming } from './inspirationService';
import { aiService } from '../../shared/services/aiService';
import { useAIStatus } from '../../shared/contexts/AIStatusContext';
import { InputModal } from '../../shared/components/Modal';
import AIProgressButton from '../../shared/components/AIProgressButton';
import SchemeCard from './components/SchemeCard';
import SchemePreviewModal from './components/SchemePreviewModal';
import HistoryPanel from './components/HistoryPanel';

type SubTab = 'incubation' | 'schemes';

interface StepInspirationProps {
  activeModel: ModelConfig;
  prompts: PromptTemplate[];
  onConfirmScheme: () => void;
  onOpenSettings: () => void;
}

const StepInspiration: React.FC<StepInspirationProps> = ({ activeModel, prompts, onConfirmScheme, onOpenSettings }) => {
  const project = dataService.getActiveProject();
  const [subTab, setSubTab] = useState<SubTab>(() => {
    if (project?.selectedSchemeId) return 'schemes';
    if (project?.novelSchemes?.length) return 'schemes';
    return 'incubation';
  });
  const [inspiration, setInspiration] = useState(project?.inspiration.text || '');
  const [tags, setTags] = useState<InspirationTag[]>(project?.inspiration.tags || []);
  const [schemes, setSchemes] = useState<NovelScheme[]>(project?.novelSchemes || []);
  const [isGeneratingTags, setIsGeneratingTags] = useState(false);
  const [isGeneratingSchemes, setIsGeneratingSchemes] = useState(false);
  const [streamContent, setStreamContent] = useState<string | null>(null);
  const [error, setErrorMsg] = useState<string | null>(null);
  const [tagCount, setTagCount] = useState(() => { try { return parseInt(localStorage.getItem('moyuan-tag-count') || '3', 10); } catch { return 3; } });
  const [schemeCount, setSchemeCount] = useState(() => { try { return parseInt(localStorage.getItem('moyuan-scheme-count') || '3', 10); } catch { return 3; } });
  const [supplementaryPrompt, setSupplementaryPrompt] = useState('');
  const [customTagModal, setCustomTagModal] = useState(false);
  const [viewingScheme, setViewingScheme] = useState<NovelScheme | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showTagHistory, setShowTagHistory] = useState(false);
  const schemeHistory = project?.schemeHistory || [];
  const tagHistory = schemeHistory.filter(h => h.tags.length > 0 && h.schemes.length === 0);
  const streamEndRef = useRef<HTMLDivElement>(null);
  const { setGenerating, setProgress, setTokenUsage, setComplete, setError: setAIError, resetStatus, status } = useAIStatus();
  const aiProgress = status.progress;

  useEffect(() => { if (project) { setInspiration(project.inspiration.text || ''); setTags(project.inspiration.tags || []); setSchemes(project.novelSchemes || []); } }, [project?.id]);
  useEffect(() => { try { localStorage.setItem('moyuan-tag-count', String(tagCount)); } catch {} }, [tagCount]);
  useEffect(() => { try { localStorage.setItem('moyuan-scheme-count', String(schemeCount)); } catch {} }, [schemeCount]);
  useEffect(() => { if (streamContent && streamEndRef.current) streamEndRef.current.scrollIntoView({ behavior: 'smooth' }); }, [streamContent]);

  const tagPrompt = prompts.find(p => p.category === 'inspiration' && p.id.includes('tag'))?.content || '请根据以下灵感，发散出{count}个创作标签：\n\n{inspiration}';
  const schemePrompt = prompts.find(p => p.category === 'inspiration' && p.id.includes('scheme'))?.content || '请根据以下灵感和标签，构思{count}个小说方案。每个方案必须包含：书名、题材、基调、核心冲突、简介、亮点。用 --- 分隔不同方案。\n\n灵感：{inspiration}\n\n标签：{tags}';

  const handleToggleTag = (tagId: string) => setTags(prev => prev.map(t => t.id === tagId ? { ...t, selected: !t.selected } : t));
  const handleAddCustomTag = (text: string) => {
    setTags(prev => [...prev, { id: `tag-custom-${Date.now()}`, text, selected: true, source: 'user' }]);
  };

  const handleGenerateTags = useCallback(async () => {
    if (!inspiration.trim() || !activeModel?.modelName) { onOpenSettings(); return; }
    setIsGeneratingTags(true); setErrorMsg(null); setStreamContent('');
    setGenerating(activeModel.name, '发散标签中...');
    try {
      const generatedTags = await generateTags(inspiration, activeModel, tagPrompt, text => setStreamContent(text), undefined, tokens => setTokenUsage(tokens), tagCount);
      setTags(generatedTags); setStreamContent(null); setComplete();
      dataService.updateInspiration(inspiration, generatedTags);
      const now = Date.now();
      const meta = dataService.getActiveProject();
      if (meta) dataService.updateProjectMeta({
        schemeHistory: [{ id: `hist-${now}`, schemes: [], tags: generatedTags, inspiration, createdAt: now, groupId: null }, ...(meta.schemeHistory || [])].slice(0, 50)
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '生成标签失败';
      if (msg !== '已中断生成') { setErrorMsg(msg); setAIError(msg); } else resetStatus();
      setComplete();
    } finally { setIsGeneratingTags(false); setStreamContent(null); }
  }, [inspiration, activeModel, tagPrompt, tagCount, setGenerating, setTokenUsage, setComplete, setAIError, resetStatus, onOpenSettings]);

  const handleGenerateSchemes = useCallback(async () => {
    const selected = tags.filter(t => t.selected);
    if (selected.length === 0) { setErrorMsg('请至少选择一个标签'); return; }
    if (!activeModel?.modelName) { onOpenSettings(); return; }
    setIsGeneratingSchemes(true); setErrorMsg(null); setStreamContent('');
    setGenerating(activeModel.name, '构思方案中...');
    const enriched = supplementaryPrompt.trim() ? `${inspiration}\n\n补充要求：${supplementaryPrompt}` : inspiration;
    try {
      await generateSchemesStreaming(enriched, selected, activeModel, schemePrompt, schemeCount, {
        onToken: text => { setStreamContent(text); setProgress(Math.min(95, Math.floor(text.length / 20))); },
        onComplete: generated => {
          if (!generated.length) { setErrorMsg('AI未能生成有效方案'); setIsGeneratingSchemes(false); setAIError('未生成有效方案'); setStreamContent(null); return; }
          const now = Date.now();
          const newSchemes: NovelScheme[] = generated.map((s, i) => ({
            id: `scheme-${now}-${i}`, title: s.title, intro: s.intro, genre: s.genre || '', tone: s.tone || '',
            coreConflict: s.coreConflict || '', highlights: s.highlights || '', selected: false, favorited: false,
            groupId: null, createdAt: now,
          }));
          setSchemes(newSchemes); setIsGeneratingSchemes(false); setStreamContent(null); setComplete();
          dataService.updateSchemes(newSchemes);
          const meta = dataService.getActiveProject();
          if (meta) dataService.updateProjectMeta({
            schemeHistory: [{ id: `hist-${now}`, schemes: newSchemes, tags: selected, inspiration, createdAt: now, groupId: null }, ...(meta.schemeHistory || [])].slice(0, 50)
          });
        },
        onError: err => { if (err !== '已中断生成') { setErrorMsg(err); setAIError(err); } resetStatus(); setIsGeneratingSchemes(false); setStreamContent(null); },
        onTokenUsage: tokens => setTokenUsage(tokens),
      });
    } catch (err) { const msg = err instanceof Error ? err.message : ''; if (msg !== '已中断生成') { setErrorMsg(msg); setAIError(msg); } setIsGeneratingSchemes(false); setStreamContent(null); }
  }, [tags, inspiration, supplementaryPrompt, activeModel, schemePrompt, schemeCount, setGenerating, setProgress, setTokenUsage, setComplete, setAIError, resetStatus, onOpenSettings]);

  const handleSelectScheme = (schemeId: string) => setSchemes(prev => prev.map(s => ({ ...s, selected: s.id === schemeId })));
  const handleViewScheme = (scheme: NovelScheme) => setViewingScheme(scheme);
  const handleToggleFavorite = (schemeId: string) => setSchemes(prev => prev.map(s => s.id === schemeId ? { ...s, favorited: !s.favorited } : s));
  const handleSaveScheme = (updatedScheme: NovelScheme) => {
    setSchemes(prev => prev.map(s => s.id === updatedScheme.id ? updatedScheme : s));
    setViewingScheme(null);
  };
  const handleRestoreFromHistory = (history) => {
    setSchemes(history.schemes);
  };
  const handleClearHistory = () => {
    dataService.updateProjectMeta({ schemeHistory: [] });
  };
  const handleRestoreTagHistory = (history) => {
    const restoredTags = history.tags.map(t => ({ ...t, selected: true }));
    setTags(prev => {
      const existingTexts = new Set(prev.map(t => t.text));
      const newTags = restoredTags.filter(t => !existingTexts.has(t.text));
      return [...prev, ...newTags];
    });
  };
  const handleToggleHistoryTag = (tag: InspirationTag) => {
    setTags(prev => {
      const existing = prev.find(t => t.text === tag.text);
      if (existing) {
        return prev.map(t => t.id === existing.id ? { ...t, selected: !t.selected } : t);
      }
      return [...prev, { ...tag, selected: true }];
    });
  };
  const handleConfirmScheme = useCallback(() => {
    const sel = schemes.find(s => s.selected);
    if (!sel) { setErrorMsg('请选择一个方案'); return; }
    dataService.confirmScheme(sel.id);
    dataService.updateInspiration(inspiration, tags);
    onConfirmScheme();
  }, [schemes, inspiration, tags, onConfirmScheme]);

  const handleAbort = useCallback(() => { aiService.abort(); setIsGeneratingTags(false); setIsGeneratingSchemes(false); setStreamContent(null); resetStatus(); }, [resetStatus]);
  const isGenerating = isGeneratingTags || isGeneratingSchemes;

  return (
    <div className="animate-fade-in p-6 mx-auto" style={{ maxWidth: 900 }}>
      {/* Tab switcher */}
      <div className="segmented-control text-xs mb-5 w-fit">
        {(['incubation', 'schemes'] as SubTab[]).map(tab => (
          <button key={tab} className={subTab === tab ? 'active' : ''} onClick={() => setSubTab(tab)}>
            <i className={`fas ${tab === 'incubation' ? 'fa-lightbulb' : 'fa-scroll'} mr-1.5`} />
            {tab === 'incubation' ? '灵感萌发' : '灵感方案'}
          </button>
        ))}
      </div>

      {/* Confirmed scheme banner */}
      {project?.selectedSchemeId && subTab === 'incubation' && (
        <div className="glass-card glass-card-inset px-4 py-3 mb-4 flex items-center justify-between" style={{ border: '1px solid var(--color-primary-200)' }}>
          <span className="text-xs" style={{ color: 'var(--color-primary-300)' }}>
            <i className="fas fa-check-circle mr-1.5" />已选方案：<strong>{project.title}</strong>
          </span>
          <button onClick={() => dataService.updateProjectMeta({ selectedSchemeId: null })} className="btn-text text-[10px]">重新选择</button>
        </div>
      )}

      {/* ====== 灵感萌发 Tab ====== */}
      {subTab === 'incubation' && (
        <>
          <div className="glass-card p-6 mb-4 rounded-2xl">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'var(--color-primary-100)' }}>
                <i className="fas fa-lightbulb" style={{ color: 'var(--color-primary-400)' }} />
              </div>
              <div>
                <h3 className="text-base font-bold" style={{ color: 'var(--color-text-primary)' }}>灵感萌发</h3>
                <p className="text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>写下你的灵感，AI 帮你发散构思</p>
              </div>
            </div>
            <textarea
              value={inspiration}
              onChange={e => setInspiration(e.target.value)}
              placeholder="输入你的小说灵感……&#10;例如：一个古代刺客穿越到现代都市，意外卷入一场阴谋……"
              className="w-full h-28 rounded-xl outline-none border resize-none p-3 text-[13px] leading-relaxed"
              style={{ color: 'var(--color-text-secondary)', backgroundColor: 'var(--color-surface-muted)', borderColor: 'var(--color-border-default)', fontFamily: 'inherit' }}
            />
            <div className="flex items-center justify-between mt-3">
              <div className="flex items-center gap-2">
                <span className="text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>标签数量</span>
                <div className="segmented-control text-[10px]">
                  {[3, 5, 8, 10, 15].map(n => (
                    <button key={n} className={tagCount === n ? 'active' : ''} onClick={() => setTagCount(n)}>{n}</button>
                  ))}
                </div>
              </div>
              <AIProgressButton
                onClick={handleGenerateTags}
                isGenerating={isGeneratingTags}
                progress={aiProgress}
                label="AI 发散标签"
                generatingLabel="分析中…"
                icon="fa-wand-magic-sparkles"
                disabled={!inspiration.trim()}
              />
            </div>
          </div>

          {/* Stream output */}
          {streamContent && (
            <div className="glass-card p-4 mb-4 rounded-xl">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                  <span className="pulse-dot mr-1.5" style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', backgroundColor: '#34d399', animation: 'pulseGlow 1.5s infinite' }} />
                  AI 正在生成…
                </span>
                <button onClick={handleAbort} className="btn-outline-danger text-[10px] px-2 py-0.5">
                  <i className="fas fa-stop mr-1" />停止
                </button>
              </div>
              <div className="max-h-48 overflow-auto p-3 rounded-lg text-[11px] whitespace-pre-wrap font-mono" style={{ backgroundColor: 'var(--color-surface-muted)', color: 'var(--color-text-tertiary)' }}>
                {streamContent}<span className="pulse-dot" style={{ display: 'inline-block', width: 6, height: 14, backgroundColor: 'var(--color-primary-400)', marginLeft: 2, verticalAlign: 'text-bottom' }} />
                <div ref={streamEndRef} />
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="error-box text-xs px-3 py-2 rounded-lg mb-3">{error}</div>
          )}

          {/* 标签历史工具栏 */}
          {tags.length > 0 && (
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>
                共 <strong style={{ color: 'var(--color-text-secondary)' }}>{tags.length}</strong> 个标签
              </span>
              <button
                onClick={() => setShowTagHistory(!showTagHistory)}
                className="px-2.5 py-1 rounded-lg text-[10px] transition-all flex items-center gap-1"
                style={{
                  backgroundColor: showTagHistory ? 'var(--color-primary-100)' : undefined,
                  color: showTagHistory ? 'var(--color-primary-300)' : 'var(--color-text-muted)',
                  border: showTagHistory ? '1px solid var(--color-primary-200)' : '1px solid var(--color-border-default)',
                }}
              >
                <i className="fas fa-history text-[9px]" />
                标签历史
                {tagHistory.length > 0 && (
                  <span className="px-1 rounded-full text-[9px]" style={{ backgroundColor: showTagHistory ? 'var(--color-primary-200)' : 'var(--color-primary-100)', color: 'var(--color-primary-400)' }}>
                    {tagHistory.length}
                  </span>
                )}
              </button>
            </div>
          )}

          {/* 标签历史面板 */}
          {showTagHistory && (
            <HistoryPanel
              title="标签生成历史"
              icon="fa-history"
              iconColor="#f59e0b"
              histories={tagHistory}
              onRestore={handleRestoreTagHistory}
              onClear={() => dataService.updateProjectMeta({ schemeHistory: [] })}
              emptyText="暂无标签历史，AI 发散标签后这里会显示"
              selectedTagTexts={tags.filter(t => t.selected).map(t => t.text)}
              onToggleTag={handleToggleHistoryTag}
            />
          )}

          {/* Tags */}
          {tags.length > 0 && (
            <>
              <div className="glass-card p-4 mb-3 rounded-xl">
                <h4 className="text-[13px] font-semibold mb-2 flex items-center gap-1.5" style={{ color: 'var(--color-text-primary)' }}>
                  <i className="fas fa-tags" style={{ color: 'var(--color-primary-400)' }} />标签池
                </h4>
                <div className="flex flex-wrap gap-2">
                  {tags.map(tag => (
                    <button
                      key={tag.id}
                      onClick={() => handleToggleTag(tag.id)}
                      className="rounded-full text-[11px] font-medium cursor-pointer transition-all px-2.5 py-1 border"
                      style={{
                        background: tag.selected ? 'var(--color-primary-100)' : 'var(--color-surface-muted)',
                        color: tag.selected ? 'var(--color-primary-300)' : 'var(--color-text-secondary)',
                        borderColor: tag.selected ? 'var(--color-primary-200)' : 'var(--color-border-default)',
                      }}
                    >
                      {tag.source === 'user' && <i className="fas fa-pen text-[7px] mr-1" style={{ color: '#f59e0b' }} />}
                      {tag.text}
                    </button>
                  ))}
                  <button
                    onClick={() => setCustomTagModal(true)}
                    className="rounded-full text-[11px] cursor-pointer px-2.5 py-1 border-dashed border"
                    style={{ color: 'var(--color-text-muted)', borderColor: 'var(--color-border-default)', background: 'transparent' }}
                  >
                    <i className="fas fa-plus mr-1" />自定义
                  </button>
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setSubTab('schemes')}
                  disabled={!tags.some(t => t.selected)}
                  className="btn-gradient px-5 py-2 text-[13px] font-semibold"
                  style={{ opacity: tags.some(t => t.selected) ? 1 : 0.4 }}>
                  <i className="fas fa-scroll mr-1.5" />进入方案构思
                </button>
              </div>
            </>
          )}
        </>
      )}

      {/* ====== 灵感方案 Tab ====== */}
      {subTab === 'schemes' && (
        <>
          {tags.some(t => t.selected) && (
            <div className="glass-card p-3 mb-3 rounded-xl">
              <div className="flex flex-wrap gap-1.5">
                {tags.filter(t => t.selected).map(tag => (
                  <span key={tag.id} className="badge badge-purple text-[10px]">{tag.text}</span>
                ))}
              </div>
            </div>
          )}

          <div className="glass-card p-4 mb-4 rounded-xl">
            <textarea
              value={supplementaryPrompt}
              onChange={e => setSupplementaryPrompt(e.target.value)}
              placeholder="补充对方案的额外要求（可选）……"
              className="w-full h-12 rounded-lg outline-none border resize-none p-2 text-xs"
              style={{ color: 'var(--color-text-secondary)', backgroundColor: 'var(--color-surface-muted)', borderColor: 'var(--color-border-default)', fontFamily: 'inherit' }}
            />
            <div className="flex items-center justify-between mt-2">
              <div className="flex items-center gap-2">
                <span className="text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>方案数量</span>
                <div className="segmented-control text-[10px]">
                  {[1, 2, 3, 4, 5].map(n => (
                    <button key={n} className={schemeCount === n ? 'active' : ''} onClick={() => setSchemeCount(n)}>{n}</button>
                  ))}
                </div>
              </div>
              <AIProgressButton
                onClick={handleGenerateSchemes}
                isGenerating={isGeneratingSchemes}
                progress={aiProgress}
                label="AI 生成方案"
                generatingLabel="构思中…"
                icon="fa-scroll"
                disabled={!tags.some(t => t.selected)}
              />
            </div>
          </div>

          {/* Stream */}
          {streamContent && (
            <div className="glass-card p-4 mb-4 rounded-xl">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold flex items-center gap-1.5" style={{ color: 'var(--color-text-primary)' }}>
                  <span className="pulse-dot" style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#34d399', animation: 'pulseGlow 1.5s infinite' }} />
                  AI 正在构思方案…
                </span>
                <button onClick={handleAbort} className="btn-outline-danger text-[10px] px-2 py-0.5"><i className="fas fa-stop mr-1" />停止</button>
              </div>
              <div className="max-h-48 overflow-auto p-3 rounded-lg text-[11px] whitespace-pre-wrap font-mono" style={{ backgroundColor: 'var(--color-surface-muted)', color: 'var(--color-text-tertiary)' }}>
                {streamContent}<span className="pulse-dot" style={{ display: 'inline-block', width: 6, height: 14, backgroundColor: 'var(--color-primary-400)', marginLeft: 2, verticalAlign: 'text-bottom' }} />
                <div ref={streamEndRef} />
              </div>
            </div>
          )}

          {error && <div className="error-box text-xs px-3 py-2 rounded-lg mb-3">{error}</div>}

          {/* 工具栏：历史记录 */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>
                共 <strong style={{ color: 'var(--color-text-secondary)' }}>{schemes.length}</strong> 个方案
              </span>
            </div>
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="px-3 py-1.5 rounded-lg text-xs transition-all flex items-center gap-1.5"
              style={{
                backgroundColor: showHistory ? 'var(--color-primary-100)' : undefined,
                color: showHistory ? 'var(--color-primary-300)' : 'var(--color-text-tertiary)',
                border: showHistory ? '1px solid var(--color-primary-200)' : '1px solid var(--color-border-default)',
              }}
            >
              <i className="fas fa-history"></i>
              生成历史
              {schemeHistory.length > 0 && (
                <span className="px-1.5 rounded-full text-[10px]" style={{ backgroundColor: showHistory ? 'var(--color-primary-200)' : 'var(--color-primary-100)', color: 'var(--color-primary-400)' }}>
                  {schemeHistory.length}
                </span>
              )}
            </button>
          </div>

          {/* 历史面板 */}
          {showHistory && (
            <HistoryPanel
              title="生成历史"
              icon="fa-history"
              iconColor="var(--color-primary-400)"
              histories={schemeHistory.filter(h => h.schemes.length > 0)}
              onRestore={handleRestoreFromHistory}
              onClear={handleClearHistory}
              emptyText="暂无历史记录，生成方案后这里会显示"
            />
          )}

          {/* Scheme cards */}
          <div className="grid gap-3 mb-5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
            {schemes.map((scheme, i) => (
              <SchemeCard
                key={scheme.id}
                scheme={scheme}
                index={i}
                layout="grid"
                schemeGroups={[]}
                onSelect={handleSelectScheme}
                onToggleFavorite={(id) => handleToggleFavorite(id)}
                onAssignGroup={() => {}}
                onView={handleViewScheme}
              />
            ))}
          </div>

          {schemes.length > 0 && (
            <div className="flex justify-end pt-4 pb-3 sticky bottom-0 z-10">
              <button
                onClick={handleConfirmScheme}
                disabled={!schemes.some(s => s.selected)}
                className="px-6 py-2.5 text-white rounded-xl disabled:opacity-40 disabled:cursor-not-allowed font-medium text-sm"
                style={{
                  background: schemes.some(s => s.selected)
                    ? 'linear-gradient(135deg, var(--color-primary-500), var(--color-primary-600))'
                    : 'var(--color-surface-muted)',
                  color: schemes.some(s => s.selected) ? '#fff' : 'var(--color-text-tertiary)',
                  boxShadow: '0 4px 20px var(--color-primary-100)',
                }}>
                <i className="fas fa-check mr-1.5" />确认选择此方案
              </button>
            </div>
          )}
        </>
      )}

      {customTagModal && (
        <InputModal
          title="添加自定义标签"
          placeholder="输入标签名称"
          confirmText="添加"
          onConfirm={(v) => { handleAddCustomTag(v); setCustomTagModal(false); }}
          onCancel={() => setCustomTagModal(false)}
        />
      )}

      {viewingScheme && (
        <SchemePreviewModal
          scheme={viewingScheme}
          index={schemes.findIndex(s => s.id === viewingScheme.id)}
          onClose={() => setViewingScheme(null)}
          onSave={handleSaveScheme}
        />
      )}
    </div>
  );
};

export default StepInspiration;
