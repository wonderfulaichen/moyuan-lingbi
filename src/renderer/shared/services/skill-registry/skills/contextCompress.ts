/**
 * 上下文压缩 Skill
 *
 * 对大量项目上下文（如多章节、长篇设定）进行结构化压缩。
 * 压缩思路：提取关键实体、关系、事件节点，丢弃冗余描述。
 */
import type { SkillDefinition } from '../types';

export const contextCompressSkill: SkillDefinition = {
  id: 'skill-context-compress',
  name: '上下文压缩',
  description: '对长篇项目文档（世界观设定/角色档案/章节正文）进行结构化摘要，保留核心信息、减少 token 占用',
  category: 'token',

  execute(input) {
    const { params } = input;
    const content = (params.content as string) || '';
    const type = (params.type as string) || 'general'; // general | world | character | plot
    const maxTokens = (params.maxTokens as number) || 2000;

    if (!content) {
      return { success: false, result: '需要提供待压缩的内容（params.content）' };
    }

    const charLimit = maxTokens * 4; // 约 4 字符/token
    const originalLength = content.length;

    if (originalLength <= charLimit) {
      return {
        success: true,
        result: `内容较短（${originalLength} 字符），无需压缩。`,
        data: { compressed: content, originalLength, compressedLength: originalLength },
      };
    }

    // 按类型结构化压缩
    let compressed = '';

    switch (type) {
      case 'world': {
        // 世界观：提取标题行 + 关键定义
        compressed = extractSections(content, ['##', '###'], 3);
        break;
      }
      case 'character': {
        // 角色：提取名称 + 核心特征
        compressed = extractSections(content, ['##', '###', '**'], 2);
        break;
      }
      case 'plot': {
        // 情节：提取章节标题 + 关键事件
        compressed = extractSections(content, ['##', '###', '---'], 2);
        break;
      }
      default: {
        // 通用：提取前 N 字 + 标题行
        compressed = content.slice(0, charLimit);
        break;
      }
    }

    // 确保不超上限
    if (compressed.length > charLimit) {
      compressed = compressed.slice(0, charLimit) + '\n\n…（内容已截断）';
    }

    return {
      success: true,
      result: `上下文压缩完成：${originalLength} → ${compressed.length} 字符（压缩率 ${Math.round((1 - compressed.length / originalLength) * 100)}%）。`,
      data: {
        originalLength,
        compressedLength: compressed.length,
        compressionRatio: Math.round((1 - compressed.length / originalLength) * 100),
        compressed,
      },
    };
  },
};

/**
 * 提取文档中的标题行及其后若干行内容
 */
function extractSections(
  content: string,
  headingMarkers: string[],
  linesAfterHeading: number,
): string {
  const lines = content.split('\n');
  const resultLines: string[] = [];
  let linesSinceLastHeading = 999;

  for (const line of lines) {
    const isHeading = headingMarkers.some((m) => line.trim().startsWith(m));
    if (isHeading) {
      resultLines.push(line);
      linesSinceLastHeading = 0;
    } else if (linesSinceLastHeading < linesAfterHeading && resultLines.length > 0) {
      resultLines.push(line);
      linesSinceLastHeading++;
    }
  }

  return resultLines.join('\n');
}
