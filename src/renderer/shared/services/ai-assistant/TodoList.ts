import crypto from 'crypto';

export type TodoStatus = 'pending' | 'in_progress' | 'completed';

export interface TodoItem {
  id: string;
  content: string;
  status: TodoStatus;
}

export interface TodoList {
  items: TodoItem[];
  updatedAt: number;
}

export function parseMarkdownChecklist(md: string): TodoItem[] {
  if (typeof md !== 'string') return [];
  
  const lines = md
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean);
  
  const todos: TodoItem[] = [];
  
  for (const line of lines) {
    const match = line.match(/^(?:[-*]\s*)?\[\s*([ xX\-~])\s*\]\s+(.+)$/);
    if (!match) continue;
    
    let status: TodoStatus = 'pending';
    if (match[1] === 'x' || match[1] === 'X') {
      status = 'completed';
    } else if (match[1] === '-' || match[1] === '~') {
      status = 'in_progress';
    }
    
    const id = crypto
      .createHash('md5')
      .update(match[2] + status)
      .digest('hex');
    
    todos.push({
      id,
      content: match[2].trim(),
      status,
    });
  }
  
  return todos;
}

export function todoListToMarkdown(todos: TodoItem[]): string {
  return todos
    .map(t => {
      let box = '[ ]';
      if (t.status === 'completed') box = '[x]';
      else if (t.status === 'in_progress') box = '[-]';
      return `${box} ${t.content}`;
    })
    .join('\n');
}

export function validateTodos(todos: unknown[]): { valid: boolean; error?: string } {
  if (!Array.isArray(todos)) {
    return { valid: false, error: 'todos must be an array' };
  }
  
  for (const [i, t] of todos.entries()) {
    if (!t || typeof t !== 'object') {
      return { valid: false, error: `Item ${i + 1} is not an object` };
    }
    const item = t as Record<string, unknown>;
    if (!item.content || typeof item.content !== 'string') {
      return { valid: false, error: `Item ${i + 1} is missing content` };
    }
    if (item.status && !['pending', 'in_progress', 'completed'].includes(item.status as string)) {
      return { valid: false, error: `Item ${i + 1} has invalid status` };
    }
  }
  
  return { valid: true };
}

export function createTodo(content: string, status: TodoStatus = 'pending'): TodoItem {
  return {
    id: crypto.randomUUID(),
    content,
    status,
  };
}

export function updateTodoStatus(todo: TodoItem, nextStatus: TodoStatus): TodoItem {
  return { ...todo, status: nextStatus };
}
