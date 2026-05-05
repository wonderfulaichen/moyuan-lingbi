import React, { useState } from 'react';
import { Project, ModelConfig, PromptTemplate, Chapter } from '../../../shared/types';
import { useToast } from '../../shared/contexts/ToastContext';

interface StepChapterOutlineProps {
  project: Project;
  prompts: PromptTemplate[];
  activeModel: ModelConfig;
  onUpdate: (updates: Partial<Project>) => void;
  onOpenSettings: () => void;
  onEnterWriting: (chapterId: string) => void;
}

const StepChapterOutline: React.FC<StepChapterOutlineProps> = ({
  project,
  prompts,
  activeModel,
  onUpdate,
  onOpenSettings,
  onEnterWriting,
}) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const { showToast } = useToast();

  const chapterPrompts = prompts.filter(p => p.category === 'chapter');

  const handleAddChapter = () => {
    const newChapter: Chapter = {
      id: Date.now().toString(),
      title: `第${project.chapters.length + 1}章`,
      summary: '',
      content: '',
      order: project.chapters.length,
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

  const handleGenerate = async () => {
    if (!activeModel) {
      showToast('请先在设置中配置AI模型', 'warning');
      return;
    }
    setIsGenerating(true);
    try {
      // TODO: 实现AI调用逻辑
    } catch (error) {
      console.error('Chapter outline generation failed:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="p-8 overflow-y-auto h-full">
      <div className="mb-8 flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-black tracking-tight" style={{ color: 'var(--color-text-primary)' }}>章节细纲</h2>
          <p className="mt-2" style={{ color: 'var(--color-text-secondary)' }}>将大纲细化为章节，规划每一章的剧情走向。</p>
        </div>
        <div className="flex items-center gap-3">
          <select className="neumorphic-input rounded-lg px-3 py-2 text-sm appearance-none cursor-pointer pr-6"
            style={{ color: 'var(--color-text-secondary)' }}>
            {chapterPrompts.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            className={`px-4 py-2.5 text-white rounded-xl transition-all duration-300 font-medium text-sm ${
              isGenerating ? 'btn-loading-ring' : 'card-float-hover'
            }`}
            style={{
              background: `linear-gradient(135deg, var(--color-primary-500), var(--color-primary-600))`
            }}
          >
            {isGenerating ? '生成中...' : <><i className="fas fa-magic mr-2"></i>AI生成细纲</>}
          </button>
          <button
            onClick={handleAddChapter}
            className="px-4 py-2.5 glass-card-inset rounded-xl transition-all font-medium text-sm card-float-hover"
            style={{ color: 'var(--color-primary-300)' }}
          >
            <i className="fas fa-plus mr-2"></i>手动添加
          </button>
        </div>
      </div>

      <div className="max-w-4xl space-y-3">
        {project.chapters.length === 0 ? (
          <div className="glass-card rounded-2xl p-12 text-center">
            <i className="fas fa-list-ol text-4xl mb-4" style={{ color: 'var(--color-text-muted)' }}></i>
            <p className="font-bold text-lg" style={{ color: 'var(--color-text-secondary)' }}>尚未创建章节</p>
            <p className="text-sm mt-1" style={{ color: 'var(--color-text-tertiary)' }}>使用AI生成或手动添加章节细纲</p>
          </div>
        ) : (
          project.chapters.sort((a, b) => a.order - b.order).map((chapter, index) => (
            <div
              key={chapter.id}
              className="glass-card p-5 card-float-hover animate-card-enter"
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 font-bold text-sm text-white"
                  style={{
                    background: `linear-gradient(135deg, var(--color-primary-400), var(--color-primary-500))`
                  }}>
                  {index + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <input
                    type="text"
                    value={chapter.title}
                    onChange={(e) => handleUpdateChapter(chapter.id, { title: e.target.value })}
                    className="w-full bg-transparent font-bold text-base focus:outline-none border-b border-transparent focus:border-theme-active transition-all pb-1"
                    style={{ color: 'var(--color-text-primary)' }}
                  />
                  <textarea
                    value={chapter.summary}
                    onChange={(e) => handleUpdateChapter(chapter.id, { summary: e.target.value })}
                    placeholder="输入章节细纲..."
                    className="w-full mt-2 neumorphic-input rounded-lg px-3 py-2 text-sm h-16 resize-none focus:outline-none transition-all"
                    style={{ color: 'var(--color-text-secondary)' }}
                  />
                </div>
                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => onEnterWriting(chapter.id)}
                    className="px-3 py-1.5 text-white rounded-xl transition-all duration-300 text-xs font-medium card-float-hover"
                    style={{
                      background: `linear-gradient(135deg, var(--color-primary-400), var(--color-primary-500))`
                    }}
                  >
                    <i className="fas fa-pen-nib mr-1"></i>写作
                  </button>
                  <button
                    onClick={() => handleDeleteChapter(chapter.id)}
                    className="px-2 py-1.5 transition-colors"
                    style={{ color: 'var(--color-text-muted)' }}
                  >
                    <i className="fas fa-trash text-xs"></i>
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default StepChapterOutline;
