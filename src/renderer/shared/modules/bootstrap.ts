
import { moduleManager } from './ModuleManager';
import { coreModules } from './registry';

// 初始化模块系统
export async function bootstrapModules(): Promise<void> {
  console.log('[模块系统] 初始化中...');

  try {
    // 注册核心模块
    console.log('[模块系统] 注册核心模块...');
    moduleManager.registerMany(coreModules);

    // 初始化启用的模块
    console.log('[模块系统] 初始化核心模块...');
    await moduleManager.initAll();

    // 尝试激活核心模块
    coreModules.forEach(m => {
      const instance = moduleManager.get(m.id);
      if (instance && instance.status === 'ready') {
        moduleManager.activate(m.id);
      }
    });

    console.log('[模块系统] 初始化完成');
  } catch (error) {
    console.error('[模块系统] 初始化失败:', error);
  }
}
