import React, { useState, useCallback } from 'react';
import { ProjectMeta } from '../../../shared/types/fileSystem';
import { ModelConfig } from '../../../shared/types';
import { dataService } from '../../shared/services/DataService';
import { InputModal } from '../../shared/components/Modal';
import AppIcon from '../../../assets/icon.png';

interface FileSidebarProps {
  projects: ProjectMeta[];
  activeProjectId: string | null;
  activeModelId: string;
  models: ModelConfig[];
  onCreateProject: () => void;
  onSelectProject: (id: string) => void;
  onDeleteProject: (id: string) => void;
  onRenameProject: (id: string, name: string) => void;
  onOpenSettings: () => void;
  onToggleAIPanel: () => void;
  aiPanelOpen: boolean;
}

const FOLDER_ICONS: Record<string, { icon: string; color: string }> = {
  'world': { icon: 'fa-globe', color: '#34d399' },
  'characters': { icon: 'fa-users', color: '#60a5fa' },
  'timeline': { icon: 'fa-timeline', color: '#f59e0b' },
  'outline': { icon: 'fa-sitemap', color: 'var(--color-primary-300)' },
  'chapters': { icon: 'fa-book', color: '#f472b6' },
};

const FileSidebar: React.FC<FileSidebarProps> = ({
  projects, activeProjectId, activeModelId, models,
  onCreateProject, onSelectProject, onDeleteProject, onRenameProject,
  onOpenSettings, onToggleAIPanel, aiPanelOpen,
}) => {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');
  const [newFolderModal, setNewFolderModal] = useState(false);

  const fs = dataService.getFS();
  const activeModel = models.find(m => m.id === activeModelId) || models[0];

  const toggleExpand = useCallback((id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const renderFolderTree = (parentId: string | null, depth: number = 0): React.ReactNode => {
    const children = dataService.getChildren(parentId);
    return children.map(file => {
      const isFolder = file.type === 'folder';
      const isExpanded = expanded.has(file.id);
      const iconInfo = FOLDER_ICONS[file.metadata.cardType || ''] || { icon: isFolder ? 'fa-folder' : 'fa-file-lines', color: 'var(--color-primary-300)' };

      return (
        <div key={file.id}>
          <div
            className="group"
            style={{ paddingLeft: depth * 12 }}
          >
            <div
              className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg cursor-pointer transition-all hover:bg-white/5"
              onClick={() => isFolder ? toggleExpand(file.id) : undefined}
            >
              {isFolder ? (
                <span className="w-4 h-4 flex items-center justify-center shrink-0">
                  <i className={`fas fa-chevron-right text-[8px] transition-transform ${isExpanded ? 'rotate-90' : ''}`} style={{ color: 'var(--color-text-muted)' }}></i>
                </span>
              ) : <span className="w-4 shrink-0"></span>}

              <i className={`fas ${isFolder ? (isExpanded ? 'fa-folder-open' : iconInfo.icon) : 'fa-file-lines'} text-xs`} style={{ color: iconInfo.color }}></i>

              {renamingId === file.id ? (
                <input
                  value={renameText}
                  onChange={e => setRenameText(e.target.value)}
                  onBlur={() => { if (renameText.trim()) dataService.updateFile(file.id, { name: renameText.trim() }); setRenamingId(null); }}
                  onKeyDown={e => { if (e.key === 'Enter') { dataService.updateFile(file.id, { name: renameText.trim() }); setRenamingId(null); } if (e.key === 'Escape') setRenamingId(null); }}
                  className="flex-1 bg-gray-800/80 border border-purple-500/30 rounded px-2 py-0.5 text-xs text-gray-200 focus:outline-none min-w-0"
                  autoFocus
                  onClick={e => e.stopPropagation()}
                />
              ) : (
                <span className="flex-1 text-xs truncate" style={{ color: 'var(--color-text-secondary)' }}>{file.name}</span>
              )}

              {isFolder && (
                <span className="text-[9px] opacity-50" style={{ color: 'var(--color-text-muted)' }}>{file.childrenIds.length}</span>
              )}

              <div className="hidden group-hover:flex items-center gap-0.5">
                <button
                  onClick={(e) => { e.stopPropagation(); setRenamingId(file.id); setRenameText(file.name); }}
                  className="p-1 rounded hover:bg-white/10"
                  style={{ color: 'var(--color-text-muted)' }}
                >
                  <i className="fas fa-pen text-[8px]"></i>
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); dataService.deleteFile(file.id); }}
                  className="p-1 rounded hover:bg-red-900/30"
                  style={{ color: 'var(--color-text-muted)' }}
                >
                  <i className="fas fa-trash text-[8px]"></i>
                </button>
              </div>
            </div>
          </div>

          {isFolder && isExpanded && renderFolderTree(file.id, depth + 1)}
        </div>
      );
    });
  };

  return (
    <div style={{
      width: 220,
      display: 'flex',
      flexDirection: 'column',
      borderRight: '1px solid var(--color-border-default)',
      backgroundColor: 'var(--color-surface-base)',
      flexShrink: 0,
    }}>
      <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--color-border-default)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 24, height: 24, borderRadius: 6, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <img src={AppIcon} alt="墨渊灵笔" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </div>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-primary)' }}>墨渊灵笔</span>
        </div>
      </div>

      <div style={{ padding: '6px 8px', borderBottom: '1px solid var(--color-border-default)' }}>
        <select
          value={activeProjectId || ''}
          onChange={e => onSelectProject(e.target.value)}
          style={{
            width: '100%',
            padding: '6px 8px',
            borderRadius: 6,
            fontSize: 11,
            backgroundColor: 'var(--color-surface-muted)',
            color: 'var(--color-text-primary)',
            border: '1px solid var(--color-border-default)',
            outline: 'none',
            cursor: 'pointer',
          }}
        >
          {projects.length === 0 && <option value="">暂无作品</option>}
          {projects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
        </select>
        <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
          <button onClick={onCreateProject} style={{ flex: 1, padding: '4px 0', borderRadius: 6, fontSize: 10, fontWeight: 500, background: 'var(--color-primary-100)', color: 'var(--color-primary-300)', border: 'none', cursor: 'pointer' }}>
            <i className="fas fa-plus" style={{ marginRight: 4 }}></i>新建
          </button>
          {activeProjectId && (
            <button onClick={() => onDeleteProject(activeProjectId)} style={{ padding: '4px 8px', borderRadius: 6, fontSize: 10, background: 'transparent', color: 'var(--color-text-muted)', border: '1px solid var(--color-border-default)', cursor: 'pointer' }}>
              <i className="fas fa-trash"></i>
            </button>
          )}
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '4px 4px' }}>
        {activeProjectId ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 8px', marginBottom: 2 }}>
              <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--color-text-muted)' }}>文件</span>
              <button
                onClick={() => setNewFolderModal(true)}
                style={{ padding: '2px 6px', borderRadius: 4, fontSize: 9, background: 'transparent', color: 'var(--color-text-muted)', border: 'none', cursor: 'pointer' }}
              >
                <i className="fas fa-folder-plus"></i>
              </button>
            </div>
            {renderFolderTree(null)}
          </>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--color-text-muted)' }}>
            <i className="fas fa-folder-open" style={{ fontSize: 24, marginBottom: 8, opacity: 0.3 }}></i>
            <p style={{ fontSize: 11 }}>请创建或选择作品</p>
          </div>
        )}
      </div>

      <div style={{ padding: '8px', borderTop: '1px solid var(--color-border-default)', display: 'flex', alignItems: 'center', gap: 4 }}>
        <select
          value={activeModelId}
          onChange={e => dataService.setActiveModel(e.target.value)}
          style={{
            flex: 1,
            padding: '4px 6px',
            borderRadius: 6,
            fontSize: 10,
            backgroundColor: 'var(--color-surface-muted)',
            color: 'var(--color-text-secondary)',
            border: '1px solid var(--color-border-default)',
            outline: 'none',
            cursor: 'pointer',
          }}
        >
          {models.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <button onClick={onToggleAIPanel} style={{
          padding: '4px 8px',
          borderRadius: 6,
          fontSize: 10,
          background: aiPanelOpen ? 'var(--color-primary-100)' : 'transparent',
          color: aiPanelOpen ? 'var(--color-primary-300)' : 'var(--color-text-muted)',
          border: aiPanelOpen ? '1px solid var(--color-primary-200)' : '1px solid var(--color-border-default)',
          cursor: 'pointer',
        }}>
          <i className="fas fa-robot"></i>
        </button>
        <button onClick={onOpenSettings} style={{ padding: '4px 8px', borderRadius: 6, fontSize: 10, background: 'transparent', color: 'var(--color-text-muted)', border: '1px solid var(--color-border-default)', cursor: 'pointer' }}>
          <i className="fas fa-gear"></i>
        </button>
      </div>

      {newFolderModal && (
        <InputModal
          title="新建文件夹"
          placeholder="输入文件夹名称"
          confirmText="创建"
          onConfirm={(v) => { dataService.createFile(null, { name: v, type: 'folder' }); setNewFolderModal(false); }}
          onCancel={() => setNewFolderModal(false)}
        />
      )}
    </div>
  );
};

export default FileSidebar;
