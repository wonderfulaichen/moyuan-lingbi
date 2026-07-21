/**
 * 角色关系颜色与标签映射
 *
 * 设计说明：
 * - 关系色属于业务语义标识（如 family=粉色、enemy=红色），跨主题保持一致便于用户识别
 * - 因此使用固定 hex 值而非 CSS 变量，不随主题切换变化
 * - 此前 NetworkNodeDetails.tsx 与 MemoryNetworkView.tsx 各自重复定义，现统一抽离
 */

/** 关系类型 → 颜色（hex 字符串，可直接用于 SVG/Canvas/inline style） */
export const RELATIONSHIP_COLORS: Record<string, string> = {
  family: '#f472b6',
  friend: '#60a5fa',
  romance: '#ec4899',
  enemy: '#ef4444',
  ally: '#34d399',
  neutral: '#9ca3af',
  master: '#a78bfa',
  disciple: '#6366f1',
  other: '#6b7280',
  involved: '#fbbf24',
};

/** 关系类型 → 中文标签 */
export const RELATIONSHIP_LABELS: Record<string, string> = {
  family: '家人',
  friend: '朋友',
  romance: '恋爱',
  enemy: '敌对',
  ally: '盟友',
  neutral: '中立',
  master: '师父',
  disciple: '徒弟',
  other: '其他',
  involved: '参与',
};

/** 默认关系色（未匹配时的兜底） */
export const DEFAULT_RELATIONSHIP_COLOR = '#6b7280';

/**
 * 根据关系类型获取颜色
 * @param type 关系类型 key（family/friend/...）
 * @returns hex 颜色字符串
 */
export function getRelationshipColor(type: string | undefined | null): string {
  if (!type) return DEFAULT_RELATIONSHIP_COLOR;
  return RELATIONSHIP_COLORS[type] || DEFAULT_RELATIONSHIP_COLOR;
}

/**
 * 根据关系类型获取标签
 * @param type 关系类型 key
 * @returns 中文标签，未匹配时返回原值
 */
export function getRelationshipLabel(type: string | undefined | null): string {
  if (!type) return '其他';
  return RELATIONSHIP_LABELS[type] || type;
}
