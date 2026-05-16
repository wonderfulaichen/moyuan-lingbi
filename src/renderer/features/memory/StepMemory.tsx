import React from 'react';
import { ModelConfig } from '../../../shared/types';

interface StepMemoryProps {
  activeModel: ModelConfig;
  onOpenSettings: () => void;
}

const StepMemory: React.FC<StepMemoryProps> = () => {
  return (
    <div className="h-full flex items-center justify-center">
      <div className="text-center max-w-md mx-auto px-8">
        <div className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-6"
          style={{ background: 'linear-gradient(135deg, var(--color-primary-100), var(--color-primary-50))' }}>
          <i className="fas fa-code text-3xl" style={{ color: 'var(--color-primary-400)' }} />
        </div>
        <h2 className="text-2xl font-black tracking-tight mb-3" style={{ color: 'var(--color-text-primary)' }}>
          正在开发中
        </h2>
        <p className="text-sm leading-relaxed mb-6" style={{ color: 'var(--color-text-tertiary)' }}>
          记忆体系统正在重构中，将提供更智能的创作记忆管理功能。
          <br />
          敬请期待后续版本更新。
        </p>
        <div className="flex items-center justify-center gap-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
          <i className="fas fa-hard-hat" />
          <span>开发团队正在努力建设中</span>
        </div>
      </div>
    </div>
  );
};

export default StepMemory;
