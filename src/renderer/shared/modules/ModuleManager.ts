
import { 
  Module, 
  ModuleInstance, 
  ModuleRegistry, 
  ModuleConfig, 
  ModuleStatus 
} from './types';

export class ModuleManager {
  private registry: ModuleRegistry = {};
  private configs: Map<string, ModuleConfig> = new Map();
  private listeners: Set<(registry: ModuleRegistry) => void> = new Set();

  constructor() {
    this.loadConfigs();
  }

  // 从存储加载配置
  private loadConfigs(): void {
    try {
      const saved = localStorage.getItem('module-configs');
      if (saved) {
        const parsed = JSON.parse(saved);
        Object.entries(parsed).forEach(([id, config]) => {
          this.configs.set(id, config as ModuleConfig);
        });
      }
    } catch {
      // 使用默认配置
    }
  }

  // 保存配置到存储
  private saveConfigs(): void {
    try {
      const configs: Record<string, ModuleConfig> = {};
      this.configs.forEach((config, id) => {
        configs[id] = config;
      });
      localStorage.setItem('module-configs', JSON.stringify(configs));
    } catch {
      console.warn('[ModuleManager] 配置保存失败');
    }
  }

  // 通知监听者
  private notifyListeners(): void {
    this.listeners.forEach(listener => listener(this.registry));
  }

  // 生成唯一实例ID
  private generateInstanceId(): string {
    return `inst_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // 注册模块
  register(module: Module): void {
    if (this.registry[module.id]) {
      console.warn(`[ModuleManager] 模块 ${module.id} 已存在`);
      return;
    }

    // 记忆体模块默认关闭，其他模块默认开启
    const isMemoryModule = module.id === 'memory';
    const config = this.configs.get(module.id) || { enabled: !isMemoryModule };
    
    const instance: ModuleInstance = {
      module,
      status: config.enabled ? 'idle' : 'disabled',
      instanceId: this.generateInstanceId(),
    };

    this.registry[module.id] = instance;
    this.configs.set(module.id, config);
    this.notifyListeners();

    console.log(`[ModuleManager] 模块注册成功: ${module.id}`);
  }

  // 批量注册模块
  registerMany(modules: Module[]): void {
    modules.forEach(module => this.register(module));
  }

  // 初始化模块（异步）
  async init(moduleId: string): Promise<void> {
    const instance = this.registry[moduleId];
    if (!instance) {
      throw new Error(`[ModuleManager] 模块 ${moduleId} 未注册`);
    }

    if (instance.status === 'disabled') {
      return;
    }

    if (instance.status === 'loading' || instance.status === 'ready' || instance.status === 'active') {
      return;
    }

    // 检查依赖
    const module = instance.module;
    if (module.dependencies && module.dependencies.length > 0) {
      for (const depId of module.dependencies) {
        const depInstance = this.registry[depId];
        if (!depInstance || depInstance.status === 'disabled') {
          throw new Error(`[ModuleManager] 依赖模块 ${depId} 不可用`);
        }
        if (depInstance.status !== 'ready' && depInstance.status !== 'active') {
          await this.init(depId);
        }
      }
    }

    instance.status = 'loading';
    this.notifyListeners();

    try {
      if (module.onInit) {
        await module.onInit();
      }
      instance.status = 'ready';
      instance.loadedAt = Date.now();
      console.log(`[ModuleManager] 模块初始化完成: ${moduleId}`);
    } catch (error) {
      instance.status = 'error';
      instance.error = error as Error;
      if (module.onError) {
        module.onError(error as Error);
      }
      console.error(`[ModuleManager] 模块初始化失败: ${moduleId}`, error);
    }

    this.notifyListeners();
  }

  // 初始化所有启用的模块
  async initAll(): Promise<void> {
    const instances = Object.values(this.registry)
      .filter(inst => inst.status !== 'disabled')
      .sort((a, b) => (a.module.priority || 0) - (b.module.priority || 0));

    for (const instance of instances) {
      await this.init(instance.module.id);
    }
  }

  // 激活模块
  activate(moduleId: string): void {
    const instance = this.registry[moduleId];
    if (!instance) {
      throw new Error(`[ModuleManager] 模块 ${moduleId} 未注册`);
    }

    if (instance.status === 'disabled' || instance.status === 'error') {
      return;
    }

    if (instance.status === 'idle' || instance.status === 'loading') {
      console.warn(`[ModuleManager] 模块 ${moduleId} 未就绪，请先初始化`);
      return;
    }

    instance.status = 'active';
    instance.activatedAt = Date.now();
    if (instance.module.onMount) {
      instance.module.onMount();
    }
    this.notifyListeners();
    console.log(`[ModuleManager] 模块激活: ${moduleId}`);
  }

  // 停用模块
  deactivate(moduleId: string): void {
    const instance = this.registry[moduleId];
    if (!instance) {
      return;
    }

    if (instance.status === 'active') {
      if (instance.module.onUnmount) {
        instance.module.onUnmount();
      }
      instance.status = 'ready';
      this.notifyListeners();
      console.log(`[ModuleManager] 模块停用: ${moduleId}`);
    }
  }

  // 启用/禁用模块
  setEnabled(moduleId: string, enabled: boolean): void {
    const instance = this.registry[moduleId];
    if (!instance) {
      return;
    }

    const currentConfig = this.configs.get(moduleId) || { enabled: true };
    const newConfig = { ...currentConfig, enabled };
    this.configs.set(moduleId, newConfig);

    if (!enabled && instance.status === 'active') {
      this.deactivate(moduleId);
    }

    instance.status = enabled ? 'idle' : 'disabled';
    this.saveConfigs();
    this.notifyListeners();
  }

  // 获取模块实例
  get(moduleId: string): ModuleInstance | undefined {
    return this.registry[moduleId];
  }

  // 获取所有模块
  getAll(): ModuleInstance[] {
    return Object.values(this.registry);
  }

  // 获取按类别分组的模块
  getByCategory(): Record<string, ModuleInstance[]> {
    const groups: Record<string, ModuleInstance[]> = {};
    Object.values(this.registry).forEach(instance => {
      const category = instance.module.category;
      if (!groups[category]) {
        groups[category] = [];
      }
      groups[category].push(instance);
    });
    return groups;
  }

  // 获取模块配置
  getConfig(moduleId: string): ModuleConfig | undefined {
    return this.configs.get(moduleId);
  }

  // 更新模块配置
  updateConfig(moduleId: string, config: Partial<ModuleConfig>): void {
    const current = this.configs.get(moduleId) || { enabled: true };
    const updated = { ...current, ...config };
    this.configs.set(moduleId, updated);
    this.saveConfigs();

    if (config.enabled !== undefined && config.enabled !== current.enabled) {
      this.setEnabled(moduleId, config.enabled);
    }
  }

  // 注册状态监听
  subscribe(listener: (registry: ModuleRegistry) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  // 获取所有路由（从所有模块收集）
  getAllRoutes() {
    const routes: Array<{ moduleId: string; route: any }> = [];
    Object.entries(this.registry).forEach(([moduleId, instance]) => {
      if (instance.status !== 'disabled' && instance.module.routes) {
        instance.module.routes.forEach(route => {
          routes.push({ moduleId, route });
        });
      }
    });
    return routes.sort((a, b) => (a.route.priority || 0) - (b.route.priority || 0));
  }
}

// 全局单例
export const moduleManager = new ModuleManager();
