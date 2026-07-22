import { useCallback, useRef } from 'react';

export type FormatType = 'bold' | 'italic' | 'dialogue' | 'quote' | 'list' | 'heading';

export interface SmartFormatOptions {
  autoIndent: boolean;
  autoClose: boolean;
  smartQuote: boolean;
}

const DEFAULT_OPTIONS: SmartFormatOptions = {
  autoIndent: true,
  autoClose: true,
  smartQuote: true,
};

export interface FormatResult {
  newText: string;
  newCursorPosition: number;
  consumed: boolean;
}

export function useSmartFormat(options: Partial<SmartFormatOptions> = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const indentStackRef = useRef<string[]>([]);

  const detectLineType = useCallback((line: string): 'dialogue' | 'quote' | 'list' | 'normal' => {
    const trimmed = line.trim();
    
    if (/^[「」""''『』【】]/.test(trimmed)) return 'dialogue';
    if (/^> /.test(trimmed)) return 'quote';
    if (/^[-*+] \S|^1+\. /.test(trimmed)) return 'list';
    
    return 'normal';
  }, []);

  const getIndent = useCallback((line: string): string => {
    const match = line.match(/^(\s*)/);
    return match ? match[1] : '';
  }, []);

  const applyFormat = useCallback((text: string, selectionStart: number, selectionEnd: number, formatType: FormatType): FormatResult => {
    const before = text.substring(0, selectionStart);
    const selected = text.substring(selectionStart, selectionEnd);
    const after = text.substring(selectionEnd);
    
    const lines = before.split('\n');
    const currentLineStart = before.lastIndexOf('\n') + 1;
    const currentLine = before.substring(currentLineStart);
    
    let newBefore = before;
    let newAfter = after;
    let cursorOffset = 0;

    switch (formatType) {
      case 'bold':
        newBefore = before + '**';
        newAfter = '**' + after;
        cursorOffset = 2;
        break;

      case 'italic':
        newBefore = before + '*';
        newAfter = '*' + after;
        cursorOffset = 1;
        break;

      case 'dialogue':
        newBefore = before + '「';
        newAfter = '」' + after;
        cursorOffset = 1;
        break;

      case 'quote':
        newBefore = before + '> ';
        cursorOffset = 2;
        break;

      case 'list':
        const listMatch = currentLine.match(/^(\s*)(\d+)\. /);
        if (listMatch) {
          const indent = listMatch[1];
          const num = parseInt(listMatch[2]) + 1;
          newBefore = before.substring(0, currentLineStart) + indent + num + '. ' + currentLine.substring(currentLineStart + listMatch[0].length);
        } else {
          newBefore = before + '- ';
          cursorOffset = 2;
        }
        break;

      case 'heading':
        const headingMatch = currentLine.match(/^(#{1,6}) /);
        if (headingMatch) {
          const currentLevel = headingMatch[1].length;
          if (currentLevel < 6) {
            const newLevel = '#'.repeat(currentLevel + 1);
            newBefore = before.substring(0, currentLineStart) + newLevel + ' ' + currentLine.substring(currentLineStart + headingMatch[0].length);
          }
        } else {
          newBefore = before + '# ';
          cursorOffset = 2;
        }
        break;
    }

    return {
      newText: newBefore + selected + newAfter,
      newCursorPosition: selectionStart + cursorOffset,
      consumed: true,
    };
  }, []);

  const handleKeyDown = useCallback((e: { key: string; preventDefault: () => void }, text: string, cursorPosition: number): FormatResult | null => {
    const key = e.key;
    const before = text.substring(0, cursorPosition);
    const after = text.substring(cursorPosition);

    if (opts.smartQuote) {
      if (key === '"') {
        e.preventDefault();
        const lineStart = before.lastIndexOf('\n') + 1;
        const line = before.substring(lineStart);
        
        if (line.trim().endsWith('「') || line.trim().endsWith('"')) {
          return {
            newText: before + '」' + after,
            newCursorPosition: cursorPosition + 1,
            consumed: true,
          };
        }
        
        return {
          newText: before + '「' + after,
          newCursorPosition: cursorPosition + 1,
          consumed: true,
        };
      }

      if (key === '"' && (before.endsWith('「') || before.endsWith('"'))) {
        e.preventDefault();
        return {
          newText: before + '」' + after,
          newCursorPosition: cursorPosition + 1,
          consumed: true,
        };
      }
    }

    if (opts.autoClose) {
      const closePairs: Record<string, string> = {
        '(': ')',
        '[': ']',
        '{': '}',
        '【': '】',
        '《': '》',
      };

      if (closePairs[key]) {
        e.preventDefault();
        const closing = closePairs[key];
        return {
          newText: before + key + closing + after,
          newCursorPosition: cursorPosition + 1,
          consumed: true,
        };
      }

      if (key === 'Backspace') {
        const pairs: Array<[string, string]> = [
          ['「', '」'],
          ['"', '"'],
          ["'", "'"],
          ['(', ')'],
          ['[', ']'],
          ['{', '}'],
          ['【', '】'],
          ['《', '》'],
        ];

        for (const [open, close] of pairs) {
          if (before.endsWith(open) && after.startsWith(close)) {
            e.preventDefault();
            return {
              newText: before + after.substring(1),
              newCursorPosition: cursorPosition,
              consumed: true,
            };
          }
        }
      }
    }

    if (opts.autoIndent) {
      if (key === 'Enter') {
        const lineStart = before.lastIndexOf('\n') + 1;
        const currentLine = before.substring(lineStart);
        const currentIndent = getIndent(currentLine);

        const trimmed = currentLine.trim();
        
        if (trimmed.endsWith('「') || trimmed.endsWith('"') || trimmed.endsWith('『')) {
          e.preventDefault();
          const charMatch = trimmed.match(/[「"『]$/);
          if (charMatch) {
            return {
              newText: before + '\n' + currentIndent + '    ' + charMatch[0] + after,
              newCursorPosition: cursorPosition + 1 + currentIndent.length + 4 + charMatch[0].length,
              consumed: true,
            };
          }
        }

        if (trimmed.endsWith('」') || trimmed.endsWith('"')) {
          e.preventDefault();
          return {
            newText: before + '\n' + currentIndent + after,
            newCursorPosition: cursorPosition + 1 + currentIndent.length,
            consumed: true,
          };
        }

        if (/^[-*+] \S/.test(trimmed) || /^\d+\. \S/.test(trimmed)) {
          e.preventDefault();
          
          if (/[-*+]$/.test(trimmed) || /\d+$/.test(trimmed.replace(/\.$/, ''))) {
            return {
              newText: before + '\n' + currentIndent + after,
              newCursorPosition: cursorPosition + 1 + currentIndent.length,
              consumed: true,
            };
          }

          const listMatch = trimmed.match(/^([-*+]|\d+\.) /);
          if (listMatch) {
            return {
              newText: before + '\n' + currentIndent + listMatch[0] + after,
              newCursorPosition: cursorPosition + 1 + currentIndent.length + listMatch[0].length,
              consumed: true,
            };
          }
        }

        if (trimmed.startsWith('> ')) {
          e.preventDefault();
          return {
            newText: before + '\n' + currentIndent + '> ' + after,
            newCursorPosition: cursorPosition + 1 + currentIndent.length + 2,
            consumed: true,
          };
        }
      }

      if (key === 'Tab') {
        e.preventDefault();
        return {
          newText: before + '    ' + after,
          newCursorPosition: cursorPosition + 4,
          consumed: true,
        };
      }
    }

    return null;
  }, [opts, getIndent]);

  const formatSelection = useCallback((text: string, selectionStart: number, selectionEnd: number, formatType: FormatType): FormatResult => {
    if (selectionStart === selectionEnd) {
      return applyFormat(text, selectionStart, selectionEnd, formatType);
    }

    const before = text.substring(0, selectionStart);
    const selected = text.substring(selectionStart, selectionEnd);
    const after = text.substring(selectionEnd);

    const markers: Record<FormatType, [string, string]> = {
      bold: ['**', '**'],
      italic: ['*', '*'],
      dialogue: ['「', '」'],
      quote: ['> ', ''],
      list: ['- ', ''],
      heading: ['# ', ''],
    };

    const [prefix, suffix] = markers[formatType];

    return {
      newText: before + prefix + selected + suffix + after,
      newCursorPosition: selectionEnd + prefix.length + suffix.length,
      consumed: true,
    };
  }, [applyFormat]);

  const normalizeWhitespace = useCallback((text: string): string => {
    let result = text;
    
    result = result.replace(/\r\n/g, '\n');
    result = result.replace(/\r/g, '\n');
    result = result.replace(/\t/g, '    ');
    result = result.replace(/[ ]+$/gm, '');
    result = result.replace(/\n{3,}/g, '\n\n');

    return result;
  }, []);

  const smartFormat = useCallback((text: string): string => {
    let result = text;

    result = result.replace(/^(\s*)(")([^"]+)(")$/gm, '$1「$3」');
    result = result.replace(/^(\s*)('')([^']+)('')$/gm, '$1『$3』');

    return result;
  }, []);

  return {
    handleKeyDown,
    formatSelection,
    normalizeWhitespace,
    smartFormat,
    detectLineType,
  };
}
