import React from 'react';
import { AgentPhase } from '../../../../../shared/types/fileSystem';
import { aiAssistant } from '../../../../shared/services/AIAssistantService';

interface ConfirmPanelProps {
  phase: AgentPhase;
  requiredAction: string;
  pendingFiles: Array<{ action: string; name: string; content: string }>;
}

export const ConfirmPanel: React.FC<ConfirmPanelProps> = ({ phase, requiredAction, pendingFiles }) => {
  if (phase !== AgentPhase.WAITING_CONFIRM) return null;

  return (
    <div className="rounded-xl border overflow-hidden" style={{ backgroundColor: 'var(--color-surface-base)', borderColor: 'var(--color-primary-200)' }}>
      <div className="px-3 py-2 flex items-center gap-2" style={{ background: 'var(--color-primary-100)' }}>
        <i className={`fas ${requiredAction === 'answer_question' ? 'fa-comment-question' : 'fa-file-circle-question'} text-xs`} style={{ color: 'var(--color-primary-400)' }} />
        <span className="text-[11px] font-semibold" style={{ color: 'var(--color-primary-400)' }}>
          {requiredAction === 'confirm_update' ? '确认文件修改' : requiredAction === 'confirm_create' ? '确认文件创建' : '等待你的输入'}
        </span>
      </div>
      {pendingFiles.length > 0 ? (
        <div className="p-2.5 flex flex-col gap-1.5">
          {pendingFiles.map((f, i) => (
            <div key={i} className="flex items-start gap-2 px-2 py-1.5 rounded-lg" style={{ background: 'var(--color-surface-muted)' }}>
              <i className={`fas ${f.action === 'create_file' ? 'fa-file-circle-plus' : 'fa-file-pen'} text-[10px] mt-0.5`}
                style={{ color: f.action === 'create_file' ? 'var(--color-primary-400)' : 'var(--color-warning-400, #f59e0b)' }} />
              <div className="flex-1 min-w-0">
                <div className="text-[11px] font-medium truncate" style={{ color: 'var(--color-text-primary)' }}>{f.name}</div>
                <div className="text-[9px] truncate" style={{ color: 'var(--color-text-muted)' }}>
                  {f.action === 'create_file' ? '新建' : '更新'} · {f.content.length}字
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="p-3 text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
          {requiredAction === 'answer_question' ? 'AI 需要你回答上方问题后继续。' : '正在准备文件操作…'}
        </div>
      )}
      <div className="px-3 py-2 flex gap-2 border-t" style={{ borderColor: 'var(--color-border-default)' }}>
        <button onClick={() => aiAssistant.confirmPendingFiles()}
          className="flex-1 text-[11px] font-semibold py-1.5 rounded-lg border-none cursor-pointer transition-all"
          style={{ background: 'var(--color-primary-400)', color: '#fff' }}>
          <i className="fas fa-check mr-1" />确认
        </button>
        <button onClick={() => aiAssistant.rejectPendingFiles()}
          className="flex-1 text-[11px] font-medium py-1.5 rounded-lg border cursor-pointer transition-all"
          style={{ background: 'transparent', color: 'var(--color-text-secondary)', borderColor: 'var(--color-border-default)' }}>
          取消
        </button>
      </div>
    </div>
  );
};
