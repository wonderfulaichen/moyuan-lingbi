import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { Project, ModelConfig, PromptTemplate, BubbleFolder as BubbleFolderType } from '../../../shared/types';
import { dataService } from '../../shared/services/DataService';
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
];

/**
 * 确保默认文件夹存在
 */
function ensureDefaultFolders(project: Project): BubbleFolderType[] {
  const filtered = (project.folders || []).filter(f => !['outline', 'detailed_outline', 'chapters'].includes(f.type));

  if (filtered.length > 0) {
    return filtered.map(f => {
      if (f.vfileId) return f;
      const vfId = dataService.getRootFolderIdByType(f.type);
      return vfId ? { ...f, vfileId: vfId } : f;
    });
  }

  const now = Date.now();
  return DEFAULT_FOLDERS.map((def, idx) => {
    const vfId = dataService.getRootFolderIdByType(def.type);
    return {
      id: `folder-${idx}`,
      name: def.name,
      icon: def.icon,
      color: def.color,
      parentId: null,
      type: def.type,
      vfileId: vfId || undefined,
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
  // 确保默认文件夹存在
  const folders = useMemo(() => ensureDefaultFolders(project), [project]);

  // 同步默认文件夹到project（首次渲染后通过 useEffect 执行）
  const initDoneRef = useRef(false);
  useEffect(() => {
    if (!initDoneRef.current && (!project.folders || project.folders.length === 0)) {
      onUpdate({ folders });
    }
    initDoneRef.current = true;
  }, []);

  const [activeFolderId, setActiveFolderId] = useState<string>(() => {
    return folders[0]?.id || '';
  });

  // 递归查找文件夹（必须先定义，后面 useMemo 中会调用）
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

  // 当前活跃文件夹（支持嵌套查找）
  const activeFolder = useMemo(
    () => findFolderInList(folders, activeFolderId) || folders[0],
    [folders, activeFolderId]
  );

  // 选择文件夹
  const handleSelectFolder = useCallback((id: string) => {
    setActiveFolderId(id);
  }, []);

  // 递归更新文件夹（支持嵌套子文件夹）
  const updateFolderInList = (folders: BubbleFolderType[], folderId: string, updates: Partial<BubbleFolderType>): BubbleFolderType[] => {
    return folders.map(f => {
      if (f.id === folderId) {
        return { ...f, ...updates };
      }
      // 递归检查子文件夹
      if (f.children && f.children.length > 0) {
        const updatedChildren = updateFolderInList(f.children, folderId, updates);
        if (updatedChildren !== f.children) {
          return { ...f, children: updatedChildren };
        }
      }
      return f;
    });
  };

  // 创建文件夹
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
      knowledgeInputs: [],
      children: [],
      createdAt: Date.now(),
    };
    onUpdate({ folders: [...folders, newFolder] });
    setActiveFolderId(newFolder.id);
  }, [folders, onUpdate]);

  // 在指定文件夹中创建卡片（右键菜单"创建文件"）
  const handleCreateCard = useCallback((folderId: string, title?: string) => {
    const cardTitle = title || `新文件_${Date.now()}`;
    const targetFolder = folders.find(f => f.id === folderId);
    const parentVfId = targetFolder?.vfileId || null;
    dataService.createFile(parentVfId, {
      name: cardTitle,
      type: 'file',
      content: '',
      metadata: { favorited: true, batchId: `batch-${Date.now()}` },
    });
    setActiveFolderId(folderId);
  }, [folders]);

  // 创建子文件夹（在指定父文件夹内）
  const handleCreateSubFolder = useCallback((parentId: string, name: string, type: BubbleFolderType['type']) => {
    const parentFolder = folders.find(f => f.id === parentId);
    const parentVfId = parentFolder?.vfileId || null;
    const vf = dataService.createFile(parentVfId, { name, type: 'folder', metadata: { tags: [type], cardType: 'folder' } });
    const newSubFolder: BubbleFolderType = {
      id: `folder-${Date.now()}`,
      name,
      icon: type === 'custom' ? 'fa-folder' : DEFAULT_FOLDERS.find(f => f.type === type)?.icon || 'fa-folder',
      color: type === 'custom' ? 'rose' : DEFAULT_FOLDERS.find(f => f.type === type)?.color || 'purple',
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

    const addSubFolderToParent = (list: BubbleFolderType[]): BubbleFolderType[] => {
      return list.map(f => {
        if (f.id === parentId) {
          return { ...f, children: [...(f.children || []), newSubFolder] };
        }
        if (f.children && f.children.length > 0) {
          return { ...f, children: addSubFolderToParent(f.children) };
        }
        return f;
      });
    };
    onUpdate({ folders: addSubFolderToParent(folders) });
  }, [folders, onUpdate]);

  // 删除文件夹
  const handleDeleteFolder = useCallback((id: string) => {
    // 内置文件夹不可删除
    const target = findFolderInList(folders, id);
    if (target && target.type !== 'custom') return;

    // 递归删除
    const removeFolder = (list: BubbleFolderType[]): BubbleFolderType[] => {
      return list
        .filter(f => f.id !== id)
        .map(f => ({
          ...f,
          children: f.children ? removeFolder(f.children) : undefined,
        }));
    };

    const updatedFolders = removeFolder(folders);
    onUpdate({ folders: updatedFolders });

    // 如果删除的是当前文件夹，切换到第一个
    if (activeFolderId === id) {
      setActiveFolderId(updatedFolders[0]?.id || '');
    }
  }, [folders, activeFolderId, onUpdate]);

  // 重命名文件夹
  const handleRenameFolder = useCallback((id: string, name: string) => {
    const target = findFolderInList(folders, id);
    if (target && target.type !== 'custom') return; // 内置文件夹不可重命名

    onUpdate({
      folders: updateFolderInList(folders, id, { name }),
    });
  }, [folders, onUpdate]);

  // 更新文件夹内容（支持嵌套）
  const handleUpdateFolder = useCallback((folderId: string, updates: Partial<BubbleFolderType>) => {
    onUpdate({
      folders: updateFolderInList(folders, folderId, updates),
    });
  }, [folders, onUpdate]);

  return (
    <div className="h-full flex overflow-hidden">
      {/* 左侧：气泡文件夹浏览器 */}
      <div className="w-56 lg:w-64 border-r border-purple-900/20 bg-gray-950/20 shrink-0 overflow-hidden">
        <BubbleFolder
          folders={folders}
          activeFolderId={activeFolderId}
          onSelectFolder={handleSelectFolder}
          onCreateFolder={handleCreateFolder}
          onDeleteFolder={handleDeleteFolder}
          onRenameFolder={handleRenameFolder}
          onCreateSubFolder={handleCreateSubFolder}
          onCreateCard={handleCreateCard}
        />
      </div>

      {/* 右侧：文件夹内容 */}
      <div className="flex-1 overflow-hidden min-w-0">
        {activeFolder ? (
          <BubbleFolderContent
            key={activeFolder.id}
            folder={activeFolder}
            project={project}
            prompts={prompts}
            activeModel={activeModel}
            onUpdate={onUpdate}
            onOpenSettings={onOpenSettings}
            onUpdateFolder={handleUpdateFolder}
            onCreateSubFolder={handleCreateSubFolder}
            onSelectFolder={handleSelectFolder}
          />
        ) : (
          <div className="h-full flex items-center justify-center text-gray-600">
            <div className="text-center">
              <i className="fas fa-folder-open text-4xl mb-3 opacity-30"></i>
              <p className="text-sm">选择一个文件夹</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default StepSettings;
