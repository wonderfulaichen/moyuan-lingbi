import React, { useState, useCallback } from 'react';
import { ModelConfig } from '../../../shared/types';
import { dataService } from '../../shared/services/DataService';
import { aiService } from '../../shared/services/aiService';
import { useAIStatus } from '../../shared/contexts/AIStatusContext';

type ReviewTab = 'overview' | 'consistency' | 'suggestions';

interface StepReviewProps {
  activeModel: ModelConfig;
  onOpenSettings: () => void;
}

const StepReview: React.FC<StepReviewProps> = ({ activeModel, onOpenSettings }) => {
  const project = dataService.getActiveProject();
  const [tab, setTab] = useState<ReviewTab>('overview');
  const [isChecking, setIsChecking] = useState(false);
  const [checkResult, setCheckResult] = useState('');
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [suggestion, setSuggestion] = useState('');
  const { setGenerating, setTokenUsage, setComplete, setError, status } = useAIStatus();

  const fs = dataService.getFS();
  const allFiles = Object.values(fs.files).filter(f => f.type === 'file');
  const totalChars = allFiles.reduce((s, f) => s + f.content.length, 0);
  const totalTokens = status.tasks.reduce((sum, t) => sum + (t.tokenUsage?.total || 0), 0);

  const handleConsistencyCheck = useCallback(async () => {
    if (!activeModel?.modelName) { onOpenSettings(); return; }
    setIsChecking(true); setCheckResult('');
    setGenerating(activeModel.name, '一致性检查...');
    const prompt = `作为专业编辑，请检查小说「${project?.title || ''}」的设定一致性。\n\n简介：${project?.intro || '暂无'}\n\n大纲：\n${project?.outline || '暂无'}\n\n检查项：角色设定一致性、世界观规则、时间线矛盾、角色与情节匹配、章节逻辑连贯。逐项分析，给出具体问题和修改建议。`;
    try {
      const r = await aiService.generateWithContext({ model: activeModel, prompt, maxTokens: 2000 });
      if (r.error) setError(r.error); else setCheckResult(r.content || '未发现问题');
      if (r.tokens) setTokenUsage(r.tokens);
      setComplete();
    } catch (err) { setError(err instanceof Error ? err.message : '检查失败'); } finally { setIsChecking(false); }
  }, [activeModel, project, setGenerating, setTokenUsage, setComplete, setError, onOpenSettings]);

  const handleSuggestions = useCallback(async () => {
    if (!activeModel?.modelName) { onOpenSettings(); return; }
    setIsSuggesting(true); setSuggestion('');
    setGenerating(activeModel.name, '生成优化建议...');
    const prompt = `作为资深编辑，为「${project?.title || ''}」（${allFiles.length}个文件，${totalChars.toLocaleString()}字）提供优化建议。\n\n分析维度：世界观深度、角色塑造、情节节奏、叙事手法、差异化亮点。每个维度给出具体建议。`;
    try {
      const r = await aiService.generateWithContext({ model: activeModel, prompt, maxTokens: 2000 });
      if (r.error) setError(r.error); else setSuggestion(r.content || '暂无建议');
      if (r.tokens) setTokenUsage(r.tokens);
      setComplete();
    } catch (err) { setError(err instanceof Error ? err.message : '失败'); } finally { setIsSuggesting(false); }
  }, [activeModel, project, allFiles.length, totalChars, setGenerating, setTokenUsage, setComplete, setError, onOpenSettings]);

  const tabs: { id: ReviewTab; label: string; icon: string }[] = [
    { id: 'overview', label: '内容概览', icon: 'fa-file-lines' },
    { id: 'consistency', label: '一致性检查', icon: 'fa-check-double' },
    { id: 'suggestions', label: '优化建议', icon: 'fa-lightbulb' },
  ];

  const stats = [
    { label: '设定文件', value: allFiles.length, icon: 'fa-file-lines', color: 'var(--color-primary-300)' },
    { label: '总字数', value: totalChars.toLocaleString(), icon: 'fa-font', color: '#60a5fa' },
    { label: '文件夹', value: Object.values(fs.files).filter(f => f.type === 'folder').length, icon: 'fa-folder', color: '#f59e0b' },
    { label: 'AI 生成', value: allFiles.filter(f => f.metadata.aiGenerated).length, icon: 'fa-robot', color: '#34d399' },
    { label: '累计 Token', value: totalTokens > 0 ? `${(totalTokens / 1000).toFixed(1)}K` : '-', icon: 'fa-microchip', color: '#a78bfa' },
  ];

  return (
    <div className="p-8 overflow-y-auto h-full">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-3xl font-black tracking-tight" style={{ color: 'var(--color-text-primary)' }}>
            审查校对
          </h2>
          <p className="mt-2 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            全方位审查你的小说设定，确保逻辑一致性与文学品质
          </p>
        </div>
        <div className="segmented-control text-xs">
          {tabs.map(t => (
            <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
              <i className={`fas ${t.icon} mr-1.5`} />{t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'overview' && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8 max-w-5xl">
            {stats.map((s, i) => (
              <div key={s.label} className="glass-card rounded-2xl p-5 text-center card-float-hover animate-card-enter"
                style={{ animationDelay: `${i * 60}ms` }}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center mx-auto mb-3"
                  style={{ background: `${s.color}15` }}>
                  <i className={`fas ${s.icon} text-sm`} style={{ color: s.color }} />
                </div>
                <div className="text-2xl font-black tabular-nums" style={{ color: s.color }}>{s.value}</div>
                <div className="text-[11px] mt-1 text-gray-500">{s.label}</div>
              </div>
            ))}
          </div>

          {project?.intro && (
            <div className="glass-card rounded-2xl p-5 mb-4 max-w-5xl">
              <h4 className="text-sm font-bold mb-2 flex items-center gap-2" style={{ color: 'var(--color-text-primary)' }}>
                <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: 'var(--color-primary-100)' }}>
                  <i className="fas fa-info-circle text-[10px]" style={{ color: 'var(--color-primary-400)' }} />
                </div>
                作品简介
              </h4>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>{project.intro}</p>
            </div>
          )}

          {project?.outline && (
            <div className="glass-card rounded-2xl p-5 max-w-4xl">
              <h4 className="text-sm font-bold mb-2 flex items-center gap-2" style={{ color: 'var(--color-text-primary)' }}>
                <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: 'var(--color-primary-100)' }}>
                  <i className="fas fa-sitemap text-[10px]" style={{ color: 'var(--color-primary-400)' }} />
                </div>
                故事大纲
              </h4>
              <div className="text-sm leading-relaxed whitespace-pre-wrap max-h-80 overflow-y-auto" style={{ color: 'var(--color-text-secondary)' }}>
                {project.outline}
              </div>
            </div>
          )}

          {!project?.intro && !project?.outline && allFiles.length === 0 && (
            <div className="glass-card rounded-2xl p-16 text-center max-w-2xl mx-auto">
              <i className="fas fa-check-double text-5xl mb-5 opacity-20" style={{ color: 'var(--color-text-muted)' }} />
              <p className="font-bold text-xl mb-2" style={{ color: 'var(--color-text-secondary)' }}>暂无内容可审查</p>
              <p className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
                完成前面的步骤后回到这里进行审查
              </p>
            </div>
          )}
        </>
      )}

      {tab === 'consistency' && (
        <div className="max-w-4xl">
          <div className="flex justify-end mb-4">
            <button onClick={handleConsistencyCheck} disabled={isChecking}
              className="px-5 py-2 text-white rounded-lg transition-all duration-300 text-sm font-medium card-float-hover disabled:opacity-40 shadow-lg flex items-center gap-2"
              style={{ background: `linear-gradient(135deg, var(--color-primary-500), var(--color-primary-600))` }}>
              {isChecking ? <><i className="fas fa-spinner fa-spin" />检查中...</> : <><i className="fas fa-check-double" />开始检查</>}
            </button>
          </div>
          {checkResult ? (
            <div className="glass-card rounded-2xl p-6">
              <div className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--color-text-secondary)' }}>
                {checkResult}
              </div>
            </div>
          ) : (
            <div className="glass-card rounded-2xl p-16 text-center">
              <i className="fas fa-check-double text-5xl mb-5 opacity-20" style={{ color: 'var(--color-text-muted)' }} />
              <p className="font-bold text-xl mb-2" style={{ color: 'var(--color-text-secondary)' }}>一致性检查</p>
              <p className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
                点击"开始检查"进行作品设定的一致性分析
              </p>
            </div>
          )}
        </div>
      )}

      {tab === 'suggestions' && (
        <div className="max-w-4xl">
          <div className="flex justify-end mb-4">
            <button onClick={handleSuggestions} disabled={isSuggesting}
              className="px-5 py-2 text-white rounded-lg transition-all duration-300 text-sm font-medium card-float-hover disabled:opacity-40 shadow-lg flex items-center gap-2"
              style={{ background: `linear-gradient(135deg, var(--color-primary-500), var(--color-primary-600))` }}>
              {isSuggesting ? <><i className="fas fa-spinner fa-spin" />分析中...</> : <><i className="fas fa-lightbulb" />获取建议</>}
            </button>
          </div>
          {suggestion ? (
            <div className="glass-card rounded-2xl p-6">
              <div className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--color-text-secondary)' }}>
                {suggestion}
              </div>
            </div>
          ) : (
            <div className="glass-card rounded-2xl p-16 text-center">
              <i className="fas fa-lightbulb text-5xl mb-5 opacity-20" style={{ color: 'var(--color-text-muted)' }} />
              <p className="font-bold text-xl mb-2" style={{ color: 'var(--color-text-secondary)' }}>优化建议</p>
              <p className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
                点击"获取建议"获取 AI 对作品的优化建议
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default StepReview;
