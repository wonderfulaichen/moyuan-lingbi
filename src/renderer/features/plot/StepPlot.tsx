import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Project, ModelConfig, PromptTemplate, BubbleFolder as BubbleFolderType } from '../../../shared/types';
import { dataService } from '../../shared/services/DataService';
import { useTheme } from '../../shared/contexts/ThemeContext';
import { useUIStore } from '../../shared/stores/uiStore';
import BubbleFolderContent from '../settings/BubbleFolderContent';

interface StepPlotProps {
  project: Project;
  prompts: PromptTemplate[];
  activeModel: ModelConfig;
  onUpdate: (updates: Partial<Project>) => void;
  onOpenSettings: () => void;
}

const PLOT_TYPES = ['outline', 'detailed_outline', 'chapters'] as const;

const TYPE_LABELS: Record<string, string> = {
  'outline': '大纲',
  'detailed_outline': '细纲',
  'chapters': '章节',
};

const TYPE_ICONS: Record<string, string> = {
  'outline': 'fa-sitemap',
  'detailed_outline': 'fa-list-check',
  'chapters': 'fa-book',
};

const StepPlot: React.FC<StepPlotProps> = ({
  project,
  prompts,
  activeModel,
  onUpdate,
  onOpenSettings,
}) => {
  const { themeInfo, mode } = useTheme();
  const { animationLevel } = useUIStore();
  const hasAnimations = animationLevel !== 'none';

  const folders = useMemo(() => project.folders || [], [project.folders]);

  const [subTab, setSubTab] = useState<string>('outline');
  const [showHistory, setShowHistory] = useState(false);
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);

  const findFolderInList = (folderList: BubbleFolderType[], folderId: string): BubbleFolderType | undefined => {
    for (const f of folderList) {
      if (f.id === folderId) return f;
      if (f.children) {
        const found = findFolderInList(f.children, folderId);
        if (found) return found;
      }
    }
    return undefined;
  };

  const getFolderPath = useCallback((targetId: string): BubbleFolderType[] => {
    const path: BubbleFolderType[] = [];
    const findPath = (folderList: BubbleFolderType[], id: string, currentPath: BubbleFolderType[]): boolean => {
      for (const f of folderList) {
        if (f.id === id) {
          currentPath.push(f);
          return true;
        }
        if (f.children && f.children.length > 0) {
          currentPath.push(f);
          if (findPath(f.children, id, currentPath)) return true;
          currentPath.pop();
        }
      }
      return false;
    };
    findPath(folders, targetId, path);
    return path;
  }, [folders]);

  const activeFolder = useMemo(() => {
    const folder = folders.find(f => f.type === subTab);
    if (activeFolderId) {
      const found = findFolderInList(folders, activeFolderId);
      if (found) return found;
    }
    return folder || folders.find(f => PLOT_TYPES.includes(f.type as any));
  }, [folders, subTab, activeFolderId]);

  const folderPath = useMemo(() => {
    if (activeFolderId) return getFolderPath(activeFolderId);
    if (activeFolder) return [activeFolder];
    return [];
  }, [activeFolderId, activeFolder, getFolderPath]);

  const handleUpdateFolder = useCallback((folderId: string, updates: Partial<BubbleFolderType>) => {
    const updateFolderInList = (folderList: BubbleFolderType[], fid: string, ups: Partial<BubbleFolderType>): BubbleFolderType[] => {
      return folderList.map(f => {
        if (f.id === fid) return { ...f, ...ups };
        if (f.children && f.children.length > 0) {
          const updatedChildren = updateFolderInList(f.children, fid, ups);
          if (updatedChildren !== f.children) return { ...f, children: updatedChildren };
        }
        return f;
      });
    };
    onUpdate({ folders: updateFolderInList(folders, folderId, updates) });
  }, [folders, onUpdate]);

  const handleCreateSubFolder = useCallback((parentId: string, name: string, type: BubbleFolderType['type']) => {
    const parentFolder = findFolderInList(folders, parentId);
    if (!parentFolder) return;

    const parentVfileId = parentFolder.vfileId || null;
    const vf = dataService.createFile(parentVfileId, {
      name,
      type: 'folder',
      metadata: { tags: [type], cardType: 'folder' }
    });

    const newSubFolder: BubbleFolderType = {
      id: `folder-${Date.now()}`,
      name,
      icon: 'fa-folder',
      color: 'custom',
      parentId,
      type,
      vfileId: vf.id,
      prompt: '',
      generatedTags: [],
      selectedTags: [],
      schemes: [],
      charts: [],
      knowledgeInputs: [],
      children: [],
      createdAt: Date.now(),
    };
    handleUpdateFolder(parentId, { children: [...(parentFolder.children || []), newSubFolder] });
  }, [folders, handleUpdateFolder]);

  const handleSelectFolder = useCallback((folderId: string | null) => {
    setActiveFolderId(folderId);
  }, []);

  const folderItems = folders.filter(f => PLOT_TYPES.includes(f.type as any));

  // 判断当前是否在子文件夹中
  const isInSubFolder = activeFolderId !== null && activeFolderId !== activeFolder?.id;

  // 获取当前要编辑的内容：子文件夹用自身的 content，根文件夹用 project.outline/detailedOutline/chapters
  const getCurrentContent = useCallback(() => {
    if (isInSubFolder && activeFolder) {
      return activeFolder.content || '';
    }
    // 根文件夹使用 project 级别数据
    if (subTab === 'outline') return project.outline || '';
    if (subTab === 'detailed_outline') return (project as any).detailedOutline || '';
    return '';
  }, [isInSubFolder, activeFolder, subTab, project.outline]);

  // 更新内容：子文件夹更新到 folder.content 并同步到 VFile，根文件夹更新到 project
  const handleContentUpdate = useCallback((content: string) => {
    if (isInSubFolder && activeFolder) {
      // 同步更新 BubbleFolder.content 和 VFile.content
      handleUpdateFolder(activeFolder.id, { content });
      if (activeFolder.vfileId) {
        dataService.updateFile(activeFolder.vfileId, { content });
      }
    } else {
      if (subTab === 'outline') onUpdate({ outline: content });
      if (subTab === 'detailed_outline') onUpdate({ detailedOutline: content } as any);
    }
  }, [isInSubFolder, activeFolder, subTab, handleUpdateFolder, onUpdate]);

  if (!activeFolder) {
    return (
      <div className="p-6 text-center" style={{ color: 'var(--color-text-muted)' }}>
        暂无文件夹
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full animate-fade-in">
      {/* 顶部 Tab 切换器 */}
      <div className="px-4 pt-4 pb-2 shrink-0">
        <div className="relative">
          <div className="absolute inset-0 rounded-full" style={{ background: 'var(--color-surface-muted)', opacity: 0.5 }} />
          <div className="relative flex gap-1 p-1 rounded-full" style={{ background: 'var(--color-surface-muted)', border: '1px solid var(--color-border-default)' }}>
            {folderItems.map((folder) => (
              <button
                key={folder.type}
                onClick={() => { setSubTab(folder.type); setActiveFolderId(null); setShowHistory(false); }}
                className={`relative px-5 py-2 rounded-full text-sm font-medium transition-all duration-300 flex items-center gap-2 tab-hover-gradient ${hasAnimations ? 'hover:scale-105' : ''}`}
                style={{
                  background: subTab === folder.type ? themeInfo.gradient : 'transparent',
                  color: subTab === folder.type ? 'var(--color-text-inverse, #ffffff)' : 'var(--color-text-secondary)',
                  boxShadow: subTab === folder.type ? 'var(--shadow-button-light, 0 4px 16px rgba(0, 0, 0, 0.1))' : 'none',
                }}>
                {subTab === folder.type && hasAnimations && (
                  <span className="absolute inset-0 rounded-full animate-pulse opacity-40" style={{ background: themeInfo.gradient }} />
                )}
                <i className={`fas ${folder.icon}`} style={{ position: 'relative', zIndex: 1 }} />
                <span style={{ position: 'relative', zIndex: 1 }}>{folder.name}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 面包屑路径导航 - 标签页下方 */}
      {folderPath.length > 0 && (
        <div className="px-5 pb-2 shrink-0">
          <div className="flex items-center gap-1 text-xs flex-wrap">
            {folderPath.map((f, idx) => {
              const isLast = idx === folderPath.length - 1;
              return (
                <React.Fragment key={f.id}>
                  {idx > 0 && (
                    <i className="fas fa-chevron-right" style={{ color: 'var(--color-text-muted)', fontSize: '8px' }}></i>
                  )}
                  <button
                    onClick={() => !isLast && handleSelectFolder(f.id)}
                    disabled={isLast}
                    className={`transition-all ${isLast ? 'cursor-default' : 'hover:opacity-80'}`}
                    style={{
                      color: isLast ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                      fontWeight: isLast ? 600 : 400,
                    }}
                  >
                    {isLast && <i className={`fas ${f.icon || 'fa-folder'} mr-1`} style={{ color: 'var(--color-primary-400)' }}></i>}
                    {f.name}
                  </button>
                </React.Fragment>
              );
            })}
          </div>
        </div>
      )}

      {/* 主内容区域 */}
      <div className="flex-1 overflow-hidden">
        {isInSubFolder ? (
          /* 子文件夹内容编辑视图 */
          <div className="h-full flex flex-col">
            {/* 工具栏 */}
            <div className="flex items-center justify-between px-4 md:px-6 py-3 shrink-0 gap-2">
              <div className="flex items-center gap-2 md:gap-3 min-w-0">
                <button
                  onClick={() => handleSelectFolder(null)}
                  className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-all"
                  style={{ background: 'var(--color-primary-100)', color: 'var(--color-primary-400)' }}
                  title="返回上级"
                >
                  <i className="fas fa-arrow-left text-xs"></i>
                </button>
                <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: 'var(--color-primary-100)' }}>
                  <i className={`fas ${TYPE_ICONS[subTab]} text-xs`} style={{ color: 'var(--color-primary-400)' }}></i>
                </div>
                <h3 className="text-sm md:text-base font-bold truncate" style={{ color: 'var(--color-text-primary)' }}>{activeFolder.name}</h3>
              </div>
            </div>
            {/* 编辑器 */}
            <div className="flex-1 p-4 md:p-6 overflow-hidden">
              <textarea
                value={getCurrentContent()}
                onChange={(e) => handleContentUpdate(e.target.value)}
                placeholder={`在这里编写${TYPE_LABELS[subTab]}内容...\n\n可以包含：\n- 故事主线\n- 核心冲突\n- 情节转折点\n- 高潮与结局`}
                className="w-full h-full neumorphic-input rounded-xl p-4 md:p-5 text-sm leading-relaxed resize-none focus:outline-none transition-all"
                style={{ color: 'var(--color-text-primary)', minHeight: '400px' }}
              />
            </div>
          </div>
        ) : (
          /* 根文件夹：显示 BubbleFolderContent */
          <BubbleFolderContent
            folder={activeFolder}
            project={project}
            prompts={prompts}
            activeModel={activeModel}
            onUpdate={onUpdate}
            onOpenSettings={onOpenSettings}
            onUpdateFolder={handleUpdateFolder}
            onCreateSubFolder={handleCreateSubFolder}
            onSelectFolder={handleSelectFolder}
            showHistory={showHistory}
            onToggleHistory={() => setShowHistory(!showHistory)}
          />
        )}
      </div>
    </div>
  );
};

export default StepPlot;
