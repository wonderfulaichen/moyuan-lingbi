import React, { useState, useCallback, useRef } from 'react';
import { Project, ModelConfig, PromptTemplate, Chapter, VolumeOutline } from '../../../shared/types';
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
  const [expandedVolumeId, setExpandedVolumeId] = useState<string | null>(null);
  const [selectedPromptId, setSelectedPromptId] = useState('');
  const [generatingChapterId, setGeneratingChapterId] = useState<string | null>(null);
  const [infoPanelOpen, setInfoPanelOpen] = useState(true);
  const abortRef = useRef<AbortController | null>(null);
  const { setGenerating, setProgress, setStatusMessage, setComplete, setError, status } = useAIStatus();
  const { showToast } = useToast();

  const chapterPrompts = prompts.filter(p => p.category === 'chapter');
  const writingPrompts = prompts.filter(p => p.category === 'writing');

  React.useEffect(() => {
    if (chapterPrompts.length > 0 && !selectedPromptId) {
      setSelectedPromptId(chapterPrompts[0].id);
    }
  }, [chapterPrompts, selectedPromptId]);

  // 从卷细纲文本中解析章节列表（用于同步 chapters 数据）
  const parseChaptersFromVolumeText = (text: string, existingCount: number, volumeId: string, volumeName: string): Chapter[] => {
    const chapters: Chapter[] = [];
    const lines = text.split('\n');
    const chapterRegex = /第\s*([0-9一二三四五六七八九十百]+)\s*章[:：]?\s*(.+)/i;

    let pendingChapter: { title: string; bodyLines: string[] } | null = null;

    const flushChapter = () => {
      if (!pendingChapter) return;
      const bodyRaw = pendingChapter.bodyLines.join('\n').trim();
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
      chapters.push({
        id: Math.random().toString(36).substr(2, 9),
        title: pendingChapter.title.replace(/[#*]/g, '').trim() || `第${existingCount + chapters.length + 1}章`,
        summary: summary || '待补充细纲...',
        content: '',
        order: existingCount + chapters.length,
        volumeId,
        volumeName,
      });
      pendingChapter = null;
    };

    for (const line of lines) {
      const chapterMatch = line.match(chapterRegex);
      if (chapterMatch) {
        flushChapter();
        pendingChapter = { title: chapterMatch[2].trim(), bodyLines: [] };
        continue;
      }
      if (pendingChapter) {
        pendingChapter.bodyLines.push(line);
      }
    }
    flushChapter();
    return chapters;
  };

  // 从AI生成的完整文本中按卷解析
  const parseVolumes = (text: string): { volumeName: string; volumeText: string }[] => {
    const volumes: { volumeName: string; volumeText: string }[] = [];
    const lines = text.split('\n');
    const volumeRegex = /第\s*([0-9一二三四五六七八九十百]+)\s*卷[:：]?\s*(.+)/i;

    let currentVolumeName: string | null = null;
    let currentLines: string[] = [];

    const flushVolume = () => {
      if (currentVolumeName && currentLines.length > 0) {
        volumes.push({ volumeName: currentVolumeName, volumeText: currentLines.join('\n').trim() });
      }
    };

    for (const line of lines) {
      const volumeMatch = line.match(volumeRegex);
      if (volumeMatch) {
        flushVolume();
        currentVolumeName = volumeMatch[2].trim().replace(/[#*]/g, '').trim() || `第${volumeMatch[1]}卷`;
        currentLines = [line];
        continue;
      }
      if (currentVolumeName) {
        currentLines.push(line);
      }
    }
    flushVolume();

    // 如果没有解析到卷，把整个文本作为一卷
    if (volumes.length === 0 && text.trim()) {
      volumes.push({ volumeName: '第一卷', volumeText: text.trim() });
    }

    return volumes;
  };

  // 将 chapters 按卷分组，生成卷细纲文本
  const buildVolumeTextFromChapters = (volumeId: string, volumeName: string): string => {
    const volChapters = project.chapters
      .filter(c => c.volumeId === volumeId)
      .sort((a, b) => a.order - b.order);
    if (volChapters.length === 0) return '';
    const lines = [`# ${volumeName}`, ''];
    for (const ch of volChapters) {
      lines.push(`## ${ch.title}`);
      if (ch.summary) lines.push(ch.summary);
      lines.push('');
    }
    return lines.join('\n');
  };

  // 同步卷细纲文本到 chapters
  const syncVolumeTextToChapters = (volumeId: string, volumeName: string, text: string): Chapter[] => {
    const existingOtherChapters = project.chapters.filter(c => c.volumeId !== volumeId);
    const newChapters = parseChaptersFromVolumeText(text, existingOtherChapters.length, volumeId, volumeName);
    return [...existingOtherChapters, ...newChapters];
  };

  const handleAddVolume = () => {
    const existingVolumes = project.volumeOutlines || [];
    const newOrder = existingVolumes.length;
    const newVolume: VolumeOutline = {
      id: `vol-${Date.now()}`,
      name: `第${newOrder + 1}卷`,
      order: newOrder,
      summary: '',
    };
    onUpdate({ volumeOutlines: [...existingVolumes, newVolume] });
  };

  const handleUpdateVolume = (id: string, updates: Partial<VolumeOutline>) => {
    const volumes = (project.volumeOutlines || []).map(v => v.id === id ? { ...v, ...updates } : v);
    // 如果更新了 summary，同步到 chapters
    if (updates.summary !== undefined) {
      const volume = volumes.find(v => v.id === id);
      if (volume) {
        const updatedChapters = syncVolumeTextToChapters(id, volume.name, updates.summary);
        onUpdate({ volumeOutlines: volumes, chapters: updatedChapters });
        return;
      }
    }
    onUpdate({ volumeOutlines: volumes });
  };

  const handleDeleteVolume = (id: string) => {
    const remainingVolumes = (project.volumeOutlines || []).filter(v => v.id !== id);
    // 同时删除该卷关联的 chapters
    const remainingChapters = project.chapters.filter(c => c.volumeId !== id);
    onUpdate({
      volumeOutlines: remainingVolumes.map((v, i) => ({ ...v, order: i })),
      chapters: remainingChapters.map((c, i) => ({ ...c, order: i })),
    });
  };

  const handleGenerateChapterContent = useCallback(async (chapterId: string) => {
    if (!activeModel) { showToast('请先在设置中配置AI模型', 'warning'); return; }
    const chapter = project.chapters.find(c => c.id === chapterId);
    if (!chapter || !chapter.summary) { showToast('请先为该章节填写细纲内容', 'warning'); return; }
    const writingTemplate = writingPrompts[0];
    if (!writingTemplate) { showToast('未找到写作提示词模板', 'warning'); return; }
    setGeneratingChapterId(chapterId);
    const taskId = `write-chapter-${chapterId}-${Date.now()}`;
    setGenerating(activeModel.name, `AI 撰写「${chapter.title}」中...`, taskId);

    const folderChars = (project.folders || []).filter(f => f.type === 'characters').flatMap(f => f.contentCards || []).filter(c => c.isFavorited && c.content).map(c => `【${c.title}】\n${c.content.slice(0, 500)}`);
    const legacyChars = project.characters.filter(c => c.name !== '新角色').map(c => `【${c.name}】(${c.role})\n- 性格：${c.personality}\n- 背景：${c.background}`);
    const charDetails = [...folderChars, ...legacyChars].join('\n\n');

    const finalPrompt = writingTemplate.content
      .replace('{title}', project.title).replace('{chapter_title}', chapter.title)
      .replace('{summary}', chapter.summary).replace('{characters}', charDetails || '暂无角色信息')
      .replace('{content}', chapter.content || '（新章节，无已有内容）');

    let accumulatedContent = '';
    try {
      await aiService.generateWithContext({ model: activeModel, prompt: finalPrompt }, (response) => {
        if (response.content) { accumulatedContent = response.content; setStatusMessage(`AI 撰写「${chapter.title}」中... (${accumulatedContent.length} 字)`); }
        if (response.isComplete) { onUpdate({ chapters: project.chapters.map(c => c.id === chapterId ? { ...c, content: accumulatedContent } : c) }); setComplete(); setGeneratingChapterId(null); showToast(`「${chapter.title}」撰写完成`, 'success'); }
        if (response.error) { setError(response.error); setGeneratingChapterId(null); showToast(`撰写失败：${response.error}`, 'error'); }
      });
    } catch (err: any) { setError(err.message || '撰写失败'); setGeneratingChapterId(null); showToast(`撰写失败：${err.message}`, 'error'); }
  }, [activeModel, project, writingPrompts, setGenerating, setStatusMessage, setComplete, setError, showToast, onUpdate]);

  const handleGenerateDetailed = useCallback(async () => {
    if (!activeModel) { showToast('请先在设置中配置AI模型', 'warning'); return; }
    if (!project.outline) { showToast('请先在大纲视图中编写故事大纲', 'warning'); return; }
    const template = prompts.find(p => p.id === selectedPromptId);
    if (!template) { showToast('请选择一个章节生成模板', 'warning'); return; }
    setIsGenerating(true); setStreamingContent('');
    const taskId = `detailed-outline-${Date.now()}`;
    setGenerating(activeModel.name, 'AI 生成卷细纲中...', taskId);

    const folderChars = (project.folders || []).filter(f => f.type === 'characters').flatMap(f => f.contentCards || []).filter(c => c.isFavorited && c.content).map(c => `【${c.title}】\n${c.content.slice(0, 500)}`);
    const legacyChars = project.characters.filter(c => c.name !== '新角色').map(c => `【${c.name}】(${c.role})\n- 性格：${c.personality}\n- 背景：${c.background}`);
    const charDetails = [...folderChars, ...legacyChars].join('\n\n');

    let finalPrompt = template.content.replace('{title}', project.title).replace('{intro}', project.intro || '暂无简介').replace('{outline}', project.outline).replace('{characters}', charDetails || '暂无角色');

    // 已有卷细纲作为上下文
    const existingVolumes = project.volumeOutlines || [];
    if (existingVolumes.length > 0) {
      const existingStr = existingVolumes.sort((a, b) => a.order - b.order).map(v => `# ${v.name}\n${v.summary}`).join('\n\n---\n\n');
      finalPrompt += `\n\n### 已有卷细纲\n${existingStr}\n\n请在此基础上继续生成后续卷。`;
    } else if (project.chapters.length > 0) {
      const existingChaptersStr = project.chapters.sort((a, b) => a.order - b.order).map((c, i) => `第${i + 1}章：${c.title}\n细纲：${c.summary}`).join('\n\n');
      finalPrompt += `\n\n### 已有章节\n${existingChaptersStr}\n\n请在此基础上继续生成后续卷。`;
    }

    let accumulatedContent = '';
    try {
      await aiService.generateWithContext({ model: activeModel, prompt: finalPrompt }, (response) => {
        if (response.content) { accumulatedContent = response.content; setStreamingContent(accumulatedContent); setStatusMessage(`AI 生成卷细纲中... (${accumulatedContent.length} 字符)`); }
        if (response.isComplete) {
          const parsedVolumes = parseVolumes(accumulatedContent);
          if (parsedVolumes.length > 0) {
            const existingVolumes = project.volumeOutlines || [];
            const existingChapters = project.chapters;
            let chapterOffset = existingChapters.length;

            const newVolumes: VolumeOutline[] = parsedVolumes.map((pv, idx) => {
              const volId = `vol-${Date.now()}-${idx}`;
              const volName = pv.volumeName;
              // 解析该卷的章节
              const volChapters = parseChaptersFromVolumeText(pv.volumeText, chapterOffset, volId, volName);
              chapterOffset += volChapters.length;

              return {
                id: volId,
                name: volName,
                order: existingVolumes.length + idx,
                summary: pv.volumeText,
              };
            });

            // 收集所有新章节
            const allNewChapters: Chapter[] = [];
            for (const pv of parsedVolumes) {
              const vol = newVolumes.find(v => v.name === pv.volumeName);
              if (vol) {
                const volChapters = parseChaptersFromVolumeText(
                  pv.volumeText,
                  existingChapters.length + allNewChapters.length,
                  vol.id,
                  vol.name
                );
                allNewChapters.push(...volChapters);
              }
            }

            onUpdate({
              volumeOutlines: [...existingVolumes, ...newVolumes],
              chapters: [...existingChapters, ...allNewChapters],
            });
          }
          setComplete(); setIsGenerating(false); setStreamingContent('');
        }
        if (response.error) { setError(response.error); setIsGenerating(false); }
      }, taskId);
    } catch (err: any) { if (err.name !== 'AbortError') { console.error('Detailed outline generation failed:', err); setError(err.message || '细纲生成失败'); setIsGenerating(false); } }
  }, [activeModel, project, prompts, selectedPromptId, onUpdate, setGenerating, setStatusMessage, setComplete, setError]);

  const sortedVolumes = [...(project.volumeOutlines || [])].sort((a, b) => a.order - b.order);

  const allChars = (() => {
    const folderChars = (project.folders || []).filter(f => f.type === 'characters').flatMap(f => f.contentCards || []).filter(c => c.isFavorited && c.title && c.title !== '新角色');
    const legacyChars = project.characters.filter(c => c.name !== '新角色');
    const combined = [...folderChars, ...legacyChars];
    return combined.filter((c, i, arr) => arr.findIndex(x => (x as any).title === (c as any).title || (x as any).name === (c as any).name) === i);
  })();

  const InfoPanel = () => (
    <div className="flex flex-col h-full">
      <div className={`flex items-center ${infoPanelOpen ? 'justify-between px-4 py-3' : 'justify-center py-3'} shrink-0`}>
        {infoPanelOpen && (
          <h3 className="text-sm font-bold flex items-center gap-2" style={{ color: 'var(--color-text-primary)' }}>
            <i className="fas fa-circle-info text-xs" style={{ color: 'var(--color-primary-400)' }}></i>
            项目信息
          </h3>
        )}
        <button onClick={() => setInfoPanelOpen(!infoPanelOpen)}
          className={`rounded-lg flex items-center justify-center transition-all hover:bg-white/10 ${infoPanelOpen ? 'w-7 h-7' : 'w-8 h-8'}`}
          style={{ color: 'var(--color-text-muted)' }} title={infoPanelOpen ? '收起面板' : '展开项目信息'}>
          <i className={`fas text-xs ${infoPanelOpen ? 'fa-chevron-left' : 'fa-chevron-right'}`}></i>
        </button>
      </div>
      <div className={`flex-1 overflow-y-auto transition-opacity duration-200 ${infoPanelOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        <div className="px-4 pb-4 space-y-3">
          <div className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.03)' }}>
            <div className="flex items-center gap-2 mb-1.5">
              <i className="fas fa-book text-[10px]" style={{ color: 'var(--color-primary-400)' }}></i>
              <span className="text-xs font-semibold" style={{ color: 'var(--color-text-primary)' }}>标题</span>
            </div>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>{project.title}</p>
          </div>
          {project.intro && (
            <div className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.03)' }}>
              <div className="flex items-center gap-2 mb-1.5">
                <i className="fas fa-quote-left text-[10px]" style={{ color: 'var(--color-primary-400)' }}></i>
                <span className="text-xs font-semibold" style={{ color: 'var(--color-text-primary)' }}>简介</span>
              </div>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-secondary)', maxHeight: '180px', overflowY: 'auto' }}>{project.intro}</p>
            </div>
          )}
          {project.outline && (
            <div className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.03)' }}>
              <div className="flex items-center gap-2 mb-1.5">
                <i className="fas fa-sitemap text-[10px]" style={{ color: 'var(--color-primary-400)' }}></i>
                <span className="text-xs font-semibold" style={{ color: 'var(--color-text-primary)' }}>大纲摘要</span>
              </div>
              <p className="text-[11px] leading-relaxed line-clamp-6" style={{ color: 'var(--color-text-secondary)' }}>{project.outline}</p>
            </div>
          )}
          <div>
            <h3 className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--color-text-muted)' }}>角色档案 ({allChars.length})</h3>
            {allChars.length === 0 ? (
              <p className="text-[11px] italic px-2.5 py-2 rounded-lg" style={{ color: 'var(--color-text-tertiary)', background: 'rgba(255,255,255,0.02)' }}>暂无角色</p>
            ) : (
              <div className="space-y-1">
                {allChars.slice(0, 20).map(c => {
                  const name = (c as any).title || (c as any).name || '未命名';
                  return (
                    <div key={c.id} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-white/[0.04] transition-colors">
                      <div className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0"
                        style={{ background: `linear-gradient(135deg, var(--color-primary-400), var(--color-primary-500))` }}>{name[0]}</div>
                      <p className="text-xs font-medium truncate" style={{ color: 'var(--color-text-secondary)' }}>{name}</p>
                    </div>
                  );
                })}
                {allChars.length > 20 && <p className="text-[9px] text-center py-1" style={{ color: 'var(--color-text-muted)' }}>+{allChars.length - 20}</p>}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="h-full flex flex-col md:flex-row">
      {/* 左侧信息面板 */}
      <div className={`shrink-0 overflow-hidden flex flex-col transition-all duration-300 ease-in-out ${infoPanelOpen ? 'w-[260px] lg:w-[300px]' : 'w-0 md:w-[36px]'}`}
        style={{ background: 'rgba(255,255,255,0.02)' }}>
        {infoPanelOpen && (
          <div className="hidden md:block absolute right-0 top-0 bottom-0 w-px"
            style={{ background: 'linear-gradient(to bottom, transparent, rgba(255,255,255,0.06), transparent)' }} />
        )}
        <InfoPanel />
      </div>

      {/* 右侧主区域 */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* 操作栏 */}
        <div className="flex items-center justify-between px-4 md:px-6 py-3 shrink-0 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <button onClick={() => setInfoPanelOpen(!infoPanelOpen)} className="md:hidden shrink-0 w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: 'var(--color-primary-100)', color: 'var(--color-primary-400)' }}><i className={`fas text-xs ${infoPanelOpen ? 'fa-chevron-left' : 'fa-circle-info'}`}></i></button>
            <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'var(--color-primary-100)' }}>
              <i className="fas fa-list-tree text-xs" style={{ color: 'var(--color-primary-400)' }}></i>
            </div>
            <h3 className="text-sm md:text-base font-bold truncate" style={{ color: 'var(--color-text-primary)' }}>卷细纲</h3>
          </div>
          <div className="flex items-center gap-1.5 md:gap-2 shrink-0">
            <select value={selectedPromptId} onChange={(e) => setSelectedPromptId(e.target.value)}
              className="neumorphic-input rounded-lg px-2 md:px-3 py-1.5 text-xs appearance-none cursor-pointer pr-6 hidden sm:block" style={{ color: 'var(--color-text-secondary)' }}>
              {chapterPrompts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            {isGenerating ? (
              <button onClick={() => { if (abortRef.current) { abortRef.current.abort(); abortRef.current = null; } aiService.abortAll(); setIsGenerating(false); }}
                className="px-4 py-2 rounded-lg text-sm border border-red-400/30 hover:bg-red-400/10 transition-colors"><i className="fas fa-stop text-sm mr-1.5" style={{ color: 'var(--color-red-400)' }}></i><span style={{ color: 'var(--color-red-400)' }}>停止</span></button>
            ) : (
              <AIProgressButton onClick={handleGenerateDetailed} isGenerating={isGenerating} progress={status.progress} label="AI生成细纲" generatingLabel="生成中..." icon="fa-magic" disabled={!activeModel || !project.outline} />
            )}
            <button onClick={handleAddVolume}
              className="px-4 py-2 rounded-lg transition-all text-sm font-medium card-float-hover hidden sm:flex items-center gap-1.5"
              style={{ color: 'var(--color-primary-300)', background: 'rgba(255,255,255,0.05)' }}><i className="fas fa-plus text-sm"></i>添加卷</button>
          </div>
        </div>

        {/* 流式输出 */}
        {streamingContent && (
          <div className="shrink-0 px-4 md:px-6 pb-2">
            <div className="rounded-xl p-3 max-h-36 overflow-y-auto" style={{ background: 'rgba(255,255,255,0.03)' }}>
              <div className="flex items-center gap-2 mb-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"></div>
                <span className="text-[11px] font-medium" style={{ color: 'var(--color-text-primary)' }}>AI 正在生成...</span>
                <span className="text-[9px]" style={{ color: 'var(--color-text-tertiary)' }}>({streamingContent.length}字符)</span>
              </div>
              <pre className="text-[11px] whitespace-pre-wrap font-mono leading-relaxed" style={{ color: 'var(--color-text-tertiary)' }}>
                {streamingContent}<span className="inline-block w-1 h-3 animate-pulse ml-0.5 align-text-bottom" style={{ backgroundColor: 'var(--color-primary-400)' }}></span>
              </pre>
            </div>
          </div>
        )}

        {/* 卷列表 */}
        <div className="flex-1 overflow-y-auto px-4 md:px-6 pb-4">
          <div className="max-w-3xl space-y-3">
            {sortedVolumes.length === 0 ? (
              <div className="rounded-2xl p-10 text-center" style={{ background: 'rgba(255,255,255,0.02)' }}>
                <i className="fas fa-list-ol text-3xl mb-3 opacity-30" style={{ color: 'var(--color-text-muted)' }}></i>
                <p className="font-bold text-sm" style={{ color: 'var(--color-text-secondary)' }}>尚未创建卷细纲</p>
                <p className="text-xs mt-1" style={{ color: 'var(--color-text-tertiary)' }}>使用AI基于大纲生成细纲，或手动添加卷</p>
                {!project.outline && <p className="text-[11px] mt-2" style={{ color: 'var(--color-primary-400)' }}><i className="fas fa-info-circle mr-1"></i>建议先在大纲视图中编写故事大纲</p>}
              </div>
            ) : (
              sortedVolumes.map((volume, index) => {
                const isExpanded = expandedVolumeId === volume.id;
                const volChapters = project.chapters.filter(c => c.volumeId === volume.id).sort((a, b) => a.order - b.order);
                return (
                  <div key={volume.id} className="rounded-xl overflow-hidden transition-all duration-200" style={{ background: 'rgba(255,255,255,0.03)' }}>
                    {/* 卷标题栏 */}
                    <div className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-white/[0.04] transition-colors"
                      onClick={() => setExpandedVolumeId(isExpanded ? null : volume.id)}>
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 font-bold text-[10px] text-white"
                        style={{ background: `linear-gradient(135deg, var(--color-primary-400), var(--color-primary-500))` }}>
                        {index + 1}
                      </div>
                      <input
                        type="text"
                        value={volume.name}
                        onChange={(e) => { e.stopPropagation(); handleUpdateVolume(volume.id, { name: e.target.value }); }}
                        onClick={(e) => e.stopPropagation()}
                        className="flex-1 bg-transparent font-bold text-sm focus:outline-none border-b border-transparent focus:border-theme-active transition-all pb-0.5 min-w-0"
                        style={{ color: 'var(--color-text-primary)' }}
                      />
                      <span className="text-[10px] shrink-0" style={{ color: 'var(--color-text-muted)' }}>({volChapters.length}章)</span>
                      <button onClick={(e) => { e.stopPropagation(); handleDeleteVolume(volume.id); }}
                        className="p-1 transition-colors hover:text-red-400 shrink-0" style={{ color: 'var(--color-text-muted)' }}>
                        <i className="fas fa-trash text-[10px]"></i>
                      </button>
                      <i className={`fas fa-chevron-down text-[10px] transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                        style={{ color: 'var(--color-text-muted)' }}></i>
                    </div>

                    {/* 卷细纲内容 */}
                    {isExpanded && (
                      <div className="px-4 pb-4 pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                        <label className="text-[11px] font-medium mb-1.5 flex items-center gap-1.5" style={{ color: 'var(--color-text-muted)' }}>
                          <i className="fas fa-align-left text-[9px]"></i>卷细纲内容
                        </label>
                        <textarea
                          value={volume.summary}
                          onChange={(e) => handleUpdateVolume(volume.id, { summary: e.target.value })}
                          placeholder={`在这里编写${volume.name}的细纲内容...\n\n格式示例：\n## 第一章：标题\n本章细纲内容...\n\n## 第二章：标题\n本章细纲内容...`}
                          className="w-full neumorphic-input rounded-lg px-3 py-2.5 text-xs leading-relaxed resize-none focus:outline-none transition-all"
                          style={{ color: 'var(--color-text-secondary)', minHeight: '300px' }}
                        />
                        {/* 章节快捷列表 */}
                        {volChapters.length > 0 && (
                          <div className="mt-3">
                            <label className="text-[11px] font-medium mb-1.5 flex items-center gap-1.5" style={{ color: 'var(--color-text-muted)' }}>
                              <i className="fas fa-book text-[9px]"></i>章节列表
                            </label>
                            <div className="space-y-1">
                              {volChapters.map(ch => (
                                <div key={ch.id} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.02)' }}>
                                  <span className="w-5 h-5 rounded flex items-center justify-center text-[9px] font-bold text-white shrink-0"
                                    style={{ background: 'var(--color-primary-500)' }}>{ch.order + 1}</span>
                                  <span className="text-xs flex-1 truncate" style={{ color: 'var(--color-text-secondary)' }}>{ch.title}</span>
                                  {ch.content ? (
                                    <span className="text-[9px] px-1.5 py-0.5 rounded text-green-400" style={{ background: 'rgba(34,197,94,0.08)' }}>{ch.content.length}字</span>
                                  ) : (
                                    <button onClick={() => handleGenerateChapterContent(ch.id)} disabled={generatingChapterId === ch.id}
                                      className="px-2 py-0.5 rounded text-[9px] font-medium transition-all"
                                      style={{ background: generatingChapterId === ch.id ? 'var(--color-surface-hover)' : 'linear-gradient(135deg, var(--color-primary-400), var(--color-primary-500))', color: generatingChapterId === ch.id ? 'var(--color-primary-400)' : 'var(--color-text-inverse, #fff)' }}>
                                      {generatingChapterId === ch.id ? '撰写中...' : '撰写'}
                                    </button>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DetailedOutlineView;
