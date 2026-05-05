import React, { useState } from 'react';
import { Project, ModelConfig, PromptTemplate } from '../../../shared/types';
import { useToast } from '../../shared/contexts/ToastContext';

interface StepOutlineProps {
  project: Project;
  prompts: PromptTemplate[];
  activeModel: ModelConfig;
  onUpdate: (updates: Partial<Project>) => void;
  onOpenSettings: () => void;
}

const StepOutline: React.FC<StepOutlineProps> = ({
  project,
  prompts,
  activeModel,
  onUpdate,
  onOpenSettings,
}) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const { showToast } = useToast();

  const outlinePrompts = prompts.filter(p => p.category === 'outline');

  const handleGenerate = async () => {
    if (!activeModel) {
      showToast('请先在设置中配置AI模型', 'warning');
      return;
    }
    setIsGenerating(true);
    try {
      // TODO: 实现AI调用逻辑
      onUpdate({ outline: 'AI大纲生成功能将在后续版本中实现。' });
    } catch (error) {
      console.error('Outline generation failed:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="p-8 overflow-y-auto h-full">
      <div className="mb-8 flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-black tracking-tight" style={{ color: 'var(--color-text-primary)' }}>大纲规划</h2>
          <p className="mt-2" style={{ color: 'var(--color-text-secondary)' }}>规划故事的整体走向，构建引人入胜的叙事框架。</p>
        </div>
        <div className="flex items-center gap-3">
          <select className="neumorphic-input rounded-lg px-3 py-2 text-sm appearance-none cursor-pointer pr-6">
            {outlinePrompts.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            className={`card-float-hover px-5 py-2.5 text-white rounded-xl disabled:opacity-40 transition-all shadow-lg font-medium text-sm ${
              isGenerating ? 'btn-loading-ring' : ''
            }`}
            style={{ background: isGenerating ? 'var(--color-primary-500)' : 'linear-gradient(135deg, var(--color-primary-500), var(--color-primary-600))' }}
          >
            {isGenerating ? (
              <><i className="fas fa-spinner fa-spin mr-2"></i>生成中...</>
            ) : (
              <><i className="fas fa-magic mr-2"></i>AI生成大纲</>
            )}
          </button>
        </div>
      </div>

      <div className="max-w-4xl">
        <div className="glass-card rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: 'var(--color-primary-100)' }}>
              <i className="fas fa-sitemap text-sm" style={{ color: 'var(--color-primary-400)' }}></i>
            </div>
            <h3 className="text-lg font-bold" style={{ color: 'var(--color-text-primary)' }}>小说大纲</h3>
          </div>
          <textarea
            value={project.outline}
            onChange={(e) => onUpdate({ outline: e.target.value })}
            placeholder="在这里编写或生成小说大纲...&#10;&#10;可以包含：&#10;- 故事主线&#10;- 核心冲突&#10;- 情节转折点&#10;- 高潮与结局"
            className="w-full h-96 neumorphic-input rounded-xl p-4 placeholder-gray-600 resize-none"
          />
        </div>
      </div>
    </div>
  );
};

export default StepOutline;
