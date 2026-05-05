import React from 'react';
import { AIInputPrompt, AIChoicePrompt, AIPlanPrompt } from '../../../../../shared/types/fileSystem';
import { aiAssistant } from '../../../../shared/services/AIAssistantService';

interface PendingPromptRendererProps {
  prompt: AIInputPrompt | AIChoicePrompt | AIPlanPrompt;
  inputAnswer: string;
  setInputAnswer: (v: string) => void;
  inputAnswerRef: React.RefObject<HTMLInputElement | null>;
  handleInputAnswerKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  selectedChoices: string[];
  setSelectedChoices: (v: string[]) => void;
}

export const PendingPromptRenderer: React.FC<PendingPromptRendererProps> = ({
  prompt, inputAnswer, setInputAnswer, inputAnswerRef, handleInputAnswerKeyDown,
  selectedChoices, setSelectedChoices,
}) => {
  const handleChoiceToggle = (option: string, multiSelect: boolean) => {
    setSelectedChoices(
      multiSelect
        ? (selectedChoices.includes(option) ? selectedChoices.filter(c => c !== option) : [...selectedChoices, option])
        : [option]
    );
  };

  switch (prompt.type) {
    case 'input':
      return (
        <div className="glass-card p-3 rounded-xl card-float-hover animate-fade-in" style={{ borderColor: 'var(--color-primary-200)', borderWidth: 1 }}>
          <p className="text-xs font-semibold mb-2.5 flex items-center gap-1.5" style={{ color: 'var(--color-primary-300)' }}>
            <i className="fas fa-keyboard" />{prompt.question}
          </p>
          <div className="flex gap-1.5">
            <input
              ref={inputAnswerRef}
              value={inputAnswer}
              onChange={e => setInputAnswer(e.target.value)}
              onKeyDown={handleInputAnswerKeyDown}
              placeholder={prompt.placeholder || '请输入...'}
              className="flex-1 rounded-lg px-3 py-1.5 text-xs outline-none transition-all"
              style={{ color: 'var(--color-text-primary)', backgroundColor: 'var(--color-surface-muted)', border: '1px solid var(--color-border-default)' }}
            />
            <button
              onClick={() => inputAnswer.trim() && aiAssistant.answerInput(inputAnswer.trim())}
              disabled={!inputAnswer.trim()}
              className="btn-gradient text-[10px] font-medium rounded-lg px-3 py-1.5 shadow-sm"
              style={{ opacity: inputAnswer.trim() ? 1 : 0.45 }}
            >
              <i className="fas fa-paper-plane mr-1" />发送
            </button>
          </div>
          <button onClick={() => aiAssistant.dismissPrompt()} className="btn-outline-muted text-[9px] mt-2 px-2 py-0.5 rounded-lg">跳过</button>
        </div>
      );

    case 'choice':
      return (
        <div className="glass-card p-3 rounded-xl card-float-hover animate-fade-in" style={{ borderColor: 'var(--color-primary-200)', borderWidth: 1 }}>
          <p className="text-xs font-semibold mb-2.5 flex items-center gap-1.5" style={{ color: 'var(--color-primary-300)' }}>
            <i className="fas fa-list-check" />{prompt.question}
          </p>
          {prompt.multiSelect && (
            <p className="text-[9px] mb-2" style={{ color: 'var(--color-text-tertiary)' }}>可多选</p>
          )}
          <div className="flex flex-wrap gap-1.5">
            {prompt.options.map((o, i) => {
              const isSelected = selectedChoices.includes(o);
              return (
                <button
                  key={i}
                  onClick={() => handleChoiceToggle(o, prompt.multiSelect)}
                  className="text-[10px] font-medium rounded-lg px-3 py-1.5 transition-all shadow-sm"
                  style={{
                    background: isSelected ? 'linear-gradient(135deg, var(--color-primary-500), var(--color-primary-600))' : 'var(--color-surface-muted)',
                    color: isSelected ? 'white' : 'var(--color-text-secondary)',
                    border: isSelected ? '1px solid var(--color-primary-400)' : '1px solid var(--color-border-default)',
                  }}
                >
                  {isSelected && <i className="fas fa-check mr-1 text-[8px]" />}{o}
                </button>
              );
            })}
          </div>
          <div className="flex gap-1.5 mt-2.5">
            <button
              onClick={() => {
                if (selectedChoices.length > 0) {
                  aiAssistant.answerChoice(prompt.multiSelect ? selectedChoices : selectedChoices[0]);
                }
              }}
              disabled={selectedChoices.length === 0}
              className="btn-gradient text-[10px] font-medium rounded-lg px-3 py-1.5 shadow-sm"
              style={{ opacity: selectedChoices.length > 0 ? 1 : 0.45 }}
            >
              确认选择
            </button>
            <button onClick={() => aiAssistant.dismissPrompt()} className="btn-outline-muted text-[10px] px-3 py-1.5 rounded-lg">跳过</button>
          </div>
        </div>
      );

    case 'plan':
      return (
        <div className="glass-card p-3 rounded-xl card-float-hover animate-fade-in" style={{ borderColor: 'var(--color-primary-200)', borderWidth: 1 }}>
          <p className="text-xs font-bold mb-1 flex items-center gap-1.5" style={{ color: 'var(--color-primary-300)' }}>
            <i className="fas fa-clipboard-list" />{prompt.title}
          </p>
          <p className="text-[9px] mb-3" style={{ color: 'var(--color-text-tertiary)' }}>AI 制定了以下执行计划，请确认后逐步执行</p>
          <div className="flex flex-col gap-1.5 mb-3">
            {prompt.steps.map((step, i) => (
              <div
                key={i}
                className="flex items-start gap-2 p-2 rounded-lg transition-all"
                style={{
                  backgroundColor: step.enabled ? 'var(--color-surface-muted)' : 'transparent',
                  opacity: step.enabled ? 1 : 0.45,
                  border: '1px solid var(--color-border-default)',
                }}
              >
                <button
                  onClick={() => aiAssistant.togglePlanStep(i, !step.enabled)}
                  className="w-4 h-4 rounded flex items-center justify-center shrink-0 mt-0.5 transition-all cursor-pointer border-none"
                  style={{
                    background: step.enabled ? 'var(--color-primary-500)' : 'var(--color-surface-muted)',
                    color: step.enabled ? 'white' : 'var(--color-text-muted)',
                  }}
                >
                  <i className={`fas ${step.enabled ? 'fa-check' : 'fa-minus'} text-[7px]`} />
                </button>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                    <span style={{ color: 'var(--color-primary-400)' }}>{i + 1}.</span> {step.title}
                  </p>
                  {step.description && (
                    <p className="text-[9px] mt-0.5 leading-relaxed" style={{ color: 'var(--color-text-tertiary)' }}>{step.description}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-1.5">
            <button
              onClick={() => aiAssistant.confirmPlan()}
              className="btn-gradient text-[10px] font-medium rounded-lg px-3 py-1.5 shadow-sm flex items-center gap-1"
            >
              <i className="fas fa-play text-[8px]" />确认执行
            </button>
            <button onClick={() => aiAssistant.cancelPlan()} className="btn-outline-muted text-[10px] px-3 py-1.5 rounded-lg">取消</button>
          </div>
        </div>
      );

    default:
      return null;
  }
};
