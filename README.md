# 墨渊灵笔 - AI小说创作工坊

一款基于AI辅助的小说创作工具，帮助作者从灵感萌发到完成整部小说。

## 技术栈

- **前端框架**: React 19 + TypeScript
- **构建工具**: Vite 6
- **样式方案**: Tailwind CSS 4
- **桌面端**: Electron 39
- **状态管理**: React Hooks + localStorage持久化

## 功能模块

| 模块 | 说明 |
|------|------|
| 灵感萌发 | 记录灵感碎片，AI辅助生成创意 |
| 世界构建 | 管理地点、势力、规则体系、时间线 |
| 角色塑造 | 创建和管理角色，定义性格与关系 |
| 大纲规划 | AI辅助生成小说大纲 |
| 章节细纲 | 将大纲细化为章节规划 |
| 正文创作 | 沉浸式写作编辑器，AI续写与润色 |

## 开发

```bash
# 安装依赖
npm install

# 启动开发服务器（浏览器模式）
npm run dev

# 启动Electron开发模式
npm run electron:dev

# 构建生产版本
npm run build

# 打包桌面应用
npm run electron:build-win
```

## 项目结构

```
src/
├── main/              # Electron主进程
│   ├── main.js
│   ├── preload.js
│   └── tsconfig.json
├── renderer/          # 渲染进程（React应用）
│   ├── app/           # 应用核心
│   │   ├── App.tsx    # 主应用组件
│   │   ├── initialState.ts
│   │   └── app-shell/
│   │       └── Sidebar.tsx
│   ├── features/      # 功能模块
│   │   ├── inspiration/   # 灵感萌发
│   │   ├── world/         # 世界构建
│   │   ├── characters/    # 角色塑造
│   │   ├── outline/       # 大纲规划
│   │   ├── chapters/      # 章节细纲
│   │   ├── writing/       # 正文创作
│   │   └── settings/      # 系统设置
│   ├── shared/        # 共享服务
│   │   └── services/
│   │       └── storage.ts
│   ├── index.tsx
│   ├── index.html
│   ├── index.css
│   └── env.d.ts
├── shared/            # 前后端共享
│   ├── types/
│   │   └── index.ts
│   └── constants/
│       └── index.ts
└── assets/            # 静态资源
```

## 版本

当前版本: v0.1.0 (开发中)
