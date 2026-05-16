# 墨渊灵笔 TDD 测试策略

## 📋 测试现状分析

**当前状态**：
- ❌ 尚无测试文件
- ❌ 无测试配置
- ❌ package.json 缺少 test 脚本

**项目技术栈**：
- React 19
- TypeScript
- Vite
- Zustand
- Electron

---

## 🎯 第一阶段：测试基础设施搭建

### 1.1 安装测试依赖

**需要安装的包**：
```bash
npm install -D vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom
```

### 1.2 配置 Vitest

**文件**：`vitest.config.ts`
```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

### 1.3 测试设置文件

**文件**：`src/test/setup.ts`
```typescript
import '@testing-library/jest-dom';
import { expect } from 'vitest';
import * as matchers from '@testing-library/jest-dom/matchers';

expect.extend(matchers);
```

### 1.4 更新 package.json

```json
{
  "scripts": {
    "test": "vitest",
    "test:run": "vitest run",
    "test:coverage": "vitest run --coverage",
    "test:ui": "vitest --ui"
  }
}
```

---

## 🧪 第二阶段：核心服务测试（优先级最高）

### 2.1 DataService 测试

**文件**：`src/renderer/shared/services/DataService.test.ts`

**测试清单**：
- [ ] `initialize()` - 初始化服务
- [ ] `createProject()` - 创建新项目
- [ ] `deleteProject()` - 删除项目
- [ ] `loadProject()` - 加载项目
- [ ] `createFile()` - 创建文件
- [ ] `updateFile()` - 更新文件
- [ ] `deleteFile()` - 删除文件
- [ ] `createFolder()` - 创建文件夹
- [ ] `updateInspiration()` - 更新灵感
- [ ] `updateSchemes()` - 更新方案
- [ ] `confirmScheme()` - 确认方案
- [ ] 自动记忆体索引触发条件（>=10字 + 父文件夹有tags）

**TDD 示例（第一个测试）**：
```typescript
describe('DataService', () => {
  let service: DataService;

  beforeEach(() => {
    // 每个测试前重置状态
    localStorage.clear();
    service = new DataService();
  });

  test('should initialize correctly', () => {
    expect(service).toBeDefined();
  });

  test('should create a new project', () => {
    const projectId = service.createProject('测试小说');
    
    expect(projectId).toBeDefined();
    expect(service.getProjectList()).toContainEqual(
      expect.objectContaining({ id: projectId, title: '测试小说' })
    );
  });
});
```

### 2.2 MemoryBankService 测试

**文件**：`src/renderer/shared/services/memory-bank/MemoryBankService.test.ts`

**测试清单**：
- [ ] `initialize()` - 初始化记忆体
- [ ] `addAtomicMemory()` - 添加原子记忆
- [ ] `updateAtomicMemory()` - 更新原子记忆
- [ ] `queryMemory()` - 查询记忆
- [ ] `search()` - 搜索功能
- [ ] `extractFromText()` - 从文本提取
- [ ] `save()` / `load()` - 持久化

### 2.3 ModelRouter 测试

**文件**：`src/renderer/shared/services/ModelRouter.test.ts`

**测试清单**：
- [ ] `getModelForTask()` - 根据任务类型获取模型
- [ ] `setModelForTask()` - 设置模型配置
- [ ] 任务类型路由正确性

### 2.4 ThemeContext 测试

**文件**：`src/renderer/shared/contexts/ThemeContext.test.tsx`

**测试清单**：
- [ ] 主题切换功能
- [ ] 日/夜模式切换
- [ ] localStorage 持久化
- [ ] 默认主题正确加载

---

## 🏗️ 第三阶段：状态管理测试

### 3.1 Zustand Stores 测试

**文件**：`src/renderer/shared/stores/*.test.ts`

**测试清单**：
- [ ] `useAppStore` - 应用状态
- [ ] `useAIStatus` - AI状态
- [ ] 各步骤相关 store

---

## 🎨 第四阶段：UI 组件测试

### 4.1 组件测试策略

**按优先级排序**：
1. **纯展示组件**（无状态，易测试）
2. **交互组件**（有状态，需模拟用户操作）
3. **页面级组件**（集成度高，需 mock 服务）

### 4.2 核心组件测试

**StepInspiration 组件测试**：
- [ ] 灵感文本输入
- [ ] 标签选择
- [ ] 风格滑块
- [ ] 方案生成流程

**StepSettings 组件测试**：
- [ ] 文件夹导航
- [ ] 卡片创建/编辑
- [ ] 气泡文件夹交互

**StepPlot 组件测试**：
- [ ] 三个视图切换
- [ ] 大纲/细纲/章节编辑
- [ ] 写作编辑器功能

**StepReview 组件测试**：
- [ ] 健康度仪表盘
- [ ] 记忆详情展示
- [ ] Tab 切换

**AIAssistantPanel 组件测试**：
- [ ] 对话 Tab
- [ ] 智能粗查 Tab
- [ ] 流式响应展示

---

## 🚀 第五阶段：新功能 TDD 开发（按架构规划）

### 5.1 记忆版本控制（MemoryVersionControl）

**先写测试！**：
```typescript
// src/renderer/shared/services/memory-bank/MemoryVersionControl.test.ts
describe('MemoryVersionControl', () => {
  test('should create version snapshot on memory change', () => {
    // RED: 先写测试，看它失败
  });
  
  test('should list all historical versions', () => {
    // RED
  });
  
  test('should compare two versions and show diff', () => {
    // RED
  });
  
  test('should rollback to previous version', () => {
    // RED
  });
});
```

### 5.2 记忆关联网络

**测试范围**：
- [ ] 节点创建
- [ ] 关系连线
- [ ] 布局计算
- [ ] 交互事件

### 5.3 记忆健康度检查

**测试范围**：
- [ ] 规则化检查（重复检测、完整性检查）
- [ ] 一致性规则验证
- [ ] 检查结果格式化

---

## 📊 测试覆盖率目标

| 阶段 | 覆盖率目标 |
|------|-----------|
| 阶段1：基础设施 | - |
| 阶段2：核心服务 | 80%+ |
| 阶段3：状态管理 | 70%+ |
| 阶段4：UI组件 | 50%+ |
| 阶段5：新功能 | TDD 100% |

---

## 🎯 TDD 工作流示例（实现记忆版本控制）

### 步骤1：写第一个失败的测试（RED）

```typescript
// MemoryVersionControl.test.ts
test('should create initial version on initialization', () => {
  const vcs = new MemoryVersionControl('test-project');
  
  const versions = vcs.getVersions();
  
  expect(versions.length).toBe(1);
  expect(versions[0].timestamp).toBeDefined();
});
```

**运行测试** → 失败（类不存在）

### 步骤2：写最小实现（GREEN）

```typescript
// MemoryVersionControl.ts
export class MemoryVersionControl {
  constructor(private projectId: string) {
    this.createVersion('initial');
  }
  
  private versions: Version[] = [];
  
  private createVersion(message: string) {
    this.versions.push({
      id: Date.now().toString(),
      timestamp: new Date(),
      message,
    });
  }
  
  getVersions() {
    return this.versions;
  }
}
```

**运行测试** → 通过！

### 步骤3：重构（REFACTOR）

- 优化代码结构
- 添加类型
- 保持测试通过

### 步骤4：下一个测试

重复循环，直到功能完整。

---

## 🔧 Mock 策略

### 避免过度 Mock

| 场景 | 策略 |
|------|------|
| localStorage | 用 `vitest.spyOn` 或真实操作（beforeEach 清空） |
| AI 服务 | Mock `aiService` 返回固定响应 |
| 外部文件 | 用内存模拟或临时文件 |
| 时间 | 用 `vi.useFakeTimers()` |

### Mock 示例

```typescript
// Mock AI 服务
vi.mock('./aiService', () => ({
  aiService: {
    generate: vi.fn().mockResolvedValue({ text: 'Mocked response' }),
  },
}));

// Mock 时间
vi.useFakeTimers();
vi.setSystemTime(new Date('2024-01-01'));
```

---

## 📝 测试最佳实践

### 好的测试

✅ **测试行为，不测试实现**
```typescript
// 好
test('creates file and indexes to memory when content >=10 chars', () => { ... });

// 坏
test('calls lightweightIndexContent when updateFile is called', () => { ... });
```

✅ **清晰的测试名称**
```typescript
test('rejects empty email', () => { /* ... */ });  // ✅
test('test1', () => { /* ... */ });               // ❌
```

✅ **每个测试一个断言**
```typescript
test('creates project with correct title', () => {
  const project = service.createProject('My Novel');
  expect(project.title).toBe('My Novel');  // 一个断言
});
```

### 测试文件命名

```
src/
├── shared/
│   ├── services/
│   │   ├── DataService.ts
│   │   └── DataService.test.ts  ← 放在一起
│   └── contexts/
│       ├── ThemeContext.tsx
│       └── ThemeContext.test.tsx
└── features/
    ├── inspiration/
    │   ├── StepInspiration.tsx
    │   └── StepInspiration.test.tsx
```

---

## 🚀 实施路线图

### 本周目标（MVP）
- [ ] 搭建测试基础设施
- [ ] 写 DataService 核心测试
- [ ] 写 ThemeContext 测试
- [ ] 配置 CI/CD 运行测试

### 本月目标
- [ ] 核心服务 80% 覆盖率
- [ ] 状态管理测试
- [ ] 关键组件测试
- [ ] 开始用 TDD 开发新功能

---

## 🔗 相关文档

- [架构流程分析.md](./架构流程分析.md)
- [Vitest 文档](https://vitest.dev/)
- [Testing Library 文档](https://testing-library.com/)
