import React from 'react';

export type StepId = 'inspiration' | 'content' | 'plot' | 'review';

interface Step {
  id: StepId;
  label: string;
  icon: string;
}

interface BottomNavProps {
  steps: Step[];
  activeStep: StepId;
  onSelectStep: (stepId: StepId) => void;
  onOpenAssistant?: () => void;
}

const BottomNav: React.FC<BottomNavProps> = ({ steps, activeStep, onSelectStep, onOpenAssistant }) => {
  return (
    <nav className="mobile-bottom-nav">
      {steps.map((step) => {
        const isActive = activeStep === step.id;
        return (
          <button
            key={step.id}
            onClick={() => onSelectStep(step.id)}
            className={`mobile-nav-item ${isActive ? 'active' : ''}`}
            aria-label={step.label}
            title={step.label}
          >
            <div className="mobile-nav-icon">
              <i className={`fas ${step.icon}`}></i>
            </div>
            <span className="mobile-nav-label">{step.label}</span>
            {isActive && <div className="mobile-nav-indicator" />}
          </button>
        );
      })}
      {onOpenAssistant && (
        <button
          onClick={onOpenAssistant}
          className="mobile-nav-item mobile-nav-assistant"
          aria-label="AI助手"
          title="AI助手"
        >
          <div className="mobile-nav-icon assistant-icon">
            <i className="fas fa-robot"></i>
          </div>
          <span className="mobile-nav-label">助手</span>
        </button>
      )}
    </nav>
  );
};

export default BottomNav;
