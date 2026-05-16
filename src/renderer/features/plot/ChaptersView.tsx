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
  const [infoPanelOpen, setInfoPanelOpen] = useState(true);

  const sortedChapters = [...project.chapters].sort((a, b) => a.order - b.order);

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
              <p className="text-xs leading-relaxed line-clamp-5" style={{ color: 'var(--color-text-secondary)' }}>{project.intro}</p>
            </div>
          )}
          <div className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.03)' }}>
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <i className="fas fa-book-open text-[10px]" style={{ color: 'var(--color-primary-400)' }}></i>
                <span className="text-xs font-semibold" style={{ color: 'var(--color-text-primary)' }}>章节总览</span>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--color-text-muted)' }}>{sortedChapters.length} 章</span>
            </div>
            <p className="text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
              总字数：{sortedChapters.reduce((sum, c) => sum + (c.content?.length || 0), 0).toLocaleString()}
              {' · '}已写作：{sortedChapters.filter(c => c.content?.length > 0).length}/{sortedChapters.length}
            </p>
          </div>
          <div>
            <h3 className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--color-text-muted)' }}>
              角色档案 ({allChars.length})
            </h3>
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
              <i className="fas fa-book text-xs" style={{ color: 'var(--color-primary-400)' }}></i>
            </div>
            <h3 className="text-sm md:text-base font-bold truncate" style={{ color: 'var(--color-text-primary)' }}>章节管理</h3>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[11px] px-2.5 py-1 rounded-full" style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--color-text-muted)' }}>
              共 {sortedChapters.length} 章
            </span>
          </div>
        </div>

        {/* 章节列表 - 按卷分组显示 */}
        <div className="flex-1 overflow-y-auto px-4 md:px-6 pb-4">
          <div className="max-w-3xl space-y-2">
            {sortedChapters.length === 0 ? (
              <div className="rounded-2xl p-10 text-center" style={{ background: 'rgba(255,255,255,0.02)' }}>
                <i className="fas fa-book-open text-3xl mb-3 opacity-30" style={{ color: 'var(--color-text-muted)' }}></i>
                <p className="font-bold text-sm" style={{ color: 'var(--color-text-secondary)' }}>暂无章节</p>
                <p className="text-xs mt-1" style={{ color: 'var(--color-text-tertiary)' }}>请在「细纲」视图中添加章节</p>
              </div>
            ) : (() => {
              // 按卷分组
              const volumeGroups: { volumeId?: string; volumeName?: string; chapters: typeof sortedChapters }[] = [];
              let currentGroup: typeof volumeGroups[0] | null = null;
              for (const ch of sortedChapters) {
                if (ch.volumeId !== currentGroup?.volumeId) {
                  currentGroup = { volumeId: ch.volumeId, volumeName: ch.volumeName, chapters: [] };
                  volumeGroups.push(currentGroup);
                }
                currentGroup.chapters.push(ch);
              }
              return volumeGroups.map((group, gIdx) => (
                <div key={group.volumeId || `nogroup-${gIdx}`} className="space-y-2">
                  {group.volumeName && (
                    <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.04)' }}>
                      <i className="fas fa-book-open text-[10px]" style={{ color: 'var(--color-primary-400)' }}></i>
                      <span className="text-xs font-bold" style={{ color: 'var(--color-primary-300)' }}>{group.volumeName}</span>
                      <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>({group.chapters.length}章)</span>
                    </div>
                  )}
                  {group.chapters.map((chapter, index) => {
                    const wordCount = chapter.content?.length || 0;
                    const hasContent = wordCount > 0;
                    return (
                      <div key={chapter.id}
                        onClick={() => { onEnterWriting(chapter.id); setEditingChapterId(chapter.id); }}
                        className="rounded-xl p-3.5 cursor-pointer transition-all duration-200 hover:bg-white/[0.04]"
                        style={{ background: 'rgba(255,255,255,0.03)', animationDelay: `${index * 40}ms` }}>
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 font-bold text-[11px] text-white"
                            style={{ background: `linear-gradient(135deg, var(--color-primary-400), var(--color-primary-500))` }}>
                            {chapter.order + 1}
                          </div>
                          <div className="min-w-0 flex-1">
                            <h4 className="font-bold text-sm" style={{ color: 'var(--color-text-primary)' }}>{chapter.title}</h4>
                            <div className="flex items-center gap-2 mt-1">
                              {chapter.summary ? (
                                <p className="text-[11px] truncate" style={{ color: 'var(--color-text-tertiary)' }}>{chapter.summary}</p>
                              ) : (
                                <span className="text-[11px] italic" style={{ color: 'var(--color-text-muted)' }}>暂无细纲</span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <div className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium ${hasContent ? 'bg-green-500/[0.08] text-green-400' : ''}`} style={!hasContent ? { background: 'rgba(255,255,255,0.04)', color: 'var(--color-text-muted)' } : undefined}>
                              <i className={`fas ${hasContent ? 'fa-check-circle' : 'fa-clock'} text-[9px]`}></i>
                              <span>{hasContent ? `${wordCount.toLocaleString()}字` : '未写作'}</span>
                            </div>
                            {chapter.keyEvents && chapter.keyEvents.length > 0 && (
                              <div className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px]" style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--color-primary-300)' }}>
                                <i className="fas fa-bolt text-[8px]"></i>{chapter.keyEvents.length}
                              </div>
                            )}
                            <div className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-white/10"
                              style={{ color: 'var(--color-primary-400)' }}><i className="fas fa-pen-nib text-[11px]"></i></div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ));
            })()}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChaptersView;
