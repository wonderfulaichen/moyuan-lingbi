import React, { useState, useCallback } from 'react';
import { Project, ModelConfig, PromptTemplate } from '../../../shared/types';
import { aiService } from '../../shared/services/aiService';
import { useAIStatus } from '../../shared/contexts/AIStatusContext';
import { useToast } from '../../shared/contexts/ToastContext';

interface OutlineViewProps {
  project: Project;
  prompts: PromptTemplate[];
  activeModel: ModelConfig;
  onUpdate: (updates: Partial<Project>) => void;
  onOpenSettings: () => void;
}

const OutlineView: React.FC<OutlineViewProps> = ({
  project,
  prompts,
  activeModel,
  onUpdate,
  onOpenSettings,
}) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedPromptId, setSelectedPromptId] = useState('');
  const [infoPanelOpen, setInfoPanelOpen] = useState(true);
  const { setGenerating, setStatusMessage, setComplete, setError } = useAIStatus();
  const { showToast } = useToast();

  const outlinePrompts = prompts.filter(p => p.category === 'outline');

  React.useEffect(() => {
    if (outlinePrompts.length > 0 && !selectedPromptId) {
      setSelectedPromptId(outlinePrompts[0].id);
    }
  }, [outlinePrompts, selectedPromptId]);

  const handleGenerate = useCallback(async () => {
    if (!activeModel) {
      showToast('请先在设置中配置AI模型', 'warning');
      return;
    }
    const template = prompts.find(p => p.id === selectedPromptId);
    if (!template) {
      showToast('请选择一个大纲生成模板', 'warning');
      return;
    }
    setIsGenerating(true);
    const taskId = `outline-${Date.now()}`;
    setGenerating(activeModel.name, 'AI 生成大纲中...', taskId);

    const folderChars = (project.folders || [])
      .filter(f => f.type === 'characters')
      .flatMap(f => f.contentCards || [])
      .filter(c => c.isFavorited && c.content)
      .map(c => `【${c.title}】\n${c.content.slice(0, 500)}`);
    const legacyChars = project.characters
      .filter(c => c.name !== '新角色')
      .map(c => `【${c.name}】(${c.role})\n- 性格：${c.personality}\n- 背景：${c.background}\n- 关系：${c.relationships}`);
    const charDetails = [...folderChars, ...legacyChars].join('\n\n');

    const knowledgeContext = project.knowledge
      .filter(k => k.category === 'outline')
      .map(k => `【${k.name}】\n${k.content.substring(0, 3000)}`)
      .join('\n\n');

    let finalPrompt = template.content
      .replace('{title}', project.title)
      .replace('{intro}', project.intro || '暂无简介')
      .replace('{characters}', charDetails || '暂无角色');

    if (knowledgeContext) {
      finalPrompt += `\n\n### 世界观参考\n${knowledgeContext}`;
    }

    let accumulatedContent = '';

    try {
      await aiService.generateWithContext(
        { model: activeModel, prompt: finalPrompt },
        (response) => {
          if (response.content) {
            accumulatedContent = response.content;
            setStatusMessage(`AI 大纲生成中... (${accumulatedContent.length} 字符)`);
          }
          if (response.isComplete) {
            onUpdate({ outline: accumulatedContent });
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
        console.error('Outline generation failed:', err);
        setError(err.message || '大纲生成失败');
        setIsGenerating(false);
      }
    }
  }, [activeModel, project, prompts, selectedPromptId, onUpdate, setGenerating, setStatusMessage, setComplete, setError]);

  const handleAbort = useCallback(() => {
    aiService.abortAll();
    setIsGenerating(false);
  }, []);

  const allChars = (() => {
    const folderChars = (project.folders || [])
      .filter(f => f.type === 'characters')
      .flatMap(f => f.contentCards || [])
      .filter(c => c.isFavorited && c.title && c.title !== '新角色');
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
        <button
          onClick={() => setInfoPanelOpen(!infoPanelOpen)}
          className={`rounded-lg flex items-center justify-center transition-all hover:bg-white/10 ${
            infoPanelOpen ? 'w-7 h-7' : 'w-8 h-8'
          }`}
          style={{ color: 'var(--color-text-muted)' }}
          title={infoPanelOpen ? '收起面板' : '展开项目信息'}
        >
          <i className={`fas text-xs ${infoPanelOpen ? 'fa-chevron-left' : 'fa-chevron-right'}`}></i>
        </button>
      </div>
      <div className={`flex-1 overflow-y-auto transition-opacity duration-200 ${infoPanelOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        <div className="px-4 pb-4 space-y-3">
          <div className="rounded-xl p-3" style={{ background: 'var(--color-surface-muted)' }}>
            <div className="flex items-center gap-2 mb-1.5">
              <i className="fas fa-book text-[10px]" style={{ color: 'var(--color-primary-400)' }}></i>
              <span className="text-xs font-semibold" style={{ color: 'var(--color-text-primary)' }}>标题</span>
            </div>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>{project.title}</p>
          </div>
          {project.intro && (
            <div className="rounded-xl p-3" style={{ background: 'var(--color-surface-muted)' }}>
              <div className="flex items-center gap-2 mb-1.5">
                <i className="fas fa-quote-left text-[10px]" style={{ color: 'var(--color-primary-400)' }}></i>
                <span className="text-xs font-semibold" style={{ color: 'var(--color-text-primary)' }}>简介</span>
              </div>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-secondary)', maxHeight: '200px', overflowY: 'auto' }}>{project.intro}</p>
            </div>
          )}
          <div>
            <h3 className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--color-text-muted)' }}>
              角色档案 ({allChars.length})
            </h3>
            {allChars.length === 0 ? (
              <p className="text-[11px] italic px-2.5 py-2 rounded-lg" style={{ color: 'var(--color-text-tertiary)', background: 'var(--color-surface-hover)' }}>
                暂无角色 · 请在"内容设定"中创建
              </p>
            ) : (
              <div className="space-y-1">
                {allChars.slice(0, 30).map(c => {
                  const name = (c as any).title || (c as any).name || '未命名';
                  const isCard = !!(c as any).title;
                  return (
                    <div key={c.id} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-white/[0.04] transition-colors">
                      <div className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0"
                        style={{ background: `linear-gradient(135deg, var(--color-primary-400), var(--color-primary-500))`, color: 'var(--color-text-primary)' }}>
                        {name[0]}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium truncate" style={{ color: 'var(--color-text-secondary)' }}>{name}</p>
                        {!isCard && (c as any).role && (
                          <p className="text-[9px] truncate" style={{ color: 'var(--color-text-muted)' }}>{(c as any).role}</p>
                        )}
                      </div>
                      {isCard && <i className="fas fa-file-lines text-[7px] text-purple-400/50 shrink-0"></i>}
                    </div>
                  );
                })}
                {allChars.length > 30 && (
                  <p className="text-[9px] text-center py-1" style={{ color: 'var(--color-text-muted)' }}>+{allChars.length - 30} 更多</p>
                )}
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
      <div
        className={`shrink-0 overflow-hidden flex flex-col transition-all duration-300 ease-in-out ${
          infoPanelOpen ? 'w-[260px] lg:w-[300px]' : 'w-0 md:w-[36px]'
        }`}
        style={{ background: 'rgba(255,255,255,[var(--panel-opacity,0.02)])' }}
      >
        {/* 分割线：仅桌面端展开时显示，用极淡的渐变而非硬边线 */}
        {infoPanelOpen && (
          <div className="hidden md:block absolute right-0 top-0 bottom-0 w-px"
            style={{ background: 'linear-gradient(to bottom, transparent, rgba(255,255,255,0.06), transparent)' }} />
        )}
        <InfoPanel />
      </div>

      {/* 右侧编辑区 */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* 操作栏 */}
        <div className="flex items-center justify-between px-4 md:px-6 py-3 shrink-0 gap-2">
          <div className="flex items-center gap-2 md:gap-3 min-w-0">
            <button
              onClick={() => setInfoPanelOpen(!infoPanelOpen)}
              className="md:hidden shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-all"
              style={{ background: 'var(--color-primary-100)', color: 'var(--color-primary-400)' }}
              title={infoPanelOpen ? '收起信息' : '展开信息'}
            >
              <i className={`fas text-xs ${infoPanelOpen ? 'fa-chevron-left' : 'fa-circle-info'}`}></i>
            </button>
            <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: 'var(--color-primary-100)' }}>
              <i className="fas fa-sitemap text-xs" style={{ color: 'var(--color-primary-400)' }}></i>
            </div>
            <h3 className="text-sm md:text-base font-bold truncate" style={{ color: 'var(--color-text-primary)' }}>小说大纲</h3>
          </div>
          <div className="flex items-center gap-1.5 md:gap-2 shrink-0">
            <select
              value={selectedPromptId}
              onChange={(e) => setSelectedPromptId(e.target.value)}
              className="neumorphic-input rounded-lg px-2 md:px-3 py-1.5 text-xs appearance-none cursor-pointer pr-6 hidden sm:block"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              {outlinePrompts.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            {isGenerating ? (
              <button onClick={handleAbort}
                className="px-4 py-2 rounded-lg text-sm border border-red-400/30 hover:bg-red-400/10 transition-colors">
                <i className="fas fa-stop text-sm mr-1.5" style={{ color: 'var(--color-red-400)' }}></i><span style={{ color: 'var(--color-red-400)' }}>停止</span>
              </button>
            ) : (
              <button onClick={handleGenerate} disabled={!activeModel}
                className="px-4 py-2 rounded-lg transition-all duration-300 text-sm font-medium card-float-hover disabled:opacity-40"
                style={{ background: `linear-gradient(135deg, var(--color-primary-500), var(--color-primary-600))`, color: 'var(--color-text-primary)' }}>
                <i className="fas fa-magic text-sm mr-1.5"></i>AI生成
              </button>
            )}
          </div>
        </div>

        {/* 编辑器 - 去掉glass-card外框，直接融入背景 */}
        <div className="flex-1 p-4 md:p-6 overflow-hidden">
          <textarea
            value={project.outline}
            onChange={(e) => onUpdate({ outline: e.target.value })}
            placeholder="在这里编写或生成小说大纲...&#10;&#10;可以包含：&#10;- 故事主线&#10;- 核心冲突&#10;- 情节转折点&#10;- 高潮与结局&#10;&#10;你也可以选择上方的AI模板，点击「AI生成」自动生成。"
            className="w-full h-full neumorphic-input rounded-xl p-4 md:p-5 text-sm leading-relaxed resize-none focus:outline-none transition-all"
            style={{ color: 'var(--color-text-primary)', minHeight: '400px' }}
          />
        </div>
      </div>
    </div>
  );
};

export default OutlineView;
