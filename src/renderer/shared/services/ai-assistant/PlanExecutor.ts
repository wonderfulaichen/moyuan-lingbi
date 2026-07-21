import { AIPlanStep } from '../../../../shared/types/fileSystem';
import { ModelConfig } from '../../../../shared/types';
import { aiService } from '../aiService';
import { PromptComposer } from '../../../../shared/prompts';
import { ToolParser } from './ToolParser';
import { unifiedExecutor } from './UnifiedExecutor';
import { detectTarget, buildForTarget, buildFileTreeDescription, summarizeTask } from './contextBuilder';
import { dataService } from '../DataService';

export interface PlanExecutionState {
  steps: AIPlanStep[];
  model: ModelConfig | null;
  currentIndex: number;
}

let planState: PlanExecutionState = {
  steps: [],
  model: null,
  currentIndex: 0,
};

export function getPlanState(): PlanExecutionState {
  return planState;
}

export function setPlanSteps(steps: AIPlanStep[], model: ModelConfig): void {
  planState = { steps, model, currentIndex: 0 };
}

export function clearPlanState(): void {
  planState = { steps: [], model: null, currentIndex: 0 };
}

export function toggleStep(index: number, enabled: boolean): void {
  if (planState.steps[index]) {
    planState.steps[index].enabled = enabled;
  }
}

export async function executePlan(
  onMessage: (msg: { role: 'user' | 'assistant'; content: string }) => void,
  onStepStatus: (index: number, status: 'in_progress' | 'completed' | 'failed') => void,
): Promise<void> {
  const steps = planState.steps.filter(s => s.enabled);
  const model = planState.model;
  if (!model || steps.length === 0) {
    onMessage({ role: 'assistant', content: '没有需要执行的步骤。' });
    return;
  }

  // 同步更新 step.status 并通知调用方（修复：原实现只通知不更新，导致成功步骤统计始终为 0）
  const updateStepStatus = (originalIndex: number, status: 'in_progress' | 'completed' | 'failed') => {
    if (planState.steps[originalIndex]) {
      planState.steps[originalIndex].status = status;
    }
    onStepStatus(originalIndex, status);
  };

  onMessage({ role: 'assistant', content: `📋 开始执行计划，共 ${steps.length} 个步骤…` });

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const originalIndex = planState.steps.indexOf(step);
    updateStepStatus(originalIndex, 'in_progress');
    onMessage({ role: 'assistant', content: `▶ 步骤 ${i + 1}/${steps.length}：${step.title}\n${step.description}` });

    try {
      const context = dataService.buildAIContext(8000);
      const project = dataService.getActiveProject();
      const fs = dataService.getFS();
      const fileTree = buildFileTreeDescription();
      const projectContext = buildForTarget(detectTarget(step.description));
      const stepSystemPrompt = PromptComposer.composeForAssistant({
        projectContext: `${projectContext}\n\n## 已有设定内容（正典）\n${context || '（暂无内容）'}`,
        fileTreeDescription: fileTree,
      }).fullPrompt;

      const stepPrompt = `你正在执行创作计划的第 ${i + 1} 步（共 ${steps.length} 步）。

**当前步骤：${step.title}**
步骤说明：${step.description}

⚠️ 你必须执行操作！如果步骤要求创建文件，把完整内容放在 tool JSON 的 content 字段中：
` + '```tool\n{"action": "create_file", "parentId": "文件夹ID", "name": "文件名", "content": "完整内容"}\n```' + `
禁止只输出文字描述而不调用工具！禁止先输出内容再跟不含content的tool！`;

      const result = await aiService.generate({
        model,
        prompt: stepPrompt,
        systemPrompt: stepSystemPrompt,
        temperature: 0.7,
        maxTokens: 4096,
      });

      let stepContent = '';
      let stepError = '';

      if (result.error) {
        stepError = result.error;
      } else {
        stepContent = result.content || '';
      }

      let toolCalls = ToolParser.extractStandard(stepContent);
      let textParts = ToolParser.extractText(stepContent);

      if (!stepError && toolCalls.length === 0 && textParts.length > 30) {
        const retryPrompt = `你上一步只输出了文字，没有使用 tool 格式。请立即用 create_file 工具标记保存位置！\n\n正确格式：先输出内容，再跟：\n\`\`\`tool\n{"action": "create_file", "parentId": "world", "name": "文件名"}\n\`\`\`\n\n步骤要求：${step.title}——${step.description}`;

        const retryResult = await aiService.generate({
          model,
          prompt: retryPrompt,
          systemPrompt: stepSystemPrompt,
          temperature: 0.7,
          maxTokens: 4096,
        });

        if (!retryResult.error) {
          stepContent = retryResult.content || '';
          toolCalls = ToolParser.extractStandard(stepContent);
          textParts = ToolParser.extractText(stepContent);
        }
      }

      if (stepError) {
        updateStepStatus(originalIndex, 'failed');
        onMessage({ role: 'assistant', content: `❌ 步骤 ${i + 1} 执行失败：${stepError}` });
      } else {
        for (const tc of toolCalls) {
          if (tc.action === 'create_file' && (!tc.content || tc.content.trim() === '') && textParts) {
            tc.content = textParts;
          }
          await unifiedExecutor.executeAction(tc, null);
        }

        if (textParts) {
          onMessage({ role: 'assistant', content: textParts });
        }

        updateStepStatus(originalIndex, 'completed');
        onMessage({ role: 'assistant', content: `✅ 步骤 ${i + 1} 完成` });
      }
    } catch (err) {
      updateStepStatus(originalIndex, 'failed');
      onMessage({ role: 'assistant', content: `❌ 步骤 ${i + 1} 出错：${err instanceof Error ? err.message : '未知错误'}` });
    }
  }

  onMessage({ role: 'assistant', content: `🎉 计划执行完毕！共 ${steps.length} 步，${planState.steps.filter(s => s.status === 'completed').length} 步成功。` });
  clearPlanState();
}
