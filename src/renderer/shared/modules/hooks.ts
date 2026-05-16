
import { useState, useEffect, useCallback } from 'react';
import { moduleManager } from './ModuleManager';
import { Module, ModuleInstance, ModuleRegistry, ModuleRoute } from './types';

// 获取模块管理器状态的 Hook
export function useModuleRegistry(): ModuleRegistry {
  const [registry, setRegistry] = useState<ModuleRegistry>(() => {
    // 初始化时获取当前状态
    const registry: ModuleRegistry = {};
    moduleManager.getAll().forEach(inst => {
      registry[inst.module.id] = inst;
    });
    return registry;
  });

  useEffect(() => {
    return moduleManager.subscribe(newRegistry => {
      setRegistry(newRegistry);
    });
  }, []);

  return registry;
}

// 获取单个模块的 Hook
export function useModule(moduleId: string): ModuleInstance | undefined {
  const registry = useModuleRegistry();
  return registry[moduleId];
}

// 管理模块生命周期的 Hook
export function useModuleLifecycle(moduleId: string) {
  const instance = useModule(moduleId);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | undefined>();

  const init = useCallback(async () => {
    try {
      setLoading(true);
      setError(undefined);
      await moduleManager.init(moduleId);
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [moduleId]);

  const activate = useCallback(() => {
    try {
      moduleManager.activate(moduleId);
    } catch (err) {
      setError(err as Error);
    }
  }, [moduleId]);

  const deactivate = useCallback(() => {
    moduleManager.deactivate(moduleId);
  }, [moduleId]);

  const toggleEnabled = useCallback((enabled: boolean) => {
    moduleManager.setEnabled(moduleId, enabled);
  }, [moduleId]);

  return {
    instance,
    loading,
    error,
    init,
    activate,
    deactivate,
    toggleEnabled,
    status: instance?.status,
  };
}

// 获取所有路由的 Hook
export function useModuleRoutes(): Array<{ moduleId: string; route: ModuleRoute }> {
  const [routes, setRoutes] = useState(moduleManager.getAllRoutes());

  useEffect(() => {
    return moduleManager.subscribe(() => {
      setRoutes(moduleManager.getAllRoutes());
    });
  }, []);

  return routes;
}

// 获取模块组件的 Hook
export function useModuleComponent<T = React.ComponentType<unknown>>(
  moduleId: string, 
  componentKey: string
): T | undefined {
  const instance = useModule(moduleId);
  if (!instance || instance.status === 'disabled' || instance.status === 'error') {
    return undefined;
  }
  return instance.module.components?.[componentKey] as T | undefined;
}

// 获取模块服务的 Hook
export function useModuleService<T = unknown>(moduleId: string, serviceKey: string): T | undefined {
  const instance = useModule(moduleId);
  if (!instance || instance.status === 'disabled' || instance.status === 'error') {
    return undefined;
  }
  return instance.module.services?.[serviceKey] as T | undefined;
}

// 创建模块定义的辅助 Hook（用于内部使用）
export function defineModule(module: Module): Module {
  return module;
}
