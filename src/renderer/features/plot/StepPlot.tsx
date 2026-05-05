import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { Project, ModelConfig, PromptTemplate, BubbleFolder as BubbleFolderType } from '../../../shared/types';
import { dataService } from '../../shared/services/DataService';
import { aiService } from '../../shared/services/aiService';
import { useAIStatus } from '../../shared/contexts/AIStatusContext';
import { ToolParser } from '../../shared/services/ai-assistant/ToolParser';
import AIProgressButton from '../../shared/components/AIProgressButton';
import { InputModal } from '../../shared/components/Modal';

interface StepPlotProps {
  project: Project;
  prompts: PromptTemplate[];
  activeModel: ModelConfig;
  onUpdate: (updates: Partial<Project>) => void;
  onOpenSettings: () => void;
}

const PLOT_FOLDERS: { name: string; icon: string; color: string; type: 'outline' | 'detailed_outline' | 'chapters' }[] = [
  { name: '大纲', icon: 'fa-sitemap', color: 'violet', type: 'outline' },
  { name: '细纲', icon: 'fa-list-check', color: 'cyan', type: 'detailed_outline' },
  { name: '章节', icon: 'fa-book', color: 'pink', type: 'chapters' },
];

function ensurePlotFolders(project: Project): BubbleFolderType[] {
  const existing = project.folders || [];
  
  if (existing.some(f => f.type === 'outline') && 
      existing.some(f => f.type === 'detailed_outline') && 
      existing.some(f => f.type === 'chapters')) {
    return existing.map(f => {
      if (f.vfileId || !['outline', 'detailed_outline', 'chapters'].includes(f.type)) return f;
      const vfId = dataService.getRootFolderIdByType(f.type);
      return vfId ? { ...f, vfileId: vfId } : f;
    });
  }
  
  let folders = [...existing];
  
  const createFolder = (type: string, name: string, icon: string, color: string) => {
    const vfId = dataService.getRootFolderIdByType(type);
    return {
      id: `plot-folder-${type}-${Date.now()}`,
      name,
      icon,
      color,
      parentId: null as string | null,
      type: type as unknown as BubbleFolderType['type'],
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
    };
  };
  
  if (!folders.find(f => f.type === 'outline')) {
    folders.push(createFolder('outline', '大纲', 'fa-sitemap', 'violet'));
  }
  if (!folders.find(f => f.type === 'detailed_outline')) {
    folders.push(createFolder('detailed_outline', '细纲', 'fa-list-check', 'cyan'));
  }
  if (!folders.find(f => f.type === 'chapters')) {
    folders.push(createFolder('chapters', '章节', 'fa-book', 'pink'));
  }
  
  return folders;
}

const StepPlot: React.FC<StepPlotProps> = ({ project, prompts, activeModel, onUpdate, onOpenSettings }) => {
  const folders = useMemo(() => ensurePlotFolders(project), [project]);
  const [topDsVersion, setTopDsVersion] = useState(0);
  useEffect(() => {
    return dataService.subscribe(() => setTopDsVersion(v => v + 1));
  }, []);
  const folderCountMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const f of folders) {
      if (f.vfileId) {
        map[f.id] = dataService.getChildren(f.vfileId).filter(x => x.type === 'file').length;
      } else {
        map[f.id] = (f.contentCards || []).length;
      }
    }
    return map;
  }, [folders, topDsVersion]);
  const initDoneRef = useRef(false);
  const foldersRef = useRef(folders);
  const onUpdateRef = useRef(onUpdate);
  foldersRef.current = folders;
  onUpdateRef.current = onUpdate;
  
  useEffect(() => {
    if (!initDoneRef.current && (!project.folders || project.folders.length === 0)) {
      onUpdate({ folders });
    }
    initDoneRef.current = true;
  }, []);

  const [activeFolderId, setActiveFolderId] = useState<string>(() => {
    const plotFolder = folders.find(f => f.type === 'outline' || f.type === 'detailed_outline' || f.type === 'chapters');
    return plotFolder?.id || '';
  });

  const findFolderInList = (list: BubbleFolderType[], id: string): BubbleFolderType | undefined => {
    return list.find(f => f.id === id);
  };

  const activeFolder = useMemo(
    () => findFolderInList(folders, activeFolderId) || folders.find(f => f.type === 'outline'),
    [folders, activeFolderId]
  );

  const updateFolderInList = (list: BubbleFolderType[], id: string, updates: Partial<BubbleFolderType>): BubbleFolderType[] => {
    return list.map(f => f.id === id ? { ...f, ...updates } : f);
  };

  const handleUpdateFolder = useCallback((folderId: string, updates: Partial<BubbleFolderType>) => {
    const updated = updateFolderInList(foldersRef.current, folderId, updates);
    onUpdateRef.current({ folders: updated });
  }, []);

  const handleCreateCard = useCallback((folderId: string, title?: string) => {
    const cardTitle = title || `新文件_${Date.now()}`;
    const targetFolder = findFolderInList(foldersRef.current, folderId);
    if (targetFolder?.vfileId) {
      dataService.createFile(targetFolder.vfileId, {
        name: cardTitle,
        type: 'file',
        content: '',
        metadata: { tags: [], favorited: true, aiGenerated: false },
      });
    } else if (targetFolder) {
      const newCard = {
        id: `card_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        tagText: cardTitle,
        title: cardTitle,
        content: '',
        isFavorited: true,
        batchId: `batch-${Date.now()}`,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      handleUpdateFolder(folderId, { contentCards: [...(targetFolder.contentCards || []), newCard] });
    }
  }, []);

  const outlinePrompts = prompts.filter(p => p.category === 'outline');

  return (
    <div className="h-full flex">
      <div className="w-56 shrink-0 border-r p-4 overflow-y-auto" style={{ borderColor: 'var(--color-border-default)' }}>
        <div className="mb-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider mb-3 flex items-center gap-2" style={{ color: 'var(--color-text-tertiary)' }}>
            <i className="fas fa-pen-nib text-[10px]" style={{ color: 'var(--color-primary-400)' }} />
            情节创作
          </h3>
        </div>
        
        <div className="space-y-1.5">
          {folders.filter(f => (f.type === 'outline' || f.type === 'detailed_outline' || f.type === 'chapters')).sort((a, b) => {
            const order = ['outline', 'detailed_outline', 'chapters'];
            return order.indexOf(a.type) - order.indexOf(b.type);
          }).map(folder => (
            <button
              key={folder.id}
              onClick={() => setActiveFolderId(folder.id)}
              className={`w-full text-left px-3 py-2.5 rounded-xl transition-all duration-200 group ${
                activeFolderId === folder.id ? '' : 'hover:bg-white/5'
              }`}
              style={activeFolderId === folder.id ? {
                background: `linear-gradient(135deg, var(--color-${folder.color}-500)/15, var(--color-${folder.color}-700)/8)`,
                borderLeft: `3px solid var(--color-${folder.color}-400)`
              } : {}}
            >
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: `linear-gradient(135deg, var(--color-${folder.color}-500)/20, var(--color-${folder.color}-600)/10)` }}>
                  <i className={`fas ${folder.icon} text-xs`} style={{ color: `var(--color-${folder.color}-400)` }} />
                </div>
                <span className="text-sm font-medium truncate" style={{ color: 'var(--color-text-primary)' }}>{folder.name}</span>
                {(folderCountMap[folder.id] || 0) > 0 && (
                  <span className="text-[10px] ml-auto" style={{ color: 'var(--color-text-muted)' }}>{folderCountMap[folder.id]}项</span>
                )}
              </div>
            </button>
          ))}
        </div>

        <div className="mt-6 pt-4" style={{ borderTop: '1px solid var(--color-border-default)' }}>
          <h3 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--color-text-muted)' }}>项目信息</h3>
          <div className="glass-card rounded-xl p-3 space-y-1.5">
            <p className="text-xs truncate" style={{ color: 'var(--color-text-secondary)' }}>
              <i className="fas fa-book text-[9px] mr-1.5" style={{ color: 'var(--color-primary-400)' }} />
              {project.title || '未命名'}
            </p>
            {project.intro && (
              <p className="text-[11px] line-clamp-2" style={{ color: 'var(--color-text-muted)' }}>
                {project.intro}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 min-w-0 overflow-hidden">
        {activeFolder && (
          <PlotFolderContent
            folder={activeFolder}
            project={project}
            prompts={prompts}
            activeModel={activeModel}
            onUpdate={onUpdate}
            onOpenSettings={onOpenSettings}
            onUpdateFolder={handleUpdateFolder}
            onCreateCard={handleCreateCard}
            onSelectFolder={setActiveFolderId}
          />
        )}
      </div>
    </div>
  );
};

interface PlotFolderContentProps {
  folder: BubbleFolderType;
  project: Project;
  prompts: PromptTemplate[];
  activeModel: ModelConfig;
  onUpdate: (updates: Partial<Project>) => void;
  onOpenSettings: () => void;
  onUpdateFolder: (folderId: string, updates: Partial<BubbleFolderType>) => void;
  onCreateCard: (folderId: string, title?: string) => void;
  onSelectFolder: (folderId: string) => void;
}

interface ContentCardData {
  id: string;
  tagText: string;
  title: string;
  content: string;
  isFavorited: boolean;
  batchId: string;
  createdAt: number;
  updatedAt: number;
}

interface ContentCardItemProps {
  card: ContentCardData;
  onDelete: (id: string) => void;
  onClick: (cardId: string) => void;
  isSelected?: boolean;
  isMultiSelect?: boolean;
  onToggleSelect?: (id: string) => void;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent, id: string) => void;
  onDragOver?: (e: React.DragEvent, id: string) => void;
  onDrop?: (e: React.DragEvent, id: string) => void;
}

const ContentCardItem = React.memo<ContentCardItemProps>(({ card, onDelete, onClick, isSelected, isMultiSelect, onToggleSelect, onDragStart, onDragOver, onDrop, draggable }) => {
  const [isHovered, setIsHovered] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  return (
    <>
      <div
        className="glass-card rounded-xl overflow-hidden transition-all duration-300 cursor-pointer hover:shadow-lg"
        style={{
          borderLeft: `3px solid ${card.isFavorited ? 'var(--color-primary-400)' : 'transparent'}`,
          ...(isSelected ? { boxShadow: '0 0 0 2px var(--color-primary-400)' } : {}),
        }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onClick={() => onClick(card.id)}
        draggable={draggable}
        onDragStart={(e) => onDragStart?.(e, card.id)}
        onDragOver={(e) => onDragOver?.(e, card.id)}
        onDrop={(e) => onDrop?.(e, card.id)}
      >
        <div className="flex items-center justify-between px-4 py-2.5" style={{ borderBottom: '1px solid var(--color-border-default)' }}>
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {isMultiSelect && (
              <button
                onClick={(e) => { e.stopPropagation(); onToggleSelect?.(card.id); }}
                className={`w-4 h-4 rounded flex items-center justify-center shrink-0 transition-all border ${
                  isSelected ? 'border-solid' : 'border-gray-600 hover:border-gray-400'
                }`}
                style={{
                  backgroundColor: isSelected ? 'var(--color-primary-500)' : 'transparent',
                  borderColor: isSelected ? 'var(--color-primary-400)' : undefined,
                }}
              >
                {isSelected && <i className="fas fa-check text-[8px] text-white"></i>}
              </button>
            )}
            {draggable && (
              <i className="fas fa-grip-vertical text-[10px] cursor-grab opacity-40 hover:opacity-70 shrink-0" style={{ color: 'var(--color-text-muted)' }}></i>
            )}
            <i className="fas fa-file-alt text-[10px]" style={{ color: 'var(--color-primary-400)' }}></i>
            <span className="text-sm font-bold truncate" style={{ color: 'var(--color-text-primary)' }}>{card.title}</span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(true); }}
              className="p-1 rounded transition-colors opacity-0 group-hover:opacity-100"
              style={{ opacity: isHovered ? 1 : undefined }}
            >
              <i className="fas fa-trash text-[10px]" style={{ color: '#ef4444' }}></i>
            </button>
          </div>
        </div>
        {card.content ? (
          <div className="px-4 py-2.5">
            <p className="text-[12px] leading-relaxed line-clamp-3" style={{ color: 'var(--color-text-secondary)' }}>
              {card.content.replace(/^#.*\n?/, '').trim()}
            </p>
          </div>
        ) : (
          <div className="px-4 py-3 text-center">
            <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>点击编辑内容</p>
          </div>
        )}
      </div>
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center" onClick={() => setShowDeleteConfirm(false)}>
          <div className="glass-card rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-bold mb-2" style={{ color: 'var(--color-text-primary)' }}>删除文件</h3>
            <p className="text-sm mb-6" style={{ color: 'var(--color-text-secondary)' }}>确定要删除「{card.title}」吗？此操作不可撤销。</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setShowDeleteConfirm(false)} className="px-4 py-2 text-sm rounded-lg border" style={{ borderColor: 'var(--color-border-default)', color: 'var(--color-text-secondary)' }}>取消</button>
              <button onClick={() => { setShowDeleteConfirm(false); onDelete(card.id); }} className="px-4 py-2 text-sm text-white rounded-lg" style={{ background: '#ef4444' }}>删除</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
});

const PlotFolderContent = React.memo<PlotFolderContentProps>(({
  folder,
  project,
  prompts,
  activeModel,
  onUpdate,
  onOpenSettings,
  onUpdateFolder,
  onCreateCard,
}) => {
  const isOutlineFolder = folder.type === 'outline';
  const isDetailedOutlineFolder = folder.type === 'detailed_outline';
  const isChaptersFolder = folder.type === 'chapters';
  
  const [outlineText, setOutlineText] = useState(() => {
    if (folder.vfileId && folder.type === 'outline') {
      const vfiles = dataService.getChildren(folder.vfileId).filter(f => f.type === 'file');
      if (vfiles.length > 0 && vfiles[0].content) return vfiles[0].content;
    }
    return project.outline || '';
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedPromptId, setSelectedPromptId] = useState('');
  const [inputModal, setInputModal] = useState<{ title: string; placeholder: string; defaultValue: string; onConfirm: (value: string) => void } | null>(null);
  const [cardSearchText, setCardSearchText] = useState('');
  const [selectedCardIds, setSelectedCardIds] = useState<Set<string>>(new Set());
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  const [showEditor, setShowEditor] = useState<{ cardId: string; isNew?: boolean } | null>(null);
  const [dragCardId, setDragCardId] = useState<string | null>(null);
  const [generatingCardId, setGeneratingCardId] = useState<string | null>(null);
  const [dsVersion, setDsVersion] = useState(0);

  useEffect(() => {
    return dataService.subscribe(() => setDsVersion(v => v + 1));
  }, []);

  useEffect(() => {
    const handleFocus = () => setDsVersion(v => v + 1);
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, []);
  
  const { setGenerating, setStatusMessage, setProgress, setTokenUsage, setComplete, setError, status } = useAIStatus();

  const outlinePrompts = prompts.filter(p => p.category === 'outline');
  const writingPrompts = prompts.filter(p => p.category === 'writing');
  React.useEffect(() => { 
    if (outlinePrompts.length > 0 && !selectedPromptId) setSelectedPromptId(outlinePrompts[0].id); 
  }, [outlinePrompts, selectedPromptId]);

  const folderFiles = useMemo(() => {
    if (folder.vfileId) {
      const vfiles = dataService.getChildren(folder.vfileId).filter(f => f.type === 'file');
      return vfiles.map(vf => ({
        id: vf.id,
        tagText: vf.name,
        title: vf.name,
        content: vf.content || '',
        isFavorited: vf.metadata.favorited !== false,
        batchId: vf.metadata.batchId || `vf-${vf.id}`,
        createdAt: vf.createdAt,
        updatedAt: vf.updatedAt,
      }));
    }
    return folder.contentCards || [];
  }, [folder.vfileId, folder.contentCards, dsVersion]);
  const filteredFiles = cardSearchText.trim()
    ? folderFiles.filter(c =>
        c.title.toLowerCase().includes(cardSearchText.trim().toLowerCase()) ||
        (c.content && c.content.toLowerCase().includes(cardSearchText.trim().toLowerCase()))
      )
    : folderFiles;

  const addCardsToVFile = useCallback((cards: Array<{ title: string; content: string; batchId?: string }>) => {
    if (folder.vfileId) {
      const parentId = folder.vfileId;
      for (const card of cards) {
        dataService.createFile(parentId, {
          name: card.title,
          type: 'file',
          content: card.content || '',
          metadata: {
            tags: [],
            favorited: true,
            cardType: '',
            references: [],
            aiGenerated: true,
            batchId: card.batchId || null,
            sortOrder: 0,
          },
        });
      }
    } else {
      const newCards = cards.map(c => ({
        id: `card_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        tagText: c.title,
        title: c.title,
        content: c.content || '',
        isFavorited: true,
        batchId: c.batchId || `batch-${Date.now()}`,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }));
      onUpdateFolder(folder.id, { contentCards: [...folderFiles, ...newCards] });
    }
  }, [folder.vfileId, folder.id, folderFiles, onUpdateFolder]);

  const updateCardInVFile = useCallback((cardId: string, updates: { title?: string; content?: string }) => {
    if (folder.vfileId) {
      const vfUpdates: any = {};
      if (updates.title !== undefined) vfUpdates.name = updates.title;
      if (updates.content !== undefined) vfUpdates.content = updates.content;
      dataService.updateFile(cardId, vfUpdates);
    } else {
      const cards = folderFiles.map(c => {
        if (c.id !== cardId) return c;
        const updated = { ...c, updatedAt: Date.now() };
        if (updates.title !== undefined) { updated.title = updates.title; updated.tagText = updates.title; }
        if (updates.content !== undefined) updated.content = updates.content;
        return updated;
      });
      onUpdateFolder(folder.id, { contentCards: cards });
    }
  }, [folder.vfileId, folder.id, folderFiles, onUpdateFolder]);

  const deleteCardFromVFile = useCallback((cardId: string) => {
    if (folder.vfileId) {
      dataService.deleteFile(cardId);
    } else {
      const cards = folderFiles.filter(c => c.id !== cardId);
      onUpdateFolder(folder.id, { contentCards: cards });
    }
  }, [folder.vfileId, folder.id, folderFiles, onUpdateFolder]);

  const showInput = useCallback((title: string, placeholder: string, defaultValue: string, onConfirm: (v: string) => void) => {
    setInputModal({ title, placeholder, defaultValue, onConfirm });
  }, []);

  const handleInputConfirm = useCallback((value: string) => {
    if (inputModal?.onConfirm) inputModal.onConfirm(value);
    setInputModal(null);
  }, [inputModal]);

  const handleSaveOutline = useCallback(() => {
    onUpdate({ outline: outlineText });
    if (folder.vfileId) {
      const existing = dataService.getChildren(folder.vfileId).filter(f => f.type === 'file');
      if (existing.length > 0) {
        dataService.updateFile(existing[0].id, { content: outlineText });
      } else if (outlineText.trim()) {
        dataService.createFile(folder.vfileId, {
          name: `${project.title || '未命名'}大纲`,
          type: 'file',
          content: outlineText,
          metadata: { tags: [], favorited: true, aiGenerated: false },
        });
      }
    }
  }, [outlineText, onUpdate, folder.vfileId, project.title]);

  const handleGenerateOutline = useCallback(async () => {
    if (!activeModel?.modelName) { onOpenSettings(); return; }
    setIsGenerating(true);
    setGenerating(activeModel.name, 'AI 生成大纲中...');
    
    const template = outlinePrompts.find(p => p.id === selectedPromptId);
    let promptStr: string;
    if (template?.content) {
      promptStr = template.content
        .replace('{title}', project.title || '')
        .replace('{intro}', project.intro || '')
        .replace('{characters}', '');
    } else {
      promptStr = [
        '为小说「' + (project.title || '未命名') + '」生成详细大纲。',
        '简介：' + (project.intro || '暂无'),
        '要求：按卷/篇章结构，标注核心事件和转折，使用 Markdown 格式',
      ].join('\n');
    }

    let accumulated = '';
    try {
      await aiService.generateWithContext({ model: activeModel, prompt: promptStr, systemPrompt: '你是资深小说策划编辑，擅长构建引人入胜的故事大纲。', temperature: 0.75 }, update => {
        if (update.content) { accumulated = update.content; setStatusMessage('AI 大纲生成中... (' + accumulated.length + ' 字符)'); setProgress(Math.min(95, Math.floor(accumulated.length / 30))); }
        if (update.tokens) setTokenUsage(update.tokens);
        if (update.isComplete) {
          if (update.error) { setError(update.error); }
          else {
            const cleaned = ToolParser.cleanFileContent(accumulated);
            setOutlineText(cleaned);
            onUpdate({ outline: cleaned });
            if (folder.vfileId) {
              const existing = dataService.getChildren(folder.vfileId).filter(f => f.type === 'file');
              if (existing.length > 0) {
                dataService.updateFile(existing[0].id, { content: cleaned });
              } else {
                dataService.createFile(folder.vfileId, {
                  name: `${project.title || '未命名'}大纲`,
                  type: 'file',
                  content: cleaned,
                  metadata: { tags: [], favorited: true, aiGenerated: true },
                });
              }
            }
          }
          setIsGenerating(false); setComplete();
        }
      });
    } catch (err) { 
      if (err instanceof Error && err.message !== '已中断生成') setError(err.message); 
      setIsGenerating(false); 
    }
  }, [activeModel, project, outlinePrompts, selectedPromptId, setGenerating, setStatusMessage, setProgress, setTokenUsage, setComplete, setError, onOpenSettings, onUpdate, folder.vfileId]);

  const handleAbort = useCallback(() => { aiService.abort(); setIsGenerating(false); }, []);

  const handleGenerateDetailedOutline = useCallback(async () => {
    if (!activeModel?.modelName || !outlineText) { onOpenSettings(); return; }
    setIsGenerating(true);
    setGenerating(activeModel.name, 'AI 生成细纲中...');
    
    try {
      const fullPrompt = [
        '基于以下小说大纲，生成详细的分卷/分章细纲。',
        '书名：' + project.title,
        '简介：' + (project.intro || '暂无'),
        '\n【大纲内容】\n' + outlineText,
        '\n要求：',
        '- 按卷/篇章结构拆分细纲',
        '- 每个细纲包含：卷名/章节名、核心事件、角色发展、情节转折点',
        '- 使用 Markdown 格式，每个细纲用 ### 标题',
        '- 细纲之间用 --- 分隔',
      ].join('\n');
      
      let accumulated = '';
      await aiService.generateWithContext({ 
        model: activeModel, 
        prompt: fullPrompt, 
        systemPrompt: '你是资深小说策划编辑，擅长将故事大纲拆解为详细的分卷细纲。', 
        temperature: 0.75 
      }, update => {
        if (update.content) { 
          accumulated = update.content; 
          setStatusMessage('AI 细纲生成中... (' + accumulated.length + ' 字符)'); 
          setProgress(Math.min(95, Math.floor(accumulated.length / 50))); 
        }
        if (update.tokens) setTokenUsage(update.tokens);
        if (update.isComplete) {
          if (update.error) { setError(update.error); }
          else {
            const rawCleaned = ToolParser.cleanFileContent(accumulated);
            const sections = rawCleaned.split('---').filter(s => s.trim());
            const cleanTitle = (t: string) => t.replace(/^#{1,6}\s*/, '').replace(/\*+/g, '').trim();
            const cleanContent = (c: string) => c.split('\n')
              .map(line => line
                .replace(/^#{1,6}\s+/, '')
                .replace(/\*\*(.+?)\*\*/g, '$1')
                .trim()
              )
              .filter(l => l)
              .join('\n');
            const newCards = sections.map((section, idx) => {
              const lines = section.trim().split('\n');
              const titleLine = lines.find(l => l.startsWith('###') || l.startsWith('#')) || lines[0] || `第${idx + 1}部分`;
              const title = cleanTitle(titleLine);
              const content = cleanContent(lines.filter((l, i) => i !== lines.indexOf(titleLine)).join('\n'));
              return {
                id: `card_${Date.now()}_${Math.random().toString(36).slice(2, 7)}_${idx}`,
                tagText: title,
                title: title || `细纲${idx + 1}`,
                content: content,
                isFavorited: true,
                batchId: `batch-${Date.now()}`,
                createdAt: Date.now(),
                updatedAt: Date.now(),
              };
            }).filter(c => c.title && c.content);
            
            if (newCards.length > 0) {
              addCardsToVFile(newCards.map(c => ({ title: c.title, content: c.content, batchId: c.batchId })));
            }
          }
          setIsGenerating(false); setComplete();
        }
      });
    } catch (err) { 
      if (err instanceof Error && err.message !== '已中断生成') setError(err.message); 
      setIsGenerating(false); 
    }
  }, [activeModel, project, outlineText, folder, folderFiles, setGenerating, setStatusMessage, setProgress, setTokenUsage, setComplete, setError, onOpenSettings, addCardsToVFile]);

  const handleAIGenerateChapters = useCallback(async (count: string) => {
    if (!activeModel?.modelName) { onOpenSettings(); return; }
    setIsGenerating(true);
    setGenerating(activeModel.name, 'AI 生成章节细纲...');
    
    try {
      const fullPrompt = [
        '为「' + project.title + '」（大纲：' + outlineText.slice(0, 500) + '...）生成' + count + '个章节细纲。',
        '每行：章节名|细则描述',
      ].join('\n');
      
      const r = await aiService.generateWithContext({ model: activeModel, prompt: fullPrompt, temperature: 0.8, maxTokens: 2000 });
      if (r.content) {
        const newCards = r.content.split('\n').filter(l => l.trim()).map(line => {
          const parts = line.split('|').map(s => s.trim());
          const name = parts[0];
          const desc = parts[1] || '';
          return {
            id: `card_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            tagText: name,
            title: name,
            content: desc,
            isFavorited: true,
            batchId: `batch-${Date.now()}`,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };
        }).filter(c => c.title);
        
        if (newCards.length > 0) {
          addCardsToVFile(newCards.map(c => ({ title: c.title, content: c.content, batchId: c.batchId })));
        }
      }
      if (r.tokens) setTokenUsage(r.tokens); setComplete();
    } catch (err) { 
      if (err instanceof Error) setError(err.message); 
    } finally { 
      setIsGenerating(false); 
    }
  }, [activeModel, project, outlineText, folder, folderFiles, setGenerating, setTokenUsage, setComplete, setError, onOpenSettings, addCardsToVFile]);

  const handleGenerateChapterContent = useCallback(async (cardId: string) => {
    if (!activeModel) return;
    const card = folderFiles.find(c => c.id === cardId);
    if (!card || !card.content) return;
    const tpl = writingPrompts[0];
    if (!tpl) return;

    setGeneratingCardId(cardId);
    setGenerating(activeModel.name, `AI 撰写「${card.title}」中...`, `write-${cardId}`);

    const folderChars = (project.folders || [])
      .filter(f => f.type === 'characters')
      .flatMap(f => f.contentCards || [])
      .filter(c => c.isFavorited && c.content)
      .map(c => `【${c.title}】\n${c.content.slice(0, 500)}`);
    const legacyChars = project.characters
      .filter(c => c.name !== '新角色')
      .map(c => `【${c.name}】(${c.role})\n- 性格：${c.personality}\n- 背景：${c.background}`);
    const charDetails = [...folderChars, ...legacyChars].join('\n\n');

    const finalPrompt = tpl.content
      .replace('{title}', project.title)
      .replace('{chapter_title}', card.title)
      .replace('{summary}', card.content)
      .replace('{characters}', charDetails || '暂无角色信息')
      .replace('{content}', '');

    let acc = '';
    try {
      await aiService.generateWithContext({ model: activeModel, prompt: finalPrompt }, (res) => {
        if (res.content) { acc += res.content; setStatusMessage(`AI 撰写「${card.title}」中... (${acc.length} 字)`); }
        if (res.tokens) setTokenUsage(res.tokens);
        if (res.isComplete) {
          updateCardInVFile(cardId, { content: ToolParser.cleanFileContent(acc) });
          setComplete(); setGeneratingCardId(null);
        }
        if (res.error) { setError(res.error); setGeneratingCardId(null); }
      });
    } catch (e: any) { setError(e.message); setGeneratingCardId(null); }
  }, [activeModel, project, folder, folderFiles, writingPrompts, setGenerating, setStatusMessage, setComplete, setError, updateCardInVFile]);

  const handleDeleteCard = useCallback((cardId: string) => {
    deleteCardFromVFile(cardId);
  }, [deleteCardFromVFile]);

  const handleBatchDeleteCards = useCallback(() => {
    if (selectedCardIds.size === 0) return;
    selectedCardIds.forEach(id => deleteCardFromVFile(id));
    setSelectedCardIds(new Set());
    setIsMultiSelectMode(false);
  }, [selectedCardIds, deleteCardFromVFile]);

  const handleSelectAll = useCallback((ids: string[]) => {
    setSelectedCardIds(new Set(ids));
  }, []);

  const handleDropOnCard = useCallback((e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!dragCardId || dragCardId === targetId) { setDragCardId(null); return; }
    const cards = [...folderFiles];
    const fromIdx = cards.findIndex(c => c.id === dragCardId);
    const toIdx = cards.findIndex(c => c.id === targetId);
    if (fromIdx < 0 || toIdx < 0) { setDragCardId(null); return; }
    const [moved] = cards.splice(fromIdx, 1);
    cards.splice(toIdx, 0, moved);
    if (folder.vfileId) {
      dataService.reorderChildren(folder.vfileId, cards.map(c => c.id));
    } else {
      onUpdateFolder(folder.id, { contentCards: cards });
    }
    setDragCardId(null);
  }, [dragCardId, folderFiles, folder.vfileId, folder.id, onUpdateFolder]);

  if (isOutlineFolder) {
    return (
      <div className="h-full flex flex-col">
        <div className="flex items-center justify-between px-6 py-3 border-b shrink-0" style={{ borderColor: 'var(--color-border-default)' }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, var(--color-violet-500)/20, var(--color-violet-600)/10)' }}>
              <i className="fas fa-sitemap text-sm" style={{ color: 'var(--color-violet-400)' }} />
            </div>
            <div>
              <h2 className="text-base font-bold" style={{ color: 'var(--color-text-primary)' }}>故事大纲</h2>
              <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                文件 {filteredFiles.length}{cardSearchText.trim() ? ` / ${folderFiles.length}` : ''}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <input
                type="text"
                value={cardSearchText}
                onChange={e => setCardSearchText(e.target.value)}
                placeholder="搜索..."
                className="neumorphic-input pl-8 pr-3 py-1.5 rounded-lg text-xs w-40"
                style={{ color: 'var(--color-text-secondary)' }}
              />
              <i className="fas fa-search absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px]" style={{ color: 'var(--color-text-muted)' }}></i>
            </div>
            <button
              onClick={() => { setIsMultiSelectMode(!isMultiSelectMode); setSelectedCardIds(new Set()); }}
              className={`px-2.5 py-1.5 rounded-lg text-[10px] border transition-colors`}
              style={{
                borderColor: isMultiSelectMode ? 'var(--color-primary-400)' : 'var(--color-border-default)',
                color: isMultiSelectMode ? 'var(--color-primary-300)' : 'var(--color-text-tertiary)',
                background: isMultiSelectMode ? 'var(--color-primary-100)' : 'transparent',
              }}
            >
              <i className="fas fa-check-double mr-1"></i>{isMultiSelectMode ? `已选${selectedCardIds.size}` : '多选'}
            </button>
            <button
              onClick={() => showInput('新建大纲', '输入大纲名称', `${project.title || '未命名'}大纲`, (n) => onCreateCard(folder.id, n))}
              className="text-xs px-3 py-1.5 rounded-lg border transition-colors flex items-center gap-1.5"
              style={{ color: 'var(--color-text-secondary)', borderColor: 'var(--color-border-default)', background: 'transparent' }}
            >
              <i className="fas fa-plus text-[10px]" />新建
            </button>
            <AIProgressButton
              onClick={handleGenerateOutline}
              isGenerating={isGenerating}
              progress={status.progress}
              label="AI生成大纲"
              generatingLabel="生成中..."
              icon="fa-wand-magic-sparkles"
              disabled={!activeModel}
            />
          </div>
        </div>

        {isMultiSelectMode && selectedCardIds.size > 0 && (
          <div className="flex items-center justify-between px-4 py-2.5 rounded-xl mx-6 mt-3 shrink-0 animate-fade-in"
            style={{ backgroundColor: 'var(--color-violet-50)', border: '1px solid var(--color-violet-200)' }}>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium" style={{ color: 'var(--color-violet-500)' }}>已选择 {selectedCardIds.size} 项</span>
              <button onClick={() => handleSelectAll(filteredFiles.map(c => c.id))}
                className="text-[10px] px-2 py-0.5 rounded hover:bg-white/10 transition-colors"
                style={{ color: 'var(--color-text-secondary)' }}>全选</button>
              <button onClick={() => setSelectedCardIds(new Set())}
                className="text-[10px] px-2 py-0.5 rounded hover:bg-white/10 transition-colors"
                style={{ color: 'var(--color-text-secondary)' }}>取消</button>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={handleBatchDeleteCards}
                className="px-3 py-1 text-xs rounded-lg text-red-400 hover:bg-red-900/20 transition-all flex items-center gap-1">
                <i className="fas fa-trash text-[10px]" />批量删除
              </button>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-6">
          {filteredFiles.length > 0 && !isMultiSelectMode && (
            <h3 className="text-sm font-bold mb-3 flex items-center gap-2" style={{ color: 'var(--color-text-secondary)' }}>
              <i className="fas fa-file-lines text-xs" style={{ color: 'var(--color-violet-400)' }}></i>
              文件 ({filteredFiles.length})
            </h3>
          )}
          {filteredFiles.length > 0 ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredFiles.map(card => (
                <ContentCardItem
                  key={card.id}
                  card={card}
                  onDelete={handleDeleteCard}
                  onClick={(cardId) => setShowEditor({ cardId })}
                  isSelected={selectedCardIds.has(card.id)}
                  isMultiSelect={isMultiSelectMode}
                  onToggleSelect={(id) => {
                    setSelectedCardIds(prev => {
                      const next = new Set(prev);
                      next.has(id) ? next.delete(id) : next.add(id);
                      return next;
                    });
                  }}
                  draggable={!isMultiSelectMode}
                  onDragStart={(e) => { setDragCardId(card.id); }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleDropOnCard}
                />
              ))}
            </div>
          ) : folderFiles.length === 0 ? (
            <div className="glass-card rounded-2xl p-16 text-center max-w-2xl mx-auto">
              <i className="fas fa-sitemap text-5xl mb-5 opacity-20" style={{ color: 'var(--color-text-muted)' }} />
              <p className="font-bold text-xl mb-2" style={{ color: 'var(--color-text-secondary)' }}>暂无大纲</p>
              <p className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>点击「AI生成大纲」自动创建，或手动新建</p>
            </div>
          ) : (
            <div className="glass-card rounded-2xl p-8 text-center max-w-2xl mx-auto">
              <i className="fas fa-search text-3xl mb-3 opacity-20" style={{ color: 'var(--color-text-muted)' }} />
              <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>未找到匹配"{cardSearchText}"的大纲文件</p>
            </div>
          )}

          {showEditor && (() => {
            const editingCard = folderFiles.find(c => c.id === showEditor.cardId);
            if (!editingCard) return null;
            return (
              <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center" onClick={() => setShowEditor(null)}>
                <div className="glass-card rounded-2xl w-full max-w-4xl max-h-[85vh] mx-4 shadow-2xl flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                  <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderBottomColor: 'var(--color-border-default)' }}>
                    <div className="flex items-center gap-3">
                      <i className="fas fa-edit text-sm" style={{ color: 'var(--color-violet-400)' }} />
                      <input
                        type="text"
                        defaultValue={editingCard.title}
                        onBlur={(e) => {
                          if (e.target.value !== editingCard.title) {
                            updateCardInVFile(editingCard.id, { title: e.target.value });
                          }
                        }}
                        className="text-base font-bold bg-transparent border-none outline-none"
                        style={{ color: 'var(--color-text-primary)' }}
                      />
                    </div>
                    <button onClick={() => setShowEditor(null)} className="p-2 rounded-lg hover:bg-white/10 transition-colors">
                      <i className="fas fa-times" style={{ color: 'var(--color-text-muted)' }}></i>
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-6">
                    <textarea
                      defaultValue={editingCard.content || ''}
                      onBlur={(e) => {
                        if (e.target.value !== editingCard.content) {
                          updateCardInVFile(editingCard.id, { content: e.target.value });
                          setOutlineText(e.target.value);
                          onUpdate({ outline: e.target.value });
                        }
                      }}
                      placeholder="输入大纲内容..."
                      className="w-full min-h-[420px] neumorphic-input rounded-xl px-4 py-3 text-sm resize-none focus:outline-none"
                      style={{ color: 'var(--color-text-primary)' }}
                    />
                  </div>
                </div>
              </div>
            );
          })()}
        </div>

        {inputModal && (
          <InputModal
            title={inputModal.title}
            placeholder={inputModal.placeholder}
            defaultValue={inputModal.defaultValue}
            onConfirm={handleInputConfirm}
            onCancel={() => setInputModal(null)}
          />
        )}
      </div>
    );
  }

  if (isDetailedOutlineFolder) {
    return (
      <div className="h-full flex flex-col">
        <div className="flex items-center justify-between px-6 py-3 border-b shrink-0" style={{ borderColor: 'var(--color-border-default)' }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, var(--color-cyan-500)/20, var(--color-cyan-600)/10)' }}>
              <i className="fas fa-list-check text-sm" style={{ color: 'var(--color-cyan-400)' }} />
            </div>
            <div>
              <h2 className="text-base font-bold" style={{ color: 'var(--color-text-primary)' }}>细纲管理</h2>
              <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                文件 {filteredFiles.length}{cardSearchText.trim() ? ` / ${folderFiles.length}` : ''}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <input
                type="text"
                value={cardSearchText}
                onChange={e => setCardSearchText(e.target.value)}
                placeholder="搜索细纲..."
                className="neumorphic-input pl-8 pr-3 py-1.5 rounded-lg text-xs w-40"
                style={{ color: 'var(--color-text-secondary)' }}
              />
              <i className="fas fa-search absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px]" style={{ color: 'var(--color-text-muted)' }}></i>
            </div>
            <button
              onClick={() => { setIsMultiSelectMode(!isMultiSelectMode); setSelectedCardIds(new Set()); }}
              className={`px-2.5 py-1.5 rounded-lg text-[10px] border transition-colors`}
              style={{
                borderColor: isMultiSelectMode ? 'var(--color-primary-400)' : 'var(--color-border-default)',
                color: isMultiSelectMode ? 'var(--color-primary-300)' : 'var(--color-text-tertiary)',
                background: isMultiSelectMode ? 'var(--color-primary-100)' : 'transparent',
              }}
            >
              <i className="fas fa-check-double mr-1"></i>{isMultiSelectMode ? `已选${selectedCardIds.size}` : '多选'}
            </button>
            <button
              onClick={() => showInput('新建细纲', '输入细纲名称（如：第一卷）', `第${folderFiles.length + 1}卷`, (n) => onCreateCard(folder.id, n))}
              className="text-xs px-3 py-1.5 rounded-lg border transition-colors flex items-center gap-1.5"
              style={{ color: 'var(--color-text-secondary)', borderColor: 'var(--color-border-default)', background: 'transparent' }}
            >
              <i className="fas fa-plus text-[10px]" />新建细纲
            </button>
            <AIProgressButton
              onClick={handleGenerateDetailedOutline}
              isGenerating={isGenerating}
              progress={status.progress}
              label="AI生成细纲"
              generatingLabel="生成中..."
              icon="fa-wand-magic-sparkles"
              disabled={!activeModel || !outlineText}
            />
          </div>
        </div>

        {isMultiSelectMode && selectedCardIds.size > 0 && (
          <div className="flex items-center justify-between px-4 py-2.5 rounded-xl mx-6 mt-3 shrink-0 animate-fade-in"
            style={{ backgroundColor: 'var(--color-cyan-50)', border: '1px solid var(--color-cyan-200)' }}>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium" style={{ color: 'var(--color-cyan-500)' }}>已选择 {selectedCardIds.size} 项</span>
              <button onClick={() => handleSelectAll(filteredFiles.map(c => c.id))}
                className="text-[10px] px-2 py-0.5 rounded hover:bg-white/10 transition-colors"
                style={{ color: 'var(--color-text-secondary)' }}>全选</button>
              <button onClick={() => setSelectedCardIds(new Set())}
                className="text-[10px] px-2 py-0.5 rounded hover:bg-white/10 transition-colors"
                style={{ color: 'var(--color-text-secondary)' }}>取消</button>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={handleBatchDeleteCards}
                className="px-3 py-1 text-xs rounded-lg text-red-400 hover:bg-red-900/20 transition-all flex items-center gap-1">
                <i className="fas fa-trash text-[10px]" />批量删除
              </button>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-6">
          {filteredFiles.length > 0 && !isMultiSelectMode && (
            <h3 className="text-sm font-bold mb-3 flex items-center gap-2" style={{ color: 'var(--color-text-secondary)' }}>
              <i className="fas fa-file-lines text-xs" style={{ color: 'var(--color-cyan-400)' }}></i>
              文件 ({filteredFiles.length})
            </h3>
          )}
          {filteredFiles.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-6xl">
              {filteredFiles.map((card) => (
                <ContentCardItem
                  key={card.id}
                  card={card}
                  onDelete={handleDeleteCard}
                  onClick={(cardId) => setShowEditor({ cardId })}
                  isSelected={selectedCardIds.has(card.id)}
                  isMultiSelect={isMultiSelectMode}
                  onToggleSelect={(id) => {
                    setSelectedCardIds(prev => {
                      const next = new Set(prev);
                      next.has(id) ? next.delete(id) : next.add(id);
                      return next;
                    });
                  }}
                  draggable={!isMultiSelectMode}
                  onDragStart={(e) => { setDragCardId(card.id); }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleDropOnCard}
                />
              ))}
            </div>
          ) : folderFiles.length === 0 ? (
            <div className="glass-card rounded-2xl p-16 text-center max-w-2xl mx-auto">
              <i className="fas fa-list-check text-5xl mb-5 opacity-20" style={{ color: 'var(--color-text-muted)' }} />
              <p className="font-bold text-xl mb-2" style={{ color: 'var(--color-text-secondary)' }}>暂无细纲</p>
              <p className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
                {!outlineText ? '新建细纲或先在大纲中创建故事框架' : '新建细纲或使用 AI 基于大纲自动生成'}
              </p>
            </div>
          ) : (
            <div className="glass-card rounded-2xl p-8 text-center max-w-2xl mx-auto">
              <i className="fas fa-search text-3xl mb-3 opacity-20" style={{ color: 'var(--color-text-muted)' }} />
              <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>未找到匹配"{cardSearchText}"的细纲</p>
            </div>
          )}

          {showEditor && (() => {
            const editingCard = folderFiles.find(c => c.id === showEditor.cardId);
            if (!editingCard) return null;
            return (
              <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center" onClick={() => setShowEditor(null)}>
                <div className="glass-card rounded-2xl w-full max-w-4xl max-h-[85vh] mx-4 shadow-2xl flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                  <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderBottomColor: 'var(--color-border-default)' }}>
                    <div className="flex items-center gap-3">
                      <i className="fas fa-edit text-sm" style={{ color: 'var(--color-cyan-400)' }} />
                      <input
                        type="text"
                        defaultValue={editingCard.title}
                        onBlur={(e) => {
                          if (e.target.value !== editingCard.title) {
                            updateCardInVFile(editingCard.id, { title: e.target.value });
                          }
                        }}
                        className="text-base font-bold bg-transparent border-none outline-none"
                        style={{ color: 'var(--color-text-primary)' }}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setShowEditor(null)} className="p-2 rounded-lg hover:bg-white/10 transition-colors">
                        <i className="fas fa-times" style={{ color: 'var(--color-text-muted)' }}></i>
                      </button>
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto p-6">
                    <textarea
                      defaultValue={editingCard.content || ''}
                      onBlur={(e) => {
                        if (e.target.value !== editingCard.content) {
                          updateCardInVFile(editingCard.id, { content: e.target.value });
                          if (isOutlineFolder) {
                            setOutlineText(e.target.value);
                            onUpdate({ outline: e.target.value });
                          }
                        }
                      }}
                      placeholder={`输入${editingCard.title}的详细内容...\n\n可包含：\n• 核心事件\n• 角色发展\n• 情节转折\n• 场景描述`}
                      className="w-full min-h-[420px] neumorphic-input rounded-xl p-5 text-sm resize-none focus:outline-none"
                      style={{ color: 'var(--color-text-primary)' }}
                    />
                  </div>
                </div>
              </div>
            );
          })()}
        </div>

        {inputModal && (
          <InputModal
            title={inputModal.title}
            placeholder={inputModal.placeholder}
            defaultValue={inputModal.defaultValue}
            onConfirm={handleInputConfirm}
            onCancel={() => setInputModal(null)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-6 py-3 border-b shrink-0" style={{ borderColor: 'var(--color-border-default)' }}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, var(--color-pink-500)/20, var(--color-pink-600)/10)' }}>
            <i className="fas fa-book-open text-sm" style={{ color: 'var(--color-pink-400)' }} />
          </div>
          <div>
            <h2 className="text-base font-bold" style={{ color: 'var(--color-text-primary)' }}>章节管理</h2>
            <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
              子文件夹 {folder.children?.length || 0} · 文件 {filteredFiles.length}{cardSearchText.trim() ? ` / ${folderFiles.length}` : ''}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <input
              type="text"
              value={cardSearchText}
              onChange={e => setCardSearchText(e.target.value)}
              placeholder="搜索卡片..."
              className="neumorphic-input pl-8 pr-3 py-1.5 rounded-lg text-xs w-40"
              style={{ color: 'var(--color-text-secondary)' }}
            />
            <i className="fas fa-search absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px]" style={{ color: 'var(--color-text-muted)' }}></i>
          </div>
          <button
            onClick={() => { setIsMultiSelectMode(!isMultiSelectMode); setSelectedCardIds(new Set()); }}
            className={`px-2.5 py-1.5 rounded-lg text-[10px] border transition-colors ${
              isMultiSelectMode ? '' : ''
            }`}
            style={{
              borderColor: isMultiSelectMode ? 'var(--color-primary-400)' : 'var(--color-border-default)',
              color: isMultiSelectMode ? 'var(--color-primary-300)' : 'var(--color-text-tertiary)',
              background: isMultiSelectMode ? 'var(--color-primary-100)' : 'transparent',
            }}
          >
            <i className="fas fa-check-double mr-1"></i>{isMultiSelectMode ? `已选${selectedCardIds.size}` : '多选'}
          </button>
          <button
            onClick={() => showInput('新建章节', '输入章节名称', `第${folderFiles.length + 1}章`, (n) => onCreateCard(folder.id, n))}
            className="text-xs px-3 py-1.5 rounded-lg border transition-colors flex items-center gap-1.5"
            style={{ color: 'var(--color-text-secondary)', borderColor: 'var(--color-border-default)', background: 'transparent' }}
          >
            <i className="fas fa-plus text-[10px]" />新建章节
          </button>
        </div>
      </div>

      {isMultiSelectMode && selectedCardIds.size > 0 && (
        <div className="flex items-center justify-between px-4 py-2.5 rounded-xl mx-6 mt-3 shrink-0 animate-fade-in"
          style={{ backgroundColor: 'var(--color-pink-50)', border: '1px solid var(--color-pink-200)' }}>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium" style={{ color: 'var(--color-pink-500)' }}>已选择 {selectedCardIds.size} 项</span>
            <button onClick={() => handleSelectAll(filteredFiles.map(c => c.id))}
              className="text-[10px] px-2 py-0.5 rounded hover:bg-white/10 transition-colors"
              style={{ color: 'var(--color-text-secondary)' }}>全选</button>
            <button onClick={() => setSelectedCardIds(new Set())}
              className="text-[10px] px-2 py-0.5 rounded hover:bg-white/10 transition-colors"
              style={{ color: 'var(--color-text-secondary)' }}>取消</button>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={handleBatchDeleteCards}
              className="px-3 py-1 text-xs rounded-lg text-red-400 hover:bg-red-900/20 transition-all flex items-center gap-1">
              <i className="fas fa-trash text-[10px]" />批量删除
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-6">
        {filteredFiles.length > 0 && !isMultiSelectMode && (
          <h3 className="text-sm font-bold mb-3 flex items-center gap-2" style={{ color: 'var(--color-text-secondary)' }}>
            <i className="fas fa-file-lines text-xs" style={{ color: 'var(--color-pink-400)' }}></i>
            文件 ({filteredFiles.length})
          </h3>
        )}
        {filteredFiles.length === 0 ? (
          <div className="glass-card rounded-2xl p-16 text-center max-w-2xl mx-auto">
            <i className="fas fa-book-open text-5xl mb-5 opacity-20" style={{ color: 'var(--color-text-muted)' }} />
            <p className="font-bold text-xl mb-2" style={{ color: 'var(--color-text-secondary)' }}>暂无章节</p>
            <p className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>新建章节或使用 AI 批量生成</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-6xl">
            {filteredFiles.map((card, i) => (
              <ContentCardItem
                key={card.id}
                card={card}
                onDelete={handleDeleteCard}
                onClick={(cardId) => setShowEditor({ cardId })}
                isSelected={selectedCardIds.has(card.id)}
                isMultiSelect={isMultiSelectMode}
                onToggleSelect={(id) => {
                  setSelectedCardIds(prev => {
                    const next = new Set(prev);
                    next.has(id) ? next.delete(id) : next.add(id);
                    return next;
                  });
                }}
                draggable={!isMultiSelectMode}
                onDragStart={(e) => { setDragCardId(card.id); }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDropOnCard}
              />
            ))}
          </div>
        )}

        {showEditor && (() => {
          const editingCard = folderFiles.find(c => c.id === showEditor.cardId);
          if (!editingCard) return null;
          return (
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center" onClick={() => setShowEditor(null)}>
              <div className="glass-card rounded-2xl w-full max-w-4xl max-h-[85vh] mx-4 shadow-2xl flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderBottomColor: 'var(--color-border-default)' }}>
                  <div className="flex items-center gap-3">
                    <i className="fas fa-edit text-sm" style={{ color: 'var(--color-primary-400)' }} />
                    <input
                      type="text"
                      defaultValue={editingCard.title}
                      onBlur={(e) => {
                        if (e.target.value !== editingCard.title) {
                          updateCardInVFile(editingCard.id, { title: e.target.value });
                        }
                      }}
                      className="text-base font-bold bg-transparent border-none outline-none"
                      style={{ color: 'var(--color-text-primary)' }}
                    />
                  </div>
                  <button onClick={() => setShowEditor(null)} className="p-2 rounded-lg hover:bg-white/10 transition-colors">
                    <i className="fas fa-times" style={{ color: 'var(--color-text-muted)' }}></i>
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-6">
                  <textarea
                    defaultValue={editingCard.content || ''}
                    onBlur={(e) => {
                      if (e.target.value !== editingCard.content) {
                        updateCardInVFile(editingCard.id, { content: e.target.value });
                      }
                    }}
                    placeholder="输入章节内容..."
                    className="w-full min-h-[420px] neumorphic-input rounded-xl p-5 text-sm resize-none focus:outline-none"
                    style={{ color: 'var(--color-text-primary)' }}
                  />
                </div>
              </div>
            </div>
          );
        })()}
      </div>

      {inputModal && (
        <InputModal
          title={inputModal.title}
          placeholder={inputModal.placeholder}
          defaultValue={inputModal.defaultValue}
          onConfirm={handleInputConfirm}
          onCancel={() => setInputModal(null)}
        />
      )}
    </div>
  );
});

export default StepPlot;
