import React, { useState, useEffect, useMemo } from 'react';
import { consistencyService, ConsistencyIssue, ConsistencyIssueType } from '../../../shared/services/ConsistencyService';
import { Character } from '../../../../shared/types';
import { useTheme } from '../../../shared/contexts/ThemeContext';
import { useUIStore } from '../../../shared/stores/uiStore';

interface ConsistencyPanelProps {
  isOpen: boolean;
  onClose: () => void;
  content: string;
  characters: Character[];
  onSelectIssue?: (issue: ConsistencyIssue) => void;
}

const ConsistencyPanel: React.FC<ConsistencyPanelProps> = ({
  isOpen,
  onClose,
  content,
  characters,
  onSelectIssue,
}) => {
  const [issues, setIssues] = useState<ConsistencyIssue[]>([]);
  const [filterType, setFilterType] = useState<ConsistencyIssueType | 'all'>('all');
  const [filterSeverity, setFilterSeverity] = useState<ConsistencyIssue['severity'] | 'all'>('all');
  const [selectedIssue, setSelectedIssue] = useState<ConsistencyIssue | null>(null);
  const { themeInfo } = useTheme();
  const { animationLevel } = useUIStore();
  const hasAnimations = animationLevel !== 'none';

  useEffect(() => {
    if (isOpen && content && characters.length > 0) {
      const result = consistencyService.checkConsistency(content, characters);
      setIssues(result);
    }
  }, [isOpen, content, characters]);

  const filteredIssues = useMemo(() => {
    return issues.filter(issue => {
      if (filterType !== 'all' && issue.type !== filterType) return false;
      if (filterSeverity !== 'all' && issue.severity !== filterSeverity) return false;
      return true;
    });
  }, [issues, filterType, filterSeverity]);

  const groupedIssues = useMemo(() => {
    const groups: Record<string, ConsistencyIssue[]> = {};
    filteredIssues.forEach(issue => {
      const key = issue.characterName || '未识别角色';
      if (!groups[key]) groups[key] = [];
      groups[key].push(issue);
    });
    return groups;
  }, [filteredIssues]);

  const typeLabels: Record<ConsistencyIssueType | 'all', string> = {
    all: '全部',
    personality: '性格',
    speech: '对话',
    behavior: '行为',
    appearance: '外貌',
  };

  const severityLabels: Record<ConsistencyIssue['severity'] | 'all', string> = {
    all: '全部',
    low: '建议',
    medium: '注意',
    high: '警告',
  };

  if (!isOpen) return null;

  return (
    <div
      className={`
        fixed inset-0 z-50 flex items-center justify-center
        ${hasAnimations ? 'animate-fade-in' : ''}
      `}
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
      onClick={onClose}
    >
      <div
        className={`
          w-[520px] max-h-[80vh] rounded-2xl overflow-hidden flex flex-col
          ${hasAnimations ? 'animate-scale-in' : ''}
        `}
        style={{
          background: 'var(--glass-bg)',
          backdropFilter: 'blur(20px)',
          border: `1px solid ${themeInfo.primaryColor}30`,
        }}
        onClick={e => e.stopPropagation()}
      >
        <div
          className="h-1 w-full"
          style={{ background: `linear-gradient(90deg, ${themeInfo.primaryColor}, transparent)` }}
        />

        <div className="flex items-center justify-between p-5 border-b" style={{ borderColor: 'var(--border-color)' }}>
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{
                background: `linear-gradient(135deg, ${themeInfo.primaryColor}30, ${themeInfo.primaryColor}10)`,
              }}
            >
              <i className="fas fa-shield-check" style={{ color: themeInfo.primaryColor }} />
            </div>
            <div>
              <h3 className="font-bold text-lg" style={{ color: 'var(--text-primary)' }}>
                一致性检查
              </h3>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                检测角色设定与描写的一致性
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
            style={{
              background: 'var(--bg-tertiary)',
              color: 'var(--text-muted)',
            }}
          >
            <i className="fas fa-times" />
          </button>
        </div>

        <div className="flex gap-3 p-4 border-b" style={{ borderColor: 'var(--border-color)' }}>
          <div className="flex items-center gap-2">
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>类型:</span>
            <div className="flex gap-1">
              {(Object.keys(typeLabels) as (ConsistencyIssueType | 'all')[]).map(type => (
                <button
                  key={type}
                  onClick={() => setFilterType(type)}
                  className={`
                    px-2 py-1 rounded text-xs transition-all
                    ${filterType === type ? 'ring-1' : ''}
                  `}
                  style={{
                    background: filterType === type ? themeInfo.primaryColor + '20' : 'var(--bg-tertiary)',
                    color: filterType === type ? themeInfo.primaryColor : 'var(--text-secondary)',
                    boxShadow: filterType === type ? `0 0 0 1px ${themeInfo.primaryColor}` : 'none',
                  }}
                >
                  {typeLabels[type]}
                </button>
              ))}
            </div>
          </div>
          <div className="w-px" style={{ background: 'var(--border-color)' }} />
          <div className="flex items-center gap-2">
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>严重:</span>
            <div className="flex gap-1">
              {(Object.keys(severityLabels) as (ConsistencyIssue['severity'] | 'all')[]).map(severity => (
                <button
                  key={severity}
                  onClick={() => setFilterSeverity(severity)}
                  className={`
                    px-2 py-1 rounded text-xs transition-all
                    ${filterSeverity === severity ? 'ring-1' : ''}
                  `}
                  style={{
                    background: filterSeverity === severity ? themeInfo.primaryColor + '20' : 'var(--bg-tertiary)',
                    color: filterSeverity === severity ? themeInfo.primaryColor : 'var(--text-secondary)',
                    boxShadow: filterSeverity === severity ? `0 0 0 1px ${themeInfo.primaryColor}` : 'none',
                  }}
                >
                  {severityLabels[severity]}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {filteredIssues.length === 0 ? (
            <div className="text-center py-12">
              <div
                className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center"
                style={{ background: 'rgba(34, 197, 94, 0.1)' }}
              >
                <i className="fas fa-check-circle text-2xl" style={{ color: 'var(--color-green-500, #22c55e)' }} />
              </div>
              <h4 className="font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
                检查通过
              </h4>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                未发现明显的一致性问题
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {Object.entries(groupedIssues).map(([characterName, charIssues]) => (
                <div key={characterName}>
                  <div className="flex items-center gap-2 mb-3">
                    <div
                      className="w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold"
                      style={{
                        background: `linear-gradient(135deg, ${themeInfo.primaryColor}40, ${themeInfo.primaryColor}20)`,
                        color: themeInfo.primaryColor,
                      }}
                    >
                      {characterName.charAt(0)}
                    </div>
                    <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
                      {characterName}
                    </span>
                    <span
                      className="text-xs px-2 py-0.5 rounded-full"
                      style={{
                        background: 'var(--bg-tertiary)',
                        color: 'var(--text-muted)',
                      }}
                    >
                      {charIssues.length} 个问题
                    </span>
                  </div>

                  <div className="space-y-2 pl-8">
                    {charIssues.map(issue => (
                      <div
                        key={issue.id}
                        onClick={() => {
                          setSelectedIssue(issue);
                          onSelectIssue?.(issue);
                        }}
                        className={`
                          p-3 rounded-xl cursor-pointer transition-all
                          border
                          ${selectedIssue?.id === issue.id ? 'ring-2' : ''}
                        `}
                        style={{
                          background: selectedIssue?.id === issue.id ? `${themeInfo.primaryColor}10` : 'var(--bg-tertiary)',
                          borderColor: selectedIssue?.id === issue.id ? themeInfo.primaryColor : 'var(--border-color)',
                          boxShadow: selectedIssue?.id === issue.id ? `0 0 0 1px ${themeInfo.primaryColor}` : 'none',
                        }}
                      >
                        <div className="flex items-start gap-3">
                          <div
                            className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                            style={{
                              background: `${consistencyService.getSeverityColor(issue.severity)}20`,
                              color: consistencyService.getSeverityColor(issue.severity),
                            }}
                          >
                            <i className={`fas ${issue.severity === 'high' ? 'fa-exclamation-triangle' : issue.severity === 'medium' ? 'fa-info-circle' : 'fa-lightbulb'}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
                                {consistencyService.getIssueTypeLabel(issue.type)}
                              </span>
                              <span
                                className="text-xs px-1.5 py-0.5 rounded"
                                style={{
                                  background: `${consistencyService.getSeverityColor(issue.severity)}20`,
                                  color: consistencyService.getSeverityColor(issue.severity),
                                }}
                              >
                                {consistencyService.getSeverityLabel(issue.severity)}
                              </span>
                            </div>
                            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                              {issue.description}
                            </p>
                          </div>
                        </div>

                        {selectedIssue?.id === issue.id && (
                          <div className="mt-3 pt-3 border-t" style={{ borderColor: 'var(--border-color)' }}>
                            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                              <i className="fas fa-lightbulb mr-1" />
                              {issue.suggestion}
                            </p>
                            <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
                              <i className="fas fa-file-text mr-1" />
                              第 {issue.context.line} 行
                            </p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-2 p-4 border-t" style={{ borderColor: 'var(--border-color)' }}>
          <button
            onClick={() => {
              const result = consistencyService.checkConsistency(content, characters);
              setIssues(result);
            }}
            className="flex-1 py-2.5 rounded-xl font-medium transition-all"
            style={{
              background: 'var(--bg-tertiary)',
              color: 'var(--text-secondary)',
              border: '1px solid var(--border-color)',
            }}
          >
            <i className="fas fa-refresh mr-2" />重新检查
          </button>
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl font-medium transition-all"
            style={{
              background: `linear-gradient(135deg, ${themeInfo.primaryColor}, ${themeInfo.secondaryColor})`,
              color: '#fff',
            }}
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConsistencyPanel;
