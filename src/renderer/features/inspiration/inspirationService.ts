import { aiService } from '../../shared/services/aiService';
import { ModelConfig, InspirationTag, NovelScheme, StreamingCallback } from '../../../shared/types';

/**
 * 灵感模块AI服务
 * 处理标签发散和方案构思的AI调用与结果解析
 * 支持流式输出和中断
 */

/**
 * 步骤1：根据灵感生成标签（支持流式回调与中断）
 */
export async function generateTags(
  inspiration: string,
  model: ModelConfig,
  promptTemplate: string,
  onProgress?: (text: string) => void,
  signal?: AbortSignal,
  onTokenUsage?: (tokens: { prompt: number; completion: number; total: number }) => void,
  count: number = 5,
): Promise<InspirationTag[]> {
  const prompt = promptTemplate
    .replace('{inspiration}', inspiration)
    .replace('{count}', String(count));

  const response = await aiService.generateWithContext({
    model,
    prompt,
    systemPrompt: '你是一位网文创作领域的专业标签策划师。你的任务是对用户的灵感进行深度分析，然后从多个维度发散出精准的创作标签。\n\n**工作流程：**\n1. 分析灵感中蕴含的核心主题和情感基调\n2. 拆解出可行的题材方向、核心元素和人物成长方向\n3. 去重合并，确保每个标签都有独特的信息价值\n4. 只输出标签本身，不要任何解释性文字\n\n**质量要求：**\n- 标签必须是网文创作中的常见分类术语\n- 避免过于宽泛或模糊的标签\n- 标签之间要有区分度，不产生歧义',
    temperature: 0.75,
    signal,
  });

  if (response.error) {
    throw new Error(response.error);
  }

  // 回调 Token 用量信息
  if (response.tokens && onTokenUsage) {
    onTokenUsage(response.tokens);
  }

  // 实时回调当前原始文本
  if (onProgress) {
    onProgress(response.content);
  }

  // 解析AI返回的标签
  const tags = response.content
    .split(/[,，、\n]/)
    .map(tag => tag.trim().replace(/^[-•*\d.、]+\s*/, ''))  // 去掉前缀符号
    .filter(tag => tag.length > 0 && tag.length <= 20)       // 过滤过长或空的
    .slice(0, count);                                         // 按用户指定数量截取

  return tags.map(text => ({
    id: `tag-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    text,
    selected: false,
    source: 'ai' as const,
  }));
}

/**
 * 步骤2：根据灵感+选中标签生成小说方案（支持流式）
 */
export async function generateSchemes(
  inspiration: string,
  selectedTags: InspirationTag[],
  model: ModelConfig,
  promptTemplate: string,
  count: number = 3,
  onProgress?: (text: string) => void,
  signal?: AbortSignal,
): Promise<NovelScheme[]> {
  const tagsText = selectedTags.map(t => t.text).join('、');
  const prompt = promptTemplate
    .replace('{inspiration}', inspiration)
    .replace('{tags}', tagsText)
    .replace('{count}', String(count));

  const response = await aiService.generateWithContext({
    model,
    prompt,
    systemPrompt: '你是一位拥有20年经验的资深小说策划编辑。你的任务是综合用户的灵感和标签，构思出有市场竞争力且创意独特的小说方案。\n\n**工作流程：**\n1. 首先充分理解用户灵感和标签组合的独特之处\n2. 思考当前网文市场中该类型的流行趋势和差异化方向\n3. 为每个方案构思一个有吸引力、有记忆点的书名\n4. 确保每个方案的核心冲突具有足够的戏剧张力和新颖性\n5. 检查各方案之间是否真正差异化，避免雷同\n6. 严格按照格式输出，每个方案用 --- 分隔\n\n**输出格式（每个方案必须包含以下字段）：**\n书名：[有网文感的书名，10字以内]\n题材：[如：玄幻、科幻、都市...]\n基调：[如：热血、悬疑、温馨...]\n核心冲突：[具体的核心矛盾]\n简介：[200字左右的故事梗概]\n亮点：[差异化卖点]\n\n**质量要求：**\n- 书名必须有吸引力、有记忆点、符合网文风格\n- 每个方案必须是一个完整的故事构思，而不是片段想法\n- 核心冲突要具体可感，不能是"正义vs邪恶"这类空泛表述\n- 简介必须有钩子、有转折、有期待感\n- 亮点要是真实可感知的差异化优势',
    temperature: 0.8,
    signal,
  });

  if (response.error) {
    throw new Error(response.error);
  }

  if (onProgress) {
    onProgress(response.content);
  }

  // 解析AI返回的方案
  const schemes = parseSchemes(response.content);

  const now = Date.now();
  return schemes.map((scheme, idx) => ({
    id: `scheme-${now}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
    ...scheme,
    selected: false,
    favorited: false,
    groupId: null,
    createdAt: now,
  }));
}

/**
 * 流式生成方案（实时展示生成过程）
 */
export async function generateSchemesStreaming(
  inspiration: string,
  selectedTags: InspirationTag[],
  model: ModelConfig,
  promptTemplate: string,
  count: number = 3,
  callbacks: {
    onToken?: (text: string) => void;
    onComplete?: (schemes: NovelScheme[]) => void;
    onError?: (error: string) => void;
    onTokenUsage?: (tokens: { prompt: number; completion: number; total: number }) => void;
  },
): Promise<void> {
  const tagsText = selectedTags.map(t => t.text).join('、');
  const prompt = promptTemplate
    .replace('{inspiration}', inspiration)
    .replace('{tags}', tagsText)
    .replace('{count}', String(count));

  let fullContent = '';

  const streamingCallback: StreamingCallback = (update) => {
    if (update.content) {
      fullContent = update.content;
      if (callbacks.onToken) {
        callbacks.onToken(update.content);
      }
    }
    if (update.isComplete) {
      // 回调 Token 用量信息
      if (update.tokens && callbacks.onTokenUsage) {
        callbacks.onTokenUsage(update.tokens);
      }
      if (!update.error) {
        const schemes = parseSchemes(fullContent);
        const now = Date.now();
        const result = schemes.map((scheme, idx) => ({
          id: `scheme-${now}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
          ...scheme,
          selected: false,
          favorited: false,
          groupId: null,
          createdAt: now,
        }));
        if (callbacks.onComplete) {
          callbacks.onComplete(result);
        }
      } else if (callbacks.onError) {
        callbacks.onError(update.error || '生成失败');
      }
    }
  };

  try {
    await aiService.generateWithContext(
      {
        model,
        prompt,
        systemPrompt: '你是一位拥有20年经验的资深小说策划编辑。你的任务是综合用户的灵感和标签，构思出有市场竞争力且创意独特的小说方案。\n\n**工作流程：**\n1. 首先充分理解用户灵感和标签组合的独特之处\n2. 思考当前网文市场中该类型的流行趋势和差异化方向\n3. 为每个方案构思一个有吸引力、有记忆点的书名\n4. 确保每个方案的核心冲突具有足够的戏剧张力和新颖性\n5. 检查各方案之间是否真正差异化，避免雷同\n6. 严格按照格式输出，每个方案用 --- 分隔\n\n**输出格式（每个方案必须包含以下字段）：**\n书名：[有网文感的书名，10字以内]\n题材：[如：玄幻、科幻、都市...]\n基调：[如：热血、悬疑、温馨...]\n核心冲突：[具体的核心矛盾]\n简介：[200字左右的故事梗概]\n亮点：[差异化卖点]\n\n**质量要求：**\n- 书名必须有吸引力、有记忆点、符合网文风格\n- 每个方案必须是一个完整的故事构思，而不是片段想法\n- 核心冲突要具体可感，不能是"正义vs邪恶"这类空泛表述\n- 简介必须有钩子、有转折、有期待感\n- 亮点要是真实可感知的差异化优势',
        temperature: 0.8,
      },
      streamingCallback,
    );
  } catch (error) {
    if (callbacks.onError) {
      callbacks.onError(error instanceof Error ? error.message : '生成失败');
    }
  }
}

/**
 * 清理字段值中的多余格式符号（markdown、引号、括号等）
 */
function stripMarkdown(raw: string): string {
  return raw
    .replace(/^\*\*|\*\*$/g, '')
    .replace(/^《|》$/g, '')
    .replace(/^\[|\]$/g, '')
    .replace(/^["'「『]|["'」』]$/g, '')
    .replace(/^\*\s+/, '')
    .replace(/^\s*[-•·]\s*/, '')
    .trim();
}

/**
 * 已知的字段名列表（用于判断一行是否为字段行）
 */
const SCHEME_FIELD_NAMES = [
  '书名', '标题', '方案名称', '小说名称', '作品名称', '小说名', '作品名',
  '题材', '基调', '风格', '核心冲突', '简介', '亮点', '目标读者定位', '目标读者',
];

/**
 * 判断一行文本是否为"字段名：值"的字段行
 */
function isFieldLine(line: string): string | null {
  const trimmed = line.trim();
  for (const name of SCHEME_FIELD_NAMES) {
    // 支持 "书名：值" 或 "**书名**：值" 或 "**书名：值**" 等格式
    const match = trimmed.match(new RegExp(`^\\*{0,2}\\s*${name}\\s*\\*{0,2}\\s*[：:]\\s*(.*?)\\s*\\*{0,2}$`));
    if (match) return name; // 返回字段名，表示这一行是这个字段
  }
  return null;
}

/**
 * 从一行中提取字段值部分（去除字段名和冒号）
 */
function extractValueFromFieldLine(line: string, fieldName: string): string {
  const regex = new RegExp(`${fieldName}\\s*\\*{0,2}\\s*[：:]\\s*(.*)`, 'i');
  const match = line.match(regex);
  if (!match) return '';
  return stripMarkdown(match[1].trim());
}

/**
 * 从文本块中按字段名搜索字段行并提取值
 */
function findFieldValue(lines: string[], fieldName: string): string {
  for (const line of lines) {
    const trimmed = line.trim();
    // 支持 "书名：值"、"**书名：值**"、"书名 **：**值" 等形式
    const regex = new RegExp(`^\\*{0,2}\\s*${fieldName}\\s*\\*{0,2}\\s*[：:]`);
    if (regex.test(trimmed)) {
      const separatorIdx = trimmed.search(/[：:]/);
      if (separatorIdx >= 0) {
        return stripMarkdown(trimmed.slice(separatorIdx + 1).trim());
      }
    }
  }
  return '';
}

/**
 * 解析AI返回的方案文本（逐行解析，支持多行值和各种格式）
 */
function parseSchemes(content: string): Array<{
  title: string;
  intro: string;
  genre: string;
  tone: string;
  coreConflict: string;
  highlights: string;
}> {
  const schemes: Array<{
    title: string;
    intro: string;
    genre: string;
    tone: string;
    coreConflict: string;
    highlights: string;
  }> = [];

  // 按 --- 分割不同方案
  const blocks = content.split(/---+/).filter(b => b.trim().length > 0);
  if (blocks.length === 0) return schemes;

  for (const block of blocks) {
    const lines = block.split('\n');

    // ---------- 1. 从字段行提取各个字段 ----------
    const title = findFieldValue(lines, '书名')
      || findFieldValue(lines, '标题')
      || findFieldValue(lines, '方案名称')
      || findFieldValue(lines, '小说名称')
      || findFieldValue(lines, '作品名称')
      || findFieldValue(lines, '小说名')
      || findFieldValue(lines, '作品名');
    const intro = findFieldValue(lines, '简介');
    const genre = findFieldValue(lines, '题材');
    const tone = findFieldValue(lines, '基调') || findFieldValue(lines, '风格');
    const coreConflict = findFieldValue(lines, '核心冲突');
    const highlights = findFieldValue(lines, '亮点');

    // ---------- 2. 如果字段提取不到标题，尝试用书名号或首行提取 ----------
    let resolvedTitle = title;
    if (!resolvedTitle) {
      // 从非字段行中找《书名号》
      for (const line of lines) {
        const bookMatch = line.match(/《(.+?)》/);
        if (bookMatch) {
          resolvedTitle = bookMatch[1].trim();
          break;
        }
      }
    }
    if (!resolvedTitle) {
      // 取第一个非空、非字段行的内容
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (isFieldLine(trimmed)) continue;
        // 跳过明显的开场白行
        if (/收到|您好|你好|灵感|以下|为您|构思|作为|从业/.test(trimmed)) continue;
        resolvedTitle = stripMarkdown(trimmed);
        break;
      }
    }

    schemes.push({
      title: resolvedTitle || '未命名方案',
      intro: intro || '',
      genre: genre || '',
      tone: tone || '',
      coreConflict: coreConflict || '',
      highlights: highlights || '',
    });
  }

  return schemes;
}
