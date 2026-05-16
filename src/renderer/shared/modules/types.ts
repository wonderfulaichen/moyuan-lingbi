
import React from 'react';

// 模块元数据
export interface ModuleMetadata {
  id: string;
  name: string;
  version: string;
  description: string;
  author?: string;
  category: 'core' | 'feature' | 'integration' | 'tool';
  priority?: number;
  tags?: string[];
  dependencies?: string[];
}

// 模块生命周期钩子
export interface ModuleLifecycle {
  onInit?: () => Promise<void>;
  onMount?: () => void;
  onUnmount?: () => void;
  onUpdate?: (data?: unknown) => void;
  onError?: (error: Error) => void;
}

// 模块导出的组件
export interface ModuleComponents {
  main?: React.ComponentType<unknown>;
  sidebar?: React.ComponentType<unknown>;
  settings?: React.ComponentType<unknown>;
  [key: string]: React.ComponentType<unknown> | undefined;
}

// 模块路由定义
export interface ModuleRoute {
  path: string;
  label: string;
  icon?: string;
  component: React.ComponentType<unknown>;
  priority?: number;
}

// 完整模块接口
export interface Module extends ModuleMetadata, ModuleLifecycle {
  routes?: ModuleRoute[];
  components?: ModuleComponents;
  stores?: Record<string, unknown>;
  services?: Record<string, unknown>;
  hooks?: Record<string, unknown>;
}

// 模块状态
export type ModuleStatus = 'idle' | 'loading' | 'ready' | 'active' | 'error' | 'disabled';

// 模块实例
export interface ModuleInstance {
  module: Module;
  status: ModuleStatus;
  instanceId: string;
  loadedAt?: number;
  activatedAt?: number;
  error?: Error;
}

// 模块配置
export interface ModuleConfig {
  enabled: boolean;
  settings?: Record<string, unknown>;
}

// 模块注册表
export interface ModuleRegistry {
  [moduleId: string]: ModuleInstance;
}
