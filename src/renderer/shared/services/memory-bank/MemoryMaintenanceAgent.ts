import { AtomicMemory, DynamicMemory, Project, ModelConfig } from '../../../../shared/types';
import { aiService } from '../aiService';
import { memoryBankService } from '../MemoryBankService';
import { PromptComposer } from '../../../../shared/prompts';
import { modelRouter } from '../ModelRouter';
import { dataService } from '../DataService';

const MEMORY_EXPERT_PROMPT = PromptComposer.composeForMemory();

function getModelForMemoryTask(fallbackModel: ModelConfig): ModelConfig {
  const availableModels = dataService.getModels();
  return modelRouter.getModelForTask('agent-memory', availableModels, fallbackModel);
}

interface ExtractResult {
  world: {
    newRules?: string[];
    cosmologyUpdates?: string;
    geography?: string[];
    history?: string[];
  };
  characters: Array<{
    name: string;
    identity?: string;
    publicIdentity?: string;
    personality?: string[];
    abilities?: string[];
    relationships?: Array<{
      targetName: string;
      type: 'ally' | 'enemy' | 'neutral' | 'family' | 'master' | 'disciple';
      description: string;
    }>;
    secrets?: string[];
    arcUpdate?: {
      current?: string;
    };
  }>;
  plots: Array<{
    type: 'main' | 'sub' | 'romance' | 'mystery';
    status: 'active' | 'resolved' | 'dormant';
    description: string;
    involvedCharacters: string[];
    foreshadows?: Array<{
      chapter: number;
      hint: string;
      expectedPayoff?: string;
      status: 'planted' | 'partial' | 'resolved';
    }>;
  }>;
  dynamic: {
    location?: string;
    pov?: string;
    time?: string;
    mood?: string;
    tensionChange?: number;
  };
}

export const memoryMaintenanceAgent = {

  async extractFromChapter(
    projectId: string,
    chapterContent: string,
    chapterNumber: number,
    model: ModelConfig,
    existingProject?: Project
  ): Promise<{
    extracted: ExtractResult | null;
    contradictions: string[];
    summary: string;
  }> {
    const bestModel = getModelForMemoryTask(model);
    const atomic = await memoryBankService.loadAtomicMemory(projectId);
    
    let contextInfo = '';
    
    if (atomic.characters.length > 0) {
      contextInfo += `\n\n已有角色:\n`;
      atomic.characters.forEach(c => {
        contextInfo += `- ${c.name}: ${c.identity || ''}\n`;
      });
    }
    
    if (existingProject?.characters && existingProject.characters.length > 0) {
      contextInfo += `\n\n项目角色数据:\n`;
      existingProject.characters.slice(0, 8).forEach(c => {
        contextInfo += `- ${c.name}: ${c.role}, ${(c.personality || '').slice(0, 50)}\n`;
      });
    }

    const prompt = `从以下章节内容中提取新的设定信息。

【章节内容】
${chapterContent.slice(0, 5000)}

${contextInfo}

请按照以下 JSON 格式输出提取结果：
{
  "world": {
    "newRules": ["规则1", "规则2"],
    "cosmologyUpdates": "力量体系更新",
    "geography": ["地点1", "地点2"],
    "history": ["历史事件"]
  },
  "characters": [
    {
      "name": "角色名",
      "identity": "身份",
      "publicIdentity": "公开身份",
      "personality": ["性格特征"],
      "abilities": ["能力"],
      "relationships": [{"targetName": "目标", "type": "ally|enemy|neutral|family|master|disciple", "description": "关系描述"}],
      "secrets": ["秘密"],
      "arcUpdate": {"current": "当前状态"}
    }
  ],
  "plots": [
    {
      "type": "main|sub|romance|mystery",
      "status": "active|resolved|dormant",
      "description": "剧情描述",
      "involvedCharacters": ["角色名"],
      "foreshadows": [{"chapter": 1, "hint": "伏笔提示", "expectedPayoff": "预期回收", "status": "planted|partial|resolved"}]
    }
  ],
  "dynamic": {
    "location": "当前地点",
    "pov": "视角角色",
    "time": "时间",
    "mood": "氛围",
    "tensionChange": 5
  }
}

只输出 JSON，不要其他说明。`;

    try {
      const result = await aiService.generate({
        model: bestModel,
        prompt,
        systemPrompt: MEMORY_EXPERT_PROMPT,
        temperature: 0.3,
        maxTokens: 4000,
      });

      if (result.error || !result.content) {
        console.error('[MemoryAgent] 提取失败:', result.error);
        
        await memoryBankService.logMaintenanceAction(
          projectId, 
          '章节提取失败', 
          `第${chapterNumber}章: ${result.error || '无响应'}`
        );
        
        return { 
          extracted: null, 
          contradictions: [], 
          summary: `提取失败: ${result.error}` 
        };
      }

      const jsonMatch = result.content.match(/\{[\s\S]*\}/);
      
      if (!jsonMatch) {
        console.error('[MemoryAgent] 无法解析 JSON');
        
        await memoryBankService.logMaintenanceAction(
          projectId, 
          '章节提取失败', 
          `第${chapterNumber}章: 无法解析AI返回的JSON`
        );

        return { 
          extracted: null, 
          contradictions: [], 
          summary: `无法解析结果` 
        };
      }

      const extracted: ExtractResult = JSON.parse(jsonMatch[0]);

      await this.applyExtractionToMemory(projectId, extracted, chapterNumber);

      const summaryLines: string[] = [];
      
      if (extracted.characters?.length > 0) {
        summaryLines.push(`角色: ${extracted.characters.map(c => c.name).join(', ')}`);
      }
      
      if (extracted.plots?.length > 0) {
        summaryLines.push(`剧情线: ${extracted.plots.length}条`);
      }
      
      if (extracted.world?.newRules?.length > 0) {
        summaryLines.push(`新规则: ${extracted.world.newRules.length}条`);
      }

      await memoryBankService.logMaintenanceAction(
        projectId,
        '章节提取完成',
        `第${chapterNumber}章: ${summaryLines.join(' | ') || '无明显新信息'}`
      );

      return {
        extracted,
        contradictions: [],
        summary: summaryLines.join(' | ') || '处理完成',
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('[MemoryAgent] 处理异常:', error);
      
      await memoryBankService.logMaintenanceAction(
        projectId,
        '章节提取异常',
        `第${chapterNumber}章: ${msg}`
      );

      return {
        extracted: null,
        contradictions: [],
        summary: `异常: ${msg}`,
      };
    }
  },

  async applyExtractionToMemory(projectId: string, extracted: ExtractResult, chapterNumber: number): Promise<void> {
    const atomic = await memoryBankService.loadAtomicMemory(projectId);
    const dynamic = await memoryBankService.loadDynamicMemory(projectId);

    if (extracted.world) {
      if (extracted.world.newRules) {
        atomic.world.rules = [...atomic.world.rules, ...extracted.world.newRules];
      }
      
      if (extracted.world.cosmologyUpdates) {
        if (atomic.world.cosmology) {
          atomic.world.cosmology += '\n' + extracted.world.cosmologyUpdates;
        } else {
          atomic.world.cosmology = extracted.world.cosmologyUpdates;
        }
      }
      
      if (extracted.world.geography) {
        atomic.world.geography = [...atomic.world.geography, ...extracted.world.geography];
      }
      
      if (extracted.world.history) {
        atomic.world.history = [...atomic.world.history, ...extracted.world.history];
      }
    }

    if (extracted.characters && extracted.characters.length > 0) {
      extracted.characters.forEach(newChar => {
        const existingIdx = atomic.characters.findIndex(c => c.name === newChar.name);
        
        if (existingIdx >= 0) {
          const existing = atomic.characters[existingIdx];
          
          if (newChar.identity) existing.identity = newChar.identity;
          if (newChar.publicIdentity) existing.publicIdentity = newChar.publicIdentity;
          if (newChar.personality && newChar.personality.length > 0) {
            existing.personality = [...new Set([...(existing.personality || []), ...newChar.personality])];
          }
          if (newChar.abilities && newChar.abilities.length > 0) {
            existing.abilities = [...new Set([...(existing.abilities || []), ...newChar.abilities])];
          }
          if (newChar.secrets && newChar.secrets.length > 0) {
            existing.secrets = [...new Set([...(existing.secrets || []), ...newChar.secrets])];
          }
          if (newChar.relationships && newChar.relationships.length > 0) {
            newChar.relationships.forEach(rel => {
              const existingRel = existing.relationships.find(r => r.targetId === rel.targetName);
              if (existingRel) {
                existingRel.type = rel.type as any;
                existingRel.description = rel.description;
              } else {
                existing.relationships.push({
                  targetId: rel.targetName,
                  type: rel.type as any,
                  description: rel.description,
                knownTo: [],
                });
              }
            });
          }
        } else {
          atomic.characters.push({
            id: newChar.name,
            name: newChar.name,
            identity: newChar.identity,
            publicIdentity: newChar.publicIdentity,
            personality: newChar.personality || [],
            abilities: newChar.abilities || [],
            relationships: newChar.relationships ? newChar.relationships.map(r => ({
              targetId: r.targetName,
              type: r.type as any,
              description: r.description,
            knownTo: [],
            })) : [],
            secrets: newChar.secrets || [],
            arc: {
              start: '',
              current: newChar.arcUpdate?.current || '',
              goal: '',
            },
          });
        }
      });
    }

    if (extracted.plots && extracted.plots.length > 0) {
      extracted.plots.forEach(newPlot => {
        const existingIdx = (atomic.plots as any).findIndex(p => (p as any).title === newPlot.description);
        
        if (existingIdx >= 0) {
          atomic.plots[existingIdx].status = newPlot.status as any;
        } else {
          (atomic.plots as any).push({
            type: newPlot.type as any,
            title: newPlot.description,
            summary: newPlot.description,
            status: newPlot.status as any,
            involvedCharacters: newPlot.involvedCharacters,
            foreshadows: newPlot.foreshadows ? newPlot.foreshadows.map(f => ({
              chapter: f.chapter,
              hint: f.hint,
              expectedPayoff: f.expectedPayoff,
              status: f.status as any,
            })) : [],
          });
        }
      });
    }

    if (extracted.dynamic) {
      if (extracted.dynamic.location) dynamic.current.location = extracted.dynamic.location;
      if (extracted.dynamic.pov) dynamic.current.pov = extracted.dynamic.pov;
      if (extracted.dynamic.time) dynamic.current.time = extracted.dynamic.time;
      if (extracted.dynamic.mood) dynamic.current.mood = extracted.dynamic.mood;
      dynamic.current.chapter = chapterNumber;
      
      if (extracted.dynamic.tensionChange !== undefined) {
        dynamic.tension.level = Math.max(0, Math.min(100, dynamic.tension.level + extracted.dynamic.tensionChange));
        dynamic.tension.history.push({
          chapter: chapterNumber,
          level: dynamic.tension.level,
          event: "tension_change",
        });
        
        if (dynamic.tension.history.length > 50) {
          dynamic.tension.history = dynamic.tension.history.slice(-50);
        }
      }
    }

    await memoryBankService.saveAtomicMemory(projectId, atomic);
    await memoryBankService.saveDynamicMemory(projectId, dynamic);
  },

  async checkConsistency(
    projectId: string,
    newText: string,
    model: ModelConfig
  ): Promise<string[]> {
    console.log('[MemoryAgent] 开始系统粗查, projectId:', projectId);
    
    // 记忆体关闭时，系统粗查不执行
    if (!memoryBankService.isEnabled(projectId)) {
      console.log('[MemoryAgent] 记忆体功能已关闭，跳过系统粗查');
      return [];
    }
    
    const atomic = await memoryBankService.loadAtomicMemory(projectId);
    
    console.log('[MemoryAgent] 加载原子记忆完成, 角色数:', atomic.characters.length, '剧情数:', atomic.plots.length);
    
    const issues: string[] = [];
    
    let charactersToCheck: Array<{
      id?: string;
      name: string;
      identity: string;
      personality: string[];
      abilities: string[];
      relationships: Array<{ targetId: string; type: string; description: string }>;
      secrets: string[];
      arc?: { start: string; current: string; goal: string };
    }> = [];
    let plotsToCheck = atomic.plots.filter(p => p.status === 'active');
    
    // 从文件系统获取当前存在的角色列表
    const existingCharacterNames = new Set<string>();
    try {
      const characterFolderId = dataService.getRootFolderIdByType('characters', projectId);
      if (characterFolderId) {
        const characterFiles = dataService.getChildren(characterFolderId, projectId);
        characterFiles.forEach(vf => {
          if (vf.type === 'file') {
            existingCharacterNames.add(vf.name);
            // 检查记忆体中是否有这个角色，如果有则使用记忆体中的完整数据
            const existingInMemory = atomic.characters.find(c => c.name === vf.name);
            const content = vf.content || '';
            // 解析内容中的性格描述，填充 personality 数组
            const extractedPersonality: string[] = [];
            // 匹配 **【三、性格特质】** 或 ### 性格特质 等标题下的内容
            const personalitySectionMatch = content.match(/(?:\*\*|#{1,3})\s*[【\[]?\s*(?:三、)?\s*性格(?:特质|特点|描述)?\s*[】\]]?\s*(?:\*\*)?\s*\n?([\s\S]*?)(?=(?:\n\s*(?:\*\*|#{1,3})\s*[【\[]?\s*(?:四、)?\s*(?:背景|身世|经历|关系|能力|秘密|结局)|\n\s*#{1,3}|\n\s*\*\*【|$))/i);
            if (personalitySectionMatch) {
              const sectionText = personalitySectionMatch[1].trim();
              // 提取列表项（如 "1. **极致危险**..." 或 "- **...**"）
              const listItems = sectionText.match(/(?:^|\n)\s*(?:\d+[.．]\s*|[\-\*]\s*)?\*\*([^*]+)\*\*[:：]?\s*([^\n]*)/g);
              if (listItems && listItems.length > 0) {
                listItems.forEach(item => {
                  const clean = item.replace(/^\s*(?:\d+[.．]\s*|[\-\*]\s*)?/, '').replace(/\*\*/g, '').trim();
                  if (clean) extractedPersonality.push(clean);
                });
              } else {
                // 没有列表格式，整段作为一条性格描述
                extractedPersonality.push(sectionText.slice(0, 100));
              }
            }
            // 如果没有匹配到章节，尝试全局搜索性格关键词
            if (extractedPersonality.length === 0) {
              const keywordMatches = content.match(/(?:性格|特质|个性|性情)[：:]\s*([^\n]+)/gi);
              if (keywordMatches) {
                keywordMatches.forEach(m => {
                  const clean = m.replace(/(?:性格|特质|个性|性情)[：:]\s*/, '').trim();
                  if (clean) extractedPersonality.push(clean);
                });
              }
            }
            if (existingInMemory) {
              // 记忆体中存在：补充 personality（如果记忆体中没有）
              if (!existingInMemory.personality || existingInMemory.personality.length === 0) {
                existingInMemory.personality = extractedPersonality;
              }
              // 同时更新 identity 为完整内容（防止被截断）
              if (!existingInMemory.identity || existingInMemory.identity.length < content.length) {
                existingInMemory.identity = content;
              }
              charactersToCheck.push(existingInMemory);
            } else {
              // 记忆体中没有，从文件系统创建临时角色对象
              charactersToCheck.push({
                id: vf.id,
                name: vf.name,
                identity: content,
                personality: extractedPersonality,
                abilities: [],
                relationships: [],
                secrets: [],
                arc: { start: '', current: '', goal: '' }
              });
            }
          }
        });
      }
      console.log('[MemoryAgent] 从文件系统提取角色数:', charactersToCheck.length);
    } catch (e) {
      console.error('[MemoryAgent] 从文件系统提取角色失败', e);
    }
    
    // 如果文件系统中没有角色，但记忆体中有，说明可能都被删除了，清空检查列表
    if (existingCharacterNames.size === 0 && atomic.characters.length > 0) {
      console.log('[MemoryAgent] 文件系统中没有角色，记忆体中的角色已被删除');
    }

    // 快速规则检查
    
    // 1. 检查角色基本完整性
    if (charactersToCheck.length === 0) {
      issues.push('尚未创建任何角色设定');
    } else {
        charactersToCheck.forEach(char => {
          if (!char.identity || char.identity.length < 5) {
            issues.push(`角色「${char.name}」的身份描述过于简略`);
          }
          // 性格检测：优先检查数组，为空时 fallback 检查原始内容中的性格关键词
          const hasPersonality = char.personality && char.personality.length > 0;
          const hasPersonalityInContent = char.identity && /性格|特质|个性|性情|人格|脾气|品性/.test(char.identity);
          if (!hasPersonality && !hasPersonalityInContent) {
            issues.push(`角色「${char.name}」缺少性格描述`);
          }
        });
    }
    
    // 2. 检查世界观完整性
    if (atomic.world.rules.length === 0 && !atomic.world.cosmology) {
      issues.push('世界观设定比较简略');
    }
    
    // 3. 检查剧情线/时间线完整性
    // 优先从文件系统检测时间线文件夹是否存在内容
    let hasTimelineFiles = false;
    try {
      const timelineFolderId = dataService.getRootFolderIdByType('timeline', projectId);
      if (timelineFolderId) {
        const timelineFiles = dataService.getChildren(timelineFolderId, projectId);
        hasTimelineFiles = timelineFiles.some(f => f.type === 'file' && f.content && f.content.trim().length > 10);
      }
    } catch (e) {
      console.error('[MemoryAgent] 从文件系统提取时间线失败', e);
    }
    if (plotsToCheck.length === 0 && atomic.plots.length === 0 && !hasTimelineFiles) {
      issues.push('尚未添加剧情线设定');
    }
    
    // 4. 检查角色关系
    const allCharacterNames = new Set(charactersToCheck.map(c => c.name));
    charactersToCheck.forEach(char => {
      (char.relationships || []).forEach(rel => {
        if (!allCharacterNames.has(rel.targetId)) {
          issues.push(`角色「${char.name}」的关系目标「${rel.targetId}」未在角色列表中找到`);
        }
      });
    });
    
    // 5. 如果有待检查文本，做简单文本关键词检查
    if (newText.trim().length > 0) {
      // 简单的关键词冲突检测
      const text = newText.toLowerCase();
      
      // 检查是否提到不存在的角色
      charactersToCheck.forEach(char => {
        if (text.includes(char.name.toLowerCase())) {
          // 可以扩展更复杂的逻辑
        }
      });
    }
    
    console.log('[MemoryAgent] 系统粗查完成，发现问题数:', issues.length);
    
    if (issues.length > 0) {
      await memoryBankService.logMaintenanceAction(
        projectId,
        '系统粗查完成',
        `发现 ${issues.length} 个潜在问题`
      );
    }
    
    return issues;
  },

  async generateContextSummary(
    projectId: string,
    model: ModelConfig,
    maxTokens: number = 2000
  ): Promise<string> {
    const ctx = await memoryBankService.buildContextFromMemory(projectId, 0);
    
    if (!ctx || ctx.length < 10) {
      return '记忆体为空';
    }

    const prompt = `请将以下记忆体内容总结为简洁的创作提示：

${ctx}

输出要求：
1. 字数控制在 300 字以内
2. 突出核心设定和当前进度
3. 适合作为 AI 写作时的上下文提示`;

    try {
      const result = await aiService.generate({
        model,
        prompt,
        temperature: 0.3,
        maxTokens: 500,
      });

      return result.content?.slice(0, 500) || ctx.slice(0, 500);
    } catch {
      return ctx.slice(0, 500);
    }
  },
};