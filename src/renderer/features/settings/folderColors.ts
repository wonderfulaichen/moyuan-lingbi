/**
 * 文件夹类型 → 颜色/图标/标签 映射
 *
 * 设计说明：
 * - 文件夹类型色（world=绿、characters=蓝、timeline=黄等）属于业务语义标识
 * - 与关系色/角色色一致，跨主题保持固定，便于用户识别
 * - 使用 Tailwind 类字符串（如 'from-emerald-600/30 to-emerald-900/20'），
 *   因 --color-emerald-* 等已在 @theme 中定义，Tailwind 类会间接引用 CSS 变量
 * - 此前 BubbleFolder.tsx 与 BubbleFolderContent.tsx 各自重复定义，现统一抽离
 */

/** 文件夹类型（覆盖所有 7 种业务类型） */
export type FolderTypeKey =
  | 'world'
  | 'characters'
  | 'timeline'
  | 'outline'
  | 'detailed_outline'
  | 'chapters'
  | 'custom';

/** 类型 → 中文标签 */
export const TYPE_LABELS: Record<FolderTypeKey, string> = {
  world: '世界观',
  characters: '角色',
  timeline: '时间线',
  outline: '大纲',
  detailed_outline: '细纲',
  chapters: '章节',
  custom: '自定义',
};

/** 类型 → FontAwesome 图标类名 */
export const TYPE_ICONS: Record<FolderTypeKey, string> = {
  world: 'fa-globe',
  characters: 'fa-users',
  timeline: 'fa-timeline',
  outline: 'fa-sitemap',
  detailed_outline: 'fa-list-check',
  chapters: 'fa-book',
  custom: 'fa-folder',
};

/** 类型 → 图标颜色（Tailwind text-* 类） */
export const FOLDER_ICON_COLORS: Record<FolderTypeKey, string> = {
  world: 'text-emerald-400',
  characters: 'text-blue-400',
  timeline: 'text-amber-400',
  outline: 'text-violet-400',
  detailed_outline: 'text-cyan-400',
  chapters: 'text-pink-400',
  custom: 'text-rose-400',
};

/** 类型 → 卡片背景渐变（Tailwind from-x 到 to-x 类，用于 BubbleFolderContent 卡片） */
export const FOLDER_BG_GRADIENTS: Record<FolderTypeKey, string> = {
  world: 'from-emerald-600/20 to-emerald-900/20',
  characters: 'from-blue-600/20 to-blue-900/20',
  timeline: 'from-amber-600/20 to-amber-900/20',
  outline: 'from-violet-600/20 to-violet-900/20',
  detailed_outline: 'from-cyan-600/20 to-cyan-900/20',
  chapters: 'from-pink-600/20 to-pink-900/20',
  custom: 'from-rose-600/20 to-rose-900/20',
};

/** 类型 → 折叠条背景渐变（Tailwind from-x 到 to-x 类，用于 BubbleFolder 折叠条，alpha 较高） */
export const FOLDER_BG_COLORS: Record<FolderTypeKey, string> = {
  world: 'from-emerald-600/30 to-emerald-900/20',
  characters: 'from-blue-600/30 to-blue-900/20',
  timeline: 'from-amber-600/30 to-amber-900/20',
  outline: 'from-violet-600/30 to-violet-900/20',
  detailed_outline: 'from-cyan-600/30 to-cyan-900/20',
  chapters: 'from-pink-600/30 to-pink-900/20',
  custom: 'from-rose-600/30 to-rose-900/20',
};

/** 类型 → 边框色（Tailwind border-* 类） */
export const FOLDER_BORDER_COLORS: Record<FolderTypeKey, string> = {
  world: 'border-emerald-500/30',
  characters: 'border-blue-500/30',
  timeline: 'border-amber-500/30',
  outline: 'border-violet-500/30',
  detailed_outline: 'border-cyan-500/30',
  chapters: 'border-pink-500/30',
  custom: 'border-rose-500/30',
};

/** 类型 → 阴影色（Tailwind shadow-* 类） */
export const FOLDER_GLOW_COLORS: Record<FolderTypeKey, string> = {
  world: 'shadow-emerald-900/30',
  characters: 'shadow-blue-900/30',
  timeline: 'shadow-amber-900/30',
  outline: 'shadow-violet-900/30',
  detailed_outline: 'shadow-cyan-900/30',
  chapters: 'shadow-pink-900/30',
  custom: 'shadow-rose-900/30',
};

/**
 * 安全获取类型标签（未知类型返回 '自定义'）
 */
export function getFolderTypeLabel(type: string | undefined | null): string {
  if (!type) return '自定义';
  return TYPE_LABELS[type as FolderTypeKey] || '自定义';
}

/**
 * 安全获取类型图标（未知类型返回文件夹图标）
 */
export function getFolderTypeIcon(type: string | undefined | null): string {
  if (!type) return 'fa-folder';
  return TYPE_ICONS[type as FolderTypeKey] || 'fa-folder';
}
