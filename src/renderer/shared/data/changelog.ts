export interface ChangelogEntry {
  version: string;
  date: string;
  title: string;
  items: { type: 'feature' | 'fix' | 'improvement' | 'ui'; text: string }[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '0.0.8',
    date: '2026-05-05',
    title: '智能体管理 & 内容文件夹优化 & 细节打磨',
    items: [
      { type: 'feature', text: '智能体支持编辑与删除：hover 自定义智能体时浮现 ✏️ 编辑 / 🗑️ 删除按钮' },
      { type: 'feature', text: '删除确认弹窗：项目风格统一弹窗替代浏览器原生 confirm()' },
      { type: 'feature', text: '内置智能体保护：通用助手、世界观构建师等系统预设不可删除' },
      { type: 'fix', text: '预设内容文件夹隐藏操作按钮：世界观/角色/时间线等系统文件夹不再显示编辑/删除入口（仅 custom 类型可见）' },
      { type: 'fix', text: '右键菜单同步适配：预设文件夹右键菜单仅保留「新建子文件夹」「新建卡片」选项' },
      { type: 'improvement', text: '移除细纲编辑器的「AI 撰写章节」按钮，简化交互流程' },
      { type: 'fix', text: '修复 AI 输出内容消失问题：token 限制导致长内容截断' },
      { type: 'fix', text: '修复大纲被拆成多个碎片文件的问题：明确单文件规则 + 自动清理冗余文件' },
      { type: 'fix', text: '修复未闭合 tool 调用被忽略的问题' },
      { type: 'fix', text: '修复 UI 操作无效（删除卡片、编辑打不开）的问题：统一数据系统 ID 处理' },
      { type: 'fix', text: '修复任务列表显示 Invalid Date 的问题' },
      { type: 'fix', text: '修复 Token 数和进度条不实时更新的问题' },
      { type: 'fix', text: '修复 AI 推理过程混入输出文件内容的问题' },
      { type: 'improvement', text: 'AI 行为优化：直接在 tool 调用 JSON 中输出内容，不再先输出再包装' },
      { type: 'improvement', text: '数据系统全面统一：contentCards 与 VFile 双系统融合，自动回退逻辑' },
      { type: 'improvement', text: '大纲弹窗尺寸扩大至 420px，与细纲弹窗保持一致' },
      { type: 'improvement', text: '细纲管理界面升级：多选、批量操作、文件计数，与角色管理对齐' },
      { type: 'improvement', text: '批量删除功能修复：细纲批量删除正常工作' },
      { type: 'improvement', text: '任务计数实时同步：AI 执行任务数全局统一展示' },
      { type: 'improvement', text: '消息操作按钮精简：AI 消息不再显示复制/刷新/关闭按钮，仅用户消息保留' },
      { type: 'improvement', text: '流式 Token 实时推送：生成过程中 token 数和进度条动态刷新' },
      { type: 'improvement', text: '内容清洗增强：ToolParser 新增多层正则过滤 AI 推理噪声' },
    ],
  },
  {
    version: '0.0.7',
    date: '2026-05-04',
    title: 'AI 记忆系统 & 上下文压缩 & 正典体系',
    items: [
      { type: 'feature', text: '上下文智能压缩：对话接近窗口上限时自动压缩旧消息为摘要，防止超上下文' },
      { type: 'feature', text: '正典系统（Canon）：⭐ 收藏文件 = 已定稿正典，AI 以此为唯一事实来源；非收藏 = 临时草稿，AI 禁止参考' },
      { type: 'feature', text: '跨区域关联读取：AI 修改角色时自动检索时间线/情节中的关联引用，确保全局一致性' },
      { type: 'feature', text: '新增 read_folder 工具：AI 可一次读取整个文件夹（如角色/世界观/时间线）的全部内容' },
      { type: 'feature', text: '新增 batch_read 工具：AI 可批量读取多个关联文件，高效完成跨区域检索' },
      { type: 'feature', text: '一致性自检机制：AI 每次生成后自动对照正典检查角色/世界观/时间线/情节 4 维度一致性' },
      { type: 'feature', text: '上下文用量显示：底部信息栏实时展示当前对话 token 占用百分比 + 进度条' },
      { type: 'feature', text: '模型上下文窗口自动获取：内置主流模型规格库，选择模型后自动填充 contextWindow' },
      { type: 'feature', text: '对话跳转导航：一键跳转到任意用户消息位置，长对话不再翻半天' },
      { type: 'feature', text: 'AI 文件导入：支持导入文件（.txt/.md/.json），AI 可读取导入内容作为参考' },
      { type: 'feature', text: '时间线卡片点击预览：点击事件卡片弹出大窗口查看完整内容' },
      { type: 'feature', text: '内容设定卡片点击预览：移除悬停展开，改为点击弹窗预览' },
      { type: 'fix', text: '修复 AI 撤回仅前端生效的问题：现在撤回会真正回滚文件操作（创建/修改/删除）' },
      { type: 'fix', text: '修复编辑重发后非流式输出 + 发送键卡死的问题' },
      { type: 'fix', text: '修复 AI 生成中无法创建新对话的问题' },
      { type: 'fix', text: '修复角色关系图文字不换行的问题' },
      { type: 'fix', text: '修复 AI 生成角色未标注主角/配角类型，导致关系图全显示配角' },
      { type: 'fix', text: '修复重新生成后顶部信息栏不显示 + 非流式输出的问题' },
      { type: 'fix', text: '修复文件导入功能导致白屏的问题' },
      { type: 'fix', text: '修复 token 用量状态变量缺失导致白屏' },
      { type: 'fix', text: '修复夜晚模式下 UI 边框几乎不可见的问题' },
      { type: 'fix', text: '修复关系图节点拖拽后飞到角落的问题' },
      { type: 'improvement', text: 'buildAIContext 重构：按文件夹分组展示正典摘要，智能分配每文件预算（600→1200字）' },
      { type: 'improvement', text: 'search 工具增强：返回内容摘要（前120字）+ 所属文件夹，最多15条防溢出' },
      { type: 'improvement', text: '文件树描述增强：显示文件大小、⭐收藏标记、标签、文件夹内文件数' },
      { type: 'improvement', text: '对话存储韧性：40条完整 + 110条压缩摘要，超 4MB 自动裁剪至 5 个对话' },
      { type: 'improvement', text: '底部信息栏常驻显示：Token 用量 | 模型名 | 上下文占比，移除晦涩的 P|C|Σ 缩写' },
      { type: 'improvement', text: '聊天输入框尺寸增大，默认 3 行，最大 8 行' },
      { type: 'improvement', text: 'AI 生成内容移除编辑按钮，仅用户消息可编辑' },
      { type: 'improvement', text: '移除单卡片 AI 生成按钮，简化内容设定交互' },
      { type: 'improvement', text: '关系图弹窗支持完整交互：拖拽节点 + 实时连线跟随 + 点击查看详情' },
      { type: 'improvement', text: 'resolveFolderId 支持英文类型名（characters/world/timeline 等）' },
    ],
  },
  {
    version: '0.0.6',
    date: '2026-05-04',
    title: 'AI 助手流式输出 & 主题交互大升级',
    items: [
      { type: 'feature', text: 'AI 助手全面支持流式输出：实时逐字显示 + 打字光标动画' },
      { type: 'feature', text: 'AI 输出自动续写：内容过长时自动请求续写，告别截断' },
      { type: 'feature', text: '消息操作工具栏：复制、编辑重发、重新生成、撤回' },
      { type: 'feature', text: '长消息展开/收缩：超过 300 字自动折叠，一键展开' },
      { type: 'feature', text: '智能滚动：用户上滑查看历史时停止自动跟滚，回到底部恢复' },
      { type: 'feature', text: '角色关系图力导向布局优化：节点间距加大，连线清晰可见' },
      { type: 'fix', text: '修复主题色默认从紫色改为宣纸白（paper）' },
      { type: 'fix', text: '修复所有硬编码紫色 hover 效果，改为跟随主题色' },
      { type: 'fix', text: '修复撤回按钮点击无反应的问题' },
      { type: 'fix', text: '修复 AI 助手发送按钮被 isProcessing 卡住的问题' },
      { type: 'fix', text: '修复角色关系图连线在白天/夜晚模式均不可见的问题' },
      { type: 'fix', text: '修复多处中文乱码字符' },
      { type: 'improvement', text: '新增主题 alpha 变量系统（--color-p-alpha-10/20/40/60），统一 hover 效果' },
      { type: 'improvement', text: 'AI 助手 maxTokens 从 2000 提升至 8192，支持更长输出' },
      { type: 'improvement', text: '停止生成时保留已输出内容并标记"(已中断)"' },
    ],
  },
  {
    version: '0.0.5',
    date: '2026-05-01',
    title: 'AI 助手架构重构 & 方案解析优化',
    items: [
      { type: 'improvement', text: 'AI 助手新增多轮对话上下文支持，对话更连贯' },
      { type: 'improvement', text: '系统提示词模块化重构：角色/能力/上下文/工具描述独立管理' },
      { type: 'improvement', text: 'AI 操作执行器类型化重构，支持参数校验和错误提示' },
      { type: 'improvement', text: '灵感方案解析器全面重写：逐行解析，兼容多种AI输出格式' },
      { type: 'improvement', text: '方案生成提示词恢复稳定版本，修复因格式约束引发的输出异常' },
      { type: 'fix', text: '修复灵感方案字段值残留 markdown 符号（**、[]、《》）的问题' },
      { type: 'fix', text: '修复灵感方案标题被AI开场白误提取的问题' },
      { type: 'fix', text: '修复方案卡片中"亮点"字段显示为**的bug' },
    ],
  },
  {
    version: '0.0.4',
    date: '2026-05-01',
    title: '提示词模板编辑 & AI 质量大升级',
    items: [
      { type: 'feature', text: '新增提示词模板编辑功能：支持自定义修改和恢复默认' },
      { type: 'feature', text: '模板变量悬停显示中文使用说明' },
      { type: 'improvement', text: '全面重写 9 个 AI 提示词模板，引入思维链引导' },
      { type: 'improvement', text: '正文创作提示词加入 Show-don\'t-Tell、感官描写、节奏控制等专业写作原则' },
      { type: 'improvement', text: '大纲生成提示词强化三幕式结构和因果逻辑链要求' },
      { type: 'improvement', text: '角色构建提示词增加动机/缺陷/人物弧线等深度维度' },
      { type: 'improvement', text: '章节细纲提示词结构化，要求每章有开场钩子、情绪节奏和结尾悬念' },
      { type: 'improvement', text: '降低 AI temperature 参数（0.9→0.75），减少随机性' },
      { type: 'improvement', text: '写作编辑区自动带上章概要，保持情节连贯性' },
      { type: 'improvement', text: '上线思导图树状视图，支持可拖拽交互' },
    ],
  },
  {
    version: '0.0.3',
    date: '2026-05-01',
    title: '主题适配修复 & 思维导图',
    items: [
      { type: 'feature', text: '新增文件夹树状视图，支持可拖拽思维导图交互' },
      { type: 'feature', text: '世界观视图新增树状层级展示' },
      { type: 'fix', text: '修复白天模式下 SVG 线条和边框不可见的问题' },
      { type: 'fix', text: '修复 MindMap 视图文件节点在浅色背景白屏' },
      { type: 'fix', text: '修复多处 rgba(255,255,255) 硬编码导致主题不适配' },
      { type: 'improvement', text: '补充 --color-surface-muted CSS 变量，统一背景色管理' },
      { type: 'improvement', text: '全局替换硬编码颜色为 CSS 变量，实现主题感知' },
    ],
  },
  {
    version: '0.0.2',
    date: '2026-04-30',
    title: 'UI 缩放 & 修复优化',
    items: [
      { type: 'feature', text: '新增 UI 缩放功能：50%~200% 自由调节' },
      { type: 'feature', text: 'Ctrl+滚轮 快速缩放界面大小' },
      { type: 'feature', text: '更新日志面板，记录每次版本变更' },
      { type: 'fix', text: '修复右键菜单「创建文件」按钮实际创建卡片而非仅导航' },
      { type: 'fix', text: '修复情节大纲页面显示未创建的角色数据' },
      { type: 'fix', text: '修复顶部栏角色计数包含占位角色的问题' },
      { type: 'fix', text: '修复内容设定页引用未定义变量导致白屏' },
      { type: 'fix', text: '修复 AI 助手发送按钮在有引用资源时无法发送的问题' },
      { type: 'improvement', text: '统一 z-index 层级，避免弹窗被遮挡' },
    ],
  },
  {
    version: '0.0.1',
    date: '2026-04-28',
    title: '墨渊灵笔 初始版本',
    items: [
      { type: 'feature', text: '灵感萌发：AI 生成标签 + 流式生成创作方案' },
      { type: 'feature', text: '内容设定：气泡文件夹 + AI 生成内容卡片' },
      { type: 'feature', text: '情节创作：大纲 / 细纲 / 章节三级结构' },
      { type: 'feature', text: 'AI 助手面板：对话聊天 + 文件管理 + 任务监控' },
      { type: 'feature', text: '主题换肤：12 套配色主题 + 浅色/深色模式切换' },
      { type: 'feature', text: '数据自动保存与本地持久化' },
      { type: 'feature', text: 'PWA 支持 + Electron 桌面版发布' },
    ],
  },
];

/** 本地存储中保存的版本号键名 */
export const CHANGELOG_LAST_SEEN_KEY = 'moyuan-changelog-last-version';

/** 获取最新版本号 */
export function getLatestVersion(): string {
  return CHANGELOG[0]?.version || '0.1.0';
}

/** 检查是否有未读更新 */
export function hasUnseenUpdate(): boolean {
  try {
    const seen = localStorage.getItem(CHANGELOG_LAST_SEEN_KEY);
    const latest = getLatestVersion();
    return seen !== latest;
  } catch {
    return true;
  }
}

/** 标记更新日志已读 */
export function markChangelogSeen(): void {
  try {
    localStorage.setItem(CHANGELOG_LAST_SEEN_KEY, getLatestVersion());
  } catch { /* ignore */ }
}
