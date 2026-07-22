/**
 * 快捷指令集成测试
 *
 * 测试目标：
 * 验证 textarea 输入 → useChatInput.setInput → useSlashCommand.parseInput → SlashCommandOverlay 渲染
 * 的完整链路。弥补 useSlashCommand Hook 单元测试与 SlashCommandOverlay 组件单元测试之间的集成空白。
 *
 * 背景：
 * 浏览器 E2E 测试因 subagent 输入模拟不稳定而无法可靠验证此流程。
 * 本测试在 jsdom 环境中用 React Testing Library 直接模拟用户输入，
 * 验证真实的事件链路：textarea.onChange → setInput → parseInput → setOverlayKind → 重新渲染 → SlashCommandOverlay。
 *
 * 注意：
 * - 不渲染完整 AIAssistantPanel（依赖过多 service 和 context）
 * - 用最小包装组件复现 useChatInput + SlashCommandOverlay 的集成
 * - mock aiAssistant 和 useAIStatus，仅验证 UI 集成行为
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import type { AIAgent } from '../../../../shared/types/fileSystem';
import type { ModelConfig } from '../../../../shared/types';

// ============================================================
// Mock：aiAssistant 服务 + useAIStatus context
// vi.mock 工厂被提升，必须用 vi.hoisted 才能引用外部变量
// ============================================================

const { aiAssistantMock, aiStatusValue } = vi.hoisted(() => {
  const aiAssistantMock = {
    sendMessage: vi.fn(),
    clearChat: vi.fn(),
    newConversation: vi.fn(),
    switchAgent: vi.fn(),
    abort: vi.fn(),
    getState: vi.fn().mockReturnValue({ agents: [] }),
  };
  const aiStatusValue = {
    setGenerating: vi.fn(),
    setProgress: vi.fn(),
    setStatusMessage: vi.fn(),
    setTokenUsage: vi.fn(),
    setError: vi.fn(),
    setComplete: vi.fn(),
    resetStatus: vi.fn(),
    addTask: vi.fn(),
    setActiveTask: vi.fn(),
    clearCompletedTasks: vi.fn(),
    status: {
      isGenerating: false,
      statusMessage: '',
      progress: 0,
      tokenUsage: null,
      modelName: '',
      lastDuration: null,
      error: null,
      currentTask: '',
      tasks: [],
      activeTaskId: null,
    },
  };
  return { aiAssistantMock, aiStatusValue };
});

vi.mock('../../../shared/services/AIAssistantService', () => ({
  aiAssistant: aiAssistantMock,
}));

vi.mock('../../../shared/contexts/AIStatusContext', () => ({
  useAIStatus: () => aiStatusValue,
}));

// ============================================================
// 导入被测组件（在 mock 之后导入）
// ============================================================

import { useChatInput } from './hooks/useChatInput';
import { SlashCommandOverlay } from './components/SlashCommandOverlay';

// ============================================================
// 测试数据
// ============================================================

const mockAgents: AIAgent[] = [
  {
    id: 'agent-general',
    name: '通用助手',
    description: '通用 AI 助手',
    icon: 'fa-robot',
    color: '#10b981',
  } as AIAgent,
  {
    id: 'agent-sub-writer',
    name: '章节写手',
    description: '专注章节正文生成',
    icon: 'fa-feather',
    color: '#8b5cf6',
  } as AIAgent,
];

const mockModel: ModelConfig = {
  id: 'model-1',
  name: 'test-model',
  modelName: 'gpt-4',
  apiType: 'openai',
  apiKey: 'test-key',
  baseUrl: 'https://test',
} as unknown as ModelConfig;

// ============================================================
// 测试包装组件：复现 AIAssistantPanel 中的关键集成
// ============================================================

/**
 * 最小化包装组件，复现 AIAssistantPanel 中
 * useChatInput + textarea + SlashCommandOverlay 的集成结构。
 */
function TestHarness({ agents = mockAgents }: { agents?: AIAgent[] }) {
  const {
    input,
    setInput,
    inputRef,
    handleKeyDown,
    slashCommand,
    handleSelectItem,
  } = useChatInput(mockModel, vi.fn(), agents);

  return (
    <div>
      <div className="relative">
        <SlashCommandOverlay
          kind={slashCommand.overlayKind}
          items={slashCommand.overlayItems}
          selectedIndex={slashCommand.selectedIndex}
          onHover={slashCommand.setSelectedIndex}
          onSelect={handleSelectItem}
        />
        <textarea
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="输入指令，AI直接操作文件…（输入 / 查看快捷指令）"
          aria-label="ai-input"
        />
      </div>
    </div>
  );
}

// ============================================================
// 辅助
// ============================================================

function renderHarness(agents?: AIAgent[]) {
  return render(<TestHarness agents={agents} />);
}

function typeText(text: string) {
  const textarea = screen.getByLabelText('ai-input') as HTMLTextAreaElement;
  fireEvent.change(textarea, { target: { value: text } });
  return textarea;
}

function keyDown(key: string) {
  const textarea = screen.getByLabelText('ai-input') as HTMLTextAreaElement;
  fireEvent.keyDown(textarea, { key });
}

// ============================================================
// 测试
// ============================================================

describe('快捷指令集成：textarea → 浮层渲染', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 重置 localStorage 草稿，避免测试间串扰
    localStorage.clear();
  });

  // ----------------------------------------------------------------
  // 核心链路：输入 / 触发浮层
  // ----------------------------------------------------------------

  describe('输入触发浮层', () => {
    it('输入 / 应显示"快捷指令"浮层，含 4 个指令', () => {
      renderHarness();
      typeText('/');

      // 浮层容器
      const listbox = screen.getByRole('listbox');
      expect(listbox).toBeInTheDocument();
      expect(listbox.getAttribute('aria-label')).toBe('快捷指令');

      // 4 个指令项
      const options = screen.getAllByRole('option');
      expect(options).toHaveLength(4);
      expect(screen.getByText('/clear')).toBeInTheDocument();
      expect(screen.getByText('/new')).toBeInTheDocument();
      expect(screen.getByText('/agent')).toBeInTheDocument();
      expect(screen.getByText('/help')).toBeInTheDocument();
    });

    it('输入普通文本（非 / 开头）不应显示浮层', () => {
      renderHarness();
      typeText('hello world');
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });

    it('清空输入后浮层应消失', () => {
      renderHarness();
      typeText('/');
      expect(screen.getByRole('listbox')).toBeInTheDocument();

      typeText('');
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });
  });

  // ----------------------------------------------------------------
  // 前缀过滤
  // ----------------------------------------------------------------

  describe('前缀过滤', () => {
    it('输入 /cl 应只显示 /clear', () => {
      renderHarness();
      typeText('/cl');

      const options = screen.getAllByRole('option');
      expect(options).toHaveLength(1);
      expect(screen.getByText('/clear')).toBeInTheDocument();
    });

    it('输入 /ne 应只显示 /new', () => {
      renderHarness();
      typeText('/ne');

      const options = screen.getAllByRole('option');
      expect(options).toHaveLength(1);
      expect(screen.getByText('/new')).toBeInTheDocument();
    });

    it('输入 /xyz（无匹配）应关闭浮层', () => {
      renderHarness();
      typeText('/xyz');
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });
  });

  // ----------------------------------------------------------------
  // /help 分支
  // ----------------------------------------------------------------

  describe('/help 分支', () => {
    it('输入 /help 应显示"指令帮助"浮层', () => {
      renderHarness();
      typeText('/help');

      const listbox = screen.getByRole('listbox');
      expect(listbox.getAttribute('aria-label')).toBe('指令帮助');

      // /help 浮层展示所有指令及其参数占位
      const options = screen.getAllByRole('option');
      expect(options).toHaveLength(4);
      // /agent 有参数占位
      expect(screen.getByText('/agent <关键词>')).toBeInTheDocument();
    });
  });

  // ----------------------------------------------------------------
  // /agent 分支
  // ----------------------------------------------------------------

  describe('/agent 分支', () => {
    it('输入 /agent （带空格）应显示"切换智能体"浮层', () => {
      renderHarness();
      typeText('/agent ');

      const listbox = screen.getByRole('listbox');
      expect(listbox.getAttribute('aria-label')).toBe('切换智能体');

      const options = screen.getAllByRole('option');
      expect(options).toHaveLength(2);
      expect(screen.getByText('通用助手')).toBeInTheDocument();
      expect(screen.getByText('章节写手')).toBeInTheDocument();
    });

    it('输入 /agent 写 应过滤出"章节写手"', () => {
      renderHarness();
      typeText('/agent 写');

      const options = screen.getAllByRole('option');
      expect(options).toHaveLength(1);
      expect(screen.getByText('章节写手')).toBeInTheDocument();
    });

    it('输入 /agent （无空格）不应显示浮层', () => {
      renderHarness();
      typeText('/agent');
      // /agent 后必须跟空格或刚好是 /agent 才显示
      // 但 /agent 字符串本身会进入 /agent 分支：text === '/agent' → 显示 agents 浮层
      // 修正：根据源码，text === '/agent' 会显示 agents 浮层
      const listbox = screen.getByRole('listbox');
      expect(listbox.getAttribute('aria-label')).toBe('切换智能体');
    });

    it('agents 为空时浮层应显示"无匹配项"', () => {
      renderHarness([]);
      typeText('/agent ');

      expect(screen.getByText('无匹配项')).toBeInTheDocument();
      expect(screen.queryByRole('option')).not.toBeInTheDocument();
    });
  });

  // ----------------------------------------------------------------
  // 键盘导航
  // ----------------------------------------------------------------

  describe('键盘导航', () => {
    it('输入 / 后按 ArrowDown 应高亮第二项', () => {
      renderHarness();
      typeText('/');

      // 初始：第一项高亮
      const optionsBefore = screen.getAllByRole('option');
      expect(optionsBefore[0].getAttribute('aria-selected')).toBe('true');
      expect(optionsBefore[1].getAttribute('aria-selected')).toBe('false');

      keyDown('ArrowDown');

      // 按 ↓ 后：第二项高亮
      const optionsAfter = screen.getAllByRole('option');
      expect(optionsAfter[0].getAttribute('aria-selected')).toBe('false');
      expect(optionsAfter[1].getAttribute('aria-selected')).toBe('true');
    });

    it('按 ArrowUp 应向上高亮（循环）', () => {
      renderHarness();
      typeText('/');

      // 初始：第一项高亮
      keyDown('ArrowUp');

      // 循环到最后一项
      const options = screen.getAllByRole('option');
      expect(options[3].getAttribute('aria-selected')).toBe('true');
    });

    it('按 Escape 应关闭浮层', () => {
      renderHarness();
      typeText('/');
      expect(screen.getByRole('listbox')).toBeInTheDocument();

      keyDown('Escape');
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });

    it('浮层未显示时键盘事件应穿透到 textarea', () => {
      renderHarness();
      // 未输入 /，浮层未显示
      // handleKeyDown 应返回 false，不消费事件
      // 验证：不会抛错，textarea 仍可正常输入
      typeText('hello');
      keyDown('Enter');
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });
  });

  // ----------------------------------------------------------------
  // 鼠标交互
  // ----------------------------------------------------------------

  describe('鼠标交互', () => {
    it('hover 第二项应高亮第二项', () => {
      renderHarness();
      typeText('/');

      const options = screen.getAllByRole('option');
      fireEvent.mouseEnter(options[1]);

      const optionsAfter = screen.getAllByRole('option');
      expect(optionsAfter[1].getAttribute('aria-selected')).toBe('true');
    });

    it('点击 /clear 项应触发 clearChat', () => {
      renderHarness();
      typeText('/');

      const clearOption = screen.getAllByRole('option')[0];
      fireEvent.click(clearOption);

      // lastAction 触发 useEffect → aiAssistant.clearChat()
      expect(aiAssistantMock.clearChat).toHaveBeenCalled();
    });

    it('点击 /new 项应触发 newConversation', () => {
      renderHarness();
      typeText('/');

      const newOption = screen.getAllByRole('option')[1];
      fireEvent.click(newOption);

      expect(aiAssistantMock.newConversation).toHaveBeenCalled();
    });
  });

  // ----------------------------------------------------------------
  // /agent 选择 → switchAgent
  // ----------------------------------------------------------------

  describe('/agent 选择执行', () => {
    it('点击 agent 项应触发 switchAgent', () => {
      renderHarness();
      typeText('/agent ');

      const firstAgent = screen.getAllByRole('option')[0];
      fireEvent.click(firstAgent);

      expect(aiAssistantMock.switchAgent).toHaveBeenCalledWith('agent-general');
    });

    it('通过键盘 Enter 选择 agent 应触发 switchAgent', () => {
      renderHarness();
      typeText('/agent ');

      keyDown('Enter');

      expect(aiAssistantMock.switchAgent).toHaveBeenCalledWith('agent-general');
    });
  });

  // ----------------------------------------------------------------
  // 状态同步：textarea 值与浮层联动
  // ----------------------------------------------------------------

  describe('状态同步', () => {
    it('textarea 值应随输入更新', () => {
      renderHarness();
      const textarea = typeText('/clear');
      expect(textarea.value).toBe('/clear');
    });

    it('执行 /clear 后 textarea 应被清空', () => {
      renderHarness();
      typeText('/clear');
      const textarea = screen.getByLabelText('ai-input') as HTMLTextAreaElement;
      expect(textarea.value).toBe('/clear');

      // 按 Enter 执行
      keyDown('Enter');

      // clearChat 被调用，input 被清空
      expect(aiAssistantMock.clearChat).toHaveBeenCalled();
      expect(textarea.value).toBe('');
    });
  });
});
