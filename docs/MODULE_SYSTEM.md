
# 墨渊灵笔模块系统文档

## 概述

墨渊灵笔采用模块化架构，让功能可以独立开发、测试和按需加载。模块系统提供了：

- 模块注册和管理
- 生命周期钩子
- 配置持久化
- 状态管理集成
- 组件导出机制

## 核心概念

### 模块 (Module)

一个模块是一个独立的功能单元，包含元数据、组件、服务和生命周期钩子。

```typescript
interface Module {
  id: string;
  name: string;
  version: string;
  description: string;
  category: 'core' | 'feature' | 'integration' | 'tool';
  priority?: number;
  tags?: string[];
  dependencies?: string[];
  
  onInit?: () => Promise&lt;void&gt;;
  onMount?: () =&gt; void;
  onUnmount?: () =&gt; void;
  onUpdate?: (data?: unknown) =&gt; void;
  onError?: (error: Error) =&gt; void;
  
  routes?: ModuleRoute[];
  components?: ModuleComponents;
  stores?: Record&lt;string, unknown&gt;;
  services?: Record&lt;string, unknown&gt;;
  hooks?: Record&lt;string, unknown&gt;;
}
```

### 模块实例 (ModuleInstance)

模块在运行时的实例，包含状态信息。

```typescript
interface ModuleInstance {
  module: Module;
  status: ModuleStatus;
  instanceId: string;
  loadedAt?: number;
  activatedAt?: number;
  error?: Error;
}
```

### 模块状态 (ModuleStatus)

```typescript
type ModuleStatus = 
  | 'idle'        // 已注册但未初始化
  | 'loading'     // 正在初始化
  | 'ready'       // 已初始化，可激活
  | 'active'      // 已激活，功能可用
  | 'error'       // 初始化或运行出错
  | 'disabled';   // 用户禁用
```

## 快速开始

### 1. 创建模块

在 `src/renderer/shared/modules/` 目录下创建你的模块文件：

```typescript
// src/renderer/shared/modules/exampleModule.ts
import React from 'react';
import { defineModule } from './hooks';

// 模块主组件
const ExampleComponent = () =&gt; {
  return (
    &lt;div className="p-4"&gt;
      &lt;h2&gt;示例模块&lt;/h2&gt;
      &lt;p&gt;这是一个示例模块组件&lt;/p&gt;
    &lt;/div&gt;
  );
};

// 导出模块
export const exampleModule = defineModule({
  id: 'example',
  name: '示例模块',
  version: '1.0.0',
  description: '一个示例模块，展示如何使用模块系统',
  category: 'feature',
  priority: 10,
  tags: ['示例', '演示'],

  // 生命周期钩子
  onInit: async () =&gt; {
    console.log('示例模块初始化');
  },
  onMount: () =&gt; {
    console.log('示例模块已激活');
  },
  onUnmount: () =&gt; {
    console.log('示例模块已停用');
  },
  onError: (error) =&gt; {
    console.error('示例模块出错:', error);
  },

  // 导出组件
  components: {
    main: ExampleComponent,
  },
});
```

### 2. 注册模块

在 `src/renderer/shared/modules/registry.ts` 中添加你的模块：

```typescript
import { exampleModule } from './exampleModule';

// 在 coreModules 数组中添加
export const coreModules = [
  // ... 其他模块
  exampleModule,
];
```

### 3. 使用模块组件

在你的应用中使用模块组件：

```tsx
import { useModuleComponent } from '../../shared/modules/hooks';

const MyPage = () =&gt; {
  const ExampleComponent = useModuleComponent('example', 'main');
  
  if (!ExampleComponent) {
    return &lt;div&gt;模块未加载&lt;/div&gt;;
  }
  
  return &lt;ExampleComponent /&gt;;
};
```

## 模块分类

| 分类 | 说明 | 示例 |
|------|------|------|
| core | 核心模块，必需的系统功能 | AI助手、主题系统 |
| feature | 功能模块，主要创作功能 | 灵感、角色、写作 |
| integration | 集成模块，外部系统集成 | 云同步、导出 |
| tool | 工具模块，辅助工具 | 模块管理、健康检查 |

## 生命周期

### 1. 注册阶段 (Register)

```
调用 moduleManager.register(module)
→ 模块状态: idle
```

### 2. 初始化阶段 (Init)

```
调用 moduleManager.init(moduleId)
→ 模块状态: loading
→ 执行 onInit()
  ↓ 成功
→ 模块状态: ready
→ 记录 loadedAt
  ↓ 失败
→ 模块状态: error
→ 保存 error
→ 执行 onError()
```

### 3. 激活阶段 (Mount)

```
调用 moduleManager.activate(moduleId)
→ 模块状态: active
→ 记录 activatedAt
→ 执行 onMount()
```

### 4. 停用阶段 (Unmount)

```
调用 moduleManager.deactivate(moduleId)
→ 执行 onUnmount()
→ 模块状态: ready
```

## React Hooks

### useModuleRegistry()

获取整个模块注册表。

```tsx
const registry = useModuleRegistry();
```

### useModule(moduleId)

获取单个模块实例。

```tsx
const moduleInstance = useModule('example');
console.log(moduleInstance.status);
```

### useModuleLifecycle(moduleId)

获取模块生命周期管理方法。

```tsx
const {
  instance,
  loading,
  error,
  init,
  activate,
  deactivate,
  toggleEnabled,
  status,
} = useModuleLifecycle('example');
```

### useModuleComponent(moduleId, componentKey)

获取模块导出的组件。

```tsx
const Component = useModuleComponent('example', 'main');
```

### useModuleService(moduleId, serviceKey)

获取模块导出的服务。

```tsx
const service = useModuleService('example', 'myService');
```

### useModuleRoutes()

获取所有启用模块的路由。

```tsx
const routes = useModuleRoutes();
```

## 模块管理面板

在应用中，你可以通过设置面板中的「模块管理」标签来管理所有模块。该面板提供：

- 模块列表（按分类分组）
- 模块状态查看
- 启用/禁用模块
- 初始化/激活模块
- 错误详情查看
- 搜索和过滤功能

## 模块配置

模块配置会自动保存到 localStorage 中。

```typescript
interface ModuleConfig {
  enabled: boolean;
  settings?: Record&lt;string, unknown&gt;;
}

// 获取配置
const config = moduleManager.getConfig('example');

// 更新配置
moduleManager.updateConfig('example', {
  enabled: true,
  settings: { theme: 'dark' },
});
```

## 依赖管理

模块可以声明对其他模块的依赖：

```typescript
export const myModule = defineModule({
  id: 'myModule',
  name: '我的模块',
  dependencies: ['core', 'theme'],
  
  onInit: async () =&gt; {
    // 这里可以确保依赖模块已初始化
  },
});
```

当初始化该模块时，模块系统会自动先初始化依赖模块。

## 最佳实践

1. **保持模块小而专注** - 每个模块只做一件事
2. **使用明确的依赖关系** - 明确声明所需依赖
3. **提供合理的默认值** - 确保模块在无配置时也能工作
4. **正确处理生命周期** - 在 onUnmount 中清理资源
5. **包含完整的元数据** - 描述、标签、版本号等
6. **遵循 TypeScript 类型** - 提供完整的类型定义

## 示例模块

项目中已包含以下示例模块：

- 灵感模块 (inspiration)
- 角色模块 (character)
- 情节模块 (plot)
- 写作模块 (writing)
- 主题系统模块 (theme)
- AI助手模块 (ai-assistant)

参考这些模块的实现来创建自己的模块。

## 常见问题

### Q: 如何让模块按需加载？

A: 使用动态 import()：

```typescript
export async function loadModule(moduleId: string) {
  if (moduleId === 'myModule') {
    const module = await import('./modules/myModule');
    return module.myModule;
  }
}
```

### Q: 模块之间如何通信？

A: 有几种方式：

1. 通过共享的 state（Zustand 或 Redux）
2. 通过事件系统
3. 通过导出的 services

### Q: 如何测试模块？

A: 模块是纯函数/对象，可以独立测试：

```typescript
describe('exampleModule', () =&gt; {
  it('should initialize', async () =&gt; {
    await exampleModule.onInit?.();
    // ... 断言
  });
});
```

## 下一步

- 查看 `src/renderer/shared/modules/` 目录下的源代码
- 尝试创建自己的模块
- 查看模块管理面板了解实际运行效果
