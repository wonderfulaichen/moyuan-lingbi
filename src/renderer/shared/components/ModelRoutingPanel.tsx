import React, { useState, useEffect } from 'react';
import { ModelConfig } from '../../../shared/types';
import { PROVIDER_INFO } from '../../../shared/constants';
import { modelRouter, TaskType, TASK_TYPES } from '../../shared/services/ModelRouter';
import { localModelService } from '../../shared/services/LocalModelService';

interface ModelRoutingPanelProps {
  models: ModelConfig[];
  onClose?: () => void;
}

type LocalModelStatus = 'unconfigured' | 'untested' | 'testing' | 'ready' | 'error';
interface LocalModelTestResult {
  status: LocalModelStatus;
  message: string;
  testedAt?: number;
  contextWindow?: number;
}

const tagStyles: Record<string, { color: string; bg: string; label: string }> = {
  'privacy-first': { color: 'var(--color-accent-emerald)', bg: 'rgba(52,211,153,0.1)', label: '🔒 隐私优先' },
  'cost-free': { color: 'var(--color-accent-amber)', bg: 'rgba(245,158,11,0.1)', label: '💰 零成本' },
  'offline': { color: 'var(--color-accent-cyan)', bg: 'rgba(34,211,238,0.1)', label: '📴 离线可用' },
  'knowledge-base': { color: 'var(--color-primary-400)', bg: 'rgba(168,85,247,0.1)', label: '📚 知识库' },
  'customizable': { color: 'var(--color-accent-rose)', bg: 'rgba(236,72,153,0.1)', label: '⚙️ 可定制' },
};

// 本地模型测试结果缓存 key
const LOCAL_MODEL_TEST_CACHE_KEY = 'moyuan-local-model-test-results';

function loadTestCache(): Record<string, LocalModelTestResult> {
  try {
    const cached = localStorage.getItem(LOCAL_MODEL_TEST_CACHE_KEY);
    return cached ? JSON.parse(cached) : {};
  } catch {
    return {};
  }
}

function saveTestCache(cache: Record<string, LocalModelTestResult>): void {
  try {
    localStorage.setItem(LOCAL_MODEL_TEST_CACHE_KEY, JSON.stringify(cache));
  } catch {}
}

const ModelRoutingPanel: React.FC<ModelRoutingPanelProps> = ({ models, onClose }) => {
  const [config, setConfig] = useState<Record<string, string>>({});
  const [activeSection, setActiveSection] = useState<'tasks' | 'agents'>('tasks');
  const [isSaving, setIsSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showLocalGuide, setShowLocalGuide] = useState(false);

  // 本地模型测试状态管理
  const [testResults, setTestResults] = useState<Record<string, LocalModelTestResult>>(() => loadTestCache());
  const [isTestingAll, setIsTestingAll] = useState(false);

  // 检测是否有本地模型可用
  const localModels = models.filter(m => m.provider === 'local');
  const hasLocalModels = localModels.length > 0;

  // 计算整体本地模型状态
  const getOverallLocalStatus = (): { status: LocalModelStatus; readyCount: number; totalCount: number } => {
    if (!hasLocalModels) return { status: 'unconfigured', readyCount: 0, totalCount: 0 };
    if (localModels.length === 0) return { status: 'unconfigured', readyCount: 0, totalCount: 0 };

    const results = localModels.map(m => testResults[m.id]);
    const readyCount = results.filter(r => r?.status === 'ready').length;
    const errorCount = results.filter(r => r?.status === 'error').length;
    const testingCount = results.filter(r => r?.status === 'testing').length;

    if (testingCount > 0) return { status: 'testing', readyCount, totalCount: localModels.length };
    if (readyCount === localModels.length) return { status: 'ready', readyCount, totalCount: localModels.length };
    if (errorCount === localModels.length && results.every(r => r)) return { status: 'error', readyCount, totalCount: localModels.length };
    return { status: 'untested', readyCount, totalCount: localModels.length };
  };

  const overallStatus = getOverallLocalStatus();

  useEffect(() => {
    setConfig(modelRouter.getConfig());
    if (!hasLocalModels) {
      const hasSeenGuide = localStorage.getItem('moyuan-local-model-guide-seen');
      if (!hasSeenGuide) {
        setShowLocalGuide(true);
      }
    }
  }, []);

  // ====== 核心方法：测试单个本地模型连接 ======
  const testSingleModel = async (model: ModelConfig): Promise<LocalModelTestResult> => {
    setTestResults(prev => ({
      ...prev,
      [model.id]: { status: 'testing', message: '正在初始化模型并测试连接...' },
    }));

    try {
      const result = await localModelService.testConnection(model);
      const testResult: LocalModelTestResult = {
        status: result.success ? 'ready' : 'error',
        message: result.message,
        testedAt: Date.now(),
        contextWindow: result.contextWindow,
      };

      setTestResults(prev => {
        const newCache = { ...prev, [model.id]: testResult };
        saveTestCache(newCache);
        return newCache;
      });

      return testResult;
    } catch (err: any) {
      const errorResult: LocalModelTestResult = {
        status: 'error',
        message: err?.message || '测试过程中发生未知错误',
        testedAt: Date.now(),
      };
      setTestResults(prev => {
        const newCache = { ...prev, [model.id]: errorResult };
        saveTestCache(newCache);
        return newCache;
      });
      return errorResult;
    }
  };

  // ====== 一键测试所有本地模型 ======
  const handleTestAllLocalModels = async () => {
    if (localModels.length === 0) return;
    setIsTestingAll(true);

    for (const model of localModels) {
      await testSingleModel(model);
      // 短暂延迟，避免同时加载多个模型导致内存不足
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    setIsTestingAll(false);
  };

  const handleModelChange = async (taskType: TaskType, modelId: string) => {
    const newConfig = { ...config, [taskType]: modelId };
    setConfig(newConfig);
    setIsSaving(true);

    try {
      await modelRouter.setModelForTask(taskType, modelId);
      setTimeout(() => {
        setIsSaving(false);
        setShowSuccess(true);
        setTimeout(() => setShowSuccess(false), 1500);
      }, 300);
    } catch (e) {
      console.error('保存失败:', e);
      setIsSaving(false);
    }
  };

  const handleResetToAuto = async (taskType: TaskType) => {
    const newConfig = { ...config, [taskType]: 'auto' };
    setConfig(newConfig);
    await modelRouter.resetTaskToAuto(taskType);
  };

  const handleSmartRecommendation = async () => {
    setIsSaving(true);
    try {
      await modelRouter.applySmartRecommendation(models);
      setConfig(modelRouter.getConfig());
      setTimeout(() => {
        setIsSaving(false);
        setShowSuccess(true);
        setTimeout(() => setShowSuccess(false), 1500);
      }, 500);
    } catch (e) {
      console.error('智能推荐失败:', e);
      setIsSaving(false);
    }
  };

  const handleResetAll = async () => {
    for (const task of TASK_TYPES) {
      await modelRouter.resetTaskToAuto(task.id as TaskType);
    }
    setConfig(modelRouter.getConfig());
  };

  const handleCloseGuide = () => {
    setShowLocalGuide(false);
    localStorage.setItem('moyuan-local-model-guide-seen', 'true');
  };

  const taskTypes = TASK_TYPES.filter(t =>
    activeSection === 'tasks'
      ? !t.id.startsWith('agent-')
      : t.id.startsWith('agent-')
  );

  // ====== 渲染本地模型状态卡片 ======
  const renderLocalModelStatusCard = () => {
    const statusConfig = {
      unconfigured: {
        icon: 'fa-plus',
        bgGradient: 'linear-gradient(135deg, #a855f7, #7c3aed)',
        bgColor: 'rgba(168,85,247,0.08)',
        borderColor: 'border-purple-900/20',
        title: '🎯 配置本地模型 (node-llama-cpp)',
        desc: '使用 node-llama-cpp 在本地运行 AI 模型，无需联网，数据完全私有',
        showGuideBtn: true,
      },
      untested: {
        icon: 'fa-clock',
        bgGradient: 'linear-gradient(135deg, #f59e0b, #d97706)',
        bgColor: 'rgba(245,158,11,0.08)',
        borderColor: 'border-amber-900/20',
        title: `⏳ 已配置 ${overallStatus.totalCount} 个本地模型（待验证）`,
        desc: '检测到本地模型配置，但尚未测试连接。点击"开始测试"验证模型是否可用。',
        showTestBtn: true,
      },
      testing: {
        icon: 'fa-spinner fa-spin',
        bgGradient: 'linear-gradient(135deg, #3b82f6, #2563eb)',
        bgColor: 'rgba(59,130,246,0.08)',
        borderColor: 'border-blue-900/20',
        title: `🔄 正在测试本地模型... (${overallStatus.readyCount}/${overallStatus.totalCount})`,
        desc: '正在逐个初始化并测试模型连接，请稍候...',
        showProgress: true,
      },
      ready: {
        icon: 'fa-check-circle',
        bgGradient: 'linear-gradient(135deg, #34d399, #10b981)',
        bgColor: 'rgba(52,211,153,0.05)',
        borderColor: 'border-green-900/15',
        title: `✅ 本地模型已就绪 (${overallStatus.readyCount}/${overallStatus.totalCount})`,
        desc: '内置 AI 引擎已激活，支持离线推理、隐私保护、零成本使用',
        showModelList: true,
      },
      error: {
        icon: 'fa-exclamation-triangle',
        bgGradient: 'linear-gradient(135deg, #ef4444, #dc2626)',
        bgColor: 'rgba(239,68,68,0.08)',
        borderColor: 'border-red-900/20',
        title: `❌ 本地模型连接失败 (${overallStatus.readyCount}/${overallStatus.totalCount} 成功)`,
        desc: '部分或全部模型无法加载，请检查模型文件路径和 GPU 配置。',
        showErrorDetails: true,
        showRetryBtn: true,
      },
    };

    const config = statusConfig[overallStatus.status];

    return (
      <div className={`p-4 rounded-xl border transition-all ${config.borderColor}`}
        style={{ backgroundColor: config.bgColor }}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: config.bgGradient }}
            >
              <i className={`fas ${config.icon} text-white text-lg ${overallStatus.status === 'testing' ? '' : ''}`} />
            </div>
            <div>
              <h4 className="text-sm font-bold" style={{ color: 'var(--color-text-primary)' }}>
                {config.title}
              </h4>
              <p className="text-[11px] mt-1" style={{ color: 'var(--color-text-muted)' }}>
                {config.desc}
              </p>

              {/* 已就绪时显示模型列表 */}
              {(config as any).showModelList && (
                <div className="mt-2 flex gap-2 flex-wrap">
                  {localModels.map(model => {
                    const result = testResults[model.id];
                    return (
                      <span key={model.id}
                        className="px-2 py-1 rounded-lg text-[10px] font-medium flex items-center gap-1"
                        style={{
                          background: result?.status === 'ready'
                            ? 'linear-gradient(135deg, var(--color-p-alpha-25), var(--color-p-alpha-20))'
                            : 'linear-gradient(135deg, var(--color-p-alpha-25), var(--color-p-alpha-20))',
                          color: result?.status === 'ready' ? 'var(--color-accent-emerald)' : 'var(--color-primary-400)',
                          border: `1px solid ${result?.status === 'ready' ? 'var(--color-p-alpha-30)' : 'var(--color-p-alpha-30)'}`,
                        }}
                      >
                        <i className={`fas ${result?.status === 'ready' ? 'fa-check-circle' : 'fa-microchip'}`} />
                        {model.name}
                        {result?.contextWindow && (
                          <span style={{ opacity: 0.7 }}>({(result.contextWindow / 1000).toFixed(0)}K)</span>
                        )}
                      </span>
                    );
                  })}
                </div>
              )}

              {/* 显示错误详情 */}
              {(config as any).showErrorDetails && (
                <div className="mt-2 space-y-1.5">
                  {localModels.map(model => {
                    const result = testResults[model.id];
                    if (!result || result.status !== 'error') return null;
                    return (
                      <div key={model.id}
                        className="p-2 rounded-lg text-[10px]"
                        style={{
                          backgroundColor: 'rgba(239,68,68,0.06)',
                          border: '1px solid rgba(239,68,68,0.15)',
                          color: '#fca5a5',
                        }}
                      >
                        <div className="font-medium">{model.name}</div>
                        <div className="mt-0.5 opacity-80 whitespace-pre-wrap">{result.message}</div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* 测试进度 */}
              {(config as any).showProgress && (
                <div className="mt-2 w-full bg-gray-800/40 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 transition-all duration-500"
                    style={{ width: `${(overallStatus.readyCount / overallStatus.totalCount) * 100}%` }}
                  />
                </div>
              )}
            </div>
          </div>

          {/* 操作按钮区域 */}
          <div className="flex items-center gap-2 shrink-0">
            {/* 未配置时显示引导按钮 */}
            {(config as any).showGuideBtn && (
              <button
                onClick={() => setShowLocalGuide(!showLocalGuide)}
                className="px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all"
                style={{
                  background: 'linear-gradient(135deg, var(--color-primary-400), var(--color-primary-500))',
                  color: 'white',
                }}
              >
                <i className="fas fa-wrench mr-1" />
                如何配置？
              </button>
            )}

            {/* 待测试 / 重试 时显示测试按钮 */}
            {((config as any).showTestBtn || (config as any).showRetryBtn) && (
              <button
                onClick={handleTestAllLocalModels}
                disabled={isTestingAll}
                className="px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all flex items-center gap-1.5 disabled:opacity-50"
                style={{
                  background: (config as any).showRetryBtn
                    ? 'linear-gradient(135deg, #ef4444, #dc2626)'
                    : 'linear-gradient(135deg, #f59e0b, #d97706)',
                  color: 'white',
                }}
              >
                <i className={`fas ${(config as any).showRetryBtn ? 'fa-redo' : 'fa-play'} ${isTestingAll ? 'fa-spin' : ''}`} />
                {isTestingAll ? '测试中...' : ((config as any).showRetryBtn ? '重新测试' : '开始测试')}
              </button>
            )}

            {/* 已就绪时显示重新测试按钮 */}
            {(config as any).showModelList && (
              <button
                onClick={handleTestAllLocalModels}
                disabled={isTestingAll}
                className="px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all disabled:opacity-50"
                style={{
                  backgroundColor: 'var(--color-surface-muted)',
                  color: 'var(--color-text-secondary)',
                  border: '1px solid var(--color-border-default)',
                }}
              >
                <i className={`fas fa-sync-alt ${isTestingAll ? 'fa-spin' : ''} mr-1`} />
                重新验证
              </button>
            )}
          </div>
        </div>

        {/* 本地模型引导内容（仅未配置时显示） */}
        {showLocalGuide && !hasLocalModels && (
          <div className="mt-4 p-4 rounded-xl space-y-3"
            style={{ backgroundColor: 'var(--color-surface-base)', border: '1px solid var(--color-border-default)' }}
          >
            <div className="flex items-center justify-between">
              <h5 className="text-xs font-bold" style={{ color: 'var(--color-text-primary)' }}>
                <i className="fas fa-book-open mr-1.5" style={{ color: 'var(--color-primary-400)' }} />
                快速配置指南
              </h5>
              <button onClick={handleCloseGuide} className="w-6 h-6 rounded-md hover:bg-white/5 transition-all"
                style={{ color: 'var(--color-text-muted)' }}>
                <i className="fas fa-times text-xs" />
              </button>
            </div>

            <ol className="space-y-2 text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
              <li className="flex gap-2">
                <span className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-[9px] font-bold"
                  style={{ backgroundColor: 'var(--color-primary-400)', color: 'white' }}>1</span>
                <span><strong>下载模型文件</strong>：从 HuggingFace 下载 .gguf 格式模型（推荐 Q4_K_M 量化）</span>
              </li>
              <li className="flex gap-2">
                <span className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-[9px] font-bold"
                  style={{ backgroundColor: 'var(--color-primary-400)', color: 'white' }}>2</span>
                <span><strong>添加到设置</strong>：在「模型配置」标签 → 新建模型 → Provider 选择「本地模型」</span>
              </li>
              <li className="flex gap-2">
                <span className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-[9px] font-bold"
                  style={{ backgroundColor: 'var(--color-primary-400)', color: 'white' }}>3</span>
                <span><strong>填写路径</strong>：输入模型文件路径，选择 GPU 层数（建议 20-35 层）</span>
              </li>
              <li className="flex gap-2">
                <span className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-[9px] font-bold"
                  style={{ backgroundColor: 'var(--color-primary-400)', color: 'white' }}>4</span>
                <span><strong>回到本页面测试</strong>：点击「开始测试」验证模型是否正常工作 ✨</span>
              </li>
            </ol>

            <div className="p-3 rounded-lg" style={{ backgroundColor: 'rgba(245,158,11,0.08)', border: '1px dashed rgba(245,158,11,0.3)' }}>
              <p className="text-[10px]" style={{ color: '#f59e0b' }}>
                <i className="fas fa-lightbulb mr-1" />
                <strong>推荐模型：</strong>Llama-3-8B-Instruct-Q4_K_M.gguf（~4.9GB）适合大多数创作任务，
                或 Mistral-7B-Instruct-v0.3-Q4_K_M.gguf（~4.4GB）性能更优
              </p>
            </div>

            <button
              onClick={handleCloseGuide}
              className="w-full py-2 rounded-lg text-xs font-medium transition-all"
              style={{ backgroundColor: 'var(--color-surface-muted)', color: 'var(--color-text-secondary)' }}
            >
              知道了，我去配置
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* ====== 本地模型状态卡片（带真实连接测试） ====== */}
      {renderLocalModelStatusCard()}

      {/* 头部说明 */}
      <div className="p-4 rounded-xl" style={{ backgroundColor: 'var(--color-surface-muted)', border: '1px solid var(--color-border-default)' }}>
        <h3 className="text-sm font-bold mb-2" style={{ color: 'var(--color-text-primary)' }}>
          <i className="fas fa-route mr-2" style={{ color: 'var(--color-primary-400)' }} />
          智能模型调度
        </h3>
        <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
          为不同的创作任务和 AI Agent 分配专属模型。
          <strong className="mx-1" style={{ color: '#34d399' }}>日常功能用 DeepSeek（快速便宜），记忆整理用本地模型（隐私安全）。</strong>
        </p>
      </div>

      {/* 切换标签：功能 / Agent */}
      <div className="flex gap-1 p-1 rounded-lg" style={{ backgroundColor: 'var(--color-surface-muted)' }}>
        <button
          onClick={() => setActiveSection('tasks')}
          className={`flex-1 px-3 py-2 rounded-md text-xs font-medium transition-all ${
            activeSection === 'tasks'
              ? 'bg-[var(--color-primary-500)] text-white shadow-md'
              : 'hover:bg-white/5'
          }`}
          style={{ color: activeSection === 'tasks' ? undefined : 'var(--color-text-secondary)' }}
        >
          <i className="fas fa-puzzle-piece mr-1.5" />功能模块 ({TASK_TYPES.filter(t => !t.id.startsWith('agent-')).length})
        </button>
        <button
          onClick={() => setActiveSection('agents')}
          className={`flex-1 px-3 py-2 rounded-md text-xs font-medium transition-all ${
            activeSection === 'agents'
              ? 'bg-[var(--color-primary-500)] text-white shadow-md'
              : 'hover:bg-white/5'
          }`}
          style={{ color: activeSection === 'agents' ? undefined : 'var(--color-text-secondary)' }}
        >
          <i className="fas fa-robot mr-1.5" />AI Agents ({TASK_TYPES.filter(t => t.id.startsWith('agent-')).length})
        </button>
      </div>

      {/* 操作按钮栏 */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={handleSmartRecommendation}
          disabled={isSaving || models.length === 0}
          className="px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all flex items-center gap-1.5 disabled:opacity-50"
          style={{
            background: 'linear-gradient(135deg, var(--color-primary-400), var(--color-primary-500))',
            color: 'white',
          }}
        >
          <i className="fas fa-magic" />
          一键智能推荐
        </button>
        <button
          onClick={handleResetAll}
          className="px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all"
          style={{ backgroundColor: 'var(--color-surface-muted)', color: 'var(--color-text-muted)', border: '1px solid var(--color-border-default)' }}
        >
          <i className="fas fa-undo mr-1" />全部重置
        </button>

        {showSuccess && (
          <span className="ml-auto text-[11px] font-medium animate-fade-in" style={{ color: '#34d399' }}>
            <i className="fas fa-check-circle mr-1" />已保存
          </span>
        )}
      </div>

      {/* 配置列表 */}
      <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
        {taskTypes.map((task) => {
          const currentModelId = config[task.id];
          const currentModel = currentModelId && currentModelId !== 'auto'
            ? models.find(m => m.id === currentModelId)
            : null;

          const isRecommendedForLocal = task.recommendedProvider === 'local';
          const selectedModelIsLocal = currentModel?.provider === 'local';
          const selectedModelTestResult = selectedModelIsLocal ? testResults[currentModel!.id] : undefined;

          return (
            <div
              key={task.id}
              className={`p-3 rounded-xl transition-all ${
                isRecommendedForLocal
                  ? 'border-purple-800/30'
                  : ''
              }`}
              style={{
                backgroundColor: 'var(--color-surface-base)',
                border: isRecommendedForLocal
                  ? '1px solid rgba(168,85,247,0.2)'
                  : '1px solid var(--color-border-default)',
              }}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center"
                    style={{
                      background: currentModel
                        ? (PROVIDER_INFO[currentModel.provider]?.bgGradient || 'from-gray-500 to-gray-600')
                        : (isRecommendedForLocal
                          ? 'linear-gradient(135deg, #a855f7, #7c3aed)'
                          : 'var(--color-surface-muted)')
                    }}
                  >
                    <i className={`fas ${task.icon} text-[10px] ${currentModel ? 'text-white' : ''}`}
                      style={{ color: currentModel ? undefined : (isRecommendedForLocal ? '#a855f7' : 'var(--color-text-muted)') }} />
                  </div>
                  <div>
                    <span className="text-xs font-semibold" style={{ color: 'var(--color-text-primary)' }}>{task.label}</span>
                    <p className="text-[9px]" style={{ color: 'var(--color-text-muted)' }}>{task.description}</p>
                  </div>
                </div>

                {/* 当前模型指示器 + 状态标签 */}
                <div className="flex items-center gap-2">
                  {currentModel ? (
                    <div className="flex items-center gap-1.5 px-2 py-1 rounded-md"
                      style={{ backgroundColor: 'var(--color-surface-muted)' }}
                    >
                      <div className={`w-4 h-4 rounded bg-gradient-to-br ${PROVIDER_INFO[currentModel.provider]?.bgGradient || 'from-gray-500 to-gray-600'} flex items-center justify-center`}>
                        <i className={`fas ${PROVIDER_INFO[currentModel.provider]?.icon || 'fa-robot'} text-white text-[7px]`} />
                      </div>
                      <span className="text-[10px] font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                        {currentModel.name}
                      </span>
                      {currentModel.provider === 'local' && (
                        <span className="text-[8px] px-1 py-0.5 rounded"
                          style={{ backgroundColor: 'rgba(168,85,247,0.2)', color: '#c084fc' }}
                        >
                          本地
                        </span>
                      )}

                      {/* 本地模型测试状态小标 */}
                      {selectedModelTestResult && (
                        <span className="text-[8px] px-1 py-0.5 rounded font-medium"
                          style={{
                            backgroundColor:
                              selectedModelTestResult.status === 'ready' ? 'rgba(52,211,153,0.15)' :
                              selectedModelTestResult.status === 'error' ? 'rgba(239,68,68,0.15)' :
                              'rgba(245,158,11,0.15)',
                            color:
                              selectedModelTestResult.status === 'ready' ? 'var(--color-accent-emerald)' :
                              selectedModelTestResult.status === 'error' ? 'var(--color-red-400)' :
                              'var(--color-accent-amber)',
                          }}
                        >
                          <i className={`fas ${
                            selectedModelTestResult.status === 'ready' ? 'fa-check' :
                            selectedModelTestResult.status === 'error' ? 'fa-times' :
                            'fa-circle-notch fa-spin'
                          } mr-0.5`} />
                          {selectedModelTestResult.status === 'ready' ? '已验证' :
                           selectedModelTestResult.status === 'error' ? '失败' : '测试中'}
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-[10px] px-2 py-1 rounded-md"
                      style={{
                        backgroundColor: isRecommendedForLocal
                          ? 'var(--color-p-alpha-20)'
                          : 'var(--color-p-alpha-12)',
                        color: isRecommendedForLocal ? 'var(--color-primary-400)' : 'var(--color-accent-emerald)',
                        border: `1px solid ${isRecommendedForLocal ? 'var(--color-p-alpha-30)' : 'var(--color-p-alpha-25)'}`,
                      }}
                    >
                      <i className={`fas ${isRecommendedForLocal ? 'fa-microchip' : 'fa-auto'} mr-1`} />
                      {isRecommendedForLocal ? '推荐本地' : '自动'}
                    </span>
                  )}

                  {currentModelId && currentModelId !== 'auto' && (
                    <button
                      onClick={() => handleResetToAuto(task.id as TaskType)}
                      className="w-5 h-5 rounded flex items-center justify-center hover:bg-red-500/10 transition-all"
                      title="重置为自动"
                    >
                      <i className="fas fa-times text-[9px]" style={{ color: 'var(--color-text-muted)' }} />
                    </button>
                  )}
                </div>
              </div>

              {/* 推荐原因 + 特殊标签 */}
              {(task.recommendationReason || task.tags?.length) && (
                <div className="mb-2 flex items-center gap-2 flex-wrap">
                  {task.recommendationReason && (
                    <span className="text-[9px] px-2 py-0.5 rounded-md"
                      style={{
                        backgroundColor: isRecommendedForLocal ? 'rgba(168,85,247,0.1)' : 'rgba(52,211,153,0.08)',
                        color: isRecommendedForLocal ? '#c084fc' : '#34d399',
                        border: `1px solid ${isRecommendedForLocal ? 'rgba(168,85,247,0.2)' : 'rgba(52,211,153,0.15)'}`,
                      }}
                    >
                      <i className="fas fa-lightbulb mr-1" style={{ fontSize: '8px' }} />
                      {task.recommendationReason}
                    </span>
                  )}

                  {task.tags?.map(tag => {
                    const style = tagStyles[tag];
                    if (!style) return null;
                    return (
                      <span key={tag} className="text-[9px] px-1.5 py-0.5 rounded-md font-medium"
                        style={{ backgroundColor: style.bg, color: style.color, border: `1px solid ${style.color}20` }}>
                        {style.label}
                      </span>
                    );
                  })}
                </div>
              )}

              {/* 模型选择下拉框 - 分组显示 + 本地模型状态标注 */}
              <select
                value={currentModelId || 'auto'}
                onChange={(e) => handleModelChange(task.id as TaskType, e.target.value)}
                className="w-full neumorphic-input rounded-lg px-3 py-1.5 text-[11px] appearance-none cursor-pointer"
              >
                <option value="auto">🤖 自动选择（系统推荐）</option>

                {isRecommendedForLocal && hasLocalModels && (
                  <optgroup label={`⭐ 推荐本地模型${overallStatus.status === 'ready' ? ' ✅' : overallStatus.status === 'error' ? ' ❌' : ' ⏳'}`}>
                    {localModels.map(model => {
                      const result = testResults[model.id];
                      const statusIcon = result?.status === 'ready' ? '✅' : result?.status === 'error' ? '❌' : result?.status === 'testing' ? '🔄' : '⏳';
                      return (
                        <option key={model.id} value={model.id}>
                          {statusIcon} {model.name} (本地 · 免费)
                        </option>
                      );
                    })}
                  </optgroup>
                )}

                <optgroup label="☁️ 云端模型">
                  {models.filter(m => m.provider !== 'local').map(model => (
                    <option key={model.id} value={model.id}>
                      ☁️ {model.name} ({model.provider})
                    </option>
                  ))}
                </optgroup>

                {!isRecommendedForLocal && hasLocalModels && (
                  <optgroup label={`💜 本地模型${overallStatus.status === 'ready' ? ' ✅' : overallStatus.status === 'error' ? ' ❌' : ' ⏳'}`}>
                    {localModels.map(model => {
                      const result = testResults[model.id];
                      const statusIcon = result?.status === 'ready' ? '✅' : result?.status === 'error' ? '❌' : result?.status === 'testing' ? '🔄' : '⏳';
                      return (
                        <option key={model.id} value={model.id}>
                          {statusIcon} {model.name} (本地)
                        </option>
                      );
                    })}
                  </optgroup>
                )}
              </select>

              {/* 单独为每个任务快速测试选中的本地模型 */}
              {selectedModelIsLocal && selectedModelTestResult?.status === 'error' && (
                <button
                  onClick={() => testSingleModel(currentModel!)}
                  className="mt-1.5 w-full text-[10px] py-1 rounded-md transition-all flex items-center justify-center gap-1"
                  style={{
                    backgroundColor: 'rgba(239,68,68,0.08)',
                    color: '#f87171',
                    border: '1px dashed rgba(239,68,68,0.25)',
                  }}
                >
                  <i className="fas fa-redo" />
                  重新测试此模型
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* 底部说明 */}
      <div className="pt-3 border-t space-y-2" style={{ borderColor: 'var(--color-border-default)' }}>
        <div className="flex items-start gap-2 text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
          <i className="fas fa-info-circle mt-0.5 shrink-0" />
          <div>
            <p><strong>自动模式</strong>：根据推荐规则匹配最佳模型</p>
            <p className="mt-1"><strong>本地模型优势</strong>：🔒 数据不离开设备 | 💰 无 API 费用 | 📴 断网也能用</p>
            <p className="mt-1"><strong>状态说明</strong>：⏳ 待验证 | 🔄 测试中 | ✅ 已就绪 | ❌ 连接失败</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ModelRoutingPanel;
