import { FormatPrompt } from '../types';

export const FORMAT_PROMPTS: Record<string, FormatPrompt> = {

  'character-card': {
    id: 'format-character-card',
    layer: 'format',
    formatId: 'character-card',
    name: '角色卡片格式',
    description: '角色文件的标准格式，首行必须标注角色类型，用于关系图谱分类',
    content: `## ⚠️ 角色类型标注（必须！）
每个角色文件内容开头必须明确标注角色类型，格式为：
【角色类型：主角/女主/反派/反派配角/配角】
这是关系图正确分类的唯一依据，不可省略。

**如何判断角色类型：**
- 主角：故事核心驱动者，贯穿全文，视角主要跟随的角色（通常1-2人）
- 女主：女性主角或核心女性角色（如果是大女主文/双主角）
- 反派：与主角对立的核心对手，推动主要冲突（通常1-2人）
- 反派配角：反派的下属/帮凶/次要敌人
- 配角：其他辅助性角色（朋友、导师、路人等，数量最多）

## 内容结构要求（必须包含以下所有部分）：

### 基本信息
- 姓名、年龄、身份定位

### 外在特征
- 外貌描述（发型、身形、标志性特征、穿着风格）

### 性格内核
- 3-5个性格关键词 + 每个关键词的具体表现细节
- 性格中的矛盾点（如外表冷漠内心温柔）

### 背景故事
- 身世背景、成长经历中的关键事件
- 塑造其当前性格的根源

### 动机与目标
- 这个角色最想要什么？为什么？
- 内心最深处的恐惧是什么？

### 人际关系
- 与其他主要角色的关系（盟友/敌人/暧昧/血缘等）
- 在剧情中的核心作用

**写作要求：**
- 总字数250-400字
- 人物要立体有血有肉，避免脸谱化
- 用具体细节展现性格（习惯动作、口头禅、标志性物品）
- 直接输出正文，不要额外说明`,
  },

  'world-document': {
    id: 'format-world-document',
    layer: 'format',
    formatId: 'world-document',
    name: '世界观文档格式',
    description: '世界观文件的四章节标准结构',
    content: `## 一、世界概貌
- 世界的基本形态、整体规模
- 主要地理区域（至少3个有特色区域）
- 气候与自然环境特征
- 独特之处（核心设定）

## 二、势力格局
- 至少3-4个主要势力/国家/组织
- 每个势力的名称、理念、疆域、关系
- 势力间的主要矛盾和平衡

## 三、规则体系
- 力量体系的核心原理
- 等级或层次划分
- 规则的限制和代价

## 四、历史与文化
- 关键历史事件
- 文化特色、社会结构
- 与故事主线的关联`,
  },

  'timeline-event': {
    id: 'format-timeline-event',
    layer: 'format',
    formatId: 'timeline-event',
    name: '时间线事件格式',
    description: '单个时间线事件卡片的五部分结构',
    content: `### 时间标记
- 事件所处阶段（开端/发展/转折/高潮/结局）

### 事件概述
- 一句话概括

### 详细经过
- 起因 → 过程和冲突 → 结果

### 人物影响
- 角色变化（认知、能力、关系）
- 对后续剧情的推动

### 隐藏伏笔
- 后续会引爆的线索`,
  },

  'outline-document': {
    id: 'format-outline-document',
    layer: 'format',
    formatId: 'outline-document',
    name: '大纲文档格式',
    description: '三幕式大纲的标准输出格式',
    content: `【总体概览】（100-200字）
一句话梗概 -> 核心冲突说明 -> 主题思想

【第一幕：开端】（详细描述）
第1个情节点(触发事件)→ 角色反应 → 决定踏上旅程

【第二幕：冲突升级】
第2个情节点 → 第3个情节点(中点转折) → 第4个情节点(最黑暗时刻)

【第三幕：高潮与结局】
第5个情节点(最终决战/抉择) → 结局

【核心悬念与伏笔清单】
列出3-5个需要在行文中埋设的重要伏笔及其回收时机。`,
  },

  'scheme-document': {
    id: 'format-scheme-document',
    layer: 'format',
    formatId: 'scheme-document',
    name: '方案文档格式',
    description: '小说方案的标准七字段格式',
    content: `书名：[有网感的书名，10字以内]
题材：[如：玄幻、科幻、都市...]
基调：[如：热血、悬疑、温馨...]
核心冲突：[具体的矛盾]
简介：[200字左右的故事梗概]
亮点：[差异化卖点]
目标读者定位：[面向哪类读者]`,
  },

  'json-strict': {
    id: 'format-json-strict',
    layer: 'format',
    formatId: 'json-strict',
    name: 'JSON严格输出格式',
    description: '仅输出JSON对象，不含任何额外文字',
    content: `输出格式要求：
- 使用严格的 JSON 格式
- 不输出任何解释性文字，只返回 JSON 对象
- 确保所有字段都符合类型定义`,
  },
};

export function getFormatPrompt(formatId: string): FormatPrompt | undefined {
  return FORMAT_PROMPTS[formatId];
}
