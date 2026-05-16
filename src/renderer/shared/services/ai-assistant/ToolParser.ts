export interface ParsedToolCall {
  action: string;
  [key: string]: any;
}

export type TodoStatus = 'pending' | 'in_progress' | 'completed';

export interface ParsedTodoItem {
  id?: string;
  content: string;
  status?: TodoStatus;
}

export interface UpdateTodoListCall {
  action: 'update_todo_list';
  todos: string | ParsedTodoItem[];
}

export interface ToolParseResult {
  toolCalls: ParsedToolCall[];
  textParts: string;
}

export class ToolParser {
  static parse(content: string): ToolParseResult {
    const toolCalls = ToolParser.parseWithPrecedingContent(content);
    const textParts = ToolParser.extractText(content);
    return { toolCalls, textParts };
  }

  static extract(content: string): ParsedToolCall[] {
    const results: ParsedToolCall[] = [];
    
    const regex = /```tool\s*\n([\s\S]*?)```/g;
    let match;
    while ((match = regex.exec(content)) !== null) {
      try {
        const raw = match[1].trim();
        const parsed = JSON.parse(raw);
        if (parsed.action) results.push(parsed);
      } catch (e) {
        console.warn('[ToolParser] 标准解析失败:', (e as Error).message, '原始内容前200字:', match[1].trim().slice(0, 200));
        const lenient = ToolParser.tryLenientJSON(match[1].trim());
        if (lenient) results.push(lenient);
      }
    }
    return results;
  }

  static parseMarkdownChecklist(md: string): ParsedTodoItem[] {
    if (typeof md !== 'string') return [];
    
    const lines = md
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(Boolean);
    
    const todos: ParsedTodoItem[] = [];
    
    for (const line of lines) {
      const match = line.match(/^(?:[-*]\s*)?\[\s*([ xX\-~])\s*\]\s+(.+)$/);
      if (!match) continue;
      
      let status: TodoStatus = 'pending';
      if (match[1] === 'x' || match[1] === 'X') {
        status = 'completed';
      } else if (match[1] === '-' || match[1] === '~') {
        status = 'in_progress';
      }
      
      todos.push({
        content: match[2].trim(),
        status,
      });
    }
    
    return todos;
  }

  static extractUpdateTodoList(content: string): UpdateTodoListCall | null {
    const results = ToolParser.extract(content);
    const todoCall = results.find(tc => tc.action === 'update_todo_list');
    
    if (!todoCall || !todoCall.todos) return null;
    
    return todoCall as unknown as UpdateTodoListCall;
  }

  static extractStandard(content: string): ParsedToolCall[] {
    const results: ParsedToolCall[] = [];
    const regex = /```tool\s*\n([\s\S]*?)```/g;
    let match;
    while ((match = regex.exec(content)) !== null) {
      try {
        const raw = match[1].trim();
        const parsed = JSON.parse(raw);
        if (parsed.action) results.push(parsed);
      } catch (e) {
        console.warn('[ToolParser] 标准解析失败:', (e as Error).message, '原始内容前200字:', match[1].trim().slice(0, 200));
        const lenient = ToolParser.tryLenientJSON(match[1].trim());
        if (lenient) results.push(lenient);
      }
    }
    return results;
  }

  static extractText(content: string): string {
    let text = content.replace(/```tool\s*\n[\s\S]*?```/g, '');
    text = text.replace(/```tool\s*\n[\s\S]*$/g, '');
    return text.trim();
  }

  static parseWithPrecedingContent(content: string): ParsedToolCall[] {
    const segments: Array<{ type: 'text' | 'tool'; content: string; parsed?: ParsedToolCall }> = [];

    const regex = /```tool\s*\n([\s\S]*?)```/g;
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(content)) !== null) {
      if (match.index > lastIndex) {
        const textBefore = content.substring(lastIndex, match.index).trim();
        if (textBefore) {
          segments.push({ type: 'text', content: textBefore });
        }
      }

      try {
        const raw = match[1].trim();
        const parsed = JSON.parse(raw);
        if (parsed.action) {
          segments.push({ type: 'tool', content: raw, parsed });
        }
      } catch (e) {
        const lenient = ToolParser.tryLenientJSON(match[1].trim());
        if (lenient) {
          segments.push({ type: 'tool', content: match[1].trim(), parsed: lenient });
        }
      }

      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < content.length) {
      const trailingText = content.substring(lastIndex).trim();
      if (trailingText) {
        const unclosedMatch = trailingText.match(/```tool\s*\n([\s\S]*)$/);
        if (unclosedMatch) {
          const raw = unclosedMatch[1].trim();
          const lenient = ToolParser.tryLenientJSON(raw);
          if (lenient && lenient.action) {
            const textBefore = trailingText.substring(0, trailingText.indexOf('```tool')).trim();
            if (textBefore) {
              segments.push({ type: 'text', content: textBefore });
            }
            segments.push({ type: 'tool', content: raw, parsed: lenient });
          } else {
            segments.push({ type: 'text', content: trailingText });
          }
        } else {
          segments.push({ type: 'text', content: trailingText });
        }
      }
    }

    const results: ParsedToolCall[] = [];
    let pendingText = '';

    for (const seg of segments) {
      if (seg.type === 'text') {
        pendingText = seg.content;
      } else if (seg.type === 'tool' && seg.parsed) {
        const tc = seg.parsed;
        if ((tc.action === 'create_file' || tc.action === 'update_file') && (!tc.content || tc.content.trim() === '') && pendingText) {
          const cleaned = ToolParser.cleanFileContent(pendingText);
          const inferredName = ToolParser.extractTitleFromContent(cleaned);
          if (inferredName && tc.action === 'create_file' && !tc.name) {
            tc.name = inferredName;
          }
          results.push({ ...tc, content: cleaned });
          pendingText = '';
        } else {
          results.push(tc);
        }
      }
    }

    return results;
  }

  static tryLenientJSON(raw: string): ParsedToolCall | null {
    try {
      let fixed = raw
        .replace(/,\s*([}\]])/g, '$1')
        .replace(/([{,]\s*)(\w+)\s*:/g, '$1"$2":')
        .replace(/:\s*'([^']*)'/g, ': "$1"');
      const parsed = JSON.parse(fixed);
      if (parsed.action) return parsed;
    } catch {}
    return null;
  }

  static cleanFileContent(raw: string): string {
    let cleaned = raw;

    const reasoningPatterns = [
      /^(?:我先|让我|我来|我将|我会|计划|准备|开始|首先|好的[，,]?|明白[，,]?|OK[，,]?|收到|没问题)[^。\n]*?(?:分析|读取|查看|确认|规划|执行|思考|理解|评估|检查|梳理|整理|补充|完善|扩充|生成|创建|构建|编写|撰写|输出|读取|了解)[^。\n]*[。\n]\s*/m,
      /^(?:我先|让我|我来|我将|我会)[^。\n]*?[。，]\s*/m,
      /^[\s\S]*?\n---+\s*\n/m,
      /^(?:\[系统\]|\(下一步|接下来|然后|之后)[^.\n]*[。\n]?\s*/m,
    ];
    for (const pat of reasoningPatterns) {
      cleaned = cleaned.replace(pat, '');
    }

    cleaned = cleaned.replace(/^(?:好的?|明白|OK|收到|没问题)[^。\n]*[。\n]\s*/m, '');
    cleaned = cleaned.replace(/^#{1,3}\s*(?:角色创建规划|任务规划|执行计划|工作计划|计划|步骤|操作列表|规划)\s*\n[\s\S]*?(?=^#{1,3}\s|\Z)/m, '');
    cleaned = cleaned.replace(/```(?:json)?\s*\{[^}]*"action"\s*:\s*"plan"[^}]*\}\s*```\s*/g, '');
    cleaned = cleaned.replace(/^#{1,3}\s*[▶►➤✦★☆●○]\s*(?:第?\d+[步个]|执行|开始|当前|下一步|继续)[^.\n]*\n\s*/m, '');

    const checkIndex = cleaned.search(/^[> ]*⚠?\s*一致性检查/m);
    if (checkIndex !== -1) {
      const beforeCheck = cleaned.slice(0, checkIndex).trim();
      if (beforeCheck.length > 50) {
        cleaned = beforeCheck;
      }
    }

    cleaned = cleaned.trim();

    const roleTagMatch = cleaned.match(/^【\s*角色类型\s*[：:].+?】/);
    const mainHeadingMatch = cleaned.match(/^#{1,3}\s+.+/m);

    if (roleTagMatch && mainHeadingMatch && mainHeadingMatch.index !== undefined && mainHeadingMatch.index > 0) {
      const roleTag = roleTagMatch[0];
      const afterHeading = cleaned.slice(mainHeadingMatch.index);
      cleaned = `${roleTag}\n\n${afterHeading}`;
    } else if (mainHeadingMatch && mainHeadingMatch.index !== undefined && mainHeadingMatch.index > 0) {
      cleaned = cleaned.slice(mainHeadingMatch.index);
    }

    return cleaned.trim();
  }

  static extractTitleFromContent(content: string): string | null {
    const stepPattern = /^(?:[【\[［]\d+[/／]\d+[】\]］]\s*)?(?:第[一二三四五六七八九十\d]+步|步骤|操作|执行|开始|继续|创建|完成|当前|下一步)[\s：:：]*[\s\S]*$|^[【\[［]\d+[/／]\d+[】\]］]\s*\S+/;
    const allHeadings = content.match(/^#{1,3}\s+(.+)$/gm) || [];
    let bestName: string | null = null;

    for (const rawHeading of allHeadings) {
      let title = rawHeading.replace(/^#{1,3}\s+/, '').trim();
      title = title.replace(/^[【\[［]\d+[/／]\d+[】\]］]\s*[：:]?\s*/, '').trim();
      if (stepPattern.test(rawHeading.replace(/^#{1,3}\s+/, '').trim())) continue;
      if (/^(?:一致性检查|角色创建规划|任务规划|计划|全部|总计|总结|✅)$/.test(title)) continue;
      if (/^(?:创建|新建|生成|撰写|编写|制作|构建|添加|写入|设定)\S+.*$/.test(title)) continue;

      const bracketMatch = title.match(/【([^】]+)】/);
      if (bracketMatch && bracketMatch[1].length >= 2 && bracketMatch[1].length <= 10) {
        const candidate = bracketMatch[1].trim();
        if (!/^(?:角色类型|主角|女主|反派|配角)$/.test(candidate)) {
          bestName = candidate;
          break;
        }
      }

      const cleanTitle = title
        .replace(/【[^】]*】/g, '')
        .replace(/[（(][^）)]*[）)]/g, '')
        .replace(/^#+\s*/, '')
        .trim();

      if (cleanTitle.length >= 2 && cleanTitle.length <= 15 && !/[，,。！？\n]/.test(cleanTitle)) {
        bestName = cleanTitle;
        break;
      }
    }

    if (bestName) return bestName;

    const nameField = content.match(/^\s*[-*]\s*\*\*姓名\*\*[：:]\s*(.+)$/m);
    if (nameField) {
      const name = nameField[1].trim().split(/[,，、\/]/)[0].replace(/[（(][^）)]*[）)]/g, '').trim();
      if (name.length >= 2 && name.length <= 10) return name;
    }
    return null;
  }

  static smartExtract(content: string, targetHint: string): ParsedToolCall[] {
    const files: Array<{ name: string; content: string }> = [];
    const headingRegex = /^(#{1,3})\s+(.+)$/gm;
    let lastIndex = 0;
    let currentTitle = '';
    let currentSections: string[] = [];

    const pushCurrentFile = () => {
      const text = currentSections.join('\n\n').trim();
      if (text.length > 50 && currentTitle) {
        files.push({ name: currentTitle.replace(/[#*`]/g, '').trim(), content: text });
      }
      currentSections = [];
    };

    let match;
    while ((match = headingRegex.exec(content)) !== null) {
      const level = match[1].length;
      const title = match[2].trim();

      if (level === 1 || level === 2) {
        if (currentTitle) pushCurrentFile();
        currentTitle = title;
        lastIndex = match.index;
      } else {
        currentSections.push(content.substring(lastIndex, match.index).trim());
        lastIndex = match.index;
      }
    }

    if (lastIndex < content.length) {
      currentSections.push(content.substring(lastIndex).trim());
    }
    pushCurrentFile();

    if (files.length === 0 && content.length > 100) {
      const folderTypeMap: Record<string, string> = {
        character: 'characters', world: 'world', timeline: 'timeline',
        outline: 'outline', chapter: 'chapters',
      };
      const defaultNameMap: Record<string, string> = {
        character: '角色设定', world: '世界观总纲', timeline: '时间线事件',
        outline: '大纲', chapter: '章节内容',
      };
      const folderType = folderTypeMap[targetHint] || null;
      files.push({
        name: defaultNameMap[targetHint] || '新建文件',
        content,
      });
      if (folderType) {
        return files.map(f => ({
          action: 'create_file',
          parentId: folderType,
          name: f.name,
          content: f.content,
        }));
      }
    }

    return files.map(f => ({
      action: 'create_file',
      name: f.name,
      content: f.content,
    }));
  }
}
