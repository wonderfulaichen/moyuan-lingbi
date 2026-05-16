import React from 'react';
import { HealthIssue, HealthCheckResult } from '../../shared/services/MemoryHealthService';
import { useTheme } from '../../shared/contexts/ThemeContext';
import { useUIStore } from '../../shared/stores/uiStore';

interface MemoryHealthPanelProps {
  result: HealthCheckResult | null;
  onRecheck: () => void;
}

const getHealthColor = (score: number) => {
  if (score >= 80) return 'var(--color-green-400, #34d399)';
  if (score >= 60) return 'var(--color-blue-400, #60a5fa)';
  if (score >= 40) return 'var(--color-amber-400, #f59e0b)';
  return 'var(--color-red-500, #ef4444)';
};

const getHealthLabel = (score: number) => {
  if (score >= 80) return '优秀';
  if (score >= 60) return '良好';
  if (score >= 40) return '需改进';
  return '需修复';
};

const getSeverityColor = (severity: string) => {
  switch (severity) {
    case 'error': return 'var(--color-red-500, #ef4444)';
    case 'warning': return 'var(--color-amber-400, #f59e0b)';
    case 'info': return 'var(--color-blue-400, #60a5fa)';
    default: return 'var(--color-gray-500, #6b7280)';
  }
};

const getSeverityLabel = (severity: string) => {
  switch (severity) {
    case 'error': return '错误';
    case 'warning': return '警告';
    case 'info': return '提示';
    default: return '未知';
  }
};

const CircularProgress = ({ score }: { score: number }) => {
  const radius = 60;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = getHealthColor(score);

  return (
    <div className="relative w-32 h-32">
      <svg className="w-full h-full" viewBox="0 0 160 160">
        <circle
          cx="80"
          cy="80"
          r={radius}
          fill="none"
          stroke="var(--color-surface-muted)"
          strokeWidth="12"
        />
        <circle
          cx="80"
          cy="80"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform="rotate(-90 80 80)"
          className="transition-all duration-700"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-black" style={{ color }}>{score}</span>
        <span className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>健康度</span>
      </div>
    </div>
  );
};

const IssueItem = ({ issue }: { issue: HealthIssue }) => {
  const color = getSeverityColor(issue.severity);
  const bgColor = `${color}15`;

  return (
    <div
      className="p-4 rounded-xl border transition-all hover:scale-[1.01]"
      style={{
        backgroundColor: bgColor,
        borderColor: `${color}30`,
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
          style={{ backgroundColor: `${color}25` }}
        >
          <i
            className={`fas ${
              issue.severity === 'error'
                ? 'fa-exclamation-triangle'
                : issue.severity === 'warning'
                ? 'fa-exclamation-circle'
                : 'fa-info-circle'
            }`}
            style={{ color }}
          />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="font-semibold text-sm" style={{ color: 'var(--color-text-primary)' }}>
              {issue.title}
            </h4>
            <span
              className="text-xs px-2 py-0.5 rounded-full font-medium"
              style={{ backgroundColor: `${color}25`, color }}
            >
              {getSeverityLabel(issue.severity)}
            </span>
          </div>
          <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
            {issue.description}
          </p>
        </div>
      </div>
    </div>
  );
};

export const MemoryHealthPanel: React.FC<MemoryHealthPanelProps> = ({ result, onRecheck }) => {
  if (!result) {
    return (
      <div className="glass-card rounded-2xl p-8 text-center">
        <i className="fas fa-heartbeat text-5xl mb-4 opacity-20" style={{ color: 'var(--color-text-muted)' }} />
        <h3 className="font-bold text-lg mb-2" style={{ color: 'var(--color-text-primary)' }}>
          开始健康检查
        </h3>
        <p className="text-sm mb-6 max-w-md mx-auto" style={{ color: 'var(--color-text-secondary)' }}>
          点击下方按钮检查记忆体的健康状况，发现重复、完整性和一致性问题
        </p>
        <button
          onClick={onRecheck}
          className="px-6 py-3 rounded-xl font-medium transition-all hover:scale-105 active:scale-95 flex items-center gap-2 mx-auto"
          style={{
            background: 'linear-gradient(135deg, var(--color-primary-400), var(--color-primary-600))',
            color: 'white',
          }}
        >
          <i className="fas fa-play" />
          立即检查
        </button>
      </div>
    );
  }

  const errors = result.issues.filter(i => i.severity === 'error');
  const warnings = result.issues.filter(i => i.severity === 'warning');
  const infos = result.issues.filter(i => i.severity === 'info');

  return (
    <div className="space-y-6">
      <div className="glass-card rounded-2xl p-6">
        <div className="flex flex-col md:flex-row items-center gap-8">
          <CircularProgress score={result.score} />
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-4">
              <h3 className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
                记忆体健康报告
              </h3>
              <span
                className="px-3 py-1 rounded-full text-sm font-medium"
                style={{
                  backgroundColor: `${getHealthColor(result.score)}20`,
                  color: getHealthColor(result.score),
                }}
              >
                {getHealthLabel(result.score)}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="text-center p-3 rounded-xl" style={{ background: 'var(--color-surface-muted)' }}>
                <div className="text-2xl font-bold" style={{ color: 'var(--color-red-500, #ef4444)' }}>{errors.length}</div>
                <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>错误</div>
              </div>
              <div className="text-center p-3 rounded-xl" style={{ background: 'var(--color-surface-muted)' }}>
                <div className="text-2xl font-bold" style={{ color: 'var(--color-amber-400, #f59e0b)' }}>{warnings.length}</div>
                <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>警告</div>
              </div>
              <div className="text-center p-3 rounded-xl" style={{ background: 'var(--color-surface-muted)' }}>
                <div className="text-2xl font-bold" style={{ color: 'var(--color-blue-400, #60a5fa)' }}>{infos.length}</div>
                <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>提示</div>
              </div>
            </div>
            <button
              onClick={onRecheck}
              className="px-4 py-2 rounded-xl text-sm font-medium transition-all hover:scale-105 active:scale-95 flex items-center gap-2"
              style={{
                background: 'var(--color-surface-muted)',
                color: 'var(--color-text-secondary)',
                border: '1px solid var(--color-border-default)',
              }}
            >
              <i className="fas fa-redo" />
              重新检查
            </button>
          </div>
        </div>
      </div>

      {result.issues.length > 0 ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold" style={{ color: 'var(--color-text-primary)' }}>
              <i className="fas fa-list mr-2" />
              发现的问题
            </h4>
          </div>

          {errors.length > 0 && (
            <div className="space-y-3">
              <h5 className="text-xs font-semibold flex items-center gap-2" style={{ color: 'var(--color-red-500, #ef4444)' }}>
                <i className="fas fa-exclamation-triangle" />
                需要修复的问题 ({errors.length})
              </h5>
              <div className="space-y-3">
                {errors.map(issue => (
                  <IssueItem key={issue.id} issue={issue} />
                ))}
              </div>
            </div>
          )}

          {warnings.length > 0 && (
            <div className="space-y-3">
              <h5 className="text-xs font-semibold flex items-center gap-2" style={{ color: 'var(--color-amber-400, #f59e0b)' }}>
                <i className="fas fa-exclamation-circle" />
                需要注意的问题 ({warnings.length})
              </h5>
              <div className="space-y-3">
                {warnings.map(issue => (
                  <IssueItem key={issue.id} issue={issue} />
                ))}
              </div>
            </div>
          )}

          {infos.length > 0 && (
            <div className="space-y-3">
              <h5 className="text-xs font-semibold flex items-center gap-2" style={{ color: 'var(--color-blue-400, #60a5fa)' }}>
                <i className="fas fa-info-circle" />
                优化建议 ({infos.length})
              </h5>
              <div className="space-y-3">
                {infos.map(issue => (
                  <IssueItem key={issue.id} issue={issue} />
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="glass-card rounded-2xl p-8 text-center">
          <i className="fas fa-check-circle text-5xl mb-4" style={{ color: 'var(--color-green-400, #34d399)' }} />
          <h3 className="font-bold text-lg mb-2" style={{ color: 'var(--color-text-primary)' }}>
            完美！
          </h3>
          <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            您的记忆体非常健康，没有发现任何问题
          </p>
        </div>
      )}
    </div>
  );
};
