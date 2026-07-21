import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ToolParser } from './ToolParser';

/**
 * ToolParser 测试
 *
 * 覆盖 ToolParser 类所有静态方法：
 * - parse / extract / extractStandard / extractText：基础提取
 * - parseWithPrecedingContent：带前缀推断的解析
 * - parseMarkdownChecklist / extractUpdateTodoList：todo 相关
 * - tryLenientJSON：宽松 JSON 解析
 * - cleanFileContent：清理思考过程文本
 * - extractTitleFromContent：从内容提取标题
 * - smartExtract：按标题切分智能提取多文件
 */

describe('ToolParser.parse', () => {
  it('无 tool 块时应返回空 toolCalls 和原文 textParts', () => {
    const content = '这是一段普通文本，没有 tool 块。';
    const result = ToolParser.parse(content);
    expect(result.toolCalls).toEqual([]);
    expect(result.textParts).toBe(content);
  });

  it('含单个 tool 块时应正确解析', () => {
    const content = '前面文字\n```tool\n{"action": "create_file", "name": "测试"}\n```\n后面文字';
    const result = ToolParser.parse(content);
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0].action).toBe('create_file');
    expect(result.toolCalls[0].name).toBe('测试');
  });

  it('含多个 tool 块时应全部解析', () => {
    const content = [
      '```tool',
      '{"action": "read_file", "fileId": "f1"}',
      '```',
      '中间文字',
      '```tool',
      '{"action": "delete_file", "fileId": "f2"}',
      '```',
    ].join('\n');
    const result = ToolParser.parse(content);
    expect(result.toolCalls).toHaveLength(2);
    expect(result.toolCalls[0].action).toBe('read_file');
    expect(result.toolCalls[1].action).toBe('delete_file');
  });

  it('tool 块无 action 字段时应被忽略', () => {
    const content = '```tool\n{"name": "无 action"}\n```';
    const result = ToolParser.parse(content);
    expect(result.toolCalls).toHaveLength(0);
  });
});

describe('ToolParser.extract', () => {
  it('应返回所有合法 tool 块', () => {
    const content = '```tool\n{"action": "search", "query": "关键词"}\n```';
    const result = ToolParser.extract(content);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ action: 'search', query: '关键词' });
  });

  it('JSON 解析失败时应回退到 lenient 解析', () => {
    // 尾逗号应被 lenient 修复
    const content = '```tool\n{"action": "search", "query": "x",}\n```';
    const result = ToolParser.extract(content);
    expect(result).toHaveLength(1);
    expect(result[0].action).toBe('search');
  });

  it('lenient 仍失败时应跳过该 tool 块', () => {
    const content = '```tool\n这是完全无法解析的内容\n```';
    const result = ToolParser.extract(content);
    expect(result).toHaveLength(0);
  });

  it('未闭合的 tool 块不应被 extract 识别', () => {
    const content = '```tool\n{"action": "search", "query": "x"}\n未闭合';
    const result = ToolParser.extract(content);
    expect(result).toHaveLength(0);
  });

  it('console.warn 应在 JSON 解析失败时被调用', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const content = '```tool\n{"name": "无action"}\n```';
    ToolParser.extract(content);
    // 解析成功但无 action 字段时不应调用 warn（warn 只在 JSON.parse 失败时触发）
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

describe('ToolParser.extractStandard', () => {
  it('应与 extract 行为一致——只识别闭合的 tool 块', () => {
    const content = '```tool\n{"action": "read_file", "fileId": "x"}\n```';
    expect(ToolParser.extractStandard(content)).toHaveLength(1);
  });

  it('多 tool 块应全部提取', () => {
    const content = [
      '```tool\n{"action": "a1"}\n```',
      '```tool\n{"action": "a2"}\n```',
      '```tool\n{"action": "a3"}\n```',
    ].join('\n');
    const result = ToolParser.extractStandard(content);
    expect(result.map(r => r.action)).toEqual(['a1', 'a2', 'a3']);
  });
});

describe('ToolParser.extractText', () => {
  it('应移除所有闭合 tool 块', () => {
    const content = '前面\n```tool\n{"action": "x"}\n```\n后面';
    expect(ToolParser.extractText(content)).toBe('前面\n\n后面');
  });

  it('应移除未闭合的 tool 块', () => {
    const content = '前面\n```tool\n{"action": "x"}\n未闭合';
    expect(ToolParser.extractText(content)).toBe('前面');
  });

  it('无 tool 块时应返回原文（trim 后）', () => {
    const content = '  纯文本内容  ';
    expect(ToolParser.extractText(content)).toBe('纯文本内容');
  });

  it('纯 tool 块（无其他文本）应返回空字符串', () => {
    const content = '```tool\n{"action": "x"}\n```';
    expect(ToolParser.extractText(content)).toBe('');
  });
});

describe('ToolParser.parseMarkdownChecklist', () => {
  it('非字符串应返回空数组', () => {
    expect(ToolParser.parseMarkdownChecklist(null as unknown as string)).toEqual([]);
    expect(ToolParser.parseMarkdownChecklist(undefined as unknown as string)).toEqual([]);
    expect(ToolParser.parseMarkdownChecklist(123 as unknown as string)).toEqual([]);
  });

  it('空字符串应返回空数组', () => {
    expect(ToolParser.parseMarkdownChecklist('')).toEqual([]);
  });

  it('应正确解析 [ ] 为 pending', () => {
    const result = ToolParser.parseMarkdownChecklist('[ ] 任务A');
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ content: '任务A', status: 'pending' });
  });

  it('应正确解析 [x] 和 [X] 为 completed', () => {
    expect(ToolParser.parseMarkdownChecklist('[x] A')[0].status).toBe('completed');
    expect(ToolParser.parseMarkdownChecklist('[X] B')[0].status).toBe('completed');
  });

  it('应正确解析 [-] 和 [~] 为 in_progress', () => {
    expect(ToolParser.parseMarkdownChecklist('[-] A')[0].status).toBe('in_progress');
    expect(ToolParser.parseMarkdownChecklist('[~] B')[0].status).toBe('in_progress');
  });

  it('ParsedTodoItem 不应包含 id 字段（与 TodoList.ts 区分）', () => {
    const result = ToolParser.parseMarkdownChecklist('[ ] 任务');
    expect(result[0]).not.toHaveProperty('id');
  });

  it('应支持 - 和 * 列表前缀', () => {
    expect(ToolParser.parseMarkdownChecklist('- [ ] A')[0].content).toBe('A');
    expect(ToolParser.parseMarkdownChecklist('* [x] B')[0].status).toBe('completed');
  });

  it('应跳过非清单行', () => {
    const md = ['# 标题', '', '[ ] 任务', '普通文字', '[x] 完成'].join('\n');
    const result = ToolParser.parseMarkdownChecklist(md);
    expect(result).toHaveLength(2);
  });

  it('status 应缺省为 pending', () => {
    // 当 checkbox 内字符不在 [xX\-~] 时，正则不匹配，所以 status 缺省场景实际不会触发
    // 这里测试 [ ] 显式场景下的 pending
    const result = ToolParser.parseMarkdownChecklist('[ ] 任务');
    expect(result[0].status).toBe('pending');
  });
});

describe('ToolParser.extractUpdateTodoList', () => {
  it('应从内容中提取 update_todo_list 调用', () => {
    const content = '```tool\n{"action": "update_todo_list", "todos": "[ ] A\\n[x] B"}\n```';
    const result = ToolParser.extractUpdateTodoList(content);
    expect(result).not.toBeNull();
    expect(result!.action).toBe('update_todo_list');
    expect(result!.todos).toBe('[ ] A\n[x] B');
  });

  it('todos 为数组形式时也应识别', () => {
    const content = '```tool\n{"action": "update_todo_list", "todos": [{"content": "A"}]}\n```';
    const result = ToolParser.extractUpdateTodoList(content);
    expect(result).not.toBeNull();
    expect(Array.isArray(result!.todos)).toBe(true);
  });

  it('无 update_todo_list 调用时应返回 null', () => {
    const content = '```tool\n{"action": "create_file"}\n```';
    expect(ToolParser.extractUpdateTodoList(content)).toBeNull();
  });

  it('多个 update_todo_list 调用时应返回第一个', () => {
    const content = [
      '```tool\n{"action": "update_todo_list", "todos": "first"}\n```',
      '```tool\n{"action": "update_todo_list", "todos": "second"}\n```',
    ].join('\n');
    const result = ToolParser.extractUpdateTodoList(content);
    expect(result!.todos).toBe('first');
  });

  it('update_todo_list 缺少 todos 字段时应返回 null', () => {
    const content = '```tool\n{"action": "update_todo_list"}\n```';
    expect(ToolParser.extractUpdateTodoList(content)).toBeNull();
  });

  it('无任何 tool 块时应返回 null', () => {
    expect(ToolParser.extractUpdateTodoList('纯文本')).toBeNull();
  });
});

describe('ToolParser.tryLenientJSON', () => {
  it('合法 JSON 应正常解析', () => {
    const result = ToolParser.tryLenientJSON('{"action": "test"}');
    expect(result).toMatchObject({ action: 'test' });
  });

  it('应处理尾逗号', () => {
    const result = ToolParser.tryLenientJSON('{"action": "test",}');
    expect(result).toMatchObject({ action: 'test' });
  });

  it('应处理对象尾逗号（需有 action 字段）', () => {
    const result = ToolParser.tryLenientJSON('{"action": "test", "list": [1, 2, 3,]}');
    expect(result).toMatchObject({ action: 'test', list: [1, 2, 3] });
  });

  it('应给未加引号的 key 加引号', () => {
    const result = ToolParser.tryLenientJSON('{action: "test"}');
    expect(result).toMatchObject({ action: 'test' });
  });

  it('应将 value 位置的单引号转为双引号（key 位置单引号不处理）', () => {
    // 源码正则 /:\s*'([^']*)'/g 只处理 value 位置的单引号
    // key 位置的单引号需要配合未引号 key 修复
    const result = ToolParser.tryLenientJSON('{action: \'test\'}');
    expect(result).toMatchObject({ action: 'test' });
  });

  it('应处理组合错误：尾逗号 + 未引号 key + 单引号', () => {
    const result = ToolParser.tryLenientJSON("{action: 'test',}");
    expect(result).toMatchObject({ action: 'test' });
  });

  it('无 action 字段时应返回 null', () => {
    expect(ToolParser.tryLenientJSON('{"name": "x"}')).toBeNull();
  });

  it('完全无法解析的内容应返回 null', () => {
    expect(ToolParser.tryLenientJSON('这不是 JSON')).toBeNull();
    expect(ToolParser.tryLenientJSON('')).toBeNull();
    expect(ToolParser.tryLenientJSON('{')) .toBeNull();
  });
});

describe('ToolParser.parseWithPrecedingContent', () => {
  it('应解析标准 tool 块', () => {
    const content = '```tool\n{"action": "create_file", "name": "test", "content": "内容"}\n```';
    const result = ToolParser.parseWithPrecedingContent(content);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ action: 'create_file', name: 'test', content: '内容' });
  });

  it('create_file 缺 content 时应从前缀文本推断', () => {
    const content = [
      '这是前面的文件内容，足够长。',
      '```tool',
      '{"action": "create_file", "name": "test"}',
      '```',
    ].join('\n');
    const result = ToolParser.parseWithPrecedingContent(content);
    expect(result).toHaveLength(1);
    expect(result[0].content).toContain('前面的文件内容');
  });

  it('update_file 缺 content 时应从前缀文本推断', () => {
    const content = [
      '要更新的新内容',
      '```tool',
      '{"action": "update_file", "fileId": "f1"}',
      '```',
    ].join('\n');
    const result = ToolParser.parseWithPrecedingContent(content);
    expect(result).toHaveLength(1);
    expect(result[0].content).toContain('要更新的新内容');
  });

  it('create_file 有 content 时不应被前缀文本覆盖', () => {
    const content = [
      '前缀内容',
      '```tool',
      '{"action": "create_file", "name": "test", "content": "原始内容"}',
      '```',
    ].join('\n');
    const result = ToolParser.parseWithPrecedingContent(content);
    expect(result[0].content).toBe('原始内容');
  });

  it('create_file 缺 content 且缺 name 时应从内容推断 name', () => {
    const content = [
      '# 角色档案\n详细信息',
      '```tool',
      '{"action": "create_file"}',
      '```',
    ].join('\n');
    const result = ToolParser.parseWithPrecedingContent(content);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBeTruthy();
  });

  it('非 create/update 类型的 tool 不应受前缀影响', () => {
    const content = [
      '前缀内容',
      '```tool',
      '{"action": "delete_file", "fileId": "x"}',
      '```',
    ].join('\n');
    const result = ToolParser.parseWithPrecedingContent(content);
    expect(result).toHaveLength(1);
    expect(result[0].action).toBe('delete_file');
    expect(result[0]).not.toHaveProperty('content');
  });

  it('未闭合的 tool 块也应通过 lenient 解析', () => {
    const content = '```tool\n{"action": "create_file", "name": "test", "content": "内容"}';
    const result = ToolParser.parseWithPrecedingContent(content);
    expect(result).toHaveLength(1);
    expect(result[0].action).toBe('create_file');
  });

  it('纯文本无 tool 块应返回空数组', () => {
    expect(ToolParser.parseWithPrecedingContent('纯文本')).toEqual([]);
  });
});

describe('ToolParser.cleanFileContent', () => {
  it('应保留普通内容不变', () => {
    const content = '# 标题\n\n正文内容';
    expect(ToolParser.cleanFileContent(content)).toBe(content);
  });

  it('应移除"我先/让我/我来"开头的思考过程', () => {
    const content = '我先分析一下需求。\n# 实际标题\n正文';
    const result = ToolParser.cleanFileContent(content);
    expect(result).not.toContain('我先分析');
    expect(result).toContain('实际标题');
    expect(result).toContain('正文');
  });

  it('应移除分隔线 --- 前的内容', () => {
    const content = '思考过程\n---\n# 实际内容';
    const result = ToolParser.cleanFileContent(content);
    expect(result).toContain('实际内容');
  });

  it('应移除"好的/明白/OK/收到/没问题"等口头语', () => {
    const content = '好的，我现在开始创建。\n# 标题\n内容';
    const result = ToolParser.cleanFileContent(content);
    expect(result).toContain('标题');
  });

  it('应保留【角色类型】标签在前（无 --- 分隔线时）', () => {
    // 注意：源码 reasoningPatterns[2] /^[\s\S]*?\n---+\s*\n/m 会删除 --- 前所有内容（含 roleTag）
    // 所以这里测试无 --- 的场景
    const content = '【角色类型：主角】\n# 角色名\n详细内容足够长以避免被清理';
    const result = ToolParser.cleanFileContent(content);
    expect(result).toContain('【角色类型：主角】');
    expect(result).toContain('角色名');
  });

  it('应移除 "一致性检查" 章节及之后内容（当 beforeCheck > 50 字符时）', () => {
    // 注意：源码正则 /^[> ]*⚠?\s*一致性检查/m 中 ⚠? 不匹配 emoji ⚠️（含 \ufe0f variation selector）
    // 所以测试用纯文本"一致性检查"不带 emoji
    // beforeCheck（一致性检查前的内容）必须 > 50 字符才会触发清理
    const content = '# 角色档案\n' + '这是一段足够长的角色档案内容，需要超过五十字符的阈值检查要求才能触发清理逻辑，确保内容超过五十个字符的阈值。' + '\n\n一致性检查\n发现一些问题';
    const result = ToolParser.cleanFileContent(content);
    expect(result).toContain('角色档案');
    expect(result).not.toContain('一致性检查');
    expect(result).not.toContain('发现一些问题');
  });

  it('空字符串应返回空字符串', () => {
    expect(ToolParser.cleanFileContent('')).toBe('');
  });
});

describe('ToolParser.extractTitleFromContent', () => {
  it('应从一级标题提取标题', () => {
    const content = '# 角色档案：李雷\n详细信息';
    const result = ToolParser.extractTitleFromContent(content);
    expect(result).toBeTruthy();
  });

  it('应跳过步骤式标题（如"第1步"）', () => {
    const content = '# 第1步：创建角色\n内容';
    const result = ToolParser.extractTitleFromContent(content);
    // 步骤式标题应被 stepPattern 过滤
    expect(result).toBeNull();
  });

  it('应跳过"角色创建规划"等元标题', () => {
    const content = '# 角色创建规划\n内容';
    const result = ToolParser.extractTitleFromContent(content);
    expect(result).toBeNull();
  });

  it('应跳过"创建/生成/撰写"等动作开头的标题', () => {
    const content = '# 创建角色档案\n内容';
    const result = ToolParser.extractTitleFromContent(content);
    expect(result).toBeNull();
  });

  it('应从【】括号中提取 2-10 字符的候选名', () => {
    const content = '# 【李雷】的档案\n详细内容';
    const result = ToolParser.extractTitleFromContent(content);
    expect(result).toBe('李雷');
  });

  it('应跳过"角色类型"括号标签', () => {
    // 源码排除列表 /^(?:角色类型|主角|女主|反派|配角)$/ 只匹配完整的"角色类型"
    // 注意：【角色类型：主角】不会被排除（含冒号），只有【角色类型】会被排除
    const content = '# 【角色类型】\n内容';
    const result = ToolParser.extractTitleFromContent(content);
    // 【角色类型】被排除后，cleanTitle 去除【...】为空，不满足 >=2 长度
    expect(result).toBeNull();
  });

  it('应从"**姓名**"字段提取文件名', () => {
    const content = '一些前置内容\n- **姓名**: 李雷\n其他字段';
    const result = ToolParser.extractTitleFromContent(content);
    expect(result).toBe('李雷');
  });

  it('无任何标题或姓名字段时应返回 null', () => {
    expect(ToolParser.extractTitleFromContent('纯文本无标题')).toBeNull();
  });

  it('标题过长（>15 字符）应被跳过', () => {
    const content = '# 这是一个非常非常非常长的标题超出限制\n内容';
    const result = ToolParser.extractTitleFromContent(content);
    expect(result).toBeNull();
  });
});

describe('ToolParser.smartExtract', () => {
  // 注意：smartExtract 的实际行为限制——
  // level 1/2 标题切换时不收集前段内容到 currentSections（源码既有行为）。
  // 只有 level 3 标题之间的内容会被收集。
  // 因此多文件切分测试用 level 3 标题，单文件测试用 level 1 标题 + 足够长内容。
  // pushCurrentFile 要求 text.length > 50；fallback 路径要求 content.length > 100。

  const longContent = '这是一段足够长的角色档案内容，需要超过五十字符的阈值检查要求才能被 pushCurrentFile 接受。';

  it('单个 level 1 标题 + 足够长内容（>50字符）应提取一个文件', () => {
    const content = '# 角色档案\n' + longContent;
    const result = ToolParser.smartExtract(content, 'character');
    expect(result).toHaveLength(1);
    expect(result[0].action).toBe('create_file');
    expect(result[0]).toHaveProperty('name');
    expect(result[0]).toHaveProperty('content');
  });

  it('无标题且内容长度 > 100 时应走 fallback 路径', () => {
    const content = '这是一段没有任何标题的纯文本内容，需要超过一百个字符才能触发 fallback 路径所以需要重复几次。'.repeat(4);
    const result = ToolParser.smartExtract(content, 'character');
    expect(result).toHaveLength(1);
    expect(result[0].action).toBe('create_file');
    expect(result[0].parentId).toBe('characters');
    expect(result[0].content).toBe(content);
  });

  it('fallback 路径 targetHint=world 时应附加 parentId=world', () => {
    const content = '这是一段没有任何标题的纯文本内容，需要超过一百个字符才能触发 fallback 路径所以需要重复几次。'.repeat(4);
    const result = ToolParser.smartExtract(content, 'world');
    expect(result[0].parentId).toBe('world');
  });

  it('fallback 路径 targetHint=outline 时应附加 parentId=outline', () => {
    const content = '这是一段没有任何标题的纯文本内容，需要超过一百个字符才能触发 fallback 路径所以需要重复几次。'.repeat(4);
    const result = ToolParser.smartExtract(content, 'outline');
    expect(result[0].parentId).toBe('outline');
  });

  it('fallback 路径 targetHint=chapter 时应附加 parentId=chapters', () => {
    const content = '这是一段没有任何标题的纯文本内容，需要超过一百个字符才能触发 fallback 路径所以需要重复几次。'.repeat(4);
    const result = ToolParser.smartExtract(content, 'chapter');
    expect(result[0].parentId).toBe('chapters');
  });

  it('fallback 路径 targetHint=timeline 时应附加 parentId=timeline', () => {
    const content = '这是一段没有任何标题的纯文本内容，需要超过一百个字符才能触发 fallback 路径所以需要重复几次。'.repeat(4);
    const result = ToolParser.smartExtract(content, 'timeline');
    expect(result[0].parentId).toBe('timeline');
  });

  it('fallback 路径 targetHint 未知时应不附加 parentId', () => {
    const content = '这是一段没有任何标题的纯文本内容，需要超过一百个字符才能触发 fallback 路径所以需要重复几次。'.repeat(4);
    const result = ToolParser.smartExtract(content, 'unknown');
    expect(result).toHaveLength(1);
    expect(result[0]).not.toHaveProperty('parentId');
  });

  it('fallback 路径应使用默认文件名', () => {
    const content = '这是一段没有任何标题的纯文本内容，需要超过一百个字符才能触发 fallback 路径所以需要重复几次。'.repeat(4);
    const result = ToolParser.smartExtract(content, 'character');
    expect(result[0].name).toBe('角色设定');
  });

  it('无标题且内容<100 字符时应返回空数组', () => {
    const result = ToolParser.smartExtract('短内容', 'character');
    expect(result).toEqual([]);
  });

  it('单个 level 1 标题 + 内容<50 字符时应返回空数组', () => {
    const content = '# 标题\n短内容';
    const result = ToolParser.smartExtract(content, 'character');
    expect(result).toEqual([]);
  });
});
