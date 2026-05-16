
import React, { useState, useMemo } from 'react';
import { 
  useModuleRegistry, 
  useModuleLifecycle,
  ModuleInstance 
} from '../../shared/modules';

// 状态指示器组件
function StatusBadge({ status }: { status: string }) {
  const configs: Record<string, { label: string; color: string; bg: string }> = {
    idle: { label: '就绪', color: 'var(--color-text-muted)', bg: 'var(--color-surface-muted)' },
    loading: { label: '加载中', color: 'var(--color-primary-400)', bg: 'var(--color-primary-100)' },
    ready: { label: '就绪', color: 'var(--color-success-400)', bg: 'var(--color-success-100)' },
    active: { label: '活动', color: 'var(--color-primary-400)', bg: 'var(--color-primary-100)' },
    error: { label: '错误', color: 'var(--color-error-400)', bg: 'var(--color-error-100)' },
    disabled: { label: '禁用', color: 'var(--color-text-muted)', bg: 'var(--color-surface-muted)' }
  };
  
  const config = configs[status] || configs.idle;
  
  return (
    <span 
      className="px-2 py-1 rounded-full text-xs font-medium"
      style={{ color: config.color, backgroundColor: config.bg }}
    >
      {config.label}
    </span>
  );
}

// 分类标签
const categoryLabels: Record<string, string> = {
  core: '核心模块',
  feature: '功能模块',
  integration: '集成模块',
  tool: '工具模块'
};

// 模块卡片组件
function ModuleCard({ instance }: { instance: ModuleInstance }) {
  const { module, status } = instance;
  const { loading, error, init, activate, deactivate, toggleEnabled } = useModuleLifecycle(module.id);

  return (
    <div 
      className="p-4 rounded-lg border mb-4 transition-all duration-200"
      style={{ 
        backgroundColor: 'var(--color-surface-base)',
        borderColor: 'var(--color-border-default)'
      }}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold text-base" style={{ color: 'var(--color-text-primary)' }}>
              {module.name}
            </h3>
            <span className="text-xs px-2 py-0.5 rounded" style={{ color: 'var(--color-text-muted)', backgroundColor: 'var(--color-surface-muted)' }}>
              v{module.version}
            </span>
            <StatusBadge status={status} />
          </div>
          <p className="text-sm mb-2" style={{ color: 'var(--color-text-secondary)' }}>
            {module.description}
          </p>
          {module.tags && module.tags.length > 0 && (
            <div className="flex gap-1 flex-wrap mb-2">
              {module.tags.map(tag => (
                <span 
                  key={tag} 
                  className="text-xs px-1.5 py-0.5 rounded"
                  style={{ color: 'var(--color-text-muted)', backgroundColor: 'var(--color-surface-hover)' }}
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {error && (
        <div 
          className="p-3 rounded mb-3 text-sm"
          style={{ backgroundColor: 'var(--color-error-100)', color: 'var(--color-error-400)' }}
        >
          <i className="fas fa-exclamation-circle mr-2"></i>
          {error.message}
        </div>
      )}

      <div className="flex items-center gap-2">
        {/* 启用/禁用开关 */}
        <button
          onClick={() => toggleEnabled(status === 'disabled')}
          className={`px-3 py-1.5 rounded text-sm font-medium transition-all ${
            status === 'disabled' ? 'text-green-600 bg-green-50 hover:bg-green-100' : 'text-gray-600 bg-gray-50 hover:bg-gray-100'
          }`}
        >
          <i className={`fas ${status === 'disabled' ? 'fa-play' : 'fa-pause'} mr-1`}></i>
          {status === 'disabled' ? '启用' : '禁用'}
        </button>

        {/* 初始化按钮 */}
        {status === 'idle' && (
          <button
            onClick={init}
            disabled={loading}
            className="px-3 py-1.5 rounded text-sm font-medium transition-all bg-blue-50 text-blue-600 hover:bg-blue-100 disabled:opacity-50"
          >
            {loading ? (
              <><i className="fas fa-spinner fa-spin mr-1"></i>加载中...</>
            ) : (
              <><i className="fas fa-play mr-1"></i>初始化</>
            )}
          </button>
        )}

        {/* 激活/停用按钮 */}
        {status === 'ready' && (
          <button
            onClick={activate}
            className="px-3 py-1.5 rounded text-sm font-medium transition-all bg-green-50 text-green-600 hover:bg-green-100"
          >
            <i className="fas fa-bolt mr-1"></i>
            激活
          </button>
        )}

        {status === 'active' && (
          <button
            onClick={deactivate}
            className="px-3 py-1.5 rounded text-sm font-medium transition-all bg-orange-50 text-orange-600 hover:bg-orange-100"
          >
            <i className="fas fa-power-off mr-1"></i>
            停用
          </button>
        )}
      </div>
    </div>
  );
}

// 模块管理面板主组件
export function ModuleManagerPanel() {
  const registry = useModuleRegistry();
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // 按类别分组模块
  const groupedModules = useMemo(() => {
    const groups: Record<string, ModuleInstance[]> = { all: [] };
    
    Object.values(registry).forEach(instance => {
      groups.all.push(instance);
      const category = instance.module.category;
      if (!groups[category]) {
        groups[category] = [];
      }
      groups[category].push(instance);
    });

    return groups;
  }, [registry]);

  // 过滤模块
  const filteredModules = useMemo(() => {
    let modules = activeCategory === 'all' 
      ? groupedModules.all 
      : (groupedModules[activeCategory] || []);

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      modules = modules.filter(inst => 
        inst.module.name.toLowerCase().includes(query) ||
        inst.module.description.toLowerCase().includes(query) ||
        inst.module.id.toLowerCase().includes(query)
      );
    }

    return modules.sort((a, b) => (a.module.priority || 0) - (b.module.priority || 0));
  }, [groupedModules, activeCategory, searchQuery]);

  // 统计信息
  const stats = useMemo(() => {
    const all = Object.values(registry);
    return {
      total: all.length,
      active: all.filter(i => i.status === 'active').length,
      ready: all.filter(i => i.status === 'ready').length,
      disabled: all.filter(i => i.status === 'disabled').length,
      error: all.filter(i => i.status === 'error').length
    };
  }, [registry]);

  return (
    <div className="p-4 h-full overflow-y-auto">
      {/* 标题区 */}
      <div className="mb-6">
        <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--color-text-primary)' }}>
          <i className="fas fa-cubes mr-2"></i>
          模块管理
        </h2>
        <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          管理和配置项目的各个功能模块
        </p>
      </div>

      {/* 统计面板 */}
      <div className="grid grid-cols-5 gap-3 mb-6">
        <div className="p-3 rounded-lg text-center" style={{ backgroundColor: 'var(--color-surface-hover)' }}>
          <div className="text-2xl font-black" style={{ color: 'var(--color-text-primary)' }}>{stats.total}</div>
          <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>总数</div>
        </div>
        <div className="p-3 rounded-lg text-center" style={{ backgroundColor: 'var(--color-primary-100)' }}>
          <div className="text-2xl font-black" style={{ color: 'var(--color-primary-400)' }}>{stats.active}</div>
          <div className="text-xs" style={{ color: 'var(--color-primary-400)' }}>活动中</div>
        </div>
        <div className="p-3 rounded-lg text-center" style={{ backgroundColor: 'var(--color-success-100)' }}>
          <div className="text-2xl font-black" style={{ color: 'var(--color-success-400)' }}>{stats.ready}</div>
          <div className="text-xs" style={{ color: 'var(--color-success-400)' }}>就绪</div>
        </div>
        <div className="p-3 rounded-lg text-center" style={{ backgroundColor: 'var(--color-surface-muted)' }}>
          <div className="text-2xl font-black" style={{ color: 'var(--color-text-muted)' }}>{stats.disabled}</div>
          <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>已禁用</div>
        </div>
        <div className="p-3 rounded-lg text-center" style={{ backgroundColor: 'var(--color-error-100)' }}>
          <div className="text-2xl font-black" style={{ color: 'var(--color-error-400)' }}>{stats.error}</div>
          <div className="text-xs" style={{ color: 'var(--color-error-400)' }}>错误</div>
        </div>
      </div>

      {/* 搜索和过滤区 */}
      <div className="flex items-center gap-4 mb-6">
        <div className="flex-1 relative">
          <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"></i>
          <input
            type="text"
            placeholder="搜索模块..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-lg border text-sm"
            style={{ 
              backgroundColor: 'var(--color-surface-base)',
              borderColor: 'var(--color-border-default)',
              color: 'var(--color-text-primary)'
            }}
          />
        </div>

        {/* 分类标签 */}
        <div className="flex gap-2">
          {['all', ...Object.keys(categoryLabels)].map(category => (
            <button
              key={category}
              onClick={() => setActiveCategory(category)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                activeCategory === category ? 'bg-purple-100 text-purple-600' : 'text-gray-600 bg-gray-50 hover:bg-gray-100'
              }`}
            >
              {category === 'all' ? '全部' : categoryLabels[category]}
            </button>
          ))}
        </div>
      </div>

      {/* 模块列表 */}
      <div className="space-y-1">
        {filteredModules.length === 0 ? (
          <div className="text-center py-12" style={{ color: 'var(--color-text-muted)' }}>
            <i className="fas fa-inbox text-4xl mb-3"></i>
            <p>没有找到匹配的模块</p>
          </div>
        ) : (
          filteredModules.map(instance => (
            <ModuleCard key={instance.instanceId} instance={instance} />
          ))
        )}
      </div>
    </div>
  );
}
