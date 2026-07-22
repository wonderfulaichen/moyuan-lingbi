/**
 * 文件内容类型推断工具
 *
 * 根据文件名扩展名推断 ContentType，用于：
 * - 文件图标区分
 * - 未来按类型渲染（markdown 解析、json 格式化、代码高亮等）
 *
 * 设计原则：
 * - 纯函数，无副作用，易于测试
 * - 未知扩展名 fallback 到 'text'
 * - 无扩展名 fallback 到 'unknown'
 */

import type { ContentType } from '../../../shared/types/fileSystem';

// ============================================================
// 扩展名映射表
// ============================================================

const MARKDOWN_EXTS = new Set(['md', 'markdown', 'mdx']);
const JSON_EXTS = new Set(['json', 'jsonc']);
const OUTLINE_EXTS = new Set(['outline']);
const CODE_EXTS = new Set([
  // JS/TS 系
  'js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs',
  // Web
  'html', 'htm', 'css', 'scss', 'sass', 'less', 'vue', 'svelte',
  // 编程语言
  'py', 'java', 'c', 'cpp', 'cc', 'cxx', 'h', 'hpp', 'hxx',
  'go', 'rs', 'rb', 'php', 'swift', 'kt', 'kts', 'scala',
  'sh', 'bash', 'zsh', 'ps1', 'bat', 'cmd',
  // 数据/配置
  'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf', 'xml',
  // 数据库
  'sql',
  // 其他
  'dart', 'lua', 'r', 'jl', 'ex', 'exs', 'erl', 'clj', 'cljs',
  'vim', 'el', 'lisp', 'hs', 'ml', 'fs', 'fsx',
]);

// ============================================================
// 核心函数
// ============================================================

/**
 * 根据文件名推断内容类型
 *
 * @param fileName 文件名（含扩展名）
 * @returns 内容类型
 *
 * @example
 * inferContentType('chapter01.md')     // 'markdown'
 * inferContentType('config.json')      // 'json'
 * inferContentType('index.tsx')        // 'code'
 * inferContentType('story.outline')    // 'outline'
 * inferContentType('notes.txt')        // 'text'
 * inferContentType('README')           // 'unknown'
 */
export function inferContentType(fileName: string): ContentType {
  if (!fileName) return 'unknown';

  const ext = extractExtension(fileName);
  if (!ext) return 'unknown';

  const lower = ext.toLowerCase();

  if (MARKDOWN_EXTS.has(lower)) return 'markdown';
  if (JSON_EXTS.has(lower)) return 'json';
  if (OUTLINE_EXTS.has(lower)) return 'outline';
  if (CODE_EXTS.has(lower)) return 'code';
  // .txt 和其他未识别扩展名都归为 text
  return 'text';
}

/**
 * 提取文件扩展名（不含点，小写）
 * 支持多点文件名（如 `index.spec.tsx` → `tsx`）
 */
function extractExtension(fileName: string): string {
  const lastDot = fileName.lastIndexOf('.');
  if (lastDot <= 0 || lastDot === fileName.length - 1) return '';
  return fileName.slice(lastDot + 1);
}

// ============================================================
// 图标映射辅助
// ============================================================

export interface ContentTypeIcon {
  /** Font Awesome 图标 class */
  icon: string;
  /** 主题色（CSS 变量或十六进制） */
  color: string;
}

/**
 * ContentType → 图标映射
 * 用于统一渲染文件图标
 */
const CONTENT_TYPE_ICON_MAP: Record<ContentType, ContentTypeIcon> = {
  markdown: { icon: 'fa-markdown', color: 'var(--color-primary-400)' },
  json: { icon: 'fa-brackets-curly', color: '#f59e0b' },
  code: { icon: 'fa-code', color: '#8b5cf6' },
  outline: { icon: 'fa-list-tree', color: '#10b981' },
  text: { icon: 'fa-file-lines', color: 'var(--color-text-muted)' },
  unknown: { icon: 'fa-file', color: 'var(--color-text-muted)' },
};

/**
 * 获取 ContentType 对应的图标信息
 */
export function getContentTypeIcon(contentType: ContentType | undefined): ContentTypeIcon {
  if (!contentType) return CONTENT_TYPE_ICON_MAP.unknown;
  return CONTENT_TYPE_ICON_MAP[contentType] || CONTENT_TYPE_ICON_MAP.unknown;
}
