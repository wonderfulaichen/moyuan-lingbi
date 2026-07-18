/**
 * mapper 单元测试
 *
 * 测试目标：
 * - agentIdToExecutor: 映射 AgentId → StepExecutor
 * - agentIdToDisplayName: 映射 AgentId → 中文显示名
 * - agentInputToStepInput: AgentInput → CreateStepInput 转换
 * - agentOutputToStepOutput: AgentOutput → StepOutput 转换
 *
 * 边界情况：
 * - 未知 AgentId（fallback 行为）
 * - 空数组 / 空字符串
 * - 特殊字符
 */
import { describe, it, expect } from 'vitest';
import {
  agentIdToExecutor,
  agentIdToDisplayName,
  agentInputToStepInput,
  agentOutputToStepOutput,
} from './mapper';
import type { AgentInput, AgentOutput } from '../types';

// ============================================================
// agentIdToExecutor
// ============================================================

describe('agentIdToExecutor', () => {
  const knownMappings: Record<string, string> = {
    'agent-general': 'system',
    'agent-worldbuilder': 'worldbuilder',
    'agent-character': 'character',
    'agent-plotter': 'plotter',
    'agent-editor': 'editor',
    'agent-sub-writer': 'writer',
    'agent-sub-planner': 'planner',
    'agent-sub-memory': 'memory',
    'agent-sub-researcher': 'researcher',
    'agent-sub-reviewer': 'auditor',
  };

  for (const [agentId, expected] of Object.entries(knownMappings)) {
    it(`"${agentId}" 应映射为 "${expected}"`, () => {
      expect(agentIdToExecutor(agentId)).toBe(expected);
    });
  }

  it('未知 AgentId 应返回 "system" 作为 fallback', () => {
    expect(agentIdToExecutor('unknown-agent')).toBe('system');
    expect(agentIdToExecutor('agent-foo')).toBe('system');
    expect(agentIdToExecutor('')).toBe('system');
  });
});

// ============================================================
// agentIdToDisplayName
// ============================================================

describe('agentIdToDisplayName', () => {
  const knownNames: Record<string, string> = {
    'agent-general': '通用助手',
    'agent-worldbuilder': '世界观架构师',
    'agent-character': '角色设计师',
    'agent-plotter': '剧情策划师',
    'agent-editor': '文字润色师',
    'agent-sub-writer': '章节写手',
    'agent-sub-planner': '大纲规划师',
    'agent-sub-memory': '记忆整理专家',
    'agent-sub-researcher': '资料研究员',
    'agent-sub-reviewer': '审校员',
  };

  for (const [agentId, expected] of Object.entries(knownNames)) {
    it(`"${agentId}" 应显示为 "${expected}"`, () => {
      expect(agentIdToDisplayName(agentId)).toBe(expected);
    });
  }

  it('未知 AgentId 应返回原始 ID', () => {
    expect(agentIdToDisplayName('my-custom-agent')).toBe('my-custom-agent');
    expect(agentIdToDisplayName('')).toBe('');
  });
});

// ============================================================
// agentInputToStepInput
// ============================================================

describe('agentInputToStepInput', () => {
  const baseInput: AgentInput = {
    stepId: 'test-step',
    userRequest: '请帮我写第一章',
    context: {
      projectState: { title: '测试小说', currentChapter: null, totalChapters: 10, lastModified: Date.now() },
      relevantMemory: [],
      activeSteps: [],
      userPreferences: { writingStyle: 'default', checkStrictness: 'normal', autoSave: true },
    },
    messages: [],
  };

  it('应正确映射基本字段', () => {
    const result = agentInputToStepInput('agent-sub-writer', baseInput, '章节写手', [], 'chain-1');
    expect(result.name).toBe('章节写手');
    expect(result.description).toBe('请帮我写第一章');
    expect(result.executor).toBe('writer');
    expect(result.chainId).toBe('chain-1');
    expect(result.dependencies).toEqual([]);
    expect(result.maxRetries).toBe(3);
  });

  it('应正确映射 dependencies', () => {
    const result = agentInputToStepInput('agent-general', baseInput, '测试', ['step-0', 'step-1']);
    expect(result.dependencies).toEqual(['step-0', 'step-1']);
  });

  it('应正确提取 options 中的 targetFileIds', () => {
    const inputWithOpts: AgentInput = {
      ...baseInput,
      options: {
        targetFileIds: ['file-1', 'file-2'],
        params: { temperature: 0.8 },
      },
    };
    const result = agentInputToStepInput('agent-editor', inputWithOpts, '润色', []);
    expect(result.input.targetFileIds).toEqual(['file-1', 'file-2']);
    expect(result.input.params).toEqual({ temperature: 0.8 });
  });

  it('没有 options 时应使用空默认值', () => {
    const result = agentInputToStepInput('agent-general', baseInput, '测试', []);
    expect(result.input.targetFileIds).toEqual([]);
    expect(result.input.params).toEqual({});
  });

  it('description 应截断到 100 字符', () => {
    const longInput: AgentInput = {
      ...baseInput,
      userRequest: 'a'.repeat(200),
    };
    const result = agentInputToStepInput('agent-general', longInput, '测试', []);
    expect(result.description.length).toBe(100);
    expect(result.description).toBe('a'.repeat(100));
  });

  it('不带 chainId 时应为 undefined', () => {
    const result = agentInputToStepInput('agent-general', baseInput, '测试', []);
    expect(result.chainId).toBeUndefined();
  });
});

// ============================================================
// agentOutputToStepOutput
// ============================================================

describe('agentOutputToStepOutput', () => {
  const baseOutput: AgentOutput = {
    content: '这是AI生成的内容',
    modifiedFileIds: [],
    memoryUpdates: [],
    suggestedNextSteps: ['继续润色', '检查角色一致性'],
    status: 'completed',
    summary: '生成了第一章',
  };

  it('应正确映射基本字段', () => {
    const result = agentOutputToStepOutput(baseOutput);
    expect(result.content).toBe('这是AI生成的内容');
    expect(result.modifiedFileIds).toEqual([]);
    expect(result.suggestedNextSteps).toEqual(['继续润色', '检查角色一致性']);
    expect(result.summary).toBe('生成了第一章');
  });

  it('有修改文件时 outputType 应为 "file"', () => {
    const outputWithFiles: AgentOutput = {
      ...baseOutput,
      modifiedFileIds: ['file-1', 'file-2'],
    };
    const result = agentOutputToStepOutput(outputWithFiles);
    expect(result.outputType).toBe('file');
  });

  it('无修改文件时 outputType 应为 "text"', () => {
    const result = agentOutputToStepOutput(baseOutput);
    expect(result.outputType).toBe('text');
  });

  it('空 suggestedNextSteps 应映射为空数组', () => {
    const output: AgentOutput = {
      ...baseOutput,
      suggestedNextSteps: [],
    };
    const result = agentOutputToStepOutput(output);
    expect(result.suggestedNextSteps).toEqual([]);
  });
});
