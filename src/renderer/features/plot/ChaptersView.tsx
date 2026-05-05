import React, { useState } from 'react';
import { Project, ModelConfig, PromptTemplate } from '../../../shared/types';
import WritingEditor from '../writing/WritingEditor';

interface ChaptersViewProps {
  project: Project;
  prompts: PromptTemplate[];
  activeModel: ModelConfig;
  onUpdate: (updates: Partial<Project>) => void;
  onOpenSettings: () => void;
  onEnterWriting: (chapterId: string) => void;
}

const ChaptersView: React.FC<ChaptersViewProps> = ({
  project,
  prompts,
  activeModel,
  onUpdate,
  onOpenSettings,
  onEnterWriting,
}) => {
  const [editingChapterId, setEditingChapterId] = useState<string | null>(null);

  const sortedChapters = [...project.chapters].sort((a, b) => a.order - b.order);

  // 如果在编辑章节，渲染 WritingEditor
  if (editingChapterId) {
    return (
      <WritingEditor
        project={project}
        prompts={prompts}
        activeModel={activeModel}
        onUpdate={onUpdate}
        onOpenSettings={onOpenSettings}
        editingChapterId={editingChapterId}
        onBackToChapters={() => setEditingChapterId(null)}
      />
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* 顶部操作栏 */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-white/5 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: 'var(--color-primary-100)' }}>
            <i className="fas fa-book text-xs" style={{ color: 'var(--color-primary-400)' }}></i>
          </div>
          <div>
            <h3 className="text-base font-bold" style={{ color: 'var(--color-text-primary)' }}>章节管理</h3>
            <p className="text-xs text-gray-500">管理已生成的章节，点击进入写作</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">
            共 {sortedChapters.length} 章
          </span>
        </div>
      </div>

      {/* 章节列表 */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl space-y-2">
          {sortedChapters.length === 0 ? (
            <div className="glass-card rounded-2xl p-12 text-center">
              <i className="fas fa-book-open text-4xl mb-4" style={{ color: 'var(--color-text-muted)' }}></i>
              <p className="font-bold text-lg" style={{ color: 'var(--color-text-secondary)' }}>暂无章节</p>
              <p className="text-sm mt-1" style={{ color: 'var(--color-text-tertiary)' }}>
                请在「细纲」视图中添加章节，或直接点击下方按钮创建
              </p>
            </div>
          ) : (
            sortedChapters.map((chapter, index) => {
              const wordCount = chapter.content?.length || 0;
              const hasContent = wordCount > 0;

              return (
                <div
                  key={chapter.id}
                  className="glass-card rounded-2xl p-4 card-float-hover animate-card-enter cursor-pointer transition-all duration-200 hover:shadow-lg"
                  style={{ animationDelay: `${index * 40}ms` }}
                  onClick={() => {
                    onEnterWriting(chapter.id);
                    setEditingChapterId(chapter.id);
                  }}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 font-bold text-sm text-white"
                      style={{
                        background: `linear-gradient(135deg, var(--color-primary-400), var(--color-primary-500))`
                      }}>
                      {index + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-bold text-sm" style={{ color: 'var(--color-text-primary)' }}>
                        {chapter.title}
                      </h4>
                      <div className="flex items-center gap-3 mt-1">
                        {chapter.summary ? (
                          <p className="text-xs truncate" style={{ color: 'var(--color-text-tertiary)' }}>
                            {chapter.summary}
                          </p>
                        ) : (
                          <span className="text-xs text-gray-600 italic">暂无细纲</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2.5 shrink-0">
                      {/* 写作状态 */}
                      <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-medium ${
                        hasContent ? 'bg-green-500/10 text-green-400' : 'bg-gray-500/10 text-gray-500'
                      }`}>
                        <i className={`fas ${hasContent ? 'fa-check-circle' : 'fa-clock'}`}></i>
                        <span>{hasContent ? `${wordCount}字` : '未写作'}</span>
                      </div>
                      {/* 关键事件数量 */}
                      {chapter.keyEvents && chapter.keyEvents.length > 0 && (
                        <div className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium bg-[var(--color-primary-400)]/10"
                          style={{ color: 'var(--color-primary-300)' }}>
                          <i className="fas fa-bolt"></i>
                          <span>{chapter.keyEvents.length}</span>
                        </div>
                      )}
                      {/* 进入写作按钮 */}
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-white/10"
                        style={{ color: 'var(--color-primary-400)' }}>
                        <i className="fas fa-pen-nib text-sm"></i>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

export default ChaptersView;
