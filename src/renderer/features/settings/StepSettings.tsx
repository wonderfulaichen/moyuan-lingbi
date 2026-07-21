
import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { Project, ModelConfig, PromptTemplate, BubbleFolder as BubbleFolderType } from '../../../shared/types';
import { dataService } from '../../shared/services/DataService';
import { useTheme } from '../../shared/contexts/ThemeContext';
import { useUIStore } from '../../shared/stores/uiStore';
import BubbleFolder from './BubbleFolder';
import BubbleFolderContent from './BubbleFolderContent';


interface StepSettingsProps {
  project: Project;
  prompts: PromptTemplate[];
  activeModel: ModelConfig;
  onUpdate: (updates: Partial<Project>) => void;
  onOpenSettings: () => void;
}

const DEFAULT_FOLDERS: { name: string; icon: string; color: string; type: BubbleFolderType['type'] }[] = [
  { name: '世界观', icon: 'fa-globe', color: 'emerald', type: 'world' },
  { name: '角色', icon: 'fa-users', color: 'blue', type: 'characters' },
  { name: '时间线', icon: 'fa-timeline', color: 'amber', type: 'timeline' },
  { name: '大纲', icon: 'fa-sitemap', color: 'violet', type: 'outline' },
  { name: '细纲', icon: 'fa-list-check', color: 'cyan', type: 'detailed_outline' },
  { name: '章节', icon: 'fa-book', color: 'pink', type: 'chapters' },
];

function ensureDefaultFolders(project: Project): BubbleFolderType[] {
  const existing = project.folders || [];

  // 如果已有文件夹，确保所有预设文件夹都有 vfileId
  if (existing.length > 0) {
    const updated = [...existing];
    for (const def of DEFAULT_FOLDERS) {
      const found = updated.find(f => f.type === def.type);
      if (!found) {
        const vfId = dataService.getRootFolderIdByType(def.type);
        updated.push({
          id: `folder-${def.type}-${Date.now()}`,
          name: def.name,
          icon: def.icon,
          color: def.color,
          parentId: null,
          type: def.type,
          vfileId: vfId || undefined,
          prompt: '',
          generatedTags: [],
          selectedTags: [],
          schemes: [],
          charts: [],
          contentCards: [],
          knowledgeInputs: [],
          children: [],
          createdAt: Date.now(),
        });
      } else if (!found.vfileId) {
        const vfId = dataService.getRootFolderIdByType(def.type);
        if (vfId) found.vfileId = vfId;
      }
    }
    return updated;
  }

  const now = Date.now();
  return DEFAULT_FOLDERS.map((def, idx) => {
    const vfId = dataService.getRootFolderIdByType(def.type);
    return {
      id: `folder-${def.type}-${now}`,
      name: def.name,
      icon: def.icon,
      color: def.color,
      parentId: null,
      type: def.type,
      vfileId: vfId || undefined,
      prompt: '',
      generatedTags: [],
      selectedTags: [],
      schemes: [],
      charts: [],
      contentCards: [],
      knowledgeInputs: [],
      children: [],
      createdAt: now + idx,
    };
  });
}

const StepSettings: React.FC<StepSettingsProps> = ({
  project,
  prompts,
  activeModel,
  onUpdate,
  onOpenSettings,
}) => {
  const { themeInfo, mode } = useTheme();
  const { animationLevel } = useUIStore();
  const hasAnimations = animationLevel !== 'none';

  const folders = useMemo(() => ensureDefaultFolders(project), [project]);

  const initDoneRef = useRef(false);
  useEffect(() => {
    if (!initDoneRef.current && (!project.folders || project.folders.length === 0)) {
      onUpdate({ folders });
    }
    initDoneRef.current = true;
  }, []);

  const [subTab, setSubTab] = useState<string>('world');
  const [showHistory, setShowHistory] = useState(false);
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);

  const findFolderInList = (folders: BubbleFolderType[], folderId: string): BubbleFolderType | undefined => {
    for (const f of folders) {
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
    return folder || folders[0];
  }, [folders, subTab, activeFolderId]);

  const folderPath = useMemo(() => {
    if (activeFolderId) return getFolderPath(activeFolderId);
    if (activeFolder) return [activeFolder];
    return [];
  }, [activeFolderId, activeFolder, getFolderPath]);

  const handleCreateFolder = useCallback((name: string, type: BubbleFolderType['type']) => {
    const vf = dataService.createFile(null, { name, type: 'folder', metadata: { tags: [type], cardType: 'folder' } });
    const newFolder: BubbleFolderType = {
      id: `folder-${Date.now()}`,
      name,
      icon: type === 'custom' ? 'fa-folder' : DEFAULT_FOLDERS.find(f => f.type === type)?.icon || 'fa-folder',
      color: type === 'custom' ? 'rose' : DEFAULT_FOLDERS.find(f => f.type === type)?.color || 'purple',
      parentId: null,
      type,
      vfileId: vf.id,
      prompt: '',
      generatedTags: [],
      selectedTags: [],
      schemes: [],
      charts: [],
      contentCards: [],
      knowledgeInputs: [],
      children: [],
      createdAt: Date.now(),
    };
    onUpdate({ folders: [...folders, newFolder] });
  }, [folders, onUpdate]);

  const handleUpdateFolder = useCallback((folderId: string, updates: Partial<BubbleFolderType>) => {
    const updateFolderInList = (folders: BubbleFolderType[], fid: string, ups: Partial<BubbleFolderType>): BubbleFolderType[] => {
      return folders.map(f => {
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

    // 在 VFile 系统中创建对应的文件夹节点
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
      contentCards: [],
      knowledgeInputs: [],
      children: [],
      createdAt: Date.now(),
    };
    handleUpdateFolder(parentId, { children: [...(parentFolder.children || []), newSubFolder] });
  }, [folders, handleUpdateFolder]);

  const folderItems = folders.filter(f => ['world', 'characters', 'timeline'].includes(f.type));

  const handleSelectFolder = useCallback((folderId: string) => {
    setActiveFolderId(folderId);
  }, []);

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
                onClick={() => { setSubTab(folder.type); setActiveFolderId(null); }}
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

      {/* 主内容区域 */}
      <div className="flex-1 overflow-hidden">
        {/* 面包屑路径导航 - 标签页下方 */}
        {folderPath.length > 1 && (
          <div className="px-5 pb-2 shrink-0">
            <div className="flex items-center gap-1 text-xs flex-wrap">
              {folderPath.map((f, idx) => {
                const isLast = idx === folderPath.length - 1;
                return (
                  <React.Fragment key={f.id}>
                    {idx > 0 && (
                      <i className="fas fa-chevron-right text-[8px]" style={{ color: 'var(--color-text-muted)' }}></i>
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
        {activeFolder && (
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

export default StepSettings;
