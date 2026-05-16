import React, { useState, useMemo } from 'react';
import { ModelConfig } from '../../../shared/types';
import { dataService } from '../../shared/services/DataService';
import { aiService } from '../../shared/services/aiService';
import { useTheme } from '../../shared/contexts/ThemeContext';
import { useUIStore } from '../../shared/stores/uiStore';
import AIProgressButton from '../../shared/components/AIProgressButton';
  
import StepMemory from '../memory/StepMemory';

type ReviewTab = 'overview' | 'report' | 'memory';
  
interface ReviewIssue {
  type: 'error' | 'warning' | 'suggestion';
  category: string;
  title: string;
  description: string;
  location?: string;
  selected?: boolean;
  fixed?: boolean;
}

interface ReviewReport {
  timestamp: number;
  issues: ReviewIssue[];
  summary: string;
  stats: {
    totalWords: number;
    totalFiles: number;
    consistencyScore: number;
    completenessScore: number;
  };
}

const StepReview: React.FC<{ activeModel: ModelConfig; onOpenSettings?: () => void }> = ({ activeModel, onOpenSettings }) => {
  const { themeInfo } = useTheme();
  const { animationLevel, writingStats, resetWritingStats, updateWritingStats } = useUIStore();
  const hasAnimations = animationLevel !== 'none';
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [goalInput, setGoalInput] = useState(writingStats.dailyGoal.toString());
  const [activeTab, setActiveTab] = useState<ReviewTab>('overview');
  const [isReviewing, setIsReviewing] = useState(false);
  const [isFixing, setIsFixing] = useState(false);
  const [fixProgress, setFixProgress] = useState(0);
  const [reviewProgress, setReviewProgress] = useState(0);
  const [currentReport, setCurrentReport] = useState<ReviewReport | null>(null);
  const [reviewHistory, setReviewHistory] = useState<ReviewReport[]>(() => {
    try {
      const saved = localStorage.getItem('moyuan-review-history');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

  const fs = dataService.getFS();
  const project = dataService.getActiveProject();
  
  const allFiles = useMemo(() => {
    return Object.values(fs.files).filter(f => f.type === 'file');
  }, [fs.files]);
  
  const totalChars = useMemo(() => {
    return allFiles.reduce((s, f) => s + f.content.length, 0);
  }, [allFiles]);

  const categorizeFiles = useMemo(() => {
    const categories = {
      outline: [] as typeof allFiles,
      detailedOutline: [] as typeof allFiles,
      chapters: [] as typeof allFiles,
      worldSettings: [] as typeof allFiles,
      characterSettings: [] as typeof allFiles,
      other: [] as typeof allFiles
    };

    allFiles.forEach(file => {
      const name = file.name.toLowerCase();
      // 优先通过父文件夹的 tags 判断类别
      const parent = file.parentId ? fs.files[file.parentId] : null;
      const parentTags = parent?.metadata?.tags || [];
      const fileTags = file.metadata?.tags || [];
      const allTags = [...new Set([...parentTags, ...fileTags])];

      if (allTags.includes('chapters') || allTags.includes('chapter')) {
        categories.chapters.push(file);
      } else if (allTags.includes('detailed_outline') || name.includes('细纲') || name.includes('章纲')) {
        categories.detailedOutline.push(file);
      } else if (allTags.includes('outline') || name.includes('大纲')) {
        categories.outline.push(file);
      } else if (allTags.includes('world') || name.includes('世界观')) {
        categories.worldSettings.push(file);
      } else if (allTags.includes('characters') || allTags.includes('character') || name.includes('角色')) {
        categories.characterSettings.push(file);
      } else {
        categories.other.push(file);
      }
    });

    return categories;
  }, [allFiles, fs.files]);

  const syncToHistory = (updated: ReviewReport) => {
    const updatedHistory = reviewHistory.map(r =>
      r.timestamp === updated.timestamp ? { ...r, issues: updated.issues } : r
    );
    setReviewHistory(updatedHistory);
    localStorage.setItem('moyuan-review-history', JSON.stringify(updatedHistory));
  };

  const toggleIssueSelected = (index: number) => {
    if (!currentReport) return;
    const updated = { ...currentReport };
    updated.issues = updated.issues.map((issue, i) =>
      i === index ? { ...issue, selected: !issue.selected } : issue
    );
    setCurrentReport(updated);
    syncToHistory(updated);
  };

  const selectAllIssues = (selected: boolean) => {
    if (!currentReport) return;
    const updated = { ...currentReport };
    updated.issues = updated.issues.map(issue => ({ ...issue, selected }));
    setCurrentReport(updated);
    syncToHistory(updated);
  };

  const handleFixSelected = async () => {
    if (!activeModel?.modelName || !currentReport) return;
    const selectedIssues = currentReport.issues.filter(i => i.selected && !i.fixed);
    if (selectedIssues.length === 0) return;

    setIsFixing(true);
    setFixProgress(0);

    try {
      // 收集所有文件内容作为上下文
      const allFileContents = allFiles.map(f => `【${f.name}】\n${f.content}`).join('\n\n---\n\n');

      for (let i = 0; i < selectedIssues.length; i++) {
        const issue = selectedIssues[i];
        setFixProgress(Math.round(((i) / selectedIssues.length) * 100));

        const fixPrompt = `你是一个专业的小说编辑。请根据以下审查问题，修复小说内容中的问题。

## 需要修复的问题
类型：${issue.type === 'error' ? '错误' : issue.type === 'warning' ? '警告' : '建议'}
分类：${issue.category}
标题：${issue.title}
描述：${issue.description}
${issue.location ? `位置：${issue.location}` : ''}

## 当前小说全部内容
${allFileContents}

## 要求
1. 分析问题描述，找出需要修改的具体内容
2. 只修改与问题相关的部分，不要改动其他内容
3. 返回修改后的完整文件内容，格式如下：

【文件名】
修改后的完整内容

【文件名】
修改后的完整内容

如果某个文件不需要修改，则不要包含它。只返回需要修改的文件。`;

        const response = await aiService.generateStream(
          {
            model: activeModel,
            prompt: fixPrompt,
            systemPrompt: '你是一个专业的小说编辑，擅长修复小说中的逻辑矛盾、设定冲突等问题。只返回需要修改的文件内容，不要额外解释。',
            temperature: 0.3,
            maxTokens: 8000,
          },
          () => {},
          `review-fix-${i}`
        );

        // 解析返回的文件内容并更新
        const content = response.content || '';
        const fileMatches = content.match(/【([^】]+)】\n([\s\S]*?)(?=\n【|$)/g);
        if (fileMatches) {
          fileMatches.forEach(match => {
            const nameMatch = match.match(/【([^】]+)】\n([\s\S]*)/);
            if (nameMatch) {
              const fileName = nameMatch[1].trim();
              const newContent = nameMatch[2].trim();
              const file = allFiles.find(f => f.name === fileName);
              if (file && newContent && newContent !== file.content) {
                dataService.updateFile(file.id, { content: newContent });
              }
            }
          });
        }

        // 标记为已修复
        const issueIndex = currentReport.issues.findIndex(
          item => item.title === issue.title && item.description === issue.description
        );
        if (issueIndex >= 0) {
          const updated = { ...currentReport };
          updated.issues = updated.issues.map((item, idx) =>
            idx === issueIndex ? { ...item, fixed: true, selected: false } : item
          );
          setCurrentReport(updated);

          syncToHistory(updated);
        }
      }

      setFixProgress(100);
    } catch (error) {
      console.error('修复失败:', error);
    } finally {
      setTimeout(() => {
        setIsFixing(false);
        setFixProgress(0);
      }, 500);
    }
  };

  const handleReview = async () => {
    if (!activeModel?.modelName) return;
    
    setIsReviewing(true);
    setReviewProgress(0);
    
    try {
      const outline = categorizeFiles.outline.map(f => f.content).join('\n\n');
      const detailedOutline = categorizeFiles.detailedOutline.map(f => f.content).join('\n\n');
      const chapters = categorizeFiles.chapters.map(f => `【${f.name}】\n${f.content}`).join('\n\n');
      const worldSettings = categorizeFiles.worldSettings.map(f => `【${f.name}】\n${f.content}`).join('\n\n');
      const characterSettings = categorizeFiles.characterSettings.map(f => `【${f.name}】\n${f.content}`).join('\n\n');
      
      const reviewPrompt = `你是一个专业的小说审查专家。请对以下小说项目进行全面审查：

## 大纲
${outline || '(未找到大纲)'}

## 细纲
${detailedOutline || '(未找到细纲)'}

## 章节内容
${chapters || '(未找到章节)'}

## 世界观设定
${worldSettings || '(未找到世界观设定)'}

## 角色设定
${characterSettings || '(未找到角色设定)'}

请从以下维度进行审查：
1. **一致性检查**：角色设定、剧情逻辑、时间线是否前后矛盾
2. **完整性检查**：大纲、细纲、章节是否完整对应
3. **可读性建议**：情节发展是否合理，节奏是否恰当
4. **潜在问题**：是否有漏洞、重复、逻辑错误

请以JSON格式返回审查结果：
{
  "summary": "总体评价（一句话）",
  "stats": {
    "totalWords": 总字数,
    "totalFiles": 总文件数,
    "consistencyScore": 一致性评分(0-100),
    "completenessScore": 完整性评分(0-100)
  },
  "issues": [
    {
      "type": "error/warning/suggestion",
      "category": "所属分类",
      "title": "问题标题",
      "description": "详细说明",
      "location": "相关位置（可选）"
    }
  ]
}`;

      setReviewProgress(30);
      
      const response = await aiService.generateStream(
        {
          model: activeModel,
          prompt: reviewPrompt,
          systemPrompt: '你是一个专业的小说审查专家，只返回JSON格式的审查结果，不要额外的解释。',
          temperature: 0.3,
          maxTokens: 8000,
        },
        () => {},
        'review-task'
      );

      setReviewProgress(80);
      
      let reportData: Partial<ReviewReport> = {};
      try {
        const jsonMatch = response.content?.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          reportData = JSON.parse(jsonMatch[0]);
        }
      } catch {
        reportData = {
          summary: response.content?.slice(0, 500) || '审查完成',
          stats: {
            totalWords: totalChars,
            totalFiles: allFiles.length,
            consistencyScore: 75,
            completenessScore: 80
          },
          issues: []
        };
      }

      const newReport: ReviewReport = {
        timestamp: Date.now(),
        issues: (reportData.issues || []).map((issue: any) => ({
          ...issue,
          selected: issue.type === 'error',
          fixed: false
        })),
        summary: reportData.summary || '审查完成',
        stats: {
          totalWords: reportData.stats?.totalWords || totalChars,
          totalFiles: reportData.stats?.totalFiles || allFiles.length,
          consistencyScore: reportData.stats?.consistencyScore || 75,
          completenessScore: reportData.stats?.completenessScore || 80
        }
      };

      setCurrentReport(newReport);
      setReviewProgress(100);
      
      const updatedHistory = [newReport, ...reviewHistory.slice(0, 9)];
      setReviewHistory(updatedHistory);
      localStorage.setItem('moyuan-review-history', JSON.stringify(updatedHistory));
      
    } catch (error) {
      console.error('审查失败:', error);
    } finally {
      setTimeout(() => {
        setIsReviewing(false);
        setReviewProgress(0);
      }, 500);
    }
  };

  const tabs = [
    { id: 'overview' as ReviewTab, label: '概览', icon: 'fa-eye' },
    { id: 'report' as ReviewTab, label: '审查报告', icon: 'fa-clipboard-check' },
    { id: 'memory' as ReviewTab, label: '记忆体', icon: 'fa-brain' },
  ];

  return (
    <div className="animate-fade-in px-4 pt-4 mx-auto" style={{ maxWidth: 900 }}>
      <div className="mb-4 relative">
        <div className="absolute inset-0 rounded-full" style={{ background: 'var(--color-surface-muted)', opacity: 0.5 }} />
        <div className="relative flex gap-1 p-1 rounded-full" style={{ background: 'var(--color-surface-muted)', border: '1px solid var(--color-border-default)' }}>
          {tabs.map((tab) => (
            <button 
              key={tab.id} 
              onClick={() => setActiveTab(tab.id)}
              className={`relative px-5 py-2 rounded-full text-sm font-medium transition-all duration-300 flex items-center gap-2 ${hasAnimations ? 'hover:scale-105' : ''}`}
              style={{
                background: activeTab === tab.id ? themeInfo.gradient : 'transparent',
                color: activeTab === tab.id ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                boxShadow: activeTab === tab.id ? 'var(--shadow-button-light, 0 4px 16px rgba(0, 0, 0, 0.1))' : 'none',
              }}
            >
              {activeTab === tab.id && hasAnimations && (
                <span className="absolute inset-0 rounded-full animate-pulse opacity-30" style={{ background: themeInfo.gradient }} />
              )}
              <i className={`fas ${tab.icon}`} style={{ position: 'relative', zIndex: 1 }} />
              <span style={{ position: 'relative', zIndex: 1 }}>{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'overview' && (
        <div className="space-y-4">
          <div className="glass-card p-4 sm:p-6 rounded-2xl" style={{ position: 'relative', overflow: 'hidden' }}>
            <div className="absolute top-0 right-0 w-40 h-40 rounded-full opacity-10" style={{ background: themeInfo.gradient, transform: 'translate(40%, -40%)' }} />
            
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: themeInfo.gradient, boxShadow: '0 4px 16px var(--color-primary-100)' }}>
                <i className="fas fa-check-circle text-white text-lg" />
              </div>
              <div>
                <h3 className="text-lg font-bold" style={{ color: 'var(--color-text-primary)' }}>智能审查</h3>
                <p className="text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>AI深度检查大纲、章节、设定等全部内容</p>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 sm:gap-3">
              {[
                { icon: 'fa-file-lines', label: '文件', value: allFiles.length, unit: '个', color: 'var(--color-accent-blue)' },
                { icon: 'fa-font', label: '总字数', value: (totalChars / 1000).toFixed(1), unit: 'k', color: 'var(--color-accent-emerald)' },
                { icon: 'fa-scroll', label: '大纲', value: categorizeFiles.outline.length, unit: '份', color: 'var(--color-accent-amber)' },
                { icon: 'fa-list', label: '章节', value: categorizeFiles.chapters.length, unit: '章', color: 'var(--color-primary-400)' },
                { icon: 'fa-users', label: '角色', value: categorizeFiles.characterSettings.length, unit: '人', color: 'var(--color-rose-400)' },
              ].map(item => (
                <div key={item.label} className="text-center p-3 rounded-xl" style={{ background: 'var(--color-p-alpha-12)' }}>
                  <div className="text-2xl font-bold" style={{ color: item.color }}>{item.value}<span className="text-xs ml-0.5">{item.unit}</span></div>
                  <div className="text-[10px] mt-1" style={{ color: 'var(--color-text-muted)' }}>{item.label}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="glass-card p-4 rounded-xl sm:p-4" style={{ background: 'var(--color-surface-elevated)/40', border: '1px solid var(--color-primary-100)' }}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[var(--color-emerald-600)]/30 to-[var(--color-green-600)]/20 flex items-center justify-center border border-[var(--color-emerald-500)]/20">
                <i className="fas fa-chart-bar text-[var(--color-emerald-400)] text-sm"></i>
              </div>
              <div>
                <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>写作统计</h3>
                <p className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>双击每日目标修改目标字数</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="p-3 rounded-lg border border-[var(--color-border-default)]/30 text-center" style={{ background: 'var(--color-surface-hover)/30' }}>
                <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>今日写作</p>
                <p className="text-lg font-bold" style={{ color: 'var(--color-cyan-300)' }}>{writingStats.todayWords.toLocaleString()} 字</p>
              </div>
              <div className="p-3 rounded-lg border border-[var(--color-border-default)]/30 text-center" style={{ background: 'var(--color-surface-hover)/30' }}>
                <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>创作天数</p>
                <p className="text-lg font-bold" style={{ color: 'var(--color-amber-300)' }}>{writingStats.sessions} 天</p>
              </div>
              <div 
                className="p-3 rounded-lg border border-[var(--color-border-default)]/30 text-center cursor-pointer hover:border-[var(--color-primary-400)]/50 transition-all" 
                style={{ background: 'var(--color-surface-hover)/30' }}
                onDoubleClick={() => setShowGoalModal(true)}
              >
                <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>每日目标</p>
                <p className="text-lg font-bold" style={{ color: 'var(--color-rose-300)' }}>{writingStats.todayWords.toLocaleString()}/{writingStats.dailyGoal.toLocaleString()}</p>
                <p className="text-[10px] mt-1" style={{ color: 'var(--color-text-muted)' }}>双击修改</p>
              </div>
            </div>

            <button
              onClick={() => resetWritingStats()}
              className="w-full px-3 py-2 rounded-lg text-[11px] flex items-center justify-center gap-2 transition-all border"
              style={{
                backgroundColor: 'var(--color-surface-hover)/30',
                color: 'var(--color-text-tertiary)',
                borderColor: 'var(--color-border-default)/30',
              }}
            >
              <i className="fas fa-rotate-right"></i>重置统计
            </button>
          </div>
        </div>
      )}

      {activeTab === 'report' && (
        <div className="space-y-4">
          {currentReport ? (
            <div className="glass-card p-4 sm:p-6 rounded-2xl">
              <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
                <div>
                  <h3 className="text-lg font-bold" style={{ color: 'var(--color-text-primary)' }}>最新审查报告</h3>
                  <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                    {new Date(currentReport.timestamp).toLocaleString('zh-CN')}
                  </p>
                </div>
                <AIProgressButton
                  onClick={handleReview}
                  isGenerating={isReviewing}
                  progress={reviewProgress}
                  label="重新审查"
                  generatingLabel={`审查中 ${reviewProgress}%`}
                  icon="fa-rotate"
                  disabled={!activeModel?.modelName}
                />
              </div>

              <div className="p-4 rounded-xl mb-6" style={{ background: 'var(--color-surface-muted)' }}>
                <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>{currentReport.summary}</p>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="p-4 rounded-xl text-center" style={{ background: 'var(--color-p-alpha-12)' }}>
                  <div className="text-3xl font-bold" style={{ color: 'var(--color-accent-emerald)' }}>{currentReport.stats.consistencyScore}</div>
                  <div className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>一致性评分</div>
                </div>
                <div className="p-4 rounded-xl text-center" style={{ background: 'var(--color-p-alpha-12)' }}>
                  <div className="text-3xl font-bold" style={{ color: 'var(--color-accent-blue)' }}>{currentReport.stats.completenessScore}</div>
                  <div className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>完整性评分</div>
                </div>
              </div>

              {currentReport.issues.length > 0 ? (
                <div className="space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <h4 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                      发现问题 ({currentReport.issues.filter(i => i.fixed).length}/{currentReport.issues.length} 已修复)
                    </h4>
                    <div className="flex items-center gap-2 self-end sm:self-auto">
                      <button
                        onClick={() => selectAllIssues(true)}
                        className="text-[10px] px-2 py-1 rounded transition-all hover:bg-white/5"
                        style={{ color: 'var(--color-text-muted)' }}
                      >
                        全选
                      </button>
                      <button
                        onClick={() => selectAllIssues(false)}
                        className="text-[10px] px-2 py-1 rounded transition-all hover:bg-white/5"
                        style={{ color: 'var(--color-text-muted)' }}
                      >
                        取消
                      </button>
                    </div>
                  </div>

                  {currentReport.issues.some(i => i.selected && !i.fixed) && (
                    <div className="flex flex-col sm:flex-row sm:justify-end">
                      <AIProgressButton
                        onClick={handleFixSelected}
                        isGenerating={isFixing}
                        progress={fixProgress}
                        label={`AI修复选中 (${currentReport.issues.filter(i => i.selected && !i.fixed).length})`}
                        generatingLabel={`修复中 ${fixProgress}%`}
                        icon="fa-wand-magic-sparkles"
                        disabled={!activeModel?.modelName}
                        className="w-full sm:w-auto"
                      />
                    </div>
                  )}

                  {currentReport.issues.map((issue, index) => (
                    <div
                      key={index}
                      className={`p-4 rounded-lg border transition-all ${issue.fixed ? 'opacity-50' : ''}`}
                      style={{
                        background: issue.type === 'error' ? 'rgba(239, 68, 68, 0.1)' : issue.type === 'warning' ? 'rgba(251, 191, 36, 0.1)' : 'rgba(59, 130, 246, 0.1)',
                        borderColor: issue.type === 'error' ? 'rgba(239, 68, 68, 0.3)' : issue.type === 'warning' ? 'rgba(251, 191, 36, 0.3)' : 'rgba(59, 130, 246, 0.3)'
                      }}
                    >
                      <div className="flex items-start gap-3">
                        {!issue.fixed && (
                          <button
                            onClick={() => toggleIssueSelected(index)}
                            className="mt-0.5 w-4 h-4 rounded border flex items-center justify-center transition-all shrink-0"
                            style={{
                              borderColor: issue.selected ? 'var(--color-primary-400)' : 'var(--color-border-default)',
                              background: issue.selected ? 'var(--color-primary-500)' : 'transparent'
                            }}
                          >
                            {issue.selected && <i className="fas fa-check text-[8px] text-white" />}
                          </button>
                        )}
                        {issue.fixed && (
                          <div className="mt-0.5 w-4 h-4 rounded flex items-center justify-center shrink-0" style={{ background: 'var(--color-accent-emerald)' }}>
                            <i className="fas fa-check text-[8px] text-white" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2 flex-wrap">
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                              issue.type === 'error' ? 'bg-red-500/20 text-red-400' :
                              issue.type === 'warning' ? 'bg-amber-500/20 text-amber-400' :
                              'bg-blue-500/20 text-blue-400'
                            }`}>
                              {issue.type === 'error' ? '错误' : issue.type === 'warning' ? '警告' : '建议'}
                            </span>
                            <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{issue.category}</span>
                            {issue.fixed && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'var(--color-accent-emerald)', color: 'white' }}>
                                已修复
                              </span>
                            )}
                          </div>
                          <h5 className="text-sm font-semibold mb-1" style={{ color: 'var(--color-text-primary)' }}>{issue.title}</h5>
                          <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>{issue.description}</p>
                          {issue.location && (
                            <p className="text-[10px] mt-1" style={{ color: 'var(--color-text-muted)' }}>位置: {issue.location}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-6 text-center rounded-xl" style={{ background: 'var(--color-surface-muted)' }}>
                  <i className="fas fa-check-circle text-3xl mb-2" style={{ color: 'var(--color-accent-emerald)' }}></i>
                  <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>未发现明显问题</p>
                </div>
              )}
            </div>
          ) : (
            <div className="glass-card p-6 rounded-2xl text-center">
              <i className="fas fa-clipboard-list text-4xl mb-4" style={{ color: 'var(--color-text-muted)' }}></i>
              <h3 className="text-lg font-bold mb-2" style={{ color: 'var(--color-text-primary)' }}>暂无审查报告</h3>
              <p className="text-sm mb-4" style={{ color: 'var(--color-text-tertiary)' }}>点击上方按钮开始一键审查</p>
              <AIProgressButton
                onClick={handleReview}
                isGenerating={isReviewing}
                progress={reviewProgress}
                label="开始首次审查"
                generatingLabel={`审查中 ${reviewProgress}%`}
                icon="fa-play"
                disabled={!activeModel?.modelName}
              />
            </div>
          )}

          {reviewHistory.length > 1 && (
            <div className="glass-card p-3 sm:p-4 rounded-xl">
              <h4 className="text-sm font-semibold mb-2 sm:mb-3" style={{ color: 'var(--color-text-primary)' }}>历史记录</h4>
              <div className="space-y-2">
                {reviewHistory.slice(1, 6).map((report, index) => (
                  <button
                    key={report.timestamp}
                    onClick={() => setCurrentReport(report)}
                    className="w-full p-3 rounded-lg text-left transition-all hover:bg-white/5"
                    style={{ background: 'var(--color-surface-muted)' }}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                        {new Date(report.timestamp).toLocaleString('zh-CN')}
                      </span>
                      <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                        一致性 {report.stats.consistencyScore} | 完整 {report.stats.completenessScore}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'memory' && (
        <div className="pt-2">
          <StepMemory activeModel={activeModel} onOpenSettings={onOpenSettings || (() => {})} />
        </div>
      )}

      {showGoalModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowGoalModal(false)}>
          <div 
            className="p-6 rounded-xl border max-w-sm w-full mx-4"
            style={{ 
              backgroundColor: 'var(--color-surface-card)',
              borderColor: 'var(--color-border-default)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--color-text-primary)' }}>设置每日写作目标</h3>
            <input
              type="number"
              value={goalInput}
              onChange={(e) => setGoalInput(e.target.value)}
              className="w-full px-4 py-3 rounded-lg border mb-4 text-center text-lg font-bold"
              style={{
                backgroundColor: 'var(--color-surface-hover)',
                color: 'var(--color-text-primary)',
                borderColor: 'var(--color-border-default)',
              }}
              min="100"
              max="100000"
              placeholder="2000"
              autoFocus
            />
            <div className="flex gap-3">
              <button
                onClick={() => setShowGoalModal(false)}
                className="flex-1 px-4 py-2 rounded-lg text-sm border transition-all"
                style={{
                  backgroundColor: 'var(--color-surface-hover)',
                  color: 'var(--color-text-secondary)',
                  borderColor: 'var(--color-border-default)',
                }}
              >
                取消
              </button>
              <button
                onClick={() => {
                  const goal = Number(goalInput) || 2000;
                  updateWritingStats({ dailyGoal: Math.max(100, Math.min(100000, goal)) });
                  setShowGoalModal(false);
                }}
                className="flex-1 px-4 py-2 rounded-lg text-sm font-semibold transition-all"
                style={{
                  background: themeInfo.gradient,
                  color: 'var(--color-text-primary)',
                }}
              >
                确定
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StepReview;
