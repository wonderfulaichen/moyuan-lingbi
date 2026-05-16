
import React from 'react';
import { defineModule } from './hooks';
import StepMemory from '../../features/memory/StepMemory';

export const memoryModule = defineModule({
  id: 'memory',
  name: '记忆体系统',
  version: '0.3.7',
  description: '记忆体系统 - 开发测试中。自动整理创作记忆，AI 理解上下文，智能管理角色、世界观和剧情记忆。',
  category: 'feature',
  priority: 25,
  tags: ['实验功能', 'AI助手', '记忆管理'],
  
  onInit: async () => {
    console.log('[记忆体模块] 初始化中...');
  },
  
  onMount: () => {
    console.log('[记忆体模块] 已激活');
  },
  
  onUnmount: () => {
    console.log('[记忆体模块] 已停用');
  },
  
  onError: (error) => {
    console.error('[记忆体模块] 错误:', error);
  },
  
  components: {
    main: StepMemory,
  },
});

