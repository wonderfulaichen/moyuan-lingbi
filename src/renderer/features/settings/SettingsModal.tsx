import React, { useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ModelConfig, PromptTemplate } from '../../../shared/types';
import { DEFAULT_PROMPTS, getKnownModelSpec, PROVIDER_INFO } from '../../../shared/constants';
import ModelRoutingPanel from '../../shared/components/ModelRoutingPanel';
import { ModuleManagerPanel } from './ModuleManagerPanel';
import { AITaskManagerPanel } from './AITaskManagerPanel';
import {
  getPromptLibrary,
  getPromptContent,
  PromptLibraryItem,
  PromptLayer,
  isPromptEditable,
  setUserOverride,
  removeUserOverride,
  clearAllUserOverrides,
} from '../../../shared/prompts';
import { aiService } from '../../shared/services/aiService';
import { useTheme, THEME_LIST, ThemeId } from '../../shared/contexts/ThemeContext';
import { useZoom, ZOOM_PRESETS } from '../../shared/contexts/ZoomContext';
import ChangelogModal from '../../shared/components/ChangelogModal';
import { CHANGELOG } from '../../shared/data/changelog';
import { ConfirmModal } from '../../shared/components/Modal';

interface SettingsModalProps {
  models: ModelConfig[];
  activeModelId: string;
  prompts: PromptTemplate[];
  onUpdateModels: (models: ModelConfig[]) => void;
  onUpdateActiveModelId: (id: string) => void;
  onUpdatePrompts: (prompts: PromptTemplate[]) => void;
  onFactoryReset?: () => void;
  onClose: () => void;
}

type SettingsTab = 'model' | 'routing' | 'promptLibrary' | 'modules' | 'tasks' | 'theme' | 'system';

const CATEGORY_LABELS: Record<string, string> = {
  inspiration: '灵感构思',
  character: '角色塑造',
  world: '世界观构建',
  timeline: '时间线',
  outline: '大纲规划',
  chapter: '章节拆分',
  writing: '正文创作',
  edit: '润色编辑',
  summary: '摘要提取',
  memory: '记忆库',
  analysis: '分析决策',
  'tool-format': '工具格式',
  workflow: '工作流程',
  'file-rules': '文件规则',
  'canon-system': '正典系统',
  compress: '摘要压缩',
  agent: '角色层',
  format: '格式层',
  rule: '规则层',
};

// 快速添加模板（参考项目1的 quickAddProviderModel）
const QUICK_ADD_PROVIDERS: Array<{ provider: ModelConfig['provider']; label: string; icon: string; color: string }> = [
  { provider: 'openai-compatible', label: 'OpenAI', icon: 'fa-robot', color: 'text-green-400' },
  { provider: 'deepseek', label: 'DeepSeek', icon: 'fa-brain', color: 'text-blue-400' },
  { provider: 'ollama', label: 'Ollama 本地', icon: 'fa-server', color: 'text-emerald-400' },
];

// 高级配置标签映射
const TEMP_LABELS = [
  { value: 0, label: '精确' },
  { value: 0.7, label: '平衡' },
  { value: 1.5, label: '创意' },
  { value: 2.0, label: '天马行空' },
];

interface NavItem {
  id: SettingsTab;
  label: string;
  icon: string;
  description: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'model', label: '模型配置', icon: 'fa-robot', description: '配置 AI 模型连接' },
  { id: 'routing', label: '智能路由', icon: 'fa-route', description: '配置任务路由规则' },
  { id: 'promptLibrary', label: '提示词库', icon: 'fa-book', description: '管理提示词模板' },
  { id: 'modules', label: '模块管理', icon: 'fa-cubes', description: '启用/禁用功能模块' },
  { id: 'tasks', label: 'AI 任务', icon: 'fa-tasks', description: '查看和管理 AI 任务' },
  { id: 'theme', label: '主题外观', icon: 'fa-palette', description: '个性化界面样式' },
  { id: 'system', label: '系统信息', icon: 'fa-info-circle', description: '系统信息和帮助' },
];

const SettingsModal: React.FC<SettingsModalProps> = ({
  models,
  activeModelId,
  prompts,
  onUpdateModels,
  onUpdateActiveModelId,
  onUpdatePrompts,
  onFactoryReset,
  onClose,
}) => {
  const { theme, setTheme, themeInfo, mode, toggleMode } = useTheme();
  const { zoom, setZoom, zoomPercent, zoomIn, zoomOut, zoomReset } = useZoom();
  const [activeTab, setActiveTab] = useState<SettingsTab>('model');
  const [editingModelId, setEditingModelId] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState<Record<string, boolean>>({});
  const [testingConnection, setTestingConnection] = useState<Record<string, boolean>>({});
  const [connectionResult, setConnectionResult] = useState<Record<string, { success: boolean; message: string }>>({});
  const [fetchingModels, setFetchingModels] = useState<Record<string, boolean>>({});
  const [modelFetchErrors, setModelFetchErrors] = useState<Record<string, string | undefined>>({});
  const [animExit, setAnimExit] = useState(false);
  const [showChangelog, setShowChangelog] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState<{ title: string; message: string; variant: 'danger' | 'warning' | 'default'; onConfirm: () => void } | null>(null);
  const [editingPrompt, setEditingPrompt] = useState<PromptTemplate | null>(null);
  const [editingName, setEditingName] = useState('');
  const [editingContent, setEditingContent] = useState('');
  const modalRef = useRef<HTMLDivElement>(null);
  const modelsRef = useRef<ModelConfig[]>(models);
  
  useEffect(() => {
    modelsRef.current = models;
  }, [models]);

  const handleOpenEditPrompt = useCallback((prompt: PromptTemplate) => {
    setEditingPrompt(prompt);
    setEditingName(prompt.name);
    setEditingContent(prompt.content);
  }, []);

  const handleCloseEditPrompt = useCallback(() => {
    setEditingPrompt(null);
  }, []);

  const handleSaveEditPrompt = useCallback(() => {
    if (!editingPrompt) return;
    const updated = prompts.map(p =>
      p.id === editingPrompt.id
        ? { ...p, name: editingName, content: editingContent }
        : p
    );
    onUpdatePrompts(updated);
    setEditingPrompt(null);
  }, [editingPrompt, editingName, editingContent, prompts, onUpdatePrompts]);

  const handleResetSinglePrompt = useCallback((promptId: string) => {
    const defaultPrompt = DEFAULT_PROMPTS.find(p => p.id === promptId);
    removeUserOverride(promptId);
    const updated = prompts.map(p => {
      if (p.id !== promptId) return p;
      if (defaultPrompt) return { ...defaultPrompt };
      return { ...p, content: getPromptContent(promptId) };
    });
    onUpdatePrompts(updated);
  }, [prompts, onUpdatePrompts]);

  const handleResetAllPrompts = useCallback(() => {
    setPendingConfirm({
      title: '恢复默认提示词',
      message: '确定要恢复所有提示词模板为默认值吗？自定义修改将丢失。',
      variant: 'warning',
      onConfirm: () => {
        setPendingConfirm(null);
        clearAllUserOverrides();
        const allDefaultPrompts = getPromptLibrary().map(p => ({
          id: p.id,
          category: (p.category ?? p.layer) as any,
          name: p.name,
          content: p.content,
        }));
        onUpdatePrompts(allDefaultPrompts);
      },
    });
  }, [onUpdatePrompts]);

  const handleClose = useCallback(() => {
    setAnimExit(true);
    setTimeout(() => onClose(), 200);
  }, [onClose]);

  const handleAddModel = useCallback(() => {
    const newModel: ModelConfig = {
      id: `model-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: '新模型',
      provider: 'openai-compatible',
      modelName: '',
      endpoint: '',
      apiKey: '',
      supportsStreaming: true,
      temperature: 0.7,
      maxTokens: 4096,
    };
    onUpdateModels([...models, newModel]);
    setTimeout(() => setEditingModelId(newModel.id), 50);
  }, [models, onUpdateModels]);

  /** 快速添加提供商模板（参考项目1: quickAddProviderModel） */
  const handleQuickAddProvider = useCallback((provider: ModelConfig['provider']) => {
    const info = PROVIDER_INFO[provider];
    if (!info) return;
    const existing = models.find(m => m.provider === provider && m.endpoint === info.defaultEndpoint);
    if (existing) {
      setEditingModelId(existing.id);
      return;
    }
    const defaultModelName = provider === 'ollama' ? 'qwen2.5' : (info.modelExamples[0] || '');
    const spec = getKnownModelSpec(defaultModelName);
    const newModel: ModelConfig = {
      id: `model-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: info.label,
      provider,
      endpoint: info.defaultEndpoint,
      apiKey: provider === 'ollama' ? '' : '',
      modelName: defaultModelName,
      supportsStreaming: true,
      temperature: 0.7,
      maxTokens: spec?.maxTokens ?? 4096,
      ...(spec ? { contextWindow: spec.contextWindow } : {}),
    };
    onUpdateModels([...models, newModel]);
    setTimeout(() => setEditingModelId(newModel.id), 50);
  }, [models, onUpdateModels]);

  const handleDeleteModel = useCallback((id: string) => {
    const newModels = models.filter(m => m.id !== id);
    onUpdateModels(newModels);
    if (editingModelId === id) setEditingModelId(null);
    if (activeModelId === id && newModels.length > 0) {
      onUpdateActiveModelId(newModels[0].id);
    }
  }, [models, editingModelId, activeModelId, onUpdateModels, onUpdateActiveModelId]);

  const handleUpdateModel = useCallback((id: string, updates: Partial<ModelConfig>) => {
    const currentModels = modelsRef.current;
    console.log('[SettingsModal] handleUpdateModel called:', { id, updates, currentModelsCount: currentModels.length });
    const updatedModels = currentModels.map(m => m.id === id ? { ...m, ...updates } : m);
    onUpdateModels(updatedModels);
  }, [onUpdateModels]);

  /** 获取可用模型 */
  const handleFetchModels = useCallback(async (model: ModelConfig) => {
    setFetchingModels(prev => ({ ...prev, [model.id]: true }));
    setModelFetchErrors(prev => ({ ...prev, [model.id]: undefined }));
    try {
      const result = await aiService.fetchAvailableModels(model);
      if (result.models.length > 0) {
        const currentModel = models.find(m => m.id === model.id);
        const currentName = currentModel?.modelName || '';
        const modelNames = result.models.map(m => m.name);
        const newModelName = modelNames.includes(currentName) ? currentName : (modelNames[0] || currentName);
        handleUpdateModel(model.id, {
          availableModels: modelNames,
          modelName: newModelName,
          modelsLastFetched: Date.now(),
          modelsFetchError: undefined,
          modelContextMap: result.modelContextMap,
        });
        setModelFetchErrors(prev => ({ ...prev, [model.id]: undefined }));
      } else {
        handleUpdateModel(model.id, {
          modelsLastFetched: Date.now(),
          modelsFetchError: result.error || '未获取到模型列表',
        });
        setModelFetchErrors(prev => ({ ...prev, [model.id]: result.error || '未获取到模型列表' }));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '获取失败';
      handleUpdateModel(model.id, { modelsFetchError: msg });
      setModelFetchErrors(prev => ({ ...prev, [model.id]: msg }));
    } finally {
      setFetchingModels(prev => ({ ...prev, [model.id]: false }));
    }
  }, [models, handleUpdateModel]);

  /** 测试连接 */
  const handleTestConnection = useCallback(async (model: ModelConfig) => {
    setTestingConnection(prev => ({ ...prev, [model.id]: true }));
    setConnectionResult(prev => ({ ...prev, [model.id]: { success: false, message: '连接测试中...' } }));
    try {
      const result = await aiService.testConnection(model);
      setConnectionResult(prev => ({
        ...prev,
        [model.id]: { success: result.success, message: result.message },
      }));
      if (result.success && (result.contextWindow || result.modelContextMap)) {
        const updates: Partial<ModelConfig> = {};
        if (result.contextWindow) updates.contextWindow = result.contextWindow;
        if (result.modelContextMap) updates.modelContextMap = result.modelContextMap;
        if (!result.contextWindow && Object.keys(result.modelContextMap || {}).length > 0) {
          const spec = getKnownModelSpec(model.modelName);
          if (!spec) { updates.contextWindow = result.modelContextMap![model.modelName]; }
        }
        if (Object.keys(updates).length > 0) handleUpdateModel(model.id, updates);
      }
    } catch (err) {
      setConnectionResult(prev => ({
        ...prev,
        [model.id]: {
          success: false,
          message: `❌ ${err instanceof Error ? err.message : '连接异常'}`,
        },
      }));
    } finally {
      setTestingConnection(prev => ({ ...prev, [model.id]: false }));
    }
  }, []);

  const handleProviderChange = useCallback((model: ModelConfig, provider: ModelConfig['provider']) => {
    const info = PROVIDER_INFO[provider];
    if (!info) return;
    handleUpdateModel(model.id, {
      provider,
      endpoint: info.defaultEndpoint,
      apiKey: provider === 'ollama' ? '' : model.apiKey,
      availableModels: undefined,
      modelsLastFetched: undefined,
      modelsFetchError: undefined,
    });
  }, [handleUpdateModel]);

  const formatTime = (timestamp?: number) => {
    if (!timestamp) return '从未获取';
    const now = Date.now();
    const diff = now - timestamp;
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
    return new Date(timestamp).toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // 获取当前温度对应的标签
  const getTempLabel = (temp: number) => {
    const closest = TEMP_LABELS.reduce((prev, curr) =>
      Math.abs(curr.value - temp) < Math.abs(prev.value - temp) ? curr : prev
    );
    return closest.label;
  };

  const editingModel = editingModelId ? models.find(m => m.id === editingModelId) || null : null;

  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center transition-all duration-300 ${
        animExit ? 'opacity-0' : 'opacity-100'
      }`}
      onClick={handleClose}
    >
      {/* 背景遮罩 */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-md"></div>

      {/* 模态框主体 */}
      <div
        ref={modalRef}
        className={`
          relative w-full mx-4
          ${isMobile ? 'h-[100dvh] max-h-[100dvh] rounded-none' : 'max-w-6xl max-h-[85vh] rounded-2xl'}
          bg-[var(--color-surface-overlay)] backdrop-blur-xl
          border border-[var(--color-border-default)]
          shadow-2xl shadow-[var(--color-primary-500)]/20
          flex flex-col overflow-hidden
          transition-all duration-300
          ${animExit ? 'scale-95 opacity-0' : 'scale-100 opacity-100'}
        `}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 装饰光效 */}
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-[var(--color-primary-600)]/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-[var(--color-primary-600)]/10 rounded-full blur-3xl pointer-events-none"></div>

        {/* 头部 */}
        <div className={`relative flex items-center justify-between border-b shrink-0 ${isMobile ? 'px-3 py-2' : 'px-6 py-4'}`} style={{ borderColor: 'var(--color-primary-100)' }}>
          <div className="flex items-center gap-3">
            {!isMobile && (
            <div className="w-10 h-10 rounded-xl flex items-center justify-center border"
              style={{ background: 'linear-gradient(135deg, var(--color-primary-100), var(--color-primary-50))', borderColor: 'var(--color-primary-200)' }}>
              <i className="fas fa-cog text-sm" style={{ color: 'var(--color-primary-400)' }}></i>
            </div>
            )}
            <div>
              <h2 className={`font-bold ${isMobile ? 'text-base' : 'text-lg'}`} style={{ color: 'var(--color-text-primary)' }}>系统设置</h2>
              {!isMobile && (
              <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-tertiary)' }}>
                {NAV_ITEMS.find(n => n.id === activeTab)?.description}
              </p>
              )}
            </div>
          </div>
          <button
            onClick={handleClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-200"
            style={{ color: 'var(--color-text-muted)' }}
          >
            <i className="fas fa-times"></i>
          </button>
        </div>

        {/* 主体内容 - 左侧导航 + 右侧内容 */}
        <div className={`flex flex-1 overflow-hidden ${isMobile ? 'flex-col' : ''}`}>
          {/* 左侧导航栏 */}
          <div className={`${isMobile ? 'w-full border-b overflow-x-auto p-2 flex gap-1 shrink-0' : 'w-60 shrink-0 border-r overflow-y-auto p-4'}`} style={{ borderColor: 'var(--color-primary-100)', background: 'var(--color-surface-elevated)/30' }}>
            <div className={`${isMobile ? 'flex gap-1' : 'space-y-1'}`}>
              {NAV_ITEMS.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`
                    ${isMobile ? 'flex-shrink-0 px-3 py-2 rounded-lg text-xs' : 'w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left'} transition-all duration-200
                    ${activeTab === item.id
                      ? 'bg-gradient-to-r from-[var(--color-primary-500)]/20 to-[var(--color-primary-600)]/10 text-[var(--color-primary-300)] border border-[var(--color-primary-300)] shadow-sm'
                      : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]'
                    }
                  `}
                >
                  <i className={`fas ${item.icon} ${isMobile ? '' : 'w-5 text-center'}`}></i>
                  {!isMobile && (
                    <div className="flex-1">
                      <span className="font-medium text-sm">{item.label}</span>
                    </div>
                  )}
                  {item.id === 'model' && !isMobile && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--color-surface-muted)] text-[var(--color-text-muted)]">{models.length}</span>
                  )}
                  {item.id === 'promptLibrary' && !isMobile && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--color-surface-muted)] text-[var(--color-text-muted)]">{getPromptLibrary().length}</span>
                  )}
                  {item.id === 'routing' && !isMobile && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: 'var(--color-purple-100, rgba(168,85,247,0.2))', color: 'var(--color-purple-500, #a855f7)' }}>NEW</span>
                  )}
                </button>
              ))}
            </div>

            {/* 底部信息 */}
            {!isMobile && (
            <div className="mt-8 pt-4 border-t" style={{ borderColor: 'var(--color-primary-100)' }}>
              <div className="text-center">
                <p className="text-[10px] text-[var(--color-text-muted)]">墨渊灵笔</p>
                <p className="text-[10px] text-[var(--color-text-muted)] mt-1">版本 1.0.0</p>
              </div>
            </div>
            )}
          </div>

          {/* 右侧内容区 */}
          <div className="flex-1 overflow-y-auto p-6">
            {activeTab === 'routing' && (
              <div className="animate-fade-in">
                <ModelRoutingPanel models={models} />
              </div>
            )}
            {activeTab === 'modules' && (
              <div className="animate-fade-in">
                <ModuleManagerPanel />
              </div>
            )}
            {activeTab === 'tasks' && (
              <div className="animate-fade-in">
                <AITaskManagerPanel />
              </div>
            )}
            {activeTab === 'model' && (
            <div className="animate-fade-in">
              {/* 顶部操作栏 */}
              <div className="flex items-center justify-between mb-5">
                <div>
                  <p className="text-sm text-[var(--color-text-tertiary)]">配置 AI 模型的连接参数与行为</p>
                  <p className="text-xs text-[var(--color-text-muted)] mt-1">支持 OpenAI Compatible / DeepSeek / Ollama 三种协议</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleAddModel}
                    className="px-4 py-2 bg-gradient-to-r from-[var(--color-primary-500)]/30 to-[var(--color-primary-600)]/20 text-[var(--color-primary-300)] rounded-xl hover:from-[var(--color-primary-500)]/50 hover:to-[var(--color-primary-600)]/30 transition-all duration-200 text-sm font-medium border border-[var(--color-primary-300)] hover:border-[var(--color-primary-400)]"
                  >
                    <i className="fas fa-plus mr-2"></i>添加模型
                  </button>
                </div>
              </div>

              {/* 快速添加提供商（参考项目1: quickAddProviderModel） */}
              <div className="mb-4 p-3 bg-[var(--color-surface-elevated)] rounded-xl border border-[var(--color-border-default)]">
                <p className="text-[10px] text-[var(--color-text-muted)] mb-2.5 flex items-center gap-1">
                  <i className="fas fa-bolt text-[8px] text-[var(--color-primary-400)]/70"></i>
                  快速添加预设
                </p>
                <div className="flex gap-2">
                  {QUICK_ADD_PROVIDERS.map(item => (
                    <button
                      key={item.provider}
                      onClick={() => handleQuickAddProvider(item.provider)}
                      className="flex items-center gap-2 px-3.5 py-2 bg-[var(--color-surface-hover)] hover:bg-[var(--color-surface-hover)] rounded-xl border border-[var(--color-border-default)] hover:border-[var(--color-primary-300)] transition-all duration-200 text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
                    >
                      <i className={`fas ${item.icon} ${item.color} text-[11px]`}></i>
                      <span>{item.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* 模型列表 */}
              <div className="space-y-3">
                {models.map((model, index) => {
                  const info = PROVIDER_INFO[model.provider] || PROVIDER_INFO['openai-compatible'];
                  const isEditing = editingModelId === model.id;
                  const isActive = activeModelId === model.id;
                  const isAdvancedShown = showAdvanced[model.id] || false;
                  const isFetching = fetchingModels[model.id];
                  const isTesting = testingConnection[model.id];
                  const connResult = connectionResult[model.id];
                  const fetchError = modelFetchErrors[model.id];

                  return (
                    <div
                      key={model.id}
                      className={`
                        relative rounded-xl border transition-all duration-300
                        animate-fade-in-up
                        ${isActive
                          ? 'bg-gradient-to-r from-[var(--color-primary-500)]/8 to-[var(--color-primary-600)]/5 border-[var(--color-primary-300)] shadow-md shadow-[var(--color-primary-500)]/15'
                          : 'bg-[var(--color-surface-elevated)] border-[var(--color-border-default)] hover:border-[var(--color-border-default)] hover:bg-[var(--color-surface-elevated)]'
                        }
                        ${isEditing ? 'scale-[1.01]' : ''}
                      `}
                      style={{ animationDelay: `${index * 50}ms` }}
                    >
                      {/* 活跃指示线 */}
                      {isActive && (
                        <div className="absolute left-0 top-2 bottom-2 w-0.5 bg-gradient-to-b from-[var(--color-primary-500)] to-[var(--color-primary-500)] rounded-full"></div>
                      )}

                      {/* 模型卡片头部 */}
                      <div
                        className="relative p-4 cursor-pointer flex items-center justify-between select-none"
                        onClick={() => setEditingModelId(isEditing ? null : model.id)}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {/* 状态指示灯 */}
                          <div className={`
                            w-2.5 h-2.5 rounded-full transition-all duration-300 shrink-0
                            ${isActive
                              ? 'bg-[var(--color-primary-500)] shadow-lg shadow-[var(--color-primary-500)]/50 animate-pulse-glow'
                              : 'bg-[var(--color-surface-muted)]'
                            }
                          `}></div>
                          {/* 提供商图标 */}
                          <div className={`
                            w-8 h-8 rounded-lg flex items-center justify-center
                            bg-gradient-to-br ${info.gradient} border border-[var(--color-border-default)] shrink-0
                          `}>
                            <i className={`fas ${info.icon} ${info.color} text-xs`}></i>
                          </div>
                          {/* 名称和标签 */}
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-[var(--color-text-primary)] text-sm truncate">{model.name}</span>
                              <span className="text-[10px] text-[var(--color-text-muted)] px-2 py-0.5 bg-[var(--color-surface-muted)] rounded-full border border-[var(--color-border-default)] shrink-0">{info.label}</span>
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              {model.modelName ? (
                                <span className="text-[11px] text-[var(--color-primary-400)]/70 font-mono">{model.modelName}</span>
                              ) : (
                                <span className="text-[11px] text-[var(--color-text-muted)]">未配置模型</span>
                              )}
                              {model.modelsLastFetched && model.availableModels && (
                                <span className="text-[10px] text-[var(--color-text-muted)]">{model.availableModels.length} 个模型</span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {/* 当前使用标签 */}
                          {isActive && (
                            <span className="text-[10px] text-[var(--color-primary-400)] bg-[var(--color-primary-600)]/20 px-2.5 py-0.5 rounded-full border border-[var(--color-primary-300)] animate-fade-in">
                              当前使用
                            </span>
                          )}
                          {/* 切换按钮 */}
                          {!isActive && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onUpdateActiveModelId(model.id);
                              }}
                              className="text-[11px] px-2.5 py-1 rounded-lg bg-[var(--color-surface-muted)] text-[var(--color-text-tertiary)] hover:text-[var(--color-primary-300)] hover:bg-[var(--color-primary-600)]/15 transition-all duration-200 border border-[var(--color-border-default)] hover:border-[var(--color-primary-300)]"
                            >
                              切换
                            </button>
                          )}
                          {/* 展开箭头 */}
                          <div className={`
                            w-6 h-6 rounded-md flex items-center justify-center
                            text-[var(--color-text-muted)] transition-all duration-300
                            ${isEditing ? 'text-[var(--color-primary-400)] rotate-180' : ''}
                          `}>
                            <i className="fas fa-chevron-down text-xs"></i>
                          </div>
                        </div>
                      </div>

                      {/* 展开的编辑面板 */}
                      {isEditing && (
                        <div className="px-4 pb-5 border-t border-[var(--color-border-default)] pt-4 animate-fade-in-down">
                          {/* 基础配置网格 */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {/* 配置名称 */}
                            <div>
                              <label className="text-[11px] text-[var(--color-text-muted)] mb-1.5 flex items-center gap-1">
                                <i className="fas fa-tag text-[9px]"></i>配置名称
                              </label>
                              <input
                                type="text"
                                value={model.name}
                                onChange={(e) => handleUpdateModel(model.id, { name: e.target.value })}
                                className="w-full bg-[var(--color-surface-hover)] border border-[var(--color-border-default)] rounded-xl px-3.5 py-2.5 text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary-400)] focus:bg-[var(--color-surface-hover)] transition-all duration-200 placeholder:text-[var(--color-text-muted)]"
                                placeholder="给配置起个名字"
                              />
                            </div>
                            {/* 提供商 */}
                            <div>
                              <label className="text-[11px] text-[var(--color-text-muted)] mb-1.5 flex items-center gap-1">
                                <i className="fas fa-cloud text-[9px]"></i>提供商
                              </label>
                              <select
                                value={model.provider}
                                onChange={(e) => handleProviderChange(model, e.target.value as ModelConfig['provider'])}
                                className="w-full bg-[var(--color-surface-hover)] border border-[var(--color-border-default)] rounded-xl px-3.5 py-2.5 text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary-400)] focus:bg-[var(--color-surface-hover)] transition-all duration-200 cursor-pointer appearance-none"
                                style={{
                                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3E%3C/svg%3E")`,
                                  backgroundPosition: 'right 8px center',
                                  backgroundRepeat: 'no-repeat',
                                  backgroundSize: '16px',
                                }}
                              >
                                <option value="openai-compatible">OpenAI Compatible</option>
                                <option value="deepseek">DeepSeek</option>
                                <option value="ollama">Ollama (本地)</option>
                              </select>
                            </div>
                          </div>

                          {/* 提供商描述和提示信息（参考项目1的功能） */}
                          <div className="mt-3 p-3 bg-[var(--color-surface-muted)] rounded-xl border border-[var(--color-border-default)]">
                            <div className="flex items-start gap-2.5">
                              <div className={`
                                w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5
                                bg-gradient-to-br ${info.gradient} border border-[var(--color-border-default)]
                              `}>
                                <i className={`fas ${info.icon} ${info.color} text-[10px]`}></i>
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs text-[var(--color-text-secondary)] font-medium">{info.label}</p>
                                <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5 leading-relaxed">{info.description}</p>
                                <div className="flex flex-wrap gap-1.5 mt-2">
                                  {info.modelExamples.slice(0, 4).map(ex => (
                                    <span key={ex} className="text-[9px] font-mono text-[var(--color-primary-400)]/60 bg-[var(--color-primary-600)]/15 px-1.5 py-0.5 rounded border border-[var(--color-border-default)]">
                                      {ex}
                                    </span>
                                  ))}
                                </div>
                                <div className="mt-2 pt-2 border-t border-[var(--color-border-default)]">
                                  <p className="text-[9px] text-[var(--color-text-muted)] mb-1.5 flex items-center gap-1">
                                    <i className="fas fa-lightbulb text-[7px] text-[var(--color-warning)]"></i>
                                    使用提示：
                                  </p>
                                  <ul className="space-y-1">
                                    {info.tips.slice(0, 4).map((tip, i) => (
                                      <li key={i} className="text-[9px] text-[var(--color-text-muted)] flex items-start gap-1.5">
                                        <span className="text-[var(--color-primary-400)]/50 mt-0.5">•</span>
                                        {tip}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                                <div className="mt-2 flex gap-2">
                                  <a
                                    href={info.website}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-[9px] text-[var(--color-primary-400)]/60 hover:text-[var(--color-primary-400)] transition-colors flex items-center gap-1"
                                    onClick={e => e.stopPropagation()}
                                  >
                                    <i className="fas fa-globe text-[7px]"></i>
                                    官方网站
                                  </a>
                                  <a
                                    href={info.apiApplyUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-[9px] text-[var(--color-primary-400)]/60 hover:text-[var(--color-primary-400)] transition-colors flex items-center gap-1"
                                    onClick={e => e.stopPropagation()}
                                  >
                                    <i className="fas fa-key text-[7px]"></i>
                                    获取 API Key
                                  </a>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* API 端点 + 获取模型 */}
                          <div className="mt-3">
                            <label className="text-[11px] text-[var(--color-text-muted)] mb-1.5 flex items-center gap-1">
                              <i className="fas fa-link text-[9px]"></i>API 端点
                            </label>
                            <div className="flex gap-2">
                              <input
                                type="text"
                                value={model.endpoint || ''}
                                onChange={(e) => {
                                  handleUpdateModel(model.id, {
                                    endpoint: e.target.value,
                                    availableModels: undefined,
                                    modelsLastFetched: undefined,
                                    modelsFetchError: undefined,
                                  });
                                }}
                                className="flex-1 bg-[var(--color-surface-hover)] border border-[var(--color-border-default)] rounded-xl px-3.5 py-2.5 text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary-400)] focus:bg-[var(--color-surface-hover)] transition-all duration-200 font-mono text-[13px] placeholder:text-[var(--color-text-muted)]"
                                placeholder={info.defaultEndpoint}
                              />
                              <button
                                onClick={() => handleFetchModels(model)}
                                disabled={isFetching}
                                className={`
                                  px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 shrink-0
                                  ${isFetching
                                    ? 'bg-[var(--color-primary-600)]/20 text-[var(--color-primary-400)]/60 cursor-wait'
                                    : 'bg-gradient-to-r from-[var(--color-primary-500)]/25 to-[var(--color-primary-600)]/20 text-[var(--color-primary-300)] hover:from-[var(--color-primary-500)]/40 hover:to-[var(--color-primary-600)]/30 border border-[var(--color-primary-300)] hover:border-[var(--color-primary-400)]'
                                  }
                                `}
                                title="从端点获取可用模型列表"
                              >
                                {isFetching ? (
                                  <span className="flex items-center gap-2">
                                    <i className="fas fa-spinner fa-spin"></i>
                                    获取中...
                                  </span>
                                ) : (
                                  <span className="flex items-center gap-2">
                                    <i className="fas fa-cloud-download-alt"></i>
                                    获取模型
                                  </span>
                                )}
                              </button>
                            </div>
                            <p className="text-[10px] text-[var(--color-text-muted)] mt-1.5 flex items-center gap-1">
                              <i className="fas fa-info-circle text-[8px]"></i>
                              {info.endpointHint} · {model.provider === 'ollama' ? '确保 Ollama 服务已启动' : '需要有效的 API Key'}
                            </p>
                            {/* 获取结果反馈 */}
                            {fetchError && (
                              <div className="mt-2 p-2.5 bg-[var(--color-error-bg)] border border-[var(--color-error-border)] rounded-xl animate-fade-in">
                                <div className="flex items-start gap-2">
                                  <i className="fas fa-exclamation-circle text-[var(--color-error)] text-[10px] mt-0.5"></i>
                                  <div className="text-[11px] text-[var(--color-error)] leading-relaxed whitespace-pre-line">{fetchError}</div>
                                </div>
                              </div>
                            )}
                            {model.modelsLastFetched && !fetchError && model.availableModels && (
                              <p className="text-[10px] text-[var(--color-text-muted)] mt-1 flex items-center gap-1">
                                <i className="fas fa-check-circle text-[var(--color-success)]"></i>
                                上次获取: {formatTime(model.modelsLastFetched)} · 共 {model.availableModels.length} 个模型
                                {aiService.isCacheValid(model) && (
                                  <span className="text-[8px] text-[var(--color-text-muted)] ml-1">(缓存有效)</span>
                                )}
                              </p>
                            )}
                          </div>

                          {/* 模型名称 */}
                          <div className="mt-3">
                            <label className="text-[11px] text-[var(--color-text-muted)] mb-1.5 flex items-center gap-1">
                              <i className="fas fa-microchip text-[9px]"></i>模型名称
                            </label>
                            {model.availableModels && model.availableModels.length > 0 ? (
                              <div className="flex gap-2">
                                <select
                                  value={model.modelName}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    const apiCtx = model.modelContextMap?.[val];
                                    const spec = getKnownModelSpec(val);
                                    handleUpdateModel(model.id, {
                                      modelName: val,
                                      ...(apiCtx ? { contextWindow: apiCtx } : (spec ? { contextWindow: spec.contextWindow, maxTokens: spec.maxTokens } : {})),
                                    });
                                  }}
                                  className="flex-1 bg-[var(--color-surface-hover)] border border-[var(--color-border-default)] rounded-xl px-3.5 py-2.5 text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary-400)] transition-all duration-200 cursor-pointer appearance-none"
                                  style={{
                                    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3E%3C/svg%3E")`,
                                    backgroundPosition: 'right 8px center',
                                    backgroundRepeat: 'no-repeat',
                                    backgroundSize: '16px',
                                  }}
                                >
                                  <option value="">-- 选择模型 --</option>
                                  {model.availableModels.map(name => (
                                    <option key={name} value={name}>{name}</option>
                                  ))}
                                </select>
                                <button
                                  onClick={() => handleUpdateModel(model.id, { availableModels: undefined })}
                                  className="px-3 py-2 bg-[var(--color-surface-hover)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] rounded-xl transition-all duration-200 text-xs border border-[var(--color-border-default)] hover:border-[var(--color-border-default)]"
                                  title="切换为手动输入"
                                >
                                  <i className="fas fa-keyboard"></i>
                                </button>
                              </div>
                            ) : (
                              <input
                                type="text"
                                value={model.modelName}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  const apiCtx = model.modelContextMap?.[val];
                                  const spec = getKnownModelSpec(val);
                                  handleUpdateModel(model.id, {
                                    modelName: val,
                                    ...(apiCtx ? { contextWindow: apiCtx } : (spec ? { contextWindow: spec.contextWindow, maxTokens: spec.maxTokens } : {})),
                                  });
                                }}
                                className="w-full bg-[var(--color-surface-hover)] border border-[var(--color-border-default)] rounded-xl px-3.5 py-2.5 text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary-400)] focus:bg-[var(--color-surface-hover)] transition-all duration-200 font-mono text-[13px] placeholder:text-[var(--color-text-muted)]"
                                placeholder={
                                  model.provider === 'ollama' ? '例: qwen2.5:7b, llama3.2' :
                                  model.provider === 'deepseek' ? '例: deepseek-chat, deepseek-reasoner' :
                                  '例: gpt-4o, gpt-4o-mini'
                                }
                              />
                            )}
                            <p className="text-[10px] text-[var(--color-text-muted)] mt-1.5 flex items-center gap-1">
                              <i className="fas fa-lightbulb text-[8px]"></i>
                              {model.availableModels && model.availableModels.length > 0
                                ? '从下拉列表中选择或点击键盘图标切换手动输入'
                                : model.provider === 'ollama'
                                  ? '在终端运行 ollama list 查看已安装的模型'
                                  : '点击上方「获取模型」自动加载可用列表'}
                            </p>
                          </div>

                          {/* API Key */}
                          <div className="mt-3">
                            <label className="text-[11px] text-[var(--color-text-muted)] mb-1.5 flex items-center gap-1">
                              <i className="fas fa-key text-[9px]"></i>API Key
                            </label>
                            <input
                              type="password"
                              value={model.apiKey || ''}
                              onChange={(e) => {
                                console.log('[SettingsModal] API Key onChange:', { modelId: model.id, valueLength: e.target.value.length });
                                handleUpdateModel(model.id, { apiKey: e.target.value });
                              }}
                              className="w-full bg-[var(--color-surface-hover)] border border-[var(--color-border-default)] rounded-xl px-3.5 py-2.5 text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary-400)] focus:bg-[var(--color-surface-hover)] transition-all duration-200 placeholder:text-[var(--color-text-muted)]"
                              placeholder={info.apiKeyHint}
                            />
                            <p className="text-[10px] text-[var(--color-text-muted)] mt-1.5 flex items-center gap-1">
                              <i className="fas fa-shield-alt text-[8px]"></i>
                              {info.apiKeyHint} · 密钥仅本地存储，不会上传
                            </p>
                          </div>

                          {/* 高级配置切换 */}
                          <button
                            onClick={() => setShowAdvanced(prev => ({ ...prev, [model.id]: !prev[model.id] }))}
                            className="mt-4 flex items-center gap-2 text-[11px] text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-all duration-200 group"
                          >
                            <div className={`
                              w-5 h-5 rounded-md flex items-center justify-center
                              bg-[var(--color-surface-hover)] group-hover:bg-[var(--color-surface-hover)] transition-colors
                              ${isAdvancedShown ? 'rotate-90' : ''}
                            `}>
                              <i className="fas fa-chevron-right text-[8px] transition-transform duration-200"></i>
                            </div>
                            <span>高级配置</span>
                            {!isAdvancedShown && (
                              <span className="text-[9px] text-[var(--color-text-muted)]">Temperature · Max Tokens · System Prompt</span>
                            )}
                          </button>

                          {/* 高级配置面板 */}
                          {isAdvancedShown && (
                            <div className="mt-3 p-4 bg-[var(--color-surface-muted)] rounded-xl border border-[var(--color-border-default)] space-y-4 animate-fade-in-down">
                              {/* Temperature */}
                              <div>
                                <div className="flex items-center justify-between mb-2">
                                  <label className="text-xs text-[var(--color-text-tertiary)] flex items-center gap-1.5">
                                    <i className="fas fa-thermometer-half text-[10px] text-[var(--color-primary-400)]/70"></i>
                                    Temperature（创造性）
                                  </label>
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs text-[var(--color-primary-400)] font-mono font-semibold">
                                      {(model.temperature ?? 0.7).toFixed(2)}
                                    </span>
                                    <span className="text-[10px] text-[var(--color-text-muted)] px-1.5 py-0.5 bg-[var(--color-surface-muted)] rounded">
                                      {getTempLabel(model.temperature ?? 0.7)}
                                    </span>
                                  </div>
                                </div>
                                <input
                                  type="range"
                                  min="0"
                                  max="2"
                                  step="0.05"
                                  value={model.temperature ?? 0.7}
                                  onChange={(e) => handleUpdateModel(model.id, { temperature: parseFloat(e.target.value) })}
                                  className="w-full"
                                />
                                <div className="flex justify-between text-[9px] text-[var(--color-text-muted)] mt-1.5">
                                  <span>精确 0</span>
                                  <span>平衡 0.7</span>
                                  <span>创意 1.5</span>
                                  <span>天马行空 2.0</span>
                                </div>
                              </div>

                              {/* Max Tokens */}
                              <div>
                                <div className="flex items-center justify-between mb-2">
                                  <label className="text-xs text-[var(--color-text-tertiary)] flex items-center gap-1.5">
                                    <i className="fas fa-ruler text-[10px] text-[var(--color-primary-400)]/70"></i>
                                    Max Tokens（最大输出）
                                  </label>
                                  <span className="text-xs text-[var(--color-primary-400)] font-mono font-semibold">{model.maxTokens ?? 4096}</span>
                                </div>
                                <input
                                  type="range"
                                  min="256"
                                  max="32768"
                                  step="256"
                                  value={model.maxTokens ?? 4096}
                                  onChange={(e) => handleUpdateModel(model.id, { maxTokens: parseInt(e.target.value) })}
                                  className="w-full"
                                />
                                <div className="flex justify-between text-[9px] text-[var(--color-text-muted)] mt-1.5">
                                  <span>256</span>
                                  <span>4K</span>
                                  <span>16K</span>
                                  <span>32K</span>
                                </div>
                              </div>

                              {/* System Prompt */}
                              <div>
                                <label className="text-xs text-[var(--color-text-tertiary)] mb-2 flex items-center gap-1.5">
                                  <i className="fas fa-scroll text-[10px] text-[var(--color-primary-400)]/70"></i>
                                  System Prompt（系统提示词）
                                </label>
                                <textarea
                                  value={model.systemPrompt || ''}
                                  onChange={(e) => handleUpdateModel(model.id, { systemPrompt: e.target.value })}
                                  className="w-full bg-[var(--color-surface-hover)] border border-[var(--color-border-default)] rounded-xl px-3.5 py-2.5 text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary-400)] focus:bg-[var(--color-surface-hover)] transition-all duration-200 h-20 resize-none placeholder:text-[var(--color-text-muted)]"
                                  placeholder='例如：你是一位专业的小说创作助手，擅长构思精彩故事...'
                                />
                                <p className="text-[10px] text-[var(--color-text-muted)] mt-1.5 flex items-center gap-1">
                                  <i className="fas fa-info-circle text-[8px]"></i>
                                  将附加到每次 AI 调用的系统消息中
                                </p>
                              </div>

                              {/* 流式输出 */}
                              <div className="flex items-center justify-between pt-2">
                                <div>
                                  <label className="text-xs text-[var(--color-text-tertiary)] flex items-center gap-1.5">
                                    <i className="fas fa-stream text-[10px] text-[var(--color-primary-400)]/70"></i>
                                    流式输出
                                  </label>
                                  <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">启用后 AI 将逐字输出，体验更流畅</p>
                                </div>
                                <button
                                  onClick={() => handleUpdateModel(model.id, { supportsStreaming: !model.supportsStreaming })}
                                  className={`toggle-switch ${model.supportsStreaming !== false ? 'active' : ''}`}
                                >
                                  <div className={`track ${model.supportsStreaming !== false ? '' : ''}`} style={{ backgroundColor: model.supportsStreaming !== false ? 'var(--color-primary-500)' : undefined }}></div>
                                  <div className="thumb"></div>
                                </button>
                              </div>
                            </div>
                          )}

                          {/* 底部操作按钮 */}
                          <div className="mt-4 flex items-center justify-between pt-2 border-t" style={{ borderColor: 'var(--color-primary-100)' }}>
                            <button
                              onClick={() => handleDeleteModel(model.id)}
                              className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-error)] transition-colors duration-200 flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-[var(--color-error-bg)]"
                            >
                              <i className="fas fa-trash-alt text-[10px]"></i>
                              删除此配置
                            </button>
                            <div className="flex items-center gap-2">
                              {/* 连接测试按钮 */}
                              <button
                                onClick={() => handleTestConnection(model)}
                                disabled={isTesting || !model.modelName}
                                className="px-3.5 py-1.5 text-xs border border-[var(--color-border-default)] text-[var(--color-primary-300)]/80 rounded-xl hover:bg-[var(--color-primary-600)]/10 hover:border-[var(--color-primary-300)] transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
                              >
                                {isTesting ? (
                                  <><i className="fas fa-spinner fa-spin"></i>测试中</>
                                ) : (
                                  <><i className="fas fa-plug"></i>测试连接</>
                                )}
                              </button>
                              {/* 测试结果 */}
                              {connResult && (
                                <div className={`
                                  text-xs px-2.5 py-1.5 rounded-xl flex items-center gap-1.5 animate-fade-in
                                  ${connResult.success
                                    ? 'text-[var(--color-success)] bg-[var(--color-success-bg)] border border-[var(--color-success-border)]'
                                    : 'text-[var(--color-error)] bg-[var(--color-error-bg)] border border-[var(--color-error-border)]'
                                  }
                                `}>
                                  <i className={`fas ${connResult.success ? 'fa-check-circle' : 'fa-exclamation-circle'} text-[10px]`}></i>
                                  {connResult.message}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* 空状态 */}
              {models.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 animate-fade-in">
                  <div className="w-16 h-16 rounded-2xl bg-[var(--color-surface-hover)] flex items-center justify-center mb-4 border border-[var(--color-border-default)]">
                    <i className="fas fa-robot text-2xl text-[var(--color-text-muted)]"></i>
                  </div>
                  <p className="text-[var(--color-text-tertiary)] text-sm font-medium">还没有配置任何模型</p>
                  <p className="text-[var(--color-text-muted)] text-xs mt-2">点击上方按钮或快速添加预设开始配置</p>
                  <div className="flex gap-2 mt-6">
                    {QUICK_ADD_PROVIDERS.map(item => (
                      <button
                        key={item.provider}
                        onClick={() => handleQuickAddProvider(item.provider)}
                        className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-[var(--color-primary-500)]/30 to-[var(--color-primary-600)]/20 text-[var(--color-primary-300)] rounded-xl hover:from-[var(--color-primary-500)]/50 hover:to-[var(--color-primary-600)]/30 transition-all duration-200 text-sm font-medium border border-[var(--color-primary-300)] hover:border-[var(--color-primary-400)]"
                      >
                        <i className={`fas ${item.icon} ${item.color} text-xs`}></i>
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 提示词库标签 */}
          {activeTab === 'promptLibrary' && (
            <div className="animate-fade-in">
              <div className="mb-5">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>管理 AI 生成时使用的提示词模板</p>
                  <button
                    onClick={handleResetAllPrompts}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all hover:bg-white/5"
                    style={{ color: 'var(--color-text-muted)' }}
                    title="恢复所有模板为默认值"
                  >
                    <i className="fas fa-rotate-left text-[9px]"></i>
                    恢复默认
                  </button>
                </div>
                <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                  模板中的 <code className="text-[var(--color-primary-400)]/70 bg-[var(--color-primary-600)]/20 px-1 rounded text-[10px]">{`{变量}`}</code> 将在调用时自动替换为实际内容
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {prompts.map((prompt, index) => {
                  const isModified = DEFAULT_PROMPTS.some(
                    dp => dp.id === prompt.id && (dp.content !== prompt.content || dp.name !== prompt.name)
                  );
                  return (
                  <div
                    key={prompt.id}
                    className="group relative p-4 rounded-xl transition-all duration-300"
                    style={{
                      backgroundColor: 'var(--color-surface-card)',
                      border: '1px solid var(--color-border-default)',
                      animationDelay: `${index * 50}ms`,
                    }}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <div className="w-6 h-6 rounded-lg flex items-center justify-center text-[10px]"
                          style={{ backgroundColor: 'var(--color-surface-hover)' }}>
                          <i className={`fas ${
                            prompt.category === 'inspiration' ? 'fa-lightbulb' :
                            prompt.category === 'character' ? 'fa-user' :
                            prompt.category === 'outline' ? 'fa-sitemap' :
                            prompt.category === 'chapter' ? 'fa-list' :
                            prompt.category === 'writing' ? 'fa-pen' :
                            prompt.category === 'world' ? 'fa-globe' :
                            prompt.category === 'timeline' ? 'fa-clock' :
                            prompt.category === 'memory' ? 'fa-brain' :
                            prompt.category === 'analysis' ? 'fa-chart-simple' :
                            prompt.category === 'edit' ? 'fa-scroll' :
                            prompt.category === 'tool-format' ? 'fa-wrench' :
                            prompt.category === 'workflow' ? 'fa-diagram-project' :
                            prompt.category === 'file-rules' ? 'fa-file-lines' :
                            prompt.category === 'canon-system' ? 'fa-book' :
                            prompt.category === 'compress' ? 'fa-compress' :
                            prompt.category === 'agent' ? 'fa-robot' :
                            prompt.category === 'format' ? 'fa-cube' :
                            prompt.category === 'rule' ? 'fa-scale-balanced' :
                            prompt.category === 'foundation' ? 'fa-layer-group' :
                            'fa-scroll'
                          }`} style={{ color: 'var(--color-text-tertiary)' }}></i>
                        </div>
                        <span className="font-medium text-sm truncate" style={{ color: 'var(--color-text-primary)' }}>{prompt.name}</span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {isModified && (
                          <button
                            onClick={() => handleResetSinglePrompt(prompt.id)}
                            className="p-1.5 rounded-lg transition-all hover:bg-white/10"
                            style={{ color: 'var(--color-text-muted)' }}
                            title="恢复此模板为默认值"
                          >
                            <i className="fas fa-undo text-[9px]"></i>
                          </button>
                        )}
                        <button
                          onClick={() => handleOpenEditPrompt(prompt)}
                          className="p-1.5 rounded-lg transition-all hover:bg-white/10"
                          style={{ color: 'var(--color-text-muted)' }}
                          title="编辑模板"
                        >
                          <i className="fas fa-pen text-[9px]"></i>
                        </button>
                      </div>
                    </div>
                    <p
                      className="text-xs leading-relaxed line-clamp-3 font-mono rounded-lg p-2.5 cursor-pointer hover:opacity-80 transition-opacity"
                      style={{
                        color: 'var(--color-text-tertiary)',
                        backgroundColor: 'var(--color-surface-hover)',
                        border: '1px solid var(--color-border-default)',
                      }}
                      onClick={() => handleOpenEditPrompt(prompt)}
                      title="点击编辑"
                    >
                      {prompt.content.length > 120 ? prompt.content.slice(0, 120) + '...' : prompt.content}
                    </p>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-[9px] px-2 py-0.5 rounded-full capitalize"
                        style={{
                          backgroundColor: 'var(--color-surface-hover)',
                          color: 'var(--color-text-tertiary)',
                        }}
                      >
                        {CATEGORY_LABELS[prompt.category] || prompt.category}
                      </span>
                      {isModified && (
                        <span className="text-[9px]" style={{ color: 'var(--color-accent-amber)' }}>
                          <i className="fas fa-pen-to-square mr-0.5"></i>已修改
                        </span>
                      )}
                    </div>
                  </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 系统信息标签（参考项目1的 system tab） */}
          {activeTab === 'system' && (
            <div className="animate-fade-in">
              <div className="mb-5">
                <p className="text-sm text-[var(--color-text-tertiary)]">应用信息与使用指南</p>
                <p className="text-xs text-[var(--color-text-muted)] mt-1">了解当前应用的版本、技术栈和配置信息</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* 应用信息 */}
                <div className="p-5 rounded-xl border" style={{ backgroundColor: 'var(--color-surface-muted)', borderColor: 'var(--color-primary-100)' }}>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center border"
                      style={{ background: 'linear-gradient(135deg, var(--color-primary-100), var(--color-primary-50))', borderColor: 'var(--color-primary-200)' }}>
                      <i className="fas fa-info-circle text-sm" style={{ color: 'var(--color-primary-400)' }}></i>
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>应用信息</h3>
                      <p className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
                        墨渊灵笔 v{CHANGELOG[0]?.version || '0.0.1'} · wonderful艾晨
                      </p>
                    </div>
                  </div>
                  <div className="space-y-2.5">
                    <div className="flex justify-between items-center">
                      <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>版本</span>
                      <span className="text-[11px] font-mono font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                        v{CHANGELOG[0]?.version || '0.0.1'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>作者</span>
                      <span className="text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>wonderful艾晨</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>技术栈</span>
                      <span className="text-[11px] font-mono" style={{ color: 'var(--color-text-secondary)' }}>React + TypeScript + Electron</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>配置模型</span>
                      <span className="text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>{models.length} 个</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>提示词模板</span>
                      <span className="text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>{prompts.length} 个</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>当前使用</span>
                      <span className="text-[11px]" style={{ color: 'var(--color-primary-300)' }}>
                        {models.find(m => m.id === activeModelId)?.name || '未选择'}
                      </span>
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t" style={{ borderColor: 'var(--color-primary-100)' }}>
                    <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                      图标由 <a href="https://fontawesome.com" target="_blank" rel="noopener noreferrer" className="hover:underline" style={{ color: 'var(--color-primary-300)' }}>Font Awesome</a> 提供
                    </p>
                  </div>
                </div>

                {/* 使用指南 */}
                <div className="p-5 bg-[var(--color-surface-elevated)] rounded-xl border border-[var(--color-border-default)]">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-600/30 to-orange-600/20 flex items-center justify-center border border-amber-500/20">
                      <i className="fas fa-book-open text-amber-400 text-sm"></i>
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">快速上手</h3>
                      <p className="text-[10px] text-[var(--color-text-muted)]">开始使用墨渊灵笔</p>
                    </div>
                  </div>
                  <ol className="space-y-2.5">
                    {[
                      { step: '1', title: '配置 AI 模型', desc: '在「模型配置」中添加并设置你的 AI 模型' },
                      { step: '2', title: '创建新作品', desc: '在侧边栏点击「+」创建一部新小说' },
                      { step: '3', title: '灵感构思', desc: '输入基础灵感，AI 帮你发散生成标签和方案' },
                      { step: '4', title: '世界构建', desc: '设定小说的世界观、地点、势力和规则' },
                      { step: '5', title: '角色创作', desc: '创建和管理小说中的角色' },
                      { step: '6', title: '开始写作', desc: '生成大纲、章节规划，开始正式创作' },
                    ].map(item => (
                      <li key={item.step} className="flex items-start gap-3">
                        <span className="w-5 h-5 rounded-lg bg-[var(--color-primary-600)]/20 text-[var(--color-primary-400)] text-[9px] font-bold flex items-center justify-center shrink-0 mt-0.5 border border-[var(--color-primary-300)]">
                          {item.step}
                        </span>
                        <div>
                          <p className="text-xs text-[var(--color-text-secondary)] font-medium">{item.title}</p>
                          <p className="text-[10px] text-[var(--color-text-muted)]">{item.desc}</p>
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>

                {/* 数据管理 */}
                <div className="p-5 bg-[var(--color-surface-elevated)] rounded-xl border border-[var(--color-border-default)]">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-600/30 to-green-600/20 flex items-center justify-center border border-emerald-500/20">
                      <i className="fas fa-database text-emerald-400 text-sm"></i>
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">数据管理</h3>
                      <p className="text-[10px] text-[var(--color-text-muted)]">数据存储与导出</p>
                    </div>
                  </div>
                  <div className="space-y-2.5">
                    <div className="flex justify-between items-center">
                      <span className="text-[11px] text-[var(--color-text-muted)]">存储方式</span>
                      <span className="text-[11px] text-[var(--color-text-secondary)]">本地 localStorage</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[11px] text-[var(--color-text-muted)]">数据持久化</span>
                      <span className="text-[11px] text-[var(--color-text-secondary)]">自动保存</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[11px] text-[var(--color-text-muted)]">隐私</span>
                      <span className="text-[11px] text-[var(--color-text-secondary)]">数据完全本地存储</span>
                    </div>
                    <div className="mt-3 pt-3 border-t border-[var(--color-border-default)]">
                      {onFactoryReset && (
                        <button
                          onClick={() => {
                            setPendingConfirm({
                              title: '恢复出厂设置',
                              message: '确定要恢复出厂设置吗？这将删除所有数据，包括API Key和所有作品内容，此操作不可撤销。',
                              variant: 'danger',
                              onConfirm: () => {
                                setPendingConfirm(null);
                                if (onFactoryReset) onFactoryReset();
                              },
                            });
                          }}
                          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-[10px] text-[var(--color-error)] hover:text-[var(--color-error)] hover:bg-[var(--color-error-bg)] rounded-lg transition-all duration-200 border border-[var(--color-error-border)] hover:border-[var(--color-error-border)]"
                        >
                          <i className="fas fa-exclamation-triangle text-[9px]"></i>
                          恢复出厂设置 - 删除所有数据
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* 提供商概览 */}
                <div className="p-5 bg-[var(--color-surface-elevated)] rounded-xl border border-[var(--color-border-default)]">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600/30 to-cyan-600/20 flex items-center justify-center border border-blue-500/20">
                      <i className="fas fa-cloud text-blue-400 text-sm"></i>
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">支持的提供商</h3>
                      <p className="text-[10px] text-[var(--color-text-muted)]">当前支持的 AI 模型服务商</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {Object.entries(PROVIDER_INFO).map(([key, info]) => (
                      <div key={key} className="flex items-center gap-2.5 p-2 bg-[var(--color-surface-muted)] rounded-lg border border-[var(--color-border-default)]">
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center bg-gradient-to-br ${info.gradient} border border-[var(--color-border-default)] shrink-0`}>
                          <i className={`fas ${info.icon} ${info.color} text-[9px]`}></i>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] text-[var(--color-text-secondary)] font-medium">{info.label}</p>
                          <p className="text-[9px] text-[var(--color-text-muted)] truncate">{info.description}</p>
                        </div>
                        <div className="flex gap-1.5 shrink-0">
                          <a
                            href={info.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-6 h-6 rounded-md bg-[var(--color-surface-hover)] flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-primary-400)] transition-colors"
                            title="官网"
                          >
                            <i className="fas fa-globe text-[9px]"></i>
                          </a>
                          <a
                            href={info.apiApplyUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-6 h-6 rounded-md bg-[var(--color-surface-hover)] flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-primary-400)] transition-colors"
                            title="获取 API Key"
                          >
                            <i className="fas fa-key text-[9px]"></i>
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 更新日志入口 */}
                <button
                  onClick={() => setShowChangelog(true)}
                  className="mt-4 w-full flex items-center justify-center gap-2 p-3 rounded-xl transition-all hover:scale-[1.01] active:scale-[0.99]"
                  style={{
                    background: 'linear-gradient(135deg, var(--color-primary-100), transparent)',
                    border: '1px dashed var(--color-primary-200)',
                    color: 'var(--color-primary-300)',
                  }}
                >
                  <i className="fas fa-scroll text-xs"></i>
                  <span className="text-xs font-medium">查看更新日志</span>
                  <span className="text-[9px] opacity-60">v{CHANGELOG[0]?.version}</span>
                  <i className="fas fa-chevron-right text-[8px] opacity-50"></i>
                </button>
              </div>
            </div>
          )}

          {/* 主题外观标签 */}
          {activeTab === 'theme' && (
            <div className="animate-fade-in">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[var(--color-primary-500)]/30 to-[var(--color-primary-600)]/20 flex items-center justify-center border border-[var(--color-primary-300)]">
                  <i className="fas fa-palette text-[var(--color-primary-400)] text-sm"></i>
                </div>
                <div>
                  <h2 className="text-base font-semibold text-[var(--color-text-primary)]">主题外观</h2>
                  <p className="text-xs text-[var(--color-text-muted)] mt-0.5">选择你喜欢的应用配色方案</p>
                </div>
              </div>

              {/* 当前主题预览 */}
              <div className="p-5 bg-[var(--color-surface-elevated)] rounded-xl border border-[var(--color-border-default)] mb-5">
                <div className="flex items-center gap-3 mb-4">
                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${themeInfo.gradient} flex items-center justify-center border border-[var(--color-border-default)]`}>
                    <i className={`fas ${themeInfo.icon} ${themeInfo.color} text-sm`}></i>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">当前主题：{themeInfo.label}</h3>
                    <p className="text-[10px] text-[var(--color-text-muted)]">{themeInfo.description}</p>
                  </div>
                </div>
              </div>

              {/* 主题选择网格 */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {THEME_LIST.map((t) => {
                  const isActive = theme === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => setTheme(t.id)}
                      className={`
                        relative p-4 rounded-xl text-left transition-all duration-300
                        ${isActive
                          ? 'bg-[var(--color-surface-hover)] border-2 shadow-lg scale-[1.02]'
                          : 'bg-[var(--color-surface-elevated)] border hover:bg-[var(--color-surface-hover)] hover:scale-[1.01]'
                        }
                      `}
                      style={{
                        borderColor: isActive
                          ? `var(--color-primary-400)`
                          : 'var(--color-border-default)',
                        boxShadow: isActive ? 'var(--shadow-glow-purple)' : 'none',
                      }}
                    >
                      {/* 选中指示器 */}
                      {isActive && (
                        <div className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center"
                          style={{ background: 'var(--color-primary-500)' }}>
                          <i className="fas fa-check text-white text-[8px]"></i>
                        </div>
                      )}

                      {/* 主题色预览条 — 与 THEME_LIST 顺序严格一致 */}
                      <div className="flex gap-1 mb-3">
                        {[
                          ['#f87171', '#fca5a5', '#b91c1c'],   // 0 cinnabar 朱砂红
                          ['#fb7185', '#fda4af', '#be123c'],   // 1 rose 丹霞绯
                          ['#fbbf24', '#fde68a', '#b45309'],   // 2 amber 暖阳金
                          ['#d4a574', '#fef3c7', '#b8845a'],   // 3 paper 宣纸白
                          ['#d1ae90', '#efe0cc', '#8c6a48'],   // 4 brown 檀木褐
                          ['#34d399', '#a7f3d0', '#047857'],   // 5 emerald 灵韵翠
                          ['#4ade80', '#bbf7d0', '#15803d'],   // 6 bamboo 竹青
                          ['#6ee7b7', '#d1fae5', '#065f46'],   // 7 jade 墨玉黑
                          ['#60a5fa', '#bfdbfe', '#1d4ed8'],   // 8 blue 星河蓝
                          ['#818cf8', '#c7d2fe', '#4338ca'],   // 9 indigo 黛蓝
                          ['#a78bfa', '#ede9fe', '#7c3aed'],   // 10 purple 墨渊紫
                          ['#cbd5e1', '#f1f5f9', '#475569'],   // 11 gray 霜白灰
                        ][THEME_LIST.findIndex(item => item.id === t.id)].map((color, ci) => (
                          <div
                            key={ci}
                            className="h-1.5 flex-1 rounded-full"
                            style={{ background: color }}
                          />
                        ))}
                      </div>

                      {/* 主题图标与名称 */}
                      <div className="flex items-center gap-2.5">
                        <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${t.gradient} flex items-center justify-center border border-[var(--color-border-default)] shrink-0`}>
                          <i className={`fas ${t.icon} ${t.color} text-[10px]`}></i>
                        </div>
                        <div className="min-w-0">
                          <p className={`text-xs font-semibold ${isActive ? 'text-[var(--color-text-primary)]' : 'text-[var(--color-text-secondary)]'}`}>
                            {t.label}
                          </p>
                          <p className="text-[9px] text-[var(--color-text-muted)] truncate">{t.description}</p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* 缩放控制面板 */}
              <div className="mt-6 p-5 bg-[var(--color-surface-elevated)] rounded-xl border border-[var(--color-border-default)]">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-600/30 to-teal-600/20 flex items-center justify-center border border-cyan-500/20">
                    <i className="fas fa-expand text-cyan-400 text-sm"></i>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">UI 缩放</h3>
                    <p className="text-[10px] text-[var(--color-text-muted)]">调整界面整体大小 · 也可按 Ctrl+滚轮 快速缩放</p>
                  </div>
                </div>

                {/* 预设快捷按钮 */}
                <div className="flex flex-wrap gap-2 mb-4">
                  {ZOOM_PRESETS.map(p => (
                    <button key={p.value}
                      onClick={() => setZoom(p.value)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        Math.abs(zoom - p.value) < 0.02
                          ? 'bg-cyan-600/30 text-cyan-200 border border-cyan-500/40 scale-105'
                          : 'bg-[var(--color-surface-hover)] text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)] border border-transparent'
                      }`}>
                      {p.label}
                    </button>
                  ))}
                  <button onClick={zoomReset}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] bg-[var(--color-surface-muted)] hover:bg-[var(--color-surface-hover)]/50 transition-all border border-[var(--color-border-default)]"
                    title="重置为 100%">
                    <i className="fas fa-undo mr-1"></i>重置
                  </button>
                </div>

                {/* 滑块 */}
                <div className="flex items-center gap-4">
                  <span className="text-xs text-[var(--color-text-muted)] shrink-0 w-10 text-right">50%</span>
                  <input
                    type="range"
                    min={50}
                    max={200}
                    value={zoomPercent}
                    onChange={(e) => setZoom(parseInt(e.target.value) / 100)}
                    className="flex-1"
                  />
                  <span className="text-xs text-[var(--color-text-muted)] shrink-0 w-10">200%</span>
                  <span className="text-sm font-bold tabular-nums min-w-[3rem] text-center"
                    style={{ color: zoomPercent === 100 ? 'var(--color-text-muted)' : 'var(--color-primary-300)' }}>
                    {zoomPercent}%
                  </span>
                </div>

                <div className="mt-2 flex items-center gap-4 text-[10px] text-[var(--color-text-muted)]">
                  <span><i className="fas fa-mouse mr-1"></i>Ctrl+滚轮 快速缩放</span>
                  <span><i className="fas fa-keyboard mr-1"></i>Ctrl + / Ctrl - 快捷键</span>
                </div>
              </div>

              {/* 主题效果预览 */}
              <div className="mt-6 p-5 bg-[var(--color-surface-elevated)] rounded-xl border border-[var(--color-border-default)]">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-600/30 to-orange-600/20 flex items-center justify-center border border-amber-500/20">
                    <i className="fas fa-eye text-amber-400 text-sm"></i>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">效果预览</h3>
                    <p className="text-[10px] text-[var(--color-text-muted)]">切换主题后，以下元素会同步变化</p>
                  </div>
                </div>
                <div className="space-y-2.5">
                  <div className="flex items-center gap-3 p-2.5 bg-[var(--color-surface-muted)] rounded-lg border border-[var(--color-border-default)]">
                    <div className="w-6 h-6 rounded-md" style={{ background: 'var(--color-primary-500)' }}></div>
                    <div className="w-6 h-6 rounded-md" style={{ background: 'var(--color-primary-400)' }}></div>
                    <div className="w-6 h-6 rounded-md" style={{ background: 'var(--color-primary-300)' }}></div>
                    <span className="text-[10px] text-[var(--color-text-muted)] ml-1">主色系</span>
                  </div>
                  <div className="flex items-center gap-3 p-2.5 bg-[var(--color-surface-muted)] rounded-lg border border-[var(--color-border-default)]">
                    <div className="w-6 h-6 rounded-md border" style={{ borderColor: 'var(--color-border-default)', background: 'transparent' }}></div>
                    <div className="w-6 h-6 rounded-md border" style={{ borderColor: 'var(--color-border-hover)', background: 'transparent' }}></div>
                    <div className="w-6 h-6 rounded-md border" style={{ borderColor: 'var(--color-border-active)', background: 'transparent' }}></div>
                    <span className="text-[10px] text-[var(--color-text-muted)] ml-1">边框色系</span>
                  </div>
                  <div className="flex items-center gap-3 p-2.5 bg-[var(--color-surface-muted)] rounded-lg border border-[var(--color-border-default)]">
                    <div className="w-6 h-6 rounded-md flex items-center justify-center" style={{ boxShadow: 'var(--shadow-glow-purple)', background: 'var(--color-primary-50)' }}>
                      <i className="fas fa-magic text-[8px]" style={{ color: 'var(--color-primary-400)' }}></i>
                    </div>
                    <span className="text-[10px] text-[var(--color-text-muted)]">光晕效果 & 滚动条配色</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

        {/* 底部信息栏 */}
        <div className={`relative flex justify-between items-center border-t border-[var(--color-border-default)] shrink-0 bg-[var(--color-surface-overlay)] ${isMobile ? 'px-3 py-2' : 'px-6 py-4'}`}>
          {!isMobile && (
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-[var(--color-text-muted)]">
              <i className="fas fa-robot mr-1"></i>
              {models.length} 个模型
            </span>
            <span className="w-1 h-1 rounded-full bg-[var(--color-surface-muted)]"></span>
            <span className="text-[10px] text-[var(--color-text-muted)]">
              当前使用:
              <span className="text-[var(--color-primary-400)]/70 ml-1">
                {models.find(m => m.id === activeModelId)?.name || '未选择'}
              </span>
            </span>
          </div>
          )}
          <button
            onClick={handleClose}
            className={`bg-gradient-to-r from-[var(--color-primary-500)] to-[var(--color-primary-600)] text-white rounded-xl hover:from-[var(--color-primary-600)] hover:to-[var(--color-primary-600)] transition-all duration-200 font-medium shadow-lg shadow-[var(--color-primary-500)]/25 hover:shadow-[var(--color-primary-500)]/40 active:scale-[0.98] ${isMobile ? 'px-4 py-2 text-sm w-full' : 'px-6 py-2 text-sm'}`}
          >
            完成
          </button>
        </div>
      </div>

      {/* 更新日志弹窗 */}
      {showChangelog && (
        <ChangelogModal onClose={() => setShowChangelog(false)} />
      )}

      {/* 编辑提示词弹窗 */}
      {editingPrompt && createPortal(
        <div
          style={{
            position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 10000,
          }}
          onClick={handleCloseEditPrompt}
        >
          <div
            className="rounded-2xl shadow-2xl border flex flex-col overflow-hidden animate-fade-in-scale"
            style={{
              width: 'min(90vw, 720px)', maxHeight: '85vh',
              backgroundColor: 'var(--color-surface-overlay)',
              borderColor: 'var(--color-border-default)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* 头部 */}
            <div className="flex items-center justify-between px-5 py-4 shrink-0"
              style={{ borderBottom: '1px solid var(--color-border-default)' }}>
              <div className="flex items-center gap-2.5">
                <i className="fas fa-scroll text-sm" style={{ color: 'var(--color-primary-400)' }}></i>
                <h3 className="text-base font-bold" style={{ color: 'var(--color-text-primary)' }}>编辑提示词模板</h3>
              </div>
              <button onClick={handleCloseEditPrompt}
                className="p-1.5 rounded-lg hover:bg-white/10 transition-all"
                style={{ color: 'var(--color-text-muted)' }}>
                <i className="fas fa-xmark text-sm"></i>
              </button>
            </div>

            {/* 编辑区 */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {/* 模板名称 */}
              <div>
                <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--color-text-secondary)' }}>
                  <i className="fas fa-tag mr-1.5" style={{ color: 'var(--color-primary-400)' }}></i>
                  模板名称
                </label>
                <input
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl text-sm focus:outline-none transition-all"
                  style={{
                    color: 'var(--color-text-primary)',
                    backgroundColor: 'var(--color-surface-hover)',
                    border: '1px solid var(--color-border-default)',
                  }}
                  placeholder="模板名称"
                />
              </div>

              {/* 分类 */}
              <div>
                <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--color-text-secondary)' }}>
                  <i className="fas fa-folder mr-1.5" style={{ color: 'var(--color-primary-400)' }}></i>
                  分类
                </label>
                <div className="text-xs px-4 py-2.5 rounded-xl" style={{
                  color: 'var(--color-text-tertiary)',
                  backgroundColor: 'var(--color-surface-hover)',
                  border: '1px solid var(--color-border-default)',
                }}>
                  {CATEGORY_LABELS[editingPrompt.category] || editingPrompt.category}
                  <span className="ml-2 text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                    · ID: {editingPrompt.id}
                  </span>
                </div>
              </div>

              {/* 模板内容编辑 */}
              <div className="flex-1">
                <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--color-text-secondary)' }}>
                  <i className="fas fa-code mr-1.5" style={{ color: 'var(--color-primary-400)' }}></i>
                  提示词内容
                </label>
                <div className="flex flex-wrap items-center gap-1.5 mb-2">
                  <span className="text-[9px]" style={{ color: 'var(--color-text-muted)' }}>
                    可用变量:
                  </span>
                  {[
                    { v: '{title}', desc: '小说标题' },
                    { v: '{intro}', desc: '小说简介' },
                    { v: '{content}', desc: '当前正文内容' },
                    { v: '{characters}', desc: '角色设定清单' },
                    { v: '{summary}', desc: '章节细纲内容' },
                    { v: '{outline}', desc: '故事大纲' },
                    { v: '{chapter_title}', desc: '当前章节标题' },
                    { v: '{locations}', desc: '故事地点清单' },
                    { v: '{tags}', desc: '选定标签列表' },
                    { v: '{count}', desc: '生成数量' },
                    { v: '{inspiration}', desc: '用户灵感描述' },
                  ].map(({ v, desc }) => (
                    <code key={v}
                      className="text-[9px] px-1.5 py-0.5 rounded cursor-pointer hover:opacity-80 transition-opacity"
                      style={{
                        color: 'var(--color-primary-300)',
                        backgroundColor: 'var(--color-primary-100)',
                      }}
                      onClick={() => setEditingContent(prev => prev + v)}
                      title={desc + ' — 点击插入'}
                    >
                      {v}
                    </code>
                  ))}
                </div>
                <textarea
                  value={editingContent}
                  onChange={(e) => setEditingContent(e.target.value)}
                  className="w-full rounded-xl p-4 text-sm leading-relaxed resize-none focus:outline-none transition-all font-mono"
                  style={{
                    minHeight: 320,
                    color: 'var(--color-text-primary)',
                    backgroundColor: 'var(--color-surface-hover)',
                    border: '1px solid var(--color-border-default)',
                  }}
                  placeholder="在此编辑提示词模板内容..."
                />
              </div>
            </div>

            {/* 底部按钮 */}
            <div className="flex items-center justify-between px-5 py-4 shrink-0"
              style={{ borderTop: '1px solid var(--color-border-default)' }}>
              <button
                onClick={() => {
                  setPendingConfirm({
                    title: '放弃编辑',
                    message: '确定放弃当前编辑内容？',
                    variant: 'warning',
                    onConfirm: () => {
                      setPendingConfirm(null);
                      handleCloseEditPrompt();
                    },
                  });
                }}
                className="px-4 py-2 rounded-xl text-xs transition-all"
                style={{ color: 'var(--color-text-muted)' }}
              >
                取消
              </button>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const dp = DEFAULT_PROMPTS.find(p => p.id === editingPrompt.id);
                    if (dp) {
                      setEditingName(dp.name);
                      setEditingContent(dp.content);
                    } else {
                      removeUserOverride(editingPrompt.id);
                      setEditingContent(getPromptContent(editingPrompt.id));
                    }
                  }}
                  className="px-4 py-2 rounded-xl text-xs transition-all"
                  style={{ color: 'var(--color-text-muted)' }}
                >
                  <i className="fas fa-undo mr-1"></i>恢复默认
                </button>
                <button
                  onClick={handleSaveEditPrompt}
                  className="px-5 py-2 rounded-xl text-xs font-medium text-white transition-all hover:scale-105"
                  style={{ background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-primary-600))' }}
                >
                  <i className="fas fa-check mr-1.5"></i>保存修改
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {pendingConfirm && (
        <ConfirmModal
          title={pendingConfirm.title}
          message={pendingConfirm.message}
          variant={pendingConfirm.variant}
          confirmText="确认"
          onConfirm={pendingConfirm.onConfirm}
          onCancel={() => setPendingConfirm(null)}
        />
      )}
    </div>
  );
};

export default SettingsModal;
