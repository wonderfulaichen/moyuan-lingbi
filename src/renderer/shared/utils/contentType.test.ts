/**
 * contentType 推断工具单元测试
 *
 * 测试目标：
 * - inferContentType: 各类扩展名正确推断
 * - 边界场景：空字符串、无扩展名、多点文件名、大小写
 * - getContentTypeIcon: 每种类型返回正确图标
 */

import { describe, it, expect } from 'vitest';
import { inferContentType, getContentTypeIcon } from './contentType';
import type { ContentType } from '../../../shared/types/fileSystem';

// ============================================================
// inferContentType
// ============================================================

describe('inferContentType', () => {
  // ----------------------------------------------------------------
  // Markdown
  // ----------------------------------------------------------------
  describe('markdown', () => {
    it('.md 应识别为 markdown', () => {
      expect(inferContentType('chapter01.md')).toBe('markdown');
    });
    it('.markdown 应识别为 markdown', () => {
      expect(inferContentType('notes.markdown')).toBe('markdown');
    });
    it('.mdx 应识别为 markdown', () => {
      expect(inferContentType('doc.mdx')).toBe('markdown');
    });
  });

  // ----------------------------------------------------------------
  // JSON
  // ----------------------------------------------------------------
  describe('json', () => {
    it('.json 应识别为 json', () => {
      expect(inferContentType('config.json')).toBe('json');
    });
    it('.jsonc 应识别为 json', () => {
      expect(inferContentType('settings.jsonc')).toBe('json');
    });
  });

  // ----------------------------------------------------------------
  // Outline
  // ----------------------------------------------------------------
  describe('outline', () => {
    it('.outline 应识别为 outline', () => {
      expect(inferContentType('story.outline')).toBe('outline');
    });
  });

  // ----------------------------------------------------------------
  // Code
  // ----------------------------------------------------------------
  describe('code', () => {
    const codeExts = [
      'js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs',
      'html', 'css', 'scss', 'vue',
      'py', 'java', 'c', 'cpp', 'go', 'rs', 'rb', 'php',
      'sh', 'bash', 'yaml', 'yml', 'toml', 'xml', 'sql',
    ];
    codeExts.forEach(ext => {
      it(`.${ext} 应识别为 code`, () => {
        expect(inferContentType(`file.${ext}`)).toBe('code');
      });
    });
  });

  // ----------------------------------------------------------------
  // Text（未识别扩展名）
  // ----------------------------------------------------------------
  describe('text', () => {
    it('.txt 应识别为 text', () => {
      expect(inferContentType('notes.txt')).toBe('text');
    });
    it('.log 应识别为 text', () => {
      expect(inferContentType('app.log')).toBe('text');
    });
    it('.csv 应识别为 text', () => {
      expect(inferContentType('data.csv')).toBe('text');
    });
    it('未知扩展名 .xyz 应 fallback 到 text', () => {
      expect(inferContentType('file.xyz')).toBe('text');
    });
  });

  // ----------------------------------------------------------------
  // Unknown（无扩展名）
  // ----------------------------------------------------------------
  describe('unknown', () => {
    it('空字符串应返回 unknown', () => {
      expect(inferContentType('')).toBe('unknown');
    });
    it('无扩展名文件应返回 unknown', () => {
      expect(inferContentType('README')).toBe('unknown');
    });
    it('以点结尾的文件名应返回 unknown', () => {
      expect(inferContentType('file.')).toBe('unknown');
    });
    it('隐藏文件 .gitignore 应返回 unknown', () => {
      // .gitignore 的 lastIndexOf('.') = 0，被视为无扩展名
      expect(inferContentType('.gitignore')).toBe('unknown');
    });
  });

  // ----------------------------------------------------------------
  // 大小写
  // ----------------------------------------------------------------
  describe('大小写不敏感', () => {
    it('.MD 应识别为 markdown', () => {
      expect(inferContentType('CHAPTER.MD')).toBe('markdown');
    });
    it('.JSON 应识别为 json', () => {
      expect(inferContentType('CONFIG.JSON')).toBe('json');
    });
    it('.TSX 应识别为 code', () => {
      expect(inferContentType('Component.TSX')).toBe('code');
    });
  });

  // ----------------------------------------------------------------
  // 多点文件名
  // ----------------------------------------------------------------
  describe('多点文件名', () => {
    it('index.spec.tsx 应识别为 code', () => {
      expect(inferContentType('index.spec.tsx')).toBe('code');
    });
    it('chapter01.final.md 应识别为 markdown', () => {
      expect(inferContentType('chapter01.final.md')).toBe('markdown');
    });
    it('app.config.json 应识别为 json', () => {
      expect(inferContentType('app.config.json')).toBe('json');
    });
  });
});

// ============================================================
// getContentTypeIcon
// ============================================================

describe('getContentTypeIcon', () => {
  const allTypes: ContentType[] = ['markdown', 'json', 'code', 'outline', 'text', 'unknown'];
  allTypes.forEach(type => {
    it(`"${type}" 应返回包含 icon 和 color 的对象`, () => {
      const result = getContentTypeIcon(type);
      expect(result).toHaveProperty('icon');
      expect(result).toHaveProperty('color');
      expect(typeof result.icon).toBe('string');
      expect(typeof result.color).toBe('string');
      expect(result.icon.startsWith('fa-')).toBe(true);
    });
  });

  it('undefined 应 fallback 到 unknown 图标', () => {
    const result = getContentTypeIcon(undefined);
    const unknown = getContentTypeIcon('unknown');
    expect(result.icon).toBe(unknown.icon);
    expect(result.color).toBe(unknown.color);
  });

  it('markdown 应返回 fa-markdown 图标', () => {
    const result = getContentTypeIcon('markdown');
    expect(result.icon).toBe('fa-markdown');
  });

  it('json 应返回 fa-brackets-curly 图标', () => {
    const result = getContentTypeIcon('json');
    expect(result.icon).toBe('fa-brackets-curly');
  });

  it('code 应返回 fa-code 图标', () => {
    const result = getContentTypeIcon('code');
    expect(result.icon).toBe('fa-code');
  });

  it('outline 应返回 fa-list-tree 图标', () => {
    const result = getContentTypeIcon('outline');
    expect(result.icon).toBe('fa-list-tree');
  });

  it('text 应返回 fa-file-lines 图标', () => {
    const result = getContentTypeIcon('text');
    expect(result.icon).toBe('fa-file-lines');
  });
});
