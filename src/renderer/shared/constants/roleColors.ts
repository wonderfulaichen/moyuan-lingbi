/**
 * 角色类型颜色映射
 *
 * 设计说明：
 * - 角色类型色（主角=金、女主=粉、反派=红等）属于业务语义标识，跨主题保持一致
 * - 使用中文 key 匹配，因为角色档案中的"角色类型"字段是中文
 * - 此前 CharacterGraphView.tsx 内联定义，现统一抽离
 */

/** 角色类型 → 颜色（hex 字符串） */
export const ROLE_COLORS: Record<string, string> = {
  '主角': '#fbbf24',
  '女主': '#f472b6',
  '反派': '#ef4444',
  '反派配角': '#f97316',
  '配角': '#60a5fa',
};

/** 默认角色色（未匹配时的兜底，对应 slate-400） */
export const DEFAULT_ROLE_COLOR = '#94a3b8';

/**
 * 根据角色类型字符串获取颜色
 * 使用 includes 模糊匹配，因为角色类型字段可能包含额外描述（如"主角（少年期）"）
 *
 * @param role 角色类型字符串（如"主角"、"女主"、"反派配角"）
 * @returns hex 颜色字符串
 */
export function getRoleColor(role: string | undefined | null): string {
  if (!role) return DEFAULT_ROLE_COLOR;
  for (const [key, color] of Object.entries(ROLE_COLORS)) {
    if (role.includes(key)) return color;
  }
  return DEFAULT_ROLE_COLOR;
}
