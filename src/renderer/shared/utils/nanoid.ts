/**
 * 生成短唯一 ID
 * 组合时间戳与随机数，保证同进程内唯一性
 * @returns 形如 "lq3r2p0k_abc1234" 的 ID 字符串
 */
export function nanoid(): string {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}
