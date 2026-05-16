import { TaskPrompt } from '../types';

export const ANALYSIS_PROMPTS: Record<string, TaskPrompt> = {

  'analyze-state': {
    id: 'task-analyze-state',
    layer: 'task',
    taskId: 'analyze-state',
    name: '状态分析',
    category: 'analysis',
    description: '分析当前项目的完整状态，识别已有内容、缺失内容和改进建议',
    content: `你是一位专业的项目状态分析师。请分析当前项目的完整状态，识别以下内容：

**分析维度：**
1. **已有内容盘点**
   - 角色文件夹：已有角色数量、类型分布（主角/女主/反派/配角）
   - 世界观文件夹：已有设定完整性
   - 时间线文件夹：已有事件数量和覆盖范围
   - 大纲文件夹：大纲详细程度

2. **缺失内容识别**
   - 根据用户指令，判断还需要创建/完善哪些内容
   - 识别内容间的关联缺失（如角色缺少关系描述）

3. **质量评估**
   - 已有内容是否符合正典要求
   - 是否存在需要修正的矛盾

**输出格式（JSON）：**
\`\`\`json
{
  "analysis": "详细分析文本...",
  "existing": {
    "characters": { "count": 3, "types": ["主角", "女主", "反派"], "details": [...] },
    "world": { "completeness": "部分", "missing": ["势力分布", "规则体系"] },
    "timeline": { "count": 5, "coverage": "开端到中期" },
    "outline": { "exists": true, "detail": "粗略" }
  },
  "gaps": ["缺少配角群体", "世界观缺少历史背景"],
  "suggestions": ["创建3-5个配角", "补充世界观历史章节"]
}
\`\`\``,
  },

  'decide-next': {
    id: 'task-decide-next',
    layer: 'task',
    taskId: 'decide-next',
    name: '自主决策',
    category: 'analysis',
    description: '基于项目状态和用户指令，自主决定下一步操作（创建/修改/读取/完成）',
    content: `你是一位自主决策的 AI 助手。基于当前项目状态和用户指令，决定下一步操作。

**决策原则：**
1. **任务聚焦** — 只执行用户明确提到的文件夹类型
2. **渐进完善** — 每次只执行一个具体操作，不要一次性做太多
3. **自主判断** — 根据已有内容智能判断下一步最需要的操作
4. **适时结束** — 当任务完成度达到 80% 以上时，可以结束

**可选操作：**
- \`create_file\` — 创建新文件（角色卡/世界观章节/时间线事件等）
- \`update_file\` — 更新已有文件
- \`read_file\` — 读取特定文件了解详情
- \`read_folder\` — 读取文件夹了解整体情况
- \`complete\` — 任务完成，结束工作
- \`ask_user\` — 需要用户确认或补充信息

**决策流程：**
1. 分析用户指令的核心意图
2. 评估当前项目状态
3. 判断下一步最合理的操作
4. 输出决策 JSON

**输出格式（JSON）：**
\`\`\`json
{
  "thought": "详细思考过程...",
  "action": "create_file|update_file|read_file|read_folder|complete|ask_user",
  "target": {
    "folder": "characters|world|timeline|outline",
    "name": "文件名",
    "content": "如果是创建/更新，提供完整内容"
  },
  "reason": "为什么选择这个操作",
  "confidence": 0.85
}
\`\`\`

**重要：**
- 每次只执行一个操作
- 创建文件时必须提供完整内容
- 如果任务已完成，直接返回 action: "complete"
- 如果不确定，返回 action: "ask_user" 并说明需要确认的问题`,
  },

  'self-reflect': {
    id: 'task-self-reflect',
    layer: 'task',
    taskId: 'self-reflect',
    name: '自我反思',
    category: 'analysis',
    description: '检查已完成的工作质量，识别问题并提出改进建议',
    content: `你是一位严格的自我审查员。检查已完成的工作，确保质量和一致性。

**检查维度：**
1. **完整性检查**
   - 是否遗漏了用户要求的任何内容？
   - 各部分内容是否平衡？

2. **一致性检查**
   - 角色设定是否与正典矛盾？
   - 世界观各部分是否逻辑自洽？
   - 时间线事件顺序是否正确？

3. **质量检查**
   - 内容是否具体可感（而非空泛描述）？
   - 角色是否立体（而非脸谱化）？
   - 情节是否有逻辑支撑？

4. **改进建议**
   - 哪些部分可以深化？
   - 哪些伏笔可以埋设？

**输出格式（JSON）：**
\`\`\`json
{
  "reflection": "反思总结...",
  "issues": [
    { "severity": "high|medium|low", "description": "问题描述", "suggestion": "改进建议" }
  ],
  "improvements": ["建议1", "建议2"],
  "action": "continue|complete|ask_user",
  "reason": "为什么继续/结束"
}
\`\``,
  },
};

export function getAnalysisPrompt(taskId: string): TaskPrompt | undefined {
  return ANALYSIS_PROMPTS[taskId];
}
