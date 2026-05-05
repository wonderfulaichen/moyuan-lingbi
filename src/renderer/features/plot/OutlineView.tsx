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
  const { setGenerating, setStatusMessage, setComplete, setError } = useAIStatus();
  const { showToast } = useToast();

  const outlinePrompts = prompts.filter(p => p.category === 'outline');

  // 自动选择第一个提示词模板
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

    // 构建角色上下文（从文件夹卡片+旧版 characters 数组合并）
    const folderChars = (project.folders || [])
      .filter(f => f.type === 'characters')
      .flatMap(f => f.contentCards || [])
      .filter(c => c.isFavorited && c.content)
      .map(c => `【${c.title}】\n${c.content.slice(0, 500)}`);
    const legacyChars = project.characters
      .filter(c => c.name !== '新角色')
      .map(c => `【${c.name}】(${c.role})\n- 性格：${c.personality}\n- 背景：${c.background}\n- 关系：${c.relationships}`);
    const charDetails = [...folderChars, ...legacyChars].join('\n\n');

    // 构建知识库上下文
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
            accumulatedContent += response.content;
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
    aiService.abort();
    setIsGenerating(false);
  }, []);

  return (
    <div className="h-full flex">
      {/* 左侧：项目上下文面板 */}
      <div className="w-64 shrink-0 border-r border-white/5 p-5 overflow-y-auto space-y-5">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">项目信息</h3>
          <div className="space-y-2">
            <div className="glass-card rounded-xl p-3">
              <div className="flex items-center gap-2 mb-1">
                <i className="fas fa-book text-xs" style={{ color: 'var(--color-primary-400)' }}></i>
                <span className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>标题</span>
              </div>
              <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{project.title}</p>
            </div>
            {project.intro && (
              <div className="glass-card rounded-xl p-3">
                <div className="flex items-center gap-2 mb-1">
                  <i className="fas fa-quote-left text-xs" style={{ color: 'var(--color-primary-400)' }}></i>
                  <span className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>简介</span>
                </div>
                <p className="text-xs line-clamp-4" style={{ color: 'var(--color-text-tertiary)' }}>{project.intro}</p>
              </div>
            )}
          </div>
        </div>

        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">
            角色档案
          </h3>
          <div className="space-y-1.5">
            {(() => {
              // 从文件夹内容卡片中获取角色（type=characters 的文件夹）
              const folderChars = (project.folders || [])
                .filter(f => f.type === 'characters')
                .flatMap(f => f.contentCards || [])
                .filter(c => c.isFavorited && c.title && c.title !== '新角色');
              // 从 project.characters（旧版）获取，过滤掉默认的'新角色'
              const legacyChars = project.characters.filter(c => c.name !== '新角色');
              const allChars = [...folderChars, ...legacyChars];

              if (allChars.length === 0) {
                return <p className="text-xs text-gray-600 italic">暂无角色 · 请在"内容设定"中创建角色卡片</p>;
              }
              // 去重显示
              const unique = allChars.filter((c, i, arr) => arr.findIndex(x => (x as any).title === (c as any).title || (x as any).name === (c as any).name) === i);
              return unique.slice(0, 12).map(c => {
                const name = (c as any).title || (c as any).name || '未命名';
                const isCard = !!(c as any).title;
                return (
                  <div key={c.id} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-white/5 transition-colors">
                    <div className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                      style={{ background: `linear-gradient(135deg, var(--color-primary-400), var(--color-primary-500))` }}>
                      {name[0]}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium truncate" style={{ color: 'var(--color-text-secondary)' }}>{name}</p>
                      <p className="text-[10px] text-gray-500 truncate">{isCard ? '设定文件' : (c as any).role || ''}</p>
                    </div>
                    {isCard && <i className="fas fa-file-lines text-[8px] text-purple-400/50"></i>}
                  </div>
                );
              });
            })()}
          </div>
        </div>
      </div>

      {/* 右侧：大纲编辑器 */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* 操作栏 */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-white/5 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ background: 'var(--color-primary-100)' }}>
              <i className="fas fa-sitemap text-xs" style={{ color: 'var(--color-primary-400)' }}></i>
            </div>
            <h3 className="text-base font-bold" style={{ color: 'var(--color-text-primary)' }}>小说大纲</h3>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={selectedPromptId}
              onChange={(e) => setSelectedPromptId(e.target.value)}
              className="neumorphic-input rounded-lg px-3 py-1.5 text-xs appearance-none cursor-pointer pr-6"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              {outlinePrompts.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            {isGenerating ? (
              <button
                onClick={handleAbort}
                className="px-3 py-1.5 text-xs text-red-400 rounded-lg border border-red-400/30 hover:bg-red-400/10 transition-colors"
              >
                <i className="fas fa-stop mr-1"></i>停止
              </button>
            ) : (
              <button
                onClick={handleGenerate}
                disabled={!activeModel}
                className="px-4 py-1.5 text-white rounded-lg transition-all duration-300 text-xs font-medium card-float-hover disabled:opacity-40"
                style={{
                  background: `linear-gradient(135deg, var(--color-primary-500), var(--color-primary-600))`
                }}
              >
                <i className="fas fa-magic mr-1.5"></i>AI生成大纲
              </button>
            )}
          </div>
        </div>

        {/* 编辑器区域 */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-4xl">
            <div className="glass-card rounded-2xl p-6">
              <textarea
                value={project.outline}
                onChange={(e) => onUpdate({ outline: e.target.value })}
                placeholder="在这里编写或生成小说大纲...&#10;&#10;可以包含：&#10;- 故事主线&#10;- 核心冲突&#10;- 情节转折点&#10;- 高潮与结局&#10;&#10;你也可以选择左侧的AI模板，点击「AI生成大纲」自动生成。"
                className="w-full min-h-[500px] neumorphic-input rounded-xl p-5 text-sm leading-relaxed resize-none focus:outline-none transition-all"
                style={{ color: 'var(--color-text-primary)' }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OutlineView;
