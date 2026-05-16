import React, { useState, useCallback } from 'react';
import { BubbleFolder as BubbleFolderType } from '../../../shared/types';
import { useTheme } from '../../shared/contexts/ThemeContext';
import { useUIStore } from '../../shared/stores/uiStore';

interface BubbleFolderProps {
  folders: BubbleFolderType[];
  activeFolderId: string | null;
  onSelectFolder: (id: string) => void;
  onCreateFolder: (name: string, type: BubbleFolderType['type']) => void;
  onDeleteFolder: (id: string) => void;
  onRenameFolder: (id: string, name: string) => void;
  onCreateSubFolder?: (parentId: string, name: string, type: BubbleFolderType['type']) => void;
  onCreateCard?: (folderId: string, title?: string) => void;
}

const FOLDER_BG_COLORS: Record<string, string> = {
  'world': 'from-emerald-600/30 to-emerald-900/20',
  'characters': 'from-blue-600/30 to-blue-900/20',
  'timeline': 'from-amber-600/30 to-amber-900/20',
  'custom': 'from-rose-600/30 to-rose-900/20',
};

const FOLDER_ICONS: Record<string, string> = {
  'world': 'fa-globe',
  'characters': 'fa-users',
  'timeline': 'fa-timeline',
  'custom': 'fa-folder',
};

const FOLDER_BORDER_COLORS: Record<string, string> = {
  'world': 'border-emerald-500/30',
  'characters': 'border-blue-500/30',
  'timeline': 'border-amber-500/30',
  'custom': 'border-rose-500/30',
};

const FOLDER_GLOW_COLORS: Record<string, string> = {
  'world': 'shadow-emerald-900/30',
  'characters': 'shadow-blue-900/30',
  'timeline': 'shadow-amber-900/30',
  'custom': 'shadow-rose-900/30',
};

const TYPE_LABELS: Record<string, string> = {
  'world': '世界观',
  'characters': '角色',
  'timeline': '时间线',
  'custom': '自定义',
};

const BubbleFolder: React.FC<BubbleFolderProps> = ({
  folders,
  activeFolderId,
  onSelectFolder,
  onCreateFolder,
  onDeleteFolder,
  onRenameFolder,
  onCreateSubFolder,
  onCreateCard,
}) => {
  const { themeInfo } = useTheme();
  const { animationLevel } = useUIStore();
  const hasAnimations = animationLevel !== 'none';
  
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderType, setNewFolderType] = useState<BubbleFolderType['type']>('custom');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [squashingId, setSquashingId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; folderId: string } | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [showCreateSubModal, setShowCreateSubModal] = useState(false);
  const [createSubParentId, setCreateSubParentId] = useState<string | null>(null);
  const [newSubName, setNewSubName] = useState('');

  const rootFolders = folders.filter(f => f.parentId === null);

  const toggleExpand = useCallback((folderId: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  }, []);

  const handleSelect = useCallback((folderId: string) => {
    setSquashingId(folderId);
    onSelectFolder(folderId);
    setTimeout(() => setSquashingId(null), 400);
  }, [onSelectFolder]);

  const handleCreate = useCallback(() => {
    if (!newFolderName.trim()) return;
    onCreateFolder(newFolderName.trim(), newFolderType);
    setNewFolderName('');
    setNewFolderType('custom');
    setShowCreateModal(false);
  }, [newFolderName, newFolderType, onCreateFolder]);

  const handleCreateSub = useCallback(() => {
    if (!newSubName.trim() || !createSubParentId || !onCreateSubFolder) return;
    onCreateSubFolder(createSubParentId, newSubName.trim(), 'custom');
    setNewSubName('');
    setShowCreateSubModal(false);
    setExpandedIds(prev => new Set(prev).add(createSubParentId));
  }, [newSubName, createSubParentId, onCreateSubFolder]);

  const handleStartRename = useCallback((folder: BubbleFolderType) => {
    setRenamingId(folder.id);
    setRenameText(folder.name);
  }, []);

  const handleConfirmRename = useCallback(() => {
    if (renamingId && renameText.trim()) {
      onRenameFolder(renamingId, renameText.trim());
    }
    setRenamingId(null);
    setRenameText('');
  }, [renamingId, renameText, onRenameFolder]);

  const handleStartDelete = useCallback((folder: BubbleFolderType) => {
    setDeletingId(folder.id);
  }, []);

  const handleConfirmDelete = useCallback(() => {
    if (deletingId) {
      onDeleteFolder(deletingId);
    }
    setDeletingId(null);
  }, [deletingId, onDeleteFolder]);

  // 递归渲染文件夹树
  const renderFolderTree = (folderList: BubbleFolderType[], depth: number = 0): React.ReactNode => {
    return folderList.map((folder) => {
      const isActive = folder.id === activeFolderId;
      const folderType = folder.type;
      const children = folder.children || [];
      const hasChildren = children.length > 0;
      const isExpanded = expandedIds.has(folder.id);
      const cardCount = (folder.contentCards || []).filter(c => c.isFavorited).length;
      const isSquashing = squashingId === folder.id;

      return (
        <div key={folder.id}>
          <div
            className="relative group"
            style={{ paddingLeft: `${depth * 16}px` }}
          >
            <button
              onClick={() => handleSelect(folder.id)}
              onDoubleClick={() => { if (hasChildren) toggleExpand(folder.id); }}
              onContextMenu={(e) => {
                e.preventDefault();
                setContextMenu({ x: e.clientX, y: e.clientY, folderId: folder.id });
              }}
              className={`
                w-full flex items-center gap-1.5 px-3 py-2.5 rounded-xl transition-all duration-200 text-left
                ${isActive
                  ? ''
                  : 'hover:bg-white/5'
                }
                ${isSquashing ? 'animate-squash-bounce' : ''}
              `}
              style={{
                background: isActive ? themeInfo.gradient : 'transparent',
                color: isActive ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                boxShadow: isActive ? '0 4px 12px var(--color-primary-100)' : 'none',
              }}
            >
              {/* 展开箭头 */}
              {hasChildren ? (
                <span
                  onClick={(e) => { e.stopPropagation(); toggleExpand(folder.id); }}
                  className="w-4 h-4 flex items-center justify-center rounded hover:bg-white/10 cursor-pointer transition-colors"
                >
                  <i className={`fas fa-chevron-right text-[8px] transition-transform ${isExpanded ? 'rotate-90' : ''}`}></i>
                </span>
              ) : (
                <span className="w-4"></span>
              )}

              {/* 文件夹图标 */}
              <i className={`fas ${FOLDER_ICONS[folderType]} text-sm ${isActive ? 'text-[var(--color-primary-300)]' : 'text-gray-500'}`}></i>

              {/* 名称 */}
              {renamingId === folder.id ? (
                <input
                  type="text"
                  value={renameText}
                  onChange={(e) => setRenameText(e.target.value)}
                  onBlur={handleConfirmRename}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleConfirmRename();
                    if (e.key === 'Escape') setRenamingId(null);
                  }}
                  className="flex-1 bg-gray-800/80 border border-[var(--color-primary-300)] rounded px-2 py-0.5 text-xs text-gray-200 focus:outline-none"
                  autoFocus
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span className="flex-1 text-xs truncate">{folder.name}</span>
              )}

              {/* 数量 */}
              {cardCount > 0 && (
                <span className="text-[9px] text-[var(--color-primary-300)]">{cardCount}</span>
              )}

              {/* hover 按钮 */}
              {folder.type === 'custom' && (
              <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <span
                  onClick={(e) => { e.stopPropagation(); handleStartRename(folder); }}
                  className="p-1 rounded hover:bg-white/10 text-gray-500 hover:text-gray-200 cursor-pointer"
                >
                  <i className="fas fa-pen text-[8px]"></i>
                </span>
                <span
                  onClick={(e) => { e.stopPropagation(); handleStartDelete(folder); }}
                  className="p-1 rounded hover:bg-red-900/30 text-gray-500 hover:text-red-300 cursor-pointer"
                >
                  <i className="fas fa-trash text-[8px]"></i>
                </span>
              </div>
              )}
            </button>
          </div>

          {/* 递归渲染子文件夹 */}
          {isExpanded && hasChildren && (
            <div className="animate-fade-in">
              {renderFolderTree(children, depth + 1)}
            </div>
          )}
        </div>
      );
    });
  };

  return (
    <div className="h-full flex flex-col">
      {/* 头部 - 美化版本 */}
      <div className="flex items-center justify-between px-4 py-3 border-b shrink-0 relative overflow-hidden">
        {/* 装饰背景 */}
        <div className="absolute inset-0 opacity-10" style={{ background: themeInfo.gradient }} />
        
        <div className="relative flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: themeInfo.gradient }}>
            <i className="fas fa-folder-tree text-white text-sm"></i>
          </div>
          <span className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>内容文件夹</span>
        </div>
        
        <button
          onClick={() => setShowCreateModal(true)}
          className={`relative flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${hasAnimations ? 'hover:scale-105 active:scale-95' : ''}`}
          style={{
            background: themeInfo.gradient,
            color: 'var(--color-text-primary)',
            boxShadow: '0 4px 12px var(--color-primary-100)'
          }}
        >
          <i className="fas fa-plus text-[10px]"></i>
          新建
        </button>
      </div>

      {/* 树形文件夹列表 */}
      <div className="flex-1 overflow-y-auto p-2">
        {rootFolders.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-600">
            <i className="fas fa-folder-open text-3xl mb-2 opacity-30"></i>
            <p className="text-xs text-gray-500">暂无文件夹</p>
          </div>
        ) : (
          <div className="space-y-0.5">
            {renderFolderTree(rootFolders)}
          </div>
        )}
      </div>

      {/* 新建文件夹弹窗 */}
      {showCreateModal && (
        <div className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in"
          onClick={() => setShowCreateModal(false)}
        >
          <div className="bg-gray-900/95 border border-[var(--color-border-default)] rounded-2xl p-6 w-80 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-gray-200 mb-4">新建文件夹</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">名称</label>
                <input
                  type="text"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="文件夹名称"
                  className="w-full bg-gray-800/60 border border-[var(--color-border-default)] rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-[var(--color-primary-300)] transition-all duration-200"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreate();
                  }}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">类型</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['custom', 'world', 'characters', 'timeline'] as const).map((type) => (
                    <button
                      key={type}
                      onClick={() => setNewFolderType(type)}
                      className={`
                        flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all duration-200
                        ${newFolderType === type
                          ? `${FOLDER_BG_COLORS[type]} ${FOLDER_BORDER_COLORS[type]} border`
                          : 'bg-gray-800/40 text-gray-500 hover:bg-gray-800/60 hover:text-gray-300 border border-transparent'
                        }
                      `}
                    >
                      <i className={`fas ${FOLDER_ICONS[type]}`}></i>
                      <span>{TYPE_LABELS[type]}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 px-4 py-2 text-xs font-medium text-gray-400 bg-gray-800/40 hover:bg-gray-800/60 rounded-lg transition-all duration-200"
                >
                  取消
                </button>
                <button
                  onClick={handleCreate}
                  disabled={!newFolderName.trim()}
                  className="flex-1 px-4 py-2 text-xs font-medium text-white bg-gradient-to-r from-[var(--color-primary-400)] to-[var(--color-primary-400)] rounded-lg hover:from-[var(--color-primary-500)] hover:to-[var(--color-primary-500)] transition-all duration-200 disabled:opacity-40"
                >
                  创建
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 删除确认弹窗 */}
      {deletingId && (
        <div className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in"
          onClick={() => setDeletingId(null)}
        >
          <div className="bg-gray-900/95 border border-red-900/30 rounded-2xl p-6 w-72 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-center mb-4">
              <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-red-900/30 flex items-center justify-center">
                <i className="fas fa-exclamation-triangle text-red-400 text-lg"></i>
              </div>
              <h3 className="text-base font-semibold text-gray-200 mb-1">删除文件夹</h3>
              <p className="text-xs text-gray-500">确定要删除此文件夹吗？此操作不可撤销。</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setDeletingId(null)}
                className="flex-1 px-4 py-2 text-xs font-medium text-gray-400 bg-gray-800/40 hover:bg-gray-800/60 rounded-lg transition-all duration-200"
              >
                取消
              </button>
              <button
                onClick={handleConfirmDelete}
                className="flex-1 px-4 py-2 text-xs font-medium text-white bg-gradient-to-r from-red-600 to-rose-600 rounded-lg hover:from-red-700 hover:to-rose-700 transition-all duration-200"
              >
                删除
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 右键上下文菜单 */}
      {contextMenu && (
        <div
          className="fixed inset-0 z-[10000]"
          onClick={() => setContextMenu(null)}
          onContextMenu={(e) => e.preventDefault()}
        >
          <div
            className="absolute rounded-xl border shadow-2xl backdrop-blur-xl overflow-hidden py-1 min-w-[140px]"
            style={{
              left: contextMenu.x, top: contextMenu.y,
              backgroundColor: 'var(--color-surface-overlay)',
              borderColor: 'var(--color-border-default)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {(() => {
              const f = folders.find(f2 => f2.id === contextMenu.folderId);
              const isCustom = f?.type === 'custom';
              return (
                <>
                  {isCustom && (
                  <button
                    onClick={() => { setContextMenu(null); if (f) handleStartRename(f); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-300 hover:bg-white/5 transition-colors text-left"
                  >
                    <i className="fas fa-pen text-[10px] text-gray-500 w-4 text-center"></i>
                    <span>重命名</span>
                  </button>
                  )}
                  {isCustom && (
                  <button
                    onClick={() => { setContextMenu(null); if (f) handleStartDelete(f); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-400 hover:bg-red-900/20 transition-colors text-left"
                  >
                    <i className="fas fa-trash text-[10px] text-red-400/60 w-4 text-center"></i>
                    <span>删除</span>
                  </button>
                  )}
                  <button
                    onClick={() => {
                      setContextMenu(null);
                      setCreateSubParentId(contextMenu.folderId);
                      setShowCreateSubModal(true);
                      setNewSubName('');
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-300 hover:bg-white/5 transition-colors text-left"
                  >
                    <i className="fas fa-folder-plus text-[10px] text-[var(--color-primary-400)] w-4 text-center"></i>
                    <span>新建子文件夹</span>
                  </button>
                  <div className="border-t border-white/5 my-1"></div>
                  <button
                    onClick={() => {
                      setContextMenu(null);
                      if (onCreateCard) {
                        onCreateCard(contextMenu.folderId);
                      } else {
                        onSelectFolder(contextMenu.folderId);
                      }
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-[var(--color-primary-300)] hover:bg-[var(--color-primary-100)] transition-colors text-left"
                  >
                    <i className="fas fa-wand-magic-sparkles text-[10px] text-[var(--color-primary-400)] w-4 text-center"></i>
                    <span>创建文件</span>
                  </button>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* 新建子文件夹弹窗 */}
      {showCreateSubModal && (
        <div className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in"
          onClick={() => setShowCreateSubModal(false)}
        >
          <div className="bg-gray-900/95 border border-[var(--color-border-default)] rounded-2xl p-6 w-72 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-gray-200 mb-4">新建子文件夹</h3>
            <p className="text-[10px] text-gray-500 mb-3">在当前文件夹中创建</p>
            <div className="space-y-3">
              <input
                type="text"
                value={newSubName}
                onChange={(e) => setNewSubName(e.target.value)}
                placeholder="文件夹名称"
                className="w-full bg-gray-800/60 border border-[var(--color-border-default)] rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-[var(--color-primary-300)] transition-all"
                autoFocus
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreateSub(); }}
              />
              <div className="flex gap-2">
                <button onClick={() => setShowCreateSubModal(false)}
                  className="flex-1 px-4 py-2 text-xs font-medium text-gray-400 bg-gray-800/40 hover:bg-gray-800/60 rounded-lg transition-all">
                  取消
                </button>
                <button onClick={handleCreateSub} disabled={!newSubName.trim()}
                  className="flex-1 px-4 py-2 text-xs font-medium text-white bg-gradient-to-r from-[var(--color-primary-400)] to-[var(--color-primary-400)] rounded-lg hover:from-[var(--color-primary-500)] hover:to-[var(--color-primary-500)] transition-all disabled:opacity-40">
                  创建
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BubbleFolder;
