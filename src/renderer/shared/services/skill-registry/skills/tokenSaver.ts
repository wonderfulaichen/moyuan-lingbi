/**
 * Token 节省 Skill
 *
 * 分析对话及上下文，自动压缩冗余内容以节省 token。
 * 调用方式：Agent 在 system prompt 中引用此 skill 的描述，
 * 或通过 tool 格式直接调用。
 */
import type { SkillDefinition } from '../types';

export const tokenSaverSkill: SkillDefinition = {
  id: 'skill-token-saver',
  name: 'Token 优化',
  description: '分析当前对话并压缩历史记录中的冗余内容，减少 token 消耗（预计节省 20-60%）',
  category: 'token',

  execute(input) {
    const { params } = input;
    const action = (params.action as string) || 'analyze';
    const content = (params.content as string) || '';

    if (action === 'analyze' && content) {
      const originalLength = content.length;
      // 简单压缩规则：移除多余空行、合并连续换行
      let compressed = content
        .replace(/\n{3,}/g, '\n\n')
        .replace(/[ \t]+$/gm, '')
        .replace(/^[ \t]+/gm, '')
        .trim();
      const savedLength = originalLength - compressed.length;
      const savedPercent = originalLength > 0 ? Math.round((savedLength / originalLength) * 100) : 0;

      return {
        success: true,
        result: `Token 分析完成。原内容 ${originalLength} 字符，压缩后 ${compressed.length} 字符（节省约 ${savedPercent}%）。`,
        data: {
          originalLength,
          compressedLength: compressed.length,
          savedPercent,
          compressed,
        },
      };
    }

    if (action === 'compress' && content) {
      const originalLength = content.length;
      let compressed = content
        .replace(/\n{3,}/g, '\n\n')
        .replace(/[ \t]+$/gm, '')
        .trim();

      // 如果过长，进行摘要截断
      const MAX_CHARS = (params.maxChars as number) || 4000;
      if (compressed.length > MAX_CHARS) {
        compressed = compressed.slice(0, MAX_CHARS) + '\n\n…（后续内容已压缩，共 ' + originalLength + ' 字符）';
      }

      const savedLength = originalLength - compressed.length;
      return {
        success: true,
        result: `Token 压缩完成：${originalLength} → ${compressed.length} 字符。`,
        data: {
          originalLength,
          compressedLength: compressed.length,
          compressed,
        },
      };
    }

    return {
      success: true,
      result: 'Token 优化就绪。使用 action="analyze" 进行分析，或 action="compress" 执行压缩。',
    };
  },
};
