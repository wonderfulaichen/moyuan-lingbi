# AI 任务管理系统使用指南

## 概述

AI 任务管理系统旨在解决以下问题：
1. 切换标签页时 AI 任务被中断
2. 无法查看 AI 任务的执行状态和进度
3. 任务管理分散，难以统一控制

## 架构设计

```
┌─────────────────────────────────────────────┐
│           React Components                   │
│  (AIAssistantPanel, SettingsModal, etc.)    │
└─────────────────┬───────────────────────────┘
                  │ useAITaskManager hook
                  ▼
┌─────────────────────────────────────────────┐
│          AITaskManager (单例)               │
│  - 任务队列管理                              │
│  - 状态管理                                  │
│  - 事件通知                                  │
└─────────────────┬───────────────────────────┘
                  │ submitTask / generateStream
                  ▼
┌─────────────────────────────────────────────┐
│            aiService                         │
│  (generate, generateStream)                  │
└─────────────────────────────────────────────┘
```

## 核心功能

### 1. 任务追踪
- 自动追踪所有 AI 任务的生命周期
- 支持任务进度更新
- 记录任务执行时间和结果

### 2. 任务管理
- 取消单个任务
- 取消所有任务
- 清除已完成的任务
- 查看任务详情和错误信息

### 3. 跨组件持久化
- 使用单例模式，任务状态不依赖组件生命周期
- 切换标签页不会中断任务
- 所有组件共享同一个任务状态

## 使用方法

### 方式一：使用 Hook（推荐）

```typescript
import { useAITaskManager, useSubmitTask } from '../../shared/hooks/useAITaskManager';

// 在组件中使用
function MyComponent() {
  const { tasks, runningTasks, stats, cancelTask } = useAITaskManager();
  const { submitTask } = useSubmitTask();

  // 提交任务
  const handleGenerate = async () => {
    await submitTask(
      '生成大纲',
      'generation',
      async (task) => {
        // 这里执行实际的 AI 调用
        const result = await aiService.generate(config);
        task.progress = 100;
        return result;
      },
      {
        onProgress: (progress) => console.log('进度:', progress),
        onComplete: (result) => console.log('完成:', result),
        onError: (error) => console.error('错误:', error),
      },
      '生成小说大纲'
    );
  };

  return (
    <div>
      {/* 显示任务列表 */}
      {runningTasks.map(task => (
        <div key={task.id}>
          {task.name} - {task.status}
          <button onClick={() => cancelTask(task.id)}>取消</button>
        </div>
      ))}
    </div>
  );
}
```

### 方式二：直接使用服务

```typescript
import { aiTaskManager } from '../../shared/services/AITaskManager';

// 提交简单任务
async function simpleTask() {
  const { taskId, result } = await aiTaskManager.submitSimpleTask(
    '生成内容',
    'generation',
    async () => {
      return await aiService.generate(config);
    }
  );
  console.log('任务ID:', taskId);
  console.log('结果:', result);
}

// 提交带进度回调的任务
async function advancedTask() {
  await aiTaskManager.submitTask(
    '生成长文本',
    'generation',
    async (task) => {
      // 模拟进度更新
      for (let i = 0; i < 100; i += 10) {
        await new Promise(resolve => setTimeout(resolve, 100));
        task.progress = i;
      }
      return await aiService.generate(config);
    },
    {
      onProgress: (progress) => updateUI(progress),
      onComplete: (result) => showResult(result),
      onError: (error) => showError(error),
    },
    '生成长篇小说章节'
  );
}
```

### 方式三：包装现有 AI 调用

```typescript
import { aiTaskManager } from '../../shared/services/AITaskManager';

// 包装现有的 generate 调用
async function wrappedGenerate(config: AIRequestConfig) {
  return await aiTaskManager.submitTask(
    'AI 生成',
    'generation',
    async () => {
      return await aiService.generate(config);
    }
  );
}

// 包装流式生成
async function wrappedGenerateStream(
  config: AIRequestConfig,
  onChunk: (chunk: string) => void
) {
  return await aiTaskManager.submitTask(
    'AI 流式生成',
    'generation',
    async (task) => {
      return await aiService.generateStream(config, (response) => {
        if (response.content) {
          onChunk(response.content);
        }
        // 更新进度（根据内容长度估算）
        task.progress = Math.min(95, (response.content.length / 5000) * 100);
        if (response.isComplete) {
          task.progress = 100;
        }
      });
    }
  );
}
```

## UI 组件

### 完整面板（AITaskManagerPanel）

在系统设置的"AI 任务"标签页中已经集成了完整的面板组件。

```typescript
import { AITaskManagerPanel } from './AITaskManagerPanel';

// 使用
<AITaskManagerPanel />
```

### 简化指示器（AITaskIndicator）

用于状态栏，显示正在运行的任务数量。

```typescript
import { AITaskIndicator } from './AITaskManagerPanel';

// 使用
<AITaskIndicator />
```

## 任务类型

系统支持以下任务类型：

| 类型 | 标签 | 图标 | 用途 |
|------|------|------|------|
| `generation` | 生成 | fa-magic | 内容生成任务 |
| `analysis` | 分析 | fa-search | 数据分析任务 |
| `consistency` | 检查 | fa-check-circle | 一致性检查 |
| `memory` | 记忆 | fa-brain | 记忆维护任务 |
| `review` | 审查 | fa-clipboard-check | 审查任务 |
| `other` | 其他 | fa-cube | 其他类型任务 |

## 最佳实践

### 1. 始终提供任务名称
```typescript
// ✅ 好的做法
await submitTask('生成第3章大纲', 'generation', executor);

// ❌ 不好的做法
await submitTask('', 'generation', executor);
```

### 2. 定期更新进度
```typescript
// ✅ 好的做法
async (task) => {
  for (let i = 0; i < steps; i++) {
    await processStep(i);
    task.progress = (i / steps) * 100; // 更新进度
  }
  return result;
}
```

### 3. 提供错误处理
```typescript
// ✅ 好的做法
{
  onError: (error) => {
    console.error('任务失败:', error);
    showNotification('任务失败: ' + error, 'error');
  }
}
```

### 4. 清理已完成的任务
```typescript
// 定期清理，避免任务列表过长
aiTaskManager.clearCompleted();
```

## 迁移指南

### 从直接调用迁移

**之前：**
```typescript
const result = await aiService.generate(config);
```

**之后：**
```typescript
const { result } = await aiTaskManager.submitSimpleTask(
  'AI 生成',
  'generation',
  () => aiService.generate(config)
);
```

### 从流式调用迁移

**之前：**
```typescript
await aiService.generateStream(config, (response) => {
  appendContent(response.content);
});
```

**之后：**
```typescript
await aiTaskManager.submitTask(
  'AI 生成',
  'generation',
  async (task) => {
    return await aiService.generateStream(config, (response) => {
      if (response.content) {
        appendContent(response.content);
      }
      task.progress = estimateProgress(response);
    });
  }
);
```

## 调试技巧

### 查看任务状态
```typescript
// 在控制台输出所有任务
console.table(aiTaskManager.getTasks());

// 查看统计信息
console.log(aiTaskManager.getStats());
```

### 监听任务变化
```typescript
const unsubscribe = aiTaskManager.subscribe((tasks) => {
  console.log('任务变化:', tasks);
});

// 取消订阅
unsubscribe();
```

## 注意事项

1. **任务 ID 是自动生成的**，不要硬编码任务 ID
2. **任务状态是不可逆的**，一旦设置为 `cancelled`、`failed` 或 `completed`，不应该再修改
3. **长时间运行的任务**应该定期更新进度，以便用户了解执行状态
4. **任务结果会保存在内存中**，大量任务可能导致内存占用增加，定期调用 `clearCompleted()` 清理
5. **AbortController** 用于取消 HTTP 请求，确保在取消任务时正确释放资源

## 未来规划

- [ ] 支持任务优先级
- [ ] 支持任务依赖关系
- [ ] 支持任务持久化（保存到 localStorage）
- [ ] 支持任务重试
- [ ] 支持批量任务提交
- [ ] 支持任务分组
