import { dataService } from '../DataService';
import { VFile } from '../../../../shared/types/fileSystem';
import { ToolParser, ParsedToolCall } from './ToolParser';
import { nanoid } from '../../utils/nanoid';

function extractRoleTags(content: string, parentId?: string): string[] {
  const tags: string[] = [];
  const rolePatterns = [
    /【\s*角色类型\s*[：:]\s*(主角|女主|反派|反派配角|配角)\s*】/,
    /\*\s*角色类型\s*[：:]\s*(主角|女主|反派|反派配角|配角)\s*\*/,
    /角色类型[：:]\s*(主角|女主|反派|反派配角|配角)/,
    /^(?:主角|女主|反派|反派配角|配角)\b/m,
  ];
  for (const p of rolePatterns) {
    const m = content.match(p);
    if (m) { tags.push(m[1]); break; }
  }
  if (!tags.length && /性别[：:]\s*女/.test(content)) {
    const isVillain = /(?:反派|敌人|对手|宿敌|魔尊|魔女|妖)/.test(content.slice(0, 500));
    const isMain = /(?:主角|男主|女主|核心|第一?主角|主人公)/.test(content.slice(0, 500));
    if (isMain && !isVillain) tags.push('女主');
    else if (isVillain) tags.push('反派');
    else tags.push('配角');
  }
  if (!tags.length) {
    const isVillain = /(?:反派|敌人|对手|宿敌|魔尊|魔女|妖)/.test(content.slice(0, 500));
    const isMain = /(?:主角|男主|女主|核心|第一?主角|主人公)/.test(content.slice(0, 500));
    if (isMain && !isVillain) tags.push('主角');
    else if (isVillain) tags.push('反派');
  }
  return tags;
}

function isValidCharacterContent(content: string): boolean {
  const hasRoleTag = /【\s*角色类型\s*[：:]/.test(content);
  const hasNameField = /(?:姓名|名字|角色名|角色)[：:]\s*\S/.test(content) || /^\s*[-*]\s*\*\*姓名/.test(content);
  const hasBasicInfo = /(?:性别|年龄|身份|境界|性格|外貌|背景)/.test(content.slice(0, 800));
  return (hasRoleTag || hasNameField) && hasBasicInfo;
}

function findDuplicateFile(parentId: string | null, name: string): VFile | null {
  if (!parentId) return null;
  const siblings = dataService.getChildren(parentId);
  const normalizedName = name.toLowerCase().replace(/[\s《》（）、·\-]/g, '');
  for (const f of siblings) {
    if (f.type === 'file') {
      const fNormal = f.name.toLowerCase().replace(/[\s《》（）、·\-]/g, '');
      if (fNormal === normalizedName || f.name.includes(name) || name.includes(f.name)) {
        return f;
      }
    }
  }
  return null;
}

function parseVolumesFromText(text: string): { name: string; content: string }[] {
  const volumeRegex = /^(\s*#*\s*)第\s*([0-9一二三四五六七八九十百]+)\s*卷[:：]?\s*(.+)/i;
  const lines = text.split('\n');
  const volumes: { name: string; content: string }[] = [];
  let currentVolumeName: string | null = null;
  let currentLines: string[] = [];
  const flushVolume = () => {
    if (currentVolumeName && currentLines.length > 0) {
      volumes.push({ name: currentVolumeName, content: currentLines.join('\n').trim() });
    }
  };
  for (const line of lines) {
    const match = line.match(volumeRegex);
    if (match) {
      flushVolume();
      const volNum = match[2];
      const volTitle = match[3].trim().replace(/[#*]/g, '').trim();
      currentVolumeName = `第${volNum}卷${volTitle ? ' · ' + volTitle : ''}`;
      currentLines = [line];
      continue;
    }
    if (currentVolumeName) {
      currentLines.push(line);
    }
  }
  flushVolume();
  if (volumes.length === 0 && text.trim()) {
    volumes.push({ name: '细纲', content: text.trim() });
  }
  return volumes;
}

function isDetailedOutlineFolder(parentId: string | null): boolean {
  if (!parentId) return false;
  const parent = dataService.getFile(parentId);
  if (!parent) return false;
  return parent.metadata?.tags?.includes('detailed_outline') || parent.metadata?.cardType === 'detailed_outline';
}

interface FileOperation {
  id: string;
  messageId: string;
  type: 'create_file' | 'update_file' | 'delete_file';
  fileId: string;
  fileName: string;
  parentId: string | null;
  previousContent?: string;
  timestamp: number;
  retryCount?: number;
}

export class UnifiedExecutor {
  private fileOperations: FileOperation[] = [];

  getFileOperations(): FileOperation[] {
    return this.fileOperations;
  }

  addFileOperation(op: FileOperation): void {
    this.fileOperations.push(op);
  }

  filterFileOperationsByMessageIds(msgIds: Set<string>): FileOperation[] {
    return this.fileOperations.filter(op => msgIds.has(op.messageId));
  }

  removeFileOperationsByMessageIds(msgIds: Set<string>): void {
    this.fileOperations = this.fileOperations.filter(op => !msgIds.has(op.messageId));
  }

  async executeAll(
    toolCalls: ParsedToolCall[],
    textParts: string,
    currentMessageId: string | null,
  ): Promise<{ actionResults: string; fileOps: ParsedToolCall[] }> {
    const fileOps = toolCalls.filter(tc => tc.action === 'create_file' || tc.action === 'update_file' || tc.action === 'delete_file');
    const nonFileOps = toolCalls.filter(tc => tc.action !== 'create_file' && tc.action !== 'update_file' && tc.action !== 'delete_file');

    for (const fc of fileOps) {
      if (fc.action === 'create_file' && (!fc.content || fc.content.trim() === '') && textParts) {
        fc.content = ToolParser.cleanFileContent(textParts);
      }
    }

    let actionResults = '';

    for (const tc of nonFileOps) {
      const actionResult = await this.executeAction(tc, currentMessageId);
      actionResults += `\n[工具执行结果] ${tc.action}: ${actionResult}\n`;
    }

    for (const tc of fileOps) {
      const actionResult = await this.executeAction(tc, currentMessageId);
      actionResults += `\n[工具执行结果] ${tc.action}: ${actionResult}\n`;
    }

    return { actionResults, fileOps };
  }

  async executeAction(action: ParsedToolCall, msgId: string | null): Promise<string> {
    switch (action.action) {
      case 'read_file': {
        const file = this.findFile(action.fileId);
        if (!file) return `❌ 文件 "${action.fileId}" 未找到。可用 search 查找或查看上方文件树中的 [id]`;
        return `📄 **${file.name}** [id:${file.id}]\n${file.content || '（空文件）'}`;
      }
      case 'read_folder': {
        const folderId = this.resolveFolderId(action.folderId);
        if (!folderId) return `❌ 文件夹 "${action.folderId}" 未找到。可用类型名：characters / world / timeline / outline / chapters / custom`;
        const folder = dataService.getFile(folderId);
        const children = dataService.getChildren(folderId).filter(c => c.type === 'file');
        if (children.length === 0) return `📁 **${folder?.name || folderId}** 下暂无文件`;
        const contents = children.map(f => `📄 **${f.name}** [id:${f.id}]\n${f.content || '（空文件）'}`).join('\n\n---\n\n');
        return `📁 **${folder?.name || folderId}**（${children.length} 个文件）\n\n${contents}`;
      }
      case 'batch_read': {
        const ids: string[] = action.fileIds || [];
        if (!ids.length) return '❌ batch_read 需要 fileIds 数组';
        const results: string[] = [];
        for (const id of ids) {
          const file = this.findFile(id);
          if (file) {
            results.push(`📄 **${file.name}** [id:${file.id}]\n${file.content || '（空文件）'}`);
          } else {
            results.push(`❌ "${id}" 未找到`);
          }
        }
        return results.join('\n\n---\n\n');
      }
      case 'create_file': {
        const parentId = this.resolveFolderId(action.parentId);
        const parentName = parentId ? (dataService.getFile(parentId)?.name || parentId) : '根目录';
        const fileContent = action.content || '';
        if (!fileContent || fileContent.trim().length < 5) {
          return `⚠️ 跳过创建「${action.name || '未命名'}」：内容为空或过短（可能输出被截断，请重试）`;
        }
        const parentFile = parentId ? dataService.getFile(parentId) : null;
        // 注：parentFile.type 只能为 'folder' | 'file'，'characters' 分类通过 metadata.tags 标识
        const isCharacterFolder = parentFile?.metadata?.tags?.includes('characters') ?? false;

        if (isCharacterFolder && fileContent.length > 20 && !isValidCharacterContent(fileContent)) {
          return `❌ 内容格式不是有效的角色档案（缺少角色类型标记或姓名字段），跳过创建「${action.name || '未命名'}」。请重新输出包含【角色类型】和基本信息的角色卡内容。`;
        }

        // 细纲类型：按卷拆分创建文件，不检测重复更新
        const isOutlineFolder = isDetailedOutlineFolder(parentId);
        if (isOutlineFolder) {
          const volumes = parseVolumesFromText(fileContent);
          const createdNames: string[] = [];
          for (const vol of volumes) {
            const file = dataService.createFile(parentId, {
              name: vol.name,
              type: 'file',
              content: vol.content,
              metadata: { tags: action.tags || [], aiGenerated: true },
            });
            if (msgId) {
              this.fileOperations.push({
                id: nanoid(),
                messageId: msgId,
                type: 'create_file',
                fileId: file.id,
                fileName: file.name,
                parentId,
                timestamp: Date.now(),
              });
            }
            createdNames.push(file.name);
          }
          return `✅ 已在「${parentName}」创建 ${createdNames.length} 卷细纲：${createdNames.join('、')}`;
        }

        const targetName = action.name || '新文件';
        const existingFile = findDuplicateFile(parentId, targetName);
        if (existingFile) {
          const previousContent = existingFile.content || '';
          dataService.updateFile(existingFile.id, { content: fileContent });
          const autoTags = extractRoleTags(fileContent, parentId);
          const mergedTags = action.tags?.length ? [...action.tags, ...autoTags] : autoTags;
          const currentMeta = existingFile.metadata || {};
          dataService.updateFile(existingFile.id, { metadata: { ...currentMeta, tags: mergedTags, aiGenerated: true } });

          if (msgId) {
            this.fileOperations.push({
              id: nanoid(),
              messageId: msgId,
              type: 'update_file',
              fileId: existingFile.id,
              fileName: existingFile.name,
              parentId,
              previousContent,
              timestamp: Date.now(),
            });
          }
          return `📝 已更新「${parentName}」中已有的「${existingFile.name}」（检测到重复，自动更新而非新建）`;
        }

        const autoTags = extractRoleTags(fileContent, parentId);
        const mergedTags = action.tags?.length ? [...action.tags, ...autoTags] : autoTags;
        const file = dataService.createFile(parentId, {
          name: action.name || '新文件',
          type: 'file',
          content: fileContent,
          metadata: { tags: mergedTags, aiGenerated: true },
        });

        const verified = dataService.getFile(file.id);
        if (!verified || (!verified.content && action.content)) {
          if (!action._retryCount) action._retryCount = 0;
          if (action._retryCount < 2) {
            action._retryCount++;
            dataService.updateFile(file.id, { content: action.content || '' });
          }
        }

        if (msgId) {
          this.fileOperations.push({
            id: nanoid(),
            messageId: msgId,
            type: 'create_file',
            fileId: file.id,
            fileName: file.name,
            parentId,
            timestamp: Date.now(),
          });
        }
        return `✅ 已在「${parentName}」创建「${file.name}」`;
      }
      case 'update_file': {
        const file = this.findFile(action.fileId);
        if (!file) return `❌ 文件 "${action.fileId}" 未找到`;
        const newContent = action.content;
        if (!newContent || newContent.trim() === '') {
          return `⚠️ 跳过更新「${file.name}」：内容为空（可能输出被截断，请重试）`;
        }
        const prevContent = file.content;
        dataService.updateFile(file.id, { content: newContent });
        if (msgId) {
          this.fileOperations.push({
            id: nanoid(),
            messageId: msgId,
            type: 'update_file',
            fileId: file.id,
            fileName: file.name,
            parentId: file.parentId,
            previousContent: prevContent,
            timestamp: Date.now(),
          });
        }
        return `✅ 已更新「${file.name}」`;
      }
      case 'delete_file': {
        const file = this.findFile(action.fileId);
        if (!file) return `❌ 文件 "${action.fileId}" 未找到，无法删除`;
        const fileName = file.name;
        const parentId = file.parentId;
        dataService.deleteFile(file.id);
        if (msgId) {
          this.fileOperations.push({
            id: nanoid(),
            messageId: msgId,
            type: 'delete_file',
            fileId: file.id,
            fileName,
            parentId,
            previousContent: file.content,
            timestamp: Date.now(),
          });
        }
        return `🗑️ 已删除「${fileName}」`;
      }
      case 'search': {
        const results = dataService.searchFiles(action.query);
        if (results.length === 0) return `🔍 未找到匹配 "${action.query}" 的文件`;
        const maxShow = 15;
        const shown = results.slice(0, maxShow);
        const items = shown.map(f => {
          const snippet = f.content ? f.content.slice(0, 120).replace(/\n/g, ' ') + (f.content.length > 120 ? '…' : '') : '';
          const folder = f.parentId ? (dataService.getFile(f.parentId)?.name || '') : '';
          return `- 📄 **${f.name}** [id:${f.id}] ${folder ? `📁${folder}` : ''}\n  ${snippet}`;
        });
        const overflow = results.length > maxShow ? `\n…还有 ${results.length - maxShow} 个结果未显示，请缩小搜索范围` : '';
        return `🔍 找到 ${results.length} 个匹配 "${action.query}" 的结果：\n${items.join('\n')}${overflow}`;
      }
      case 'ask_input':
      case 'ask_choice':
      case 'plan':
        return '';
      default:
        return `⚠️ 未知操作：${action.action}`;
    }
  }

  resolveFolderId(idOrName: string | null | undefined): string | null {
    if (!idOrName || idOrName === 'null') return null;
    const trimmed = idOrName.trim();
    const fs = dataService.getFS();
    if (fs.files[trimmed]) return trimmed;
    const folder = Object.values(fs.files).find(f => f.type === 'folder' && f.name === trimmed);
    if (folder) return folder.id;
    const directTypeMap: Record<string, string> = { 'characters': 'characters', 'world': 'world', 'timeline': 'timeline', 'outline': 'outline', 'chapters': 'chapters', 'custom': 'custom' };
    if (directTypeMap[trimmed]) return dataService.getRootFolderIdByType(directTypeMap[trimmed]);
    const exactTypeMap: Record<string, string> = { '角色': 'characters', '人物': 'characters', '世界': 'world', '世界观': 'world', '地点': 'world', '时间线': 'timeline', '大纲': 'outline', '章节': 'chapters' };
    if (exactTypeMap[trimmed]) return dataService.getRootFolderIdByType(exactTypeMap[trimmed]);
    return null;
  }

  private findFile(idOrName: string): VFile | undefined {
    const fs = dataService.getFS();
    if (fs.files[idOrName]) return fs.files[idOrName];
    return Object.values(fs.files).find(f => f.name === idOrName || f.name.includes(idOrName));
  }

  revertOperations(ops: FileOperation[]): string[] {
    const revertedFiles: string[] = [];
    for (let i = ops.length - 1; i >= 0; i--) {
      const op = ops[i];
      try {
        if (op.type === 'create_file') {
          dataService.deleteFile(op.fileId);
          revertedFiles.push(`🗑️ 删除：${op.fileName}`);
        } else if (op.type === 'delete_file' && op.previousContent !== undefined) {
          dataService.createFile(op.parentId, {
            name: op.fileName,
            type: 'file',
            content: op.previousContent,
          });
          revertedFiles.push(`↩️ 恢复：${op.fileName}`);
        } else if (op.type === 'update_file' && op.previousContent !== undefined) {
          dataService.updateFile(op.fileId, { content: op.previousContent });
          revertedFiles.push(`↩️ 恢复：${op.fileName}`);
        }
      } catch (e) {
        revertedFiles.push(`⚠️ 回滚失败：${op.fileName}`);
      }
    }
    return revertedFiles;
  }
}

export const unifiedExecutor = new UnifiedExecutor();
