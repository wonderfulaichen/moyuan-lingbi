import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import {
  parseMarkdownChecklist,
  todoListToMarkdown,
  validateTodos,
  createTodo,
  updateTodoStatus,
  TodoItem,
} from './TodoList';

/**
 * TodoList 测试
 *
 * 覆盖 5 个导出函数：
 * - parseMarkdownChecklist：Markdown 清单解析（支持 [ ]/[x]/[X]/[-]/[~]）
 * - todoListToMarkdown：反向转换
 * - validateTodos：todo 数组验证
 * - createTodo：创建（crypto.randomUUID）
 * - updateTodoStatus：更新状态（不可变）
 */

describe('parseMarkdownChecklist', () => {
  it('非字符串输入应返回空数组', () => {
    expect(parseMarkdownChecklist(undefined as unknown as string)).toEqual([]);
    expect(parseMarkdownChecklist(null as unknown as string)).toEqual([]);
    expect(parseMarkdownChecklist(123 as unknown as string)).toEqual([]);
  });

  it('空字符串应返回空数组', () => {
    expect(parseMarkdownChecklist('')).toEqual([]);
  });

  it('纯文本（无 checkbox 标记）应返回空数组', () => {
    expect(parseMarkdownChecklist('这是一段普通文本')).toEqual([]);
    expect(parseMarkdownChecklist('第一行\n第二行\n第三行')).toEqual([]);
  });

  it('应正确解析 [ ] 为 pending 状态', () => {
    const result = parseMarkdownChecklist('[ ] 待办事项');
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('pending');
    expect(result[0].content).toBe('待办事项');
  });

  it('应正确解析 [x] 和 [X] 为 completed 状态', () => {
    const r1 = parseMarkdownChecklist('[x] 已完成1');
    const r2 = parseMarkdownChecklist('[X] 已完成2');
    expect(r1[0].status).toBe('completed');
    expect(r2[0].status).toBe('completed');
  });

  it('应正确解析 [-] 和 [~] 为 in_progress 状态', () => {
    const r1 = parseMarkdownChecklist('[-] 进行中1');
    const r2 = parseMarkdownChecklist('[~] 进行中2');
    expect(r1[0].status).toBe('in_progress');
    expect(r2[0].status).toBe('in_progress');
  });

  it('应支持带 - 或 * 前缀的 markdown 列表语法', () => {
    const r1 = parseMarkdownChecklist('- [ ] 列表项1');
    const r2 = parseMarkdownChecklist('* [x] 列表项2');
    expect(r1[0].status).toBe('pending');
    expect(r1[0].content).toBe('列表项1');
    expect(r2[0].status).toBe('completed');
    expect(r2[0].content).toBe('列表项2');
  });

  it('应支持多行混合状态解析', () => {
    const md = [
      '[ ] 任务A',
      '[x] 任务B',
      '[-] 任务C',
      '[X] 任务D',
      '[~] 任务E',
    ].join('\n');
    const result = parseMarkdownChecklist(md);
    expect(result).toHaveLength(5);
    expect(result.map(r => r.status)).toEqual([
      'pending',
      'completed',
      'in_progress',
      'completed',
      'in_progress',
    ]);
  });

  it('应自动 trim 内容首尾空白', () => {
    const result = parseMarkdownChecklist('[ ]   带空格的内容   ');
    expect(result[0].content).toBe('带空格的内容');
  });

  it('应跳过空行与非清单行，只保留有效清单项', () => {
    const md = [
      '# 标题',
      '',
      '[ ] 任务1',
      '普通说明文字',
      '[x] 任务2',
      '',
      '   ',
    ].join('\n');
    const result = parseMarkdownChecklist(md);
    expect(result).toHaveLength(2);
    expect(result[0].content).toBe('任务1');
    expect(result[1].content).toBe('任务2');
  });

  it('应支持 \\r\\n 换行符', () => {
    const md = '[ ] 任务A\r\n[x] 任务B\r\n';
    const result = parseMarkdownChecklist(md);
    expect(result).toHaveLength(2);
  });

  it('id 应基于 content + status 的 md5 哈希（确定性）', () => {
    const r1 = parseMarkdownChecklist('[ ] 同一任务');
    const r2 = parseMarkdownChecklist('[ ] 同一任务');
    const expected = crypto
      .createHash('md5')
      .update('同一任务' + 'pending')
      .digest('hex');
    expect(r1[0].id).toBe(expected);
    expect(r2[0].id).toBe(expected);
    expect(r1[0].id).toBe(r2[0].id);
  });

  it('相同内容但不同状态的 id 应不同', () => {
    const r1 = parseMarkdownChecklist('[ ] 任务');
    const r2 = parseMarkdownChecklist('[x] 任务');
    expect(r1[0].id).not.toBe(r2[0].id);
  });

  it('checkbox 内含多余空格也应被识别（正则容忍）', () => {
    // 正则 [\s*([ xX\-~])\s*] 中字符类包含空格，且 \s* 可吞掉额外空格
    // 所以 [  ]（两空格）会被识别为 pending 状态
    const result = parseMarkdownChecklist('[  ] 内容');
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('pending');
    expect(result[0].content).toBe('内容');
  });
});

describe('todoListToMarkdown', () => {
  it('空数组应返回空字符串', () => {
    expect(todoListToMarkdown([])).toBe('');
  });

  it('pending 状态应转换为 [ ] content', () => {
    const todo: TodoItem = {
      id: '1',
      content: '待办',
      status: 'pending',
    };
    expect(todoListToMarkdown([todo])).toBe('[ ] 待办');
  });

  it('completed 状态应转换为 [x] content', () => {
    const todo: TodoItem = {
      id: '1',
      content: '已完成',
      status: 'completed',
    };
    expect(todoListToMarkdown([todo])).toBe('[x] 已完成');
  });

  it('in_progress 状态应转换为 [-] content', () => {
    const todo: TodoItem = {
      id: '1',
      content: '进行中',
      status: 'in_progress',
    };
    expect(todoListToMarkdown([todo])).toBe('[-] 进行中');
  });

  it('多个 todo 应以 \\n 连接', () => {
    const todos: TodoItem[] = [
      { id: '1', content: 'A', status: 'pending' },
      { id: '2', content: 'B', status: 'completed' },
      { id: '3', content: 'C', status: 'in_progress' },
    ];
    expect(todoListToMarkdown(todos)).toBe('[ ] A\n[x] B\n[-] C');
  });
});

describe('parseMarkdownChecklist 与 todoListToMarkdown 的往返一致性', () => {
  it('待办列表经 toMarkdown 后再 parse 应保持状态与内容一致（id 会重新生成）', () => {
    const todos: TodoItem[] = [
      { id: 'a', content: '任务1', status: 'pending' },
      { id: 'b', content: '任务2', status: 'completed' },
      { id: 'c', content: '任务3', status: 'in_progress' },
    ];
    const md = todoListToMarkdown(todos);
    const parsed = parseMarkdownChecklist(md);
    expect(parsed.map(p => ({ content: p.content, status: p.status }))).toEqual(
      todos.map(t => ({ content: t.content, status: t.status })),
    );
  });
});

describe('validateTodos', () => {
  it('非数组应返回 valid:false 含错误信息', () => {
    const result = validateTodos('not an array' as unknown as unknown[]);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('array');
  });

  it('空数组应返回 valid:true', () => {
    const result = validateTodos([]);
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('元素非对象应返回 valid:false 含位置信息', () => {
    const result = validateTodos([null, 123, 'str']);
    // 第一个非对象元素即返回错误
    expect(result.valid).toBe(false);
    expect(result.error).toContain('1');
  });

  it('缺少 content 字段应返回错误', () => {
    const result = validateTodos([{ status: 'pending' }]);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('content');
    expect(result.error).toContain('1');
  });

  it('content 非字符串应返回错误', () => {
    const result = validateTodos([{ content: 123 }]);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('content');
  });

  it('status 为非法值应返回错误', () => {
    const result = validateTodos([
      { content: '任务', status: 'invalid_status' },
    ]);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('status');
  });

  it('status 为 pending/in_progress/completed 应通过', () => {
    const validStatuses = ['pending', 'in_progress', 'completed'];
    for (const status of validStatuses) {
      const result = validateTodos([{ content: '任务', status }]);
      expect(result.valid).toBe(true);
    }
  });

  it('status 缺省时应视为有效', () => {
    const result = validateTodos([{ content: '任务' }]);
    expect(result.valid).toBe(true);
  });

  it('错误信息中的 item 序号应为 1-based', () => {
    const result = validateTodos([
      { content: 'ok', status: 'pending' },
      { content: 'ok', status: 'pending' },
      { status: 'pending' }, // 第 3 个缺 content
    ]);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('3');
  });

  it('多个合法元素应整体通过', () => {
    const result = validateTodos([
      { id: '1', content: '任务1', status: 'pending' },
      { id: '2', content: '任务2', status: 'completed' },
      { id: '3', content: '任务3', status: 'in_progress' },
    ]);
    expect(result.valid).toBe(true);
  });
});

describe('createTodo', () => {
  it('默认 status 应为 pending', () => {
    const todo = createTodo('内容');
    expect(todo.content).toBe('内容');
    expect(todo.status).toBe('pending');
  });

  it('应支持自定义 status', () => {
    expect(createTodo('A', 'completed').status).toBe('completed');
    expect(createTodo('B', 'in_progress').status).toBe('in_progress');
  });

  it('生成的 id 应为 UUID v4 格式', () => {
    const todo = createTodo('内容');
    // UUID v4 格式：xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx，y 为 8/9/a/b
    expect(todo.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('每次调用应生成不同的 id', () => {
    const t1 = createTodo('A');
    const t2 = createTodo('A');
    expect(t1.id).not.toBe(t2.id);
  });

  it('空内容也应允许创建（不在 createTodo 层做内容校验，由 validateTodos 负责）', () => {
    const todo = createTodo('');
    expect(todo.content).toBe('');
    expect(todo.status).toBe('pending');
  });
});

describe('updateTodoStatus', () => {
  it('应返回带新 status 的新对象', () => {
    const original: TodoItem = {
      id: 'abc',
      content: '内容',
      status: 'pending',
    };
    const updated = updateTodoStatus(original, 'completed');
    expect(updated.status).toBe('completed');
  });

  it('应保持其他字段不变（id、content）', () => {
    const original: TodoItem = {
      id: 'abc',
      content: '内容',
      status: 'pending',
    };
    const updated = updateTodoStatus(original, 'in_progress');
    expect(updated.id).toBe(original.id);
    expect(updated.content).toBe(original.content);
  });

  it('应为不可变操作——原对象不被修改', () => {
    const original: TodoItem = {
      id: 'abc',
      content: '内容',
      status: 'pending',
    };
    updateTodoStatus(original, 'completed');
    expect(original.status).toBe('pending');
  });

  it('应在所有状态之间都能转换', () => {
    const original: TodoItem = {
      id: 'x',
      content: 'c',
      status: 'pending',
    };
    const toProgress = updateTodoStatus(original, 'in_progress');
    const toCompleted = updateTodoStatus(toProgress, 'completed');
    const backToPending = updateTodoStatus(toCompleted, 'pending');
    expect(toProgress.status).toBe('in_progress');
    expect(toCompleted.status).toBe('completed');
    expect(backToPending.status).toBe('pending');
  });
});
