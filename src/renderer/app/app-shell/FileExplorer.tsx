import React, { useState, useCallback, useEffect } from 'react';
import { VFile } from '../../../shared/types/fileSystem';
import { ModelConfig } from '../../../shared/types';
import { dataService } from '../../shared/services/DataService';
import { aiService } from '../../shared/services/aiService';
import { useAIStatus } from '../../shared/contexts/AIStatusContext';
import { InputModal } from '../../shared/components/Modal';

interface FileExplorerProps {
  activeFileId: string | null;
  onSelectFile: (id: string | null) => void;
  activeModel: ModelConfig;
  onOpenSettings: () => void;
}

type InputModalState = {
  isOpen: boolean;
  title: string;
  placeholder: string;
  defaultValue: string;
  onConfirm: (value: string) => void;
} | null;

const ICON_MAP: Record<string, { icon: string; color: string }> = {
  'world': { icon: 'fa-globe', color: '#34d399' },
  'characters': { icon: 'fa-users', color: '#60a5fa' },
  'timeline': { icon: 'fa-timeline', color: '#f59e0b' },
  'outline': { icon: 'fa-sitemap', color: 'var(--color-primary-300)' },
  'chapters': { icon: 'fa-book', color: '#f472b6' },
};

const FileExplorer: React.FC<FileExplorerProps> = ({ activeFileId, onSelectFile, activeModel, onOpenSettings }) => {
  const [editContent, setEditContent] = useState('');
  const [editName, setEditName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [viewMode, setViewMode] = useState<'edit' | 'preview'>('edit');
  const [inputModal, setInputModal] = useState<InputModalState>(null);
  const { setGenerating, setTokenUsage, setComplete, setError } = useAIStatus();

  const activeFile = activeFileId ? dataService.getFile(activeFileId) : undefined;

  const showInput = useCallback((title: string, placeholder: string, defaultValue: string, onConfirm: (v: string) => void) => {
    setInputModal({ isOpen: true, title, placeholder, defaultValue, onConfirm });
  }, []);

  const handleInputConfirm = useCallback((value: string) => {
    if (inputModal?.onConfirm) inputModal.onConfirm(value);
    setInputModal(null);
  }, [inputModal]);

  useEffect(() => {
    if (activeFile) { setEditContent(activeFile.content); setEditName(activeFile.name); }
    else { setEditContent(''); setEditName(''); }
  }, [activeFileId, activeFile?.version]);

  const handleSave = useCallback(() => {
    if (!activeFileId || !editName.trim()) return;
    dataService.updateFile(activeFileId, { name: editName.trim(), content: editContent });
    setIsSaving(true);
    setTimeout(() => setIsSaving(false), 800);
  }, [activeFileId, editName, editContent]);

  useEffect(() => {
    if (!activeFileId || !activeFile) return;
    const timer = setTimeout(() => {
      if (editContent !== activeFile.content || editName !== activeFile.name)
        dataService.updateFile(activeFileId, { name: editName.trim() || activeFile.name, content: editContent });
    }, 500);
    return () => clearTimeout(timer);
  }, [editContent, editName, activeFileId]);

  const handleAIGenerate = useCallback(async (type: 'expand' | 'rewrite' | 'continue') => {
    if (!activeFile || !activeModel?.modelName) { onOpenSettings(); return; }
    setIsGenerating(true);
    setGenerating(activeModel.name, `AI ${type === 'expand' ? '扩写中' : type === 'rewrite' ? '重写中' : '续写中'}...`);

    const prompts: Record<string, string> = {
      expand: `请对以下小说设定进行扩写，增加更多细节和深度，保持原有风格和逻辑一致性。直接输出扩写后的完整内容，不要前缀说明。\n\n${activeFile.content}`,
      rewrite: `请重新撰写以下小说设定，使其更加生动、具体、有画面感。保持核心设定不变，提升文学品质。直接输出重写后的完整内容。\n\n${activeFile.content}`,
      continue: `请续写以下小说设定，延续当前的风格和逻辑方向，补充更多细节。直接输出续写内容（仅续写部分）。\n\n${activeFile.content}`,
    };
    try {
      const result = await aiService.generateWithContext({ model: activeModel, prompt: prompts[type], temperature: 0.8, maxTokens: 1500 });
      if (result.tokens) setTokenUsage(result.tokens);
      if (result.error) { setError(result.error); }
      else if (result.content) {
        const nc = type === 'continue' ? activeFile.content + '\n\n' + result.content : result.content;
        dataService.updateFile(activeFile.id, { content: nc });
        setEditContent(nc);
        setComplete();
      }
    } catch (err) { setError(err instanceof Error ? err.message : '生成失败'); }
    finally { setIsGenerating(false); }
  }, [activeFile, activeModel, setGenerating, setTokenUsage, setComplete, setError, onOpenSettings]);

  const handleAICreateFiles = useCallback(async (parentId: string | null, count: string) => {
    if (!activeModel?.modelName) { onOpenSettings(); return; }
    const folderName = parentId ? dataService.getFile(parentId)?.name : '根目录';
    setIsGenerating(true);
    setGenerating(activeModel.name, '批量生成设定...');
    const aiPrompt = `你是一位小说设定规划师。为「${folderName}」分类生成${count}个设定文件。\n要求：每行一个：文件名|简短描述。直接输出`;
    try {
      const result = await aiService.generateWithContext({ model: activeModel, prompt: aiPrompt, maxTokens: 1000 });
      if (result.error) { setError(result.error); return; }
      if (result.tokens) setTokenUsage(result.tokens);
      const lines = (result.content || '').split('\n').filter(l => l.trim());
      for (const line of lines) {
        const [name, desc] = line.split('|').map(s => s.trim());
        if (name) dataService.createFile(parentId, { name, type: 'file', content: `# ${name}\n\n${desc || ''}`, metadata: { aiGenerated: true } });
      }
      setComplete();
    } catch (err) { setError(err instanceof Error ? err.message : '生成失败'); }
    finally { setIsGenerating(false); }
  }, [activeModel, setGenerating, setTokenUsage, setComplete, setError, onOpenSettings]);

  const renderInputModal = () => {
    if (!inputModal) return null;
    return (
      <InputModal
        title={inputModal.title}
        placeholder={inputModal.placeholder}
        defaultValue={inputModal.defaultValue}
        onConfirm={handleInputConfirm}
        onCancel={() => setInputModal(null)}
      />
    );
  };

  if (!activeFile) {
    const rootFolders = dataService.getChildren(null);
    return (
      <div className="p-8 overflow-y-auto h-full">
        {renderInputModal()}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-3xl font-black tracking-tight" style={{ color: 'var(--color-text-primary)' }}>
              内容设定
            </h2>
            <p className="mt-2 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              管理世界观、角色、时间线等小说核心设定文件
            </p>
          </div>
          <button
            onClick={() => showInput('新建文件夹', '输入文件夹名称', '', (n) => dataService.createFile(null, { name: n, type: 'folder' }))}
            className="card-float-hover px-4 py-2 text-white rounded-lg transition-all text-sm font-medium shadow-lg flex items-center gap-2"
            style={{ background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-primary-600))' }}
          >
            <i className="fas fa-folder-plus" />新建文件夹
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 max-w-6xl">
          {rootFolders.map((folder, i) => {
            const info = ICON_MAP[folder.metadata.cardType || ''] || { icon: 'fa-folder', color: 'var(--color-primary-300)' };
            const fileCount = folder.childrenIds.length;
            return (
              <div
                key={folder.id}
                onClick={() => onSelectFile(folder.id)}
                className="glass-card rounded-2xl p-5 card-float-hover animate-card-enter cursor-pointer"
                style={{ animationDelay: `${i * 50}ms` }}
              >
                <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-4"
                  style={{ background: `${info.color}15` }}>
                  <i className={`fas ${info.icon} text-base`} style={{ color: info.color }} />
                </div>
                <h3 className="text-base font-bold mb-1" style={{ color: 'var(--color-text-primary)' }}>{folder.name}</h3>
                <div className="flex items-center gap-3">
                  <span className="text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>{fileCount} 个文件</span>
                  {folder.metadata.autoGenerated && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ color: 'var(--color-primary-300)', backgroundColor: 'var(--color-primary-100)' }}>AI</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {rootFolders.length === 0 && (
          <div className="glass-card rounded-2xl p-16 text-center max-w-2xl mx-auto">
            <i className="fas fa-folder-open text-5xl mb-5 opacity-20" style={{ color: 'var(--color-text-muted)' }} />
            <p className="font-bold text-xl mb-2" style={{ color: 'var(--color-text-secondary)' }}>暂无内容设定</p>
            <p className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
              点击上方按钮创建文件夹来组织你的小说设定
            </p>
          </div>
        )}
      </div>
    );
  }

  const isFolder = activeFile.type === 'folder';
  const children = isFolder ? dataService.getChildren(activeFile.id) : [];

  if (isFolder) {
    const iconInfo = ICON_MAP[activeFile.metadata.cardType || ''] || { icon: 'fa-folder', color: 'var(--color-primary-300)' };
    return (
      <div className="p-8 overflow-y-auto h-full">
        {renderInputModal()}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <button onClick={() => onSelectFile(null)} className="w-9 h-9 rounded-lg flex items-center justify-center transition-colors hover:bg-white/10" style={{ color: 'var(--color-text-tertiary)' }}>
              <i className="fas fa-arrow-left text-sm" />
            </button>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${iconInfo.color}15` }}>
              <i className={`fas ${iconInfo.icon} text-base`} style={{ color: iconInfo.color }} />
            </div>
            <div>
              <h2 className="text-2xl font-black" style={{ color: 'var(--color-text-primary)' }}>{activeFile.name}</h2>
              <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{children.length} 项</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => showInput('新建文件', '输入文件名称', '', (n) => { const f = dataService.createFile(activeFile.id, { name: n, type: 'file' }); onSelectFile(f.id); })}
              className="text-xs px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 border" style={{ color: 'var(--color-text-secondary)', borderColor: 'var(--color-border-default)', background: 'transparent' }}>
              <i className="fas fa-plus text-[10px]" />新建文件
            </button>
            <button
              onClick={() => showInput('新建子文件夹', '输入文件夹名称', '', (n) => dataService.createFile(activeFile.id, { name: n, type: 'folder' }))}
              className="text-xs px-3 py-1.5 rounded-lg border transition-colors" style={{ color: 'var(--color-text-tertiary)', borderColor: 'var(--color-border-default)', background: 'transparent' }}>
              <i className="fas fa-folder-plus mr-1" />子文件夹
            </button>
          </div>
        </div>

        {children.length === 0 ? (
          <div className="glass-card rounded-2xl p-16 text-center max-w-2xl mx-auto">
            <i className={`fas ${iconInfo.icon} text-5xl mb-5 opacity-20`} style={{ color: iconInfo.color }} />
            <p className="font-bold text-xl mb-2" style={{ color: 'var(--color-text-secondary)' }}>此文件夹为空</p>
            <p className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>新建文件或使用 AI 批量生成</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-6xl">
            {children.map((child, i) => {
              const childInfo = ICON_MAP[child.metadata.cardType || ''] || { icon: child.type === 'folder' ? 'fa-folder' : 'fa-file-lines', color: child.type === 'folder' ? '#f59e0b' : 'var(--color-primary-400)' };
              const colorHex = typeof childInfo.color === 'string' && childInfo.color.startsWith('#') ? childInfo.color : 'var(--color-primary-300)';
              return (
                <div
                  key={child.id}
                  onClick={() => onSelectFile(child.id)}
                  className="glass-card rounded-2xl p-4 card-float-hover animate-card-enter cursor-pointer group"
                  style={{ animationDelay: `${i * 40}ms` }}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                      style={{ background: `${colorHex}15` }}>
                      <i className={`fas ${childInfo.icon} text-xs`} style={{ color: colorHex }} />
                    </div>
                    <span className="text-sm font-bold truncate flex-1" style={{ color: 'var(--color-text-primary)' }}>{child.name}</span>
                    <button onClick={e => { e.stopPropagation(); dataService.deleteFile(child.id); }}
                      className="p-1 rounded-lg opacity-0 group-hover:opacity-100 transition-all hover:bg-red-500/15 border-none cursor-pointer text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                      <i className="fas fa-xmark" />
                    </button>
                  </div>
                  {child.content && child.type === 'file' && (
                    <p className="text-[11px] leading-relaxed line-clamp-2 mt-2" style={{ color: 'var(--color-text-tertiary)' }}>
                      {child.content.replace(/^#.*\n?/, '').trim().slice(0, 120)}
                    </p>
                  )}
                  {child.type === 'folder' && (
                    <div className="mt-2 flex items-center gap-2">
                      <span className="badge badge-purple text-[9px]">{child.childrenIds.length} 项</span>
                      {child.metadata.autoGenerated && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ color: 'var(--color-primary-300)', backgroundColor: 'var(--color-primary-100)' }}>AI</span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="flex items-center justify-between px-6 py-3 border-b border-white/5 shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => onSelectFile(null)} className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-white/10" style={{ color: 'var(--color-text-tertiary)' }}>
            <i className="fas fa-arrow-left text-xs" />
          </button>
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'var(--color-primary-100)' }}>
            <i className="fas fa-file-lines text-xs" style={{ color: 'var(--color-primary-400)' }} />
          </div>
          <input
            value={editName}
            onChange={e => setEditName(e.target.value)}
            className="bg-transparent border-none outline-none text-base font-bold min-w-0"
            style={{ color: 'var(--color-text-primary)' }}
          />
        </div>
        <div className="flex items-center gap-2">
          <div className="segmented-control text-[10px]">
            <button className={viewMode === 'edit' ? 'active' : ''} onClick={() => setViewMode('edit')}>
              <i className="fas fa-pen mr-1" />编辑
            </button>
            <button className={viewMode === 'preview' ? 'active' : ''} onClick={() => setViewMode('preview')}>
              <i className="fas fa-eye mr-1" />预览
            </button>
          </div>
          <button onClick={() => handleAIGenerate('expand')} disabled={isGenerating}
            className="text-xs text-white rounded-lg transition-all px-3 py-1 font-medium card-float-hover disabled:opacity-50 flex items-center gap-1"
            style={{ background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-primary-600))' }}>
            <i className="fas fa-wand-magic-sparkles text-[10px]" />扩写
          </button>
          <button onClick={() => handleAIGenerate('rewrite')} disabled={isGenerating}
            className="text-xs text-white rounded-lg transition-all px-3 py-1 font-medium card-float-hover disabled:opacity-50 flex items-center gap-1"
            style={{ background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-primary-600))' }}>
            <i className="fas fa-rotate text-[10px]" />重写
          </button>
          <button onClick={() => handleAIGenerate('continue')} disabled={isGenerating}
            className="text-xs text-white rounded-lg transition-all px-3 py-1 font-medium card-float-hover disabled:opacity-50 flex items-center gap-1"
            style={{ background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-primary-600))' }}>
            <i className="fas fa-forward text-[10px]" />续写
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl">
          {viewMode === 'edit' ? (
            <div className="glass-card rounded-2xl p-6">
              <textarea
                value={editContent}
                onChange={e => setEditContent(e.target.value)}
                placeholder="输入 Markdown 内容..."
                className="w-full min-h-[500px] neumorphic-input rounded-xl p-5 text-sm leading-relaxed resize-none focus:outline-none transition-all"
                style={{ color: 'var(--color-text-primary)', fontFamily: 'inherit' }}
              />
            </div>
          ) : (
            <div className="glass-card rounded-2xl p-6">
              <div className="p-5 text-sm leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--color-text-secondary)' }}>
                {editContent || '（空内容）'}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between px-6 py-1.5 border-t border-white/5 shrink-0">
        <span className="text-[10px] text-gray-500">
          {editContent.length} 字 · {activeFile ? new Date(activeFile.updatedAt).toLocaleTimeString('zh-CN') : ''}
        </span>
        {isSaving && <span className="text-[10px] animate-fade-in text-purple-400">已保存 ✓</span>}
      </div>
    </div>
  );
};

export default FileExplorer;
