
import React from 'react';
import { defineModule } from './hooks';
import StepInspiration from '../../features/inspiration/StepInspiration';
import StepCharacters from '../../features/characters/StepCharacters';
import StepPlot from '../../features/plot/StepPlot';
import WritingEditor from '../../features/writing/WritingEditor';
import { memoryModule } from './memoryModule';

// 核心模块定义
// 1. 灵感模块
export const inspirationModule = defineModule({
  id: 'inspiration',
  name: '灵感萌发',
  version: '0.3.7',
  description: '记录和管理创作灵感，AI辅助创意生成',
  category: 'feature',
  priority: 10,
  tags: ['创意', '灵感', 'AI生成'],
  onInit: async () => {
    console.log('[灵感模块] 初始化');
  },
  components: {
    main: StepInspiration,
  },
});

// 2. 角色模块
export const characterModule = defineModule({
  id: 'character',
  name: '角色塑造',
  version: '0.3.7',
  description: '创建和管理角色，定义性格与关系',
  category: 'feature',
  priority: 20,
  tags: ['角色', '关系', '性格'],
  components: {
    main: StepCharacters,
  },
});

// 3. 情节模块
export const plotModule = defineModule({
  id: 'plot',
  name: '情节创作',
  version: '0.3.7',
  description: '大纲规划、章节细纲管理',
  category: 'feature',
  priority: 30,
  tags: ['大纲', '情节', '章节'],
  components: {
    main: StepPlot,
  },
});

// 4. 写作模块
export const writingModule = defineModule({
  id: 'writing',
  name: '正文创作',
  version: '0.3.7',
  description: '沉浸式写作编辑器，AI续写与润色',
  category: 'feature',
  priority: 40,
  tags: ['写作', '编辑器', 'AI'],
  components: {
    main: WritingEditor,
  },
});

// 5. 主题系统模块
export const themeModule = defineModule({
  id: 'theme',
  name: '主题系统',
  version: '0.3.7',
  description: '主题切换和主题管理',
  category: 'core',
  priority: 5,
  tags: ['主题', 'UI', '样式'],
});

// 6. AI助手模块
export const aiAssistantModule = defineModule({
  id: 'ai-assistant',
  name: 'AI助手',
  version: '0.3.7',
  description: 'AI创作助手，多Agent协作系统',
  category: 'core',
  priority: 1,
  tags: ['AI', '助手', 'Agent'],
});

// 导出所有核心模块
export const coreModules = [
  aiAssistantModule,
  themeModule,
  inspirationModule,
  characterModule,
  plotModule,
  writingModule,
  memoryModule,
];

// 按需加载其他模块的示例函数
export async function loadModule(moduleId: string) {
  switch (moduleId) {
    case 'memory':
      return memoryModule;
    default:
      throw new Error(`Unknown module: ${moduleId}`);
  }
}
