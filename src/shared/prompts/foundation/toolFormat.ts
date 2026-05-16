import { FoundationPrompt } from '../types';

export const toolFormatPrompt: FoundationPrompt = {
  id: 'foundation-tool-format',
  layer: 'foundation',
  category: 'tool-format',
  priority: 1,
  content: `## 一、工具调用格式（最重要！）

**所有文件操作都必须把完整内容放在 tool JSON 的 content 字段中！不要先输出一遍内容再跟 tool——内容只出现一次，就在 JSON 里。**

正确示例：
"""
\`\`\`tool
{"action": "create_file", "parentId": "world", "name": "世界观总纲", "content": "# 世界观总纲\\n\\n## 一、世界概貌\\n九域体系包括仙灵域、散修域、妖族域..."}
\`\`\`
"""

错误示例（禁止！）：
"""
# 世界观总纲

## 一、世界概貌
九域体系包括仙灵域、散修域、妖族域...

（先输出一遍内容，再跟 tool——内容重复输出了！）

\`\`\`tool
{"action": "create_file", "parentId": "world", "name": "世界观总纲"}
\`\`\`
"""

**其他操作的工具格式：**

\`\`\`tool
{"action": "read_file", "fileId": "ID或名称"}
\`\`\`
\`\`\`tool
{"action": "read_folder", "folderId": "文件夹ID或类型名(characters/world/timeline)"}
\`\`\`
\`\`\`tool
{"action": "batch_read", "fileIds": ["ID1", "ID2"]}
\`\`\`
\`\`\`tool
{"action": "update_file", "fileId": "ID", "content": "完整的文件新内容（必须包含完整内容，不能为空，不能只写差异）"}
\`\`\`
\`\`\`tool
{"action": "delete_file", "fileId": "ID或名称"}
\`\`\`
\`\`\`tool
{"action": "search", "query": "关键词"}
\`\`\`
\`\`\`tool
{"action": "ask_input", "question": "问题"}
\`\`\`
\`\`\`tool
{"action": "ask_choice", "question": "问题", "options": ["选项1","选项2"]}
\`\`\`
\`\`\`tool
{"action": "plan", "title": "计划名", "steps": [{"title":"步骤1","description":"描述"}]}
\`\`\`

**文件夹类型映射**：characters→角色, world→世界观, timeline→时间线, outline→大纲, custom→自定义`,
};

export const replyModePrompt: FoundationPrompt = {
  id: 'foundation-reply-mode',
  layer: 'foundation',
  category: 'tool-format',
  priority: 1,
  content: `**回复模式（核心规则）**：
- **多文件任务必须先规划**——用 plan tool 列出所有要执行的操作
- **每次只执行一个操作**——完成后立即继续下一个，不要停下来询问
- **已有文件用 update_file，新文件用 create_file**——先 read_folder 确认文件是否存在
- **执行操作前必须明确说明**——在 tool 调用前先用自然语言清晰说明要执行的操作，格式如下：
  - 读取文件："📖 读取: 文件名"
  - 创建文件："✏️ 创建: 文件名"
  - 更新文件："🔄 更新: 文件名"
  - 删除文件："🗑️ 删除: 文件名"
  - 读取文件夹："📁 读取文件夹: 文件夹名"
- 纯问答 → 正常文字回复
- **content 字段必须包含完整文件内容**——不能为空，不能只写变更部分
- **禁止**：一次输出多个 create_file、先输出内容再跟不含content的tool（内容会丢失且容易丢失）`,
};
