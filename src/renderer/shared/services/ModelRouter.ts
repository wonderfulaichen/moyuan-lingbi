import { ModelConfig } from '../../../shared/types';
import { dataService } from './DataService';

export type TaskType =
  | 'general'           // 通用功能（默认）
  | 'inspiration'       // 灵感生成
  | 'world-building'    // 世界构建
  | 'character'         // 角色塑造
  | 'outline'           // 大纲规划
  | 'writing'           // 正文写作/续写
  | 'review'            // 审查校对
  | 'agent-planner'     // Agent: 规划师
  | 'agent-writer'      // Agent: 创作家
  | 'agent-reviewer'    // Agent: 审校员
  | 'agent-memory'      // Agent: 记忆整理专家
  | 'agent-researcher'; // Agent: 研究员

export interface ModelRoutingConfig {
  [taskType: string]: string; // taskType -> modelId
}

export interface ModelRoutingRule {
  id: TaskType;
  label: string;
  icon: string;
  description: string;
  recommendedProvider?: string; // 推荐的提供商类型
  recommendationReason?: string; // 推荐原因说明
  defaultModelId?: string;     // 默认模型ID（如果用户未设置）
  tags?: string[];             // 特殊标签（如 privacy-first, cost-free）
}

// ===== 任务类型定义表 =====
export const TASK_TYPES: ModelRoutingRule[] = [
  {
    id: 'general',
    label: '通用功能',
    icon: 'fa-cog',
    description: '所有未分类的AI调用（默认）',
    recommendedProvider: 'deepseek',
    recommendationReason: '性价比高，响应快，适合日常轻量任务',
  },
  {
    id: 'inspiration',
    label: '灵感生成',
    icon: 'fa-lightbulb',
    description: '标签发散、方案构思、创意生成',
    recommendedProvider: 'deepseek',
    recommendationReason: '创意任务需要快速迭代，云端模型更灵活',
  },
  {
    id: 'world-building',
    label: '世界构建',
    icon: 'fa-globe',
    description: '地点、势力、规则体系生成',
    recommendedProvider: 'deepseek',
    recommendationReason: '结构化内容生成，DeepSeek 表现优秀',
  },
  {
    id: 'character',
    label: '角色塑造',
    icon: 'fa-user',
    description: '性格画像、角色关系、对话生成',
    recommendedProvider: 'deepseek',
    recommendationReason: '需要理解复杂人物关系，强推理模型优先',
  },
  {
    id: 'outline',
    label: '大纲规划',
    icon: 'fa-list-ol',
    description: '故事大纲、章节细纲生成',
    recommendedProvider: 'deepseek',
    recommendationReason: '长文本规划任务，需较强逻辑能力',
  },
  {
    id: 'writing',
    label: '正文创作',
    icon: 'fa-pen-nib',
    description: '续写、润色、改写',
    recommendedProvider: 'deepseek',
    recommendationReason: '写作质量要求高，推荐高质量模型',
  },
  {
    id: 'review',
    label: '审查校对',
    icon: 'fa-check-double',
    description: '错误检测、一致性检查、质量评估',
    recommendedProvider: 'deepseek',
    recommendationReason: '审校需细致分析，强语言理解能力重要',
  },
  {
    id: 'agent-planner',
    label: 'Agent: 规划师',
    icon: 'fa-clipboard-list',
    description: '制定创作计划、分解任务',
    recommendedProvider: 'deepseek',
    recommendationReason: '多步骤推理，需强规划能力',
  },
  {
    id: 'agent-writer',
    label: 'Agent: 创作家',
    icon: 'fa-feather-pointed',
    description: '执行写作任务、内容生成',
    recommendedProvider: 'deepseek',
    recommendationReason: '创作质量关键，推荐最强写作模型',
  },
  {
    id: 'agent-reviewer',
    label: 'Agent: 审校员',
    icon: 'fa-magnifying-glass',
    description: '审查内容质量、提出修改建议',
    recommendedProvider: 'deepseek',
    recommendationReason: '深度审查需强分析能力',
  },
  {
    id: 'agent-memory',
    label: 'Agent: 记忆整理专家 ⭐',
    icon: 'fa-brain',
    description: '整理项目记忆、提取关键信息、维护知识库',
    recommendedProvider: 'local',
    recommendationReason: '⭐ 强烈推荐本地模型！隐私安全 + 零成本 + 离线可用',
    tags: ['privacy-first', 'cost-free', 'offline'],
  },
  {
    id: 'agent-researcher',
    label: 'Agent: 研究员',
    icon: 'fa-book-open',
    description: '背景研究、资料查找、事实核查',
    recommendedProvider: 'local',
    recommendationReason: '适合本地模型：可加载专业知识库，定制化强',
    tags: ['knowledge-base', 'customizable'],
  },
];

// ===== 默认路由配置 =====
const DEFAULT_ROUTING: Partial<ModelRoutingConfig> = {
  'general': 'auto',
  'inspiration': 'auto',
  'world-building': 'auto',
  'character': 'auto',
  'outline': 'auto',
  'writing': 'auto',
  'review': 'auto',
  'agent-planner': 'auto',
  'agent-writer': 'auto',
  'agent-reviewer': 'auto',
  'agent-memory': 'auto',
  'agent-researcher': 'auto',
};

class ModelRouterService {
  private config: ModelRoutingConfig = {};
  private initialized = false;

  constructor() {
    this.loadConfig();
  }

  /**
   * 从数据服务加载用户自定义的路由配置
   */
  private loadConfig(): void {
    try {
      const data = dataService.getData();
      this.config = data.modelRouting || { ...DEFAULT_ROUTING };
      this.initialized = true;
    } catch (e) {
      console.warn('[ModelRouter] 加载配置失败，使用默认配置');
      this.config = { ...DEFAULT_ROUTING };
      this.initialized = true;
    }
  }

  /**
   * 保存路由配置到数据服务
   */
  async saveConfig(newConfig: ModelRoutingConfig): Promise<void> {
    this.config = { ...newConfig };
    await dataService.updateModelRouting(this.config);
  }

  /**
   * 获取当前完整配置
   */
  getConfig(): ModelRoutingConfig {
    return { ...this.config };
  }

  /**
   * 核心方法：根据任务类型获取应该使用的模型
   *
   * @param taskType - 任务类型
   * @param availableModels - 可用的模型列表
   * @param fallbackModel - 兜底模型（通常是当前激活的模型）
   * @returns 应该使用的 ModelConfig
   */
  getModelForTask(
    taskType: TaskType,
    availableModels: ModelConfig[],
    fallbackModel?: ModelConfig,
  ): ModelConfig {
    const modelId = this.config[taskType];

    if (!modelId || modelId === 'auto') {
      return this.getAutoModel(taskType, availableModels, fallbackModel);
    }

    const selected = availableModels.find(m => m.id === modelId);
    if (selected) return selected;

    console.warn(`[ModelRouter] 模型 ${modelId} 不存在，回退到自动选择`);
    return this.getAutoModel(taskType, availableModels, fallbackModel);
  }

  /**
   * 自动选择最佳模型（基于推荐规则 + 智能匹配）
   */
  private getAutoModel(
    taskType: TaskType,
    availableModels: ModelConfig[],
    fallbackModel?: ModelConfig,
  ): ModelConfig {
    const taskDef = TASK_TYPES.find(t => t.id === taskType);

    if (taskDef?.recommendedProvider) {
      const recommended = availableModels.find(m =>
        m.provider === taskDef.recommendedProvider ||
        m.provider.includes(taskDef.recommendedProvider)
      );
      if (recommended) return recommended;
    }

    if (fallbackModel) return fallbackModel;

    if (availableModels.length > 0) return availableModels[0];

    throw new Error(`[ModelRouter] 没有可用的模型`);
  }

  /**
   * 为特定任务类型设置指定模型
   */
  async setModelForTask(taskType: TaskType, modelId: string): Promise<void> {
    this.config[taskType] = modelId;
    await this.saveConfig(this.config);
  }

  /**
   * 重置某个任务类型的设置为"自动"
   */
  async resetTaskToAuto(taskType: TaskType): Promise<void> {
    this.config[taskType] = 'auto';
    await this.saveConfig(this.config);
  }

  /**
   * 获取任务类型定义
   */
  getTaskTypes(): ModelRoutingRule[] {
    return TASK_TYPES;
  }

  /**
   * 获取特定任务的配置信息
   */
  getTaskInfo(taskType: TaskType): ModelRoutingRule | undefined {
    return TASK_TYPES.find(t => t.id === taskType);
  }

  /**
   * 批量导入智能推荐配置（一键优化）
   */
  async applySmartRecommendation(availableModels: ModelConfig[]): Promise<void> {
    const newConfig: ModelRoutingConfig = {};

    for (const task of TASK_TYPES) {
      if (task.recommendedProvider) {
        const match = availableModels.find(m =>
          m.provider === task.recommendedProvider ||
          m.provider.includes(task.recommendedProvider)
        );
        newConfig[task.id] = match ? match.id : 'auto';
      } else {
        newConfig[task.id] = 'auto';
      }
    }

    await this.saveConfig(newConfig);
  }

  /**
   * 导出配置为JSON（用于备份）
   */
  exportConfig(): string {
    return JSON.stringify(this.config, null, 2);
  }

  /**
   * 从JSON导入配置
   */
  async importConfig(jsonStr: string): Promise<void> {
    try {
      const parsed = JSON.parse(jsonStr) as ModelRoutingConfig;
      await this.saveConfig(parsed);
    } catch (e) {
      throw new Error('[ModelRouter] 配置格式无效');
    }
  }
}

// 单例导出
export const modelRouter = new ModelRouterService();

// 类型辅助：便捷获取模型的 Hook 参数类型
export type UseModelRouterReturn = {
  getModelForTask: typeof modelRouter.getModelForTask;
  setModelForTask: typeof modelRouter.setModelForTask;
  getConfig: typeof modelRouter.getConfig;
  getTaskTypes: typeof modelRouter.getTaskTypes;
  applySmartRecommendation: typeof modelRouter.applySmartRecommendation;
};
