import {
  ComposeOptions,
  ComposedPrompt,
  PromptLayer,
  AgentId,
  TaskId,
  FormatId,
  RuleId,
  EntryPoint,
  PromptLibraryItem,
} from './types';
import {
  getUserOverrides,
  getUserOverrideContent,
  hasUserOverride,
} from './userOverrides';
import { toolFormatPrompt, replyModePrompt } from './foundation/toolFormat';
import { workflowPrompt, autonomousExecutionPrompt } from './foundation/workflow';
import { fileRulesPrompt, canonSystemPrompt, compressPrompt } from './foundation/index';
import { getAgentPrompt, getAllAgents, BUILT_IN_AGENTS } from './agents';
import { getTaskPrompt, TASK_PROMPTS } from './tasks';
import { getFormatPrompt, FORMAT_PROMPTS } from './formats';
import { getRulePrompt, getAutoRulesForTask, getAutoRulesForAgent, RULE_PROMPTS } from './rules';

const FOUNDATION_BASE = [
  toolFormatPrompt,
  replyModePrompt,
  workflowPrompt,
  autonomousExecutionPrompt,
];

const FOUNDATION_RULES = [
  fileRulesPrompt,
  canonSystemPrompt,
];

function isLayerSkipped(options: ComposeOptions, layer: PromptLayer): boolean {
  return options.skipLayers?.includes(layer) ?? false;
}

export class PromptComposer {

  static compose(options: ComposeOptions): ComposedPrompt {
    const parts: string[] = [];
    const layersUsed: PromptLayer[] = [];
    let agentName: string | undefined;
    let taskName: string | undefined;

    const header = `你是"墨渊灵笔"的 AI 创作助手。核心原则：**少说废话，直接干活**。`;
    parts.push(header);

    if (!isLayerSkipped(options, 'foundation')) {
      for (const prompt of FOUNDATION_BASE) {
        parts.push(prompt.content);
      }
      layersUsed.push('foundation');
    }

    if (!isLayerSkipped(options, 'agent') && options.agentId) {
      const agent = getAgentPrompt(options.agentId);
      if (agent && agent.content) {
        parts.push(`\n## 当前角色：${agent.name}\n${agent.content}`);
        agentName = agent.name;
        layersUsed.push('agent');
      }
    }

    if (!isLayerSkipped(options, 'task') && options.taskId) {
      const task = getTaskPrompt(options.taskId);
      if (task) {
        parts.push(task.content);
        taskName = task.name;
        layersUsed.push('task');
      }
    }

    if (!isLayerSkipped(options, 'format') && options.formatId) {
      const fmt = getFormatPrompt(options.formatId);
      if (fmt) {
        parts.push(fmt.content);
        layersUsed.push('format');
      }
    }

    if (!isLayerSkipped(options, 'rule')) {
      let rulesToApply: typeof RULE_PROMPTS[string][] = [];

      if (options.customRules && options.customRules.length > 0) {
        for (const ruleId of options.customRules) {
          const rule = getRulePrompt(ruleId);
          if (rule) rulesToApply.push(rule);
        }
      } else {
        if (options.taskId) {
          rulesToApply = [...rulesToApply, ...getAutoRulesForTask(options.taskId)];
        }
        if (options.agentId) {
          rulesToApply = [...rulesToApply, ...getAutoRulesForAgent(options.agentId)];
        }
      }

      for (const rule of rulesToApply) {
        parts.push(rule.content);
      }
      if (rulesToApply.length > 0) layersUsed.push('rule');
    }

    if (!isLayerSkipped(options, 'foundation')) {
      for (const prompt of FOUNDATION_RULES) {
        parts.push(prompt.content);
      }
    }

    if (options.projectContext) {
      parts.push(`\n## 项目上下文\n${options.projectContext}`);
    }

    if (options.fileTreeDescription) {
      parts.push(`\n## 文件结构\n${options.fileTreeDescription}`);
    }

    return {
      fullPrompt: parts.join('\n\n---\n\n'),
      layersUsed: [...new Set(layersUsed)],
      agentName,
      taskName,
    };
  }

  static composeForAssistant(params: {
    agentId?: AgentId;
    projectContext?: string;
    fileTreeDescription?: string;
    customRules?: RuleId[];
  }): ComposedPrompt {
    return PromptComposer.compose({
      entryPoint: 'assistant',
      agentId: params.agentId,
      projectContext: params.projectContext,
      fileTreeDescription: params.fileTreeDescription,
      customRules: params.customRules,
    });
  }

  static composeForButton(params: {
    taskId: TaskId;
    agentId?: AgentId;
    formatId?: FormatId;
    projectContext?: string;
    templateVars?: Record<string, string>;
  }): string {
    const composed = PromptComposer.compose({
      entryPoint: 'button',
      taskId: params.taskId,
      agentId: params.agentId,
      formatId: params.formatId,
      projectContext: params.projectContext,
      skipLayers: ['foundation', 'format'], // AI 按键不需要工具格式和输出格式规范，直接输出纯文本
    });

    let result = composed.fullPrompt;
    if (params.templateVars) {
      for (const [key, value] of Object.entries(params.templateVars)) {
        result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
      }
    }
    return result;
  }

  static composeForInspiration(params: {
    taskId: 'inspire-tags' | 'inspire-schemes';
    templateVars?: Record<string, string>;
  }): string {
    const composed = PromptComposer.compose({
      entryPoint: 'inspiration',
      taskId: params.taskId,
      skipLayers: ['agent', 'format', 'rule'],
    });

    let result = composed.fullPrompt;
    if (params.templateVars) {
      for (const [key, value] of Object.entries(params.templateVars)) {
        result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
      }
    }
    return result;
  }

  static composeForMemory(): string {
    const composed = PromptComposer.compose({
      entryPoint: 'memory',
      taskId: 'memory-extract',
      skipLayers: ['foundation', 'agent'],
      formatId: 'json-strict',
    });
    return composed.fullPrompt;
  }

  static getCompressPrompt(): string {
    return compressPrompt.content;
  }

  static resolveAgentSystemPrompt(agentId: AgentId): string {
    const agent = getAgentPrompt(agentId);
    return agent?.content || '';
  }

  static resolveTaskPrompt(taskId: TaskId, vars?: Record<string, string>): string | null {
    const task = getTaskPrompt(taskId);
    if (!task) return null;
    if (!vars) return task.content;
    let result = task.content;
    for (const [key, value] of Object.entries(vars)) {
      result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
    }
    return result;
  }
}

export {
  BUILT_IN_AGENTS,
  TASK_PROMPTS,
  FORMAT_PROMPTS,
  RULE_PROMPTS,
};

export {
  getAgentPrompt,
  getAllAgents,
  getTaskPrompt,
  getFormatPrompt,
  getRulePrompt,
  getAutoRulesForTask,
  getAutoRulesForAgent,
};

export type {
  AgentId,
  TaskId,
  FormatId,
  RuleId,
  EntryPoint,
  PromptLayer,
  PromptLibraryItem,
};

export const FOUNDATION_PROMPTS = [
  toolFormatPrompt,
  replyModePrompt,
  workflowPrompt,
  autonomousExecutionPrompt,
  fileRulesPrompt,
  canonSystemPrompt,
  compressPrompt,
];

export const ALL_PROMPTS = [
  ...FOUNDATION_PROMPTS,
  ...Object.values(BUILT_IN_AGENTS),
  ...Object.values(TASK_PROMPTS),
  ...Object.values(FORMAT_PROMPTS),
  ...Object.values(RULE_PROMPTS),
];

const LAYER_LABELS: Record<PromptLayer, string> = {
  foundation: '基础层',
  agent: '角色层',
  task: '任务层',
  format: '格式层',
  rule: '规则层',
};

const CATEGORY_LABELS_TASK: Record<string, string> = {
  inspiration: '灵感构思',
  character: '角色塑造',
  world: '世界观构建',
  timeline: '时间线',
  outline: '大纲规划',
  chapter: '章节拆分',
  writing: '正文创作',
  edit: '润色编辑',
  summary: '摘要提取',
  memory: '记忆库',
  analysis: '分析决策',
};

const EDITABLE_TASK_IDS = new Set<TaskId>([
  'inspire-tags',
  'inspire-schemes',
  'char-build',
  'outline-gen',
  'outline-detailed',
  'writing-create',
  'writing-continue',
  'edit-polish',
  'summary-extract',
]);

export function getPromptLibrary(): PromptLibraryItem[] {
  const items: PromptLibraryItem[] = [];
  const overrides = getUserOverrides();

  for (const p of FOUNDATION_PROMPTS) {
    items.push({
      id: p.id,
      name: p.id.replace('foundation-', ''),
      layer: p.layer,
      layerLabel: LAYER_LABELS[p.layer],
      category: p.category,
      categoryLabel: p.category,
      content: overrides[p.id]?.content ?? p.content,
    });
  }

  for (const agent of Object.values(BUILT_IN_AGENTS)) {
    items.push({
      id: agent.id,
      name: agent.name,
      layer: agent.layer,
      layerLabel: LAYER_LABELS[agent.layer],
      description: agent.description,
      content: overrides[agent.id]?.content ?? agent.content,
      icon: agent.icon,
      color: agent.color,
    });
  }

  for (const task of Object.values(TASK_PROMPTS)) {
    const isEditable = EDITABLE_TASK_IDS.has(task.taskId);
    items.push({
      id: task.id,
      name: task.name,
      layer: task.layer,
      layerLabel: LAYER_LABELS[task.layer],
      category: task.category,
      categoryLabel: CATEGORY_LABELS_TASK[task.category] || task.category,
      description: task.description,
      content: overrides[task.id]?.content ?? task.content,
      editable: isEditable,
    });
  }

  for (const fmt of Object.values(FORMAT_PROMPTS)) {
    items.push({
      id: fmt.id,
      name: fmt.name,
      layer: fmt.layer,
      layerLabel: LAYER_LABELS[fmt.layer],
      description: fmt.description,
      content: overrides[fmt.id]?.content ?? fmt.content,
    });
  }

  for (const rule of Object.values(RULE_PROMPTS)) {
    items.push({
      id: rule.id,
      name: rule.name,
      layer: rule.layer,
      layerLabel: LAYER_LABELS[rule.layer],
      description: rule.name,
      content: overrides[rule.id]?.content ?? rule.content,
      autoApplyFor: [
        ...(rule.autoApplyForTasks || []),
        ...(rule.autoApplyForAgents || []),
      ],
    });
  }

  return items;
}

export function getPromptContent(id: string): string {
  const override = getUserOverrideContent(id);
  if (override) return override;

  const all = [
    ...FOUNDATION_PROMPTS,
    ...Object.values(BUILT_IN_AGENTS),
    ...Object.values(TASK_PROMPTS),
    ...Object.values(FORMAT_PROMPTS),
    ...Object.values(RULE_PROMPTS),
  ];
  const found = all.find(p => p.id === id);
  return found?.content || '';
}

export function isPromptEditable(id: string): boolean {
  const task = Object.values(TASK_PROMPTS).find(t => t.id === id);
  if (task) return EDITABLE_TASK_IDS.has(task.taskId);
  return false;
}

export { getUserOverrides, getUserOverrideContent, hasUserOverride };
export {
  setUserOverride,
  removeUserOverride,
  clearAllUserOverrides,
} from './userOverrides';
