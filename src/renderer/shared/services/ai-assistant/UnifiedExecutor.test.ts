import { describe, it, expect, beforeEach, vi } from 'vitest';
import { unifiedExecutor, UnifiedExecutor } from './UnifiedExecutor';
import { VFile } from '../../../../shared/types/fileSystem';
import { ParsedToolCall } from './ToolParser';

/**
 * UnifiedExecutor 测试
 *
 * 覆盖 UnifiedExecutor 类所有公开方法：
 * - fileOperations 管理: get/add/filter/remove
 * - executeAll: 批量执行 + create_file 缺 content 用 textParts 填充
 * - executeAction: 9 种 action 分支（read_file/read_folder/batch_read/create_file/update_file/delete_file/search/ask_input/plan）
 * - resolveFolderId: id/name/类型名/中文名 解析
 * - revertOperations: create→delete, delete→restore, update→restore, 异常容错
 *
 * mock 策略：
 * - dataService: mock 所有方法
 * - ToolParser.cleanFileContent: 不 mock（真实调用）
 * - nanoid: 不 mock（真实调用）
 *
 * 注意：unifiedExecutor 是单例，fileOperations 会跨测试累积
 * 解决方案：每个测试通过 removeFileOperationsByMessageIds 或直接调用 addFileOperation 测试
 */

vi.mock('../DataService', () => ({
  dataService: {
    getFS: vi.fn(),
    getFile: vi.fn(),
    getChildren: vi.fn().mockReturnValue([]),
    createFile: vi.fn(),
    updateFile: vi.fn(),
    deleteFile: vi.fn(),
    searchFiles: vi.fn().mockReturnValue([]),
    getRootFolderIdByType: vi.fn().mockReturnValue(null),
  },
}));

import { dataService } from '../DataService';

const mockedDataService = vi.mocked(dataService);

// ============== 测试夹具 ==============

function createFile(overrides: Partial<VFile> = {}): VFile {
  return {
    id: 'file-' + Math.random().toString(36).slice(2, 8),
    name: '未命名',
    type: 'file',
    parentId: null,
    content: '',
    childrenIds: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    version: 1,
    metadata: {
      tags: [],
      favorited: false,
      cardType: '',
      references: [],
      aiGenerated: false,
      batchId: null,
      sortOrder: 0,
    },
    ...overrides,
  } as VFile;
}

function createFolder(overrides: Partial<VFile> = {}): VFile {
  return {
    id: 'folder-' + Math.random().toString(36).slice(2, 8),
    name: '未命名文件夹',
    type: 'folder',
    parentId: null,
    content: '',
    childrenIds: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    version: 1,
    metadata: {
      tags: [],
      favorited: false,
      cardType: '',
      references: [],
      aiGenerated: false,
      batchId: null,
      sortOrder: 0,
    },
    ...overrides,
  } as VFile;
}

function createToolCall(overrides: Partial<ParsedToolCall> = {}): ParsedToolCall {
  return {
    action: 'create_file',
    name: '测试文件',
    content: '测试内容',
    parentId: 'folder-1',
    ...overrides,
  } as ParsedToolCall;
}

beforeEach(() => {
  vi.clearAllMocks();
  // 默认空 FS
  mockedDataService.getFS.mockReturnValue({ files: {}, rootIds: [] });
  mockedDataService.getChildren.mockReturnValue([]);
  mockedDataService.searchFiles.mockReturnValue([]);
  mockedDataService.getRootFolderIdByType.mockReturnValue(null);
  // 清空 fileOperations（通过 removeFileOperationsByMessageIds）
  const allOps = unifiedExecutor.getFileOperations();
  if (allOps.length > 0) {
    const allIds = new Set(allOps.map(op => op.messageId));
    unifiedExecutor.removeFileOperationsByMessageIds(allIds);
  }
});

// ============== 1. fileOperations 管理 ==============

describe('fileOperations 管理', () => {
  it('getFileOperations 初始应返回数组（可能为空或包含历史）', () => {
    const ops = unifiedExecutor.getFileOperations();
    expect(Array.isArray(ops)).toBe(true);
  });

  it('addFileOperation 应添加操作到列表', () => {
    const initialCount = unifiedExecutor.getFileOperations().length;
    unifiedExecutor.addFileOperation({
      id: 'op-1',
      messageId: 'msg-1',
      type: 'create_file',
      fileId: 'file-1',
      fileName: 'A.md',
      parentId: 'folder-1',
      timestamp: Date.now(),
    });
    expect(unifiedExecutor.getFileOperations().length).toBe(initialCount + 1);
  });

  it('filterFileOperationsByMessageIds 应按 messageId 过滤', () => {
    unifiedExecutor.addFileOperation({
      id: 'op-1', messageId: 'msg-A', type: 'create_file',
      fileId: 'f1', fileName: 'A', parentId: null, timestamp: Date.now(),
    });
    unifiedExecutor.addFileOperation({
      id: 'op-2', messageId: 'msg-B', type: 'update_file',
      fileId: 'f2', fileName: 'B', parentId: null, timestamp: Date.now(),
    });
    const filtered = unifiedExecutor.filterFileOperationsByMessageIds(new Set(['msg-A']));
    expect(filtered).toHaveLength(1);
    expect(filtered[0].messageId).toBe('msg-A');
  });

  it('removeFileOperationsByMessageIds 应删除指定 messageId 的操作', () => {
    unifiedExecutor.addFileOperation({
      id: 'op-1', messageId: 'msg-A', type: 'create_file',
      fileId: 'f1', fileName: 'A', parentId: null, timestamp: Date.now(),
    });
    unifiedExecutor.addFileOperation({
      id: 'op-2', messageId: 'msg-B', type: 'update_file',
      fileId: 'f2', fileName: 'B', parentId: null, timestamp: Date.now(),
    });
    unifiedExecutor.removeFileOperationsByMessageIds(new Set(['msg-A']));
    const ops = unifiedExecutor.getFileOperations();
    expect(ops.filter(op => op.messageId === 'msg-A')).toHaveLength(0);
    expect(ops.filter(op => op.messageId === 'msg-B')).toHaveLength(1);
  });
});

// ============== 2. resolveFolderId ==============

describe('resolveFolderId', () => {
  it('null 或 "null" 字符串应返回 null', () => {
    expect(unifiedExecutor.resolveFolderId(null)).toBeNull();
    expect(unifiedExecutor.resolveFolderId('null')).toBeNull();
    expect(unifiedExecutor.resolveFolderId(undefined)).toBeNull();
  });

  it('空字符串应返回 null', () => {
    expect(unifiedExecutor.resolveFolderId('')).toBeNull();
  });

  it('直接 id（FS 中存在）应返回该 id', () => {
    const folder = createFolder({ id: 'f1', name: '角色' });
    mockedDataService.getFS.mockReturnValue({ files: { f1: folder }, rootIds: ['f1'] });
    expect(unifiedExecutor.resolveFolderId('f1')).toBe('f1');
  });

  it('按文件夹名称匹配应返回 id', () => {
    const folder = createFolder({ id: 'f1', name: '角色文件夹' });
    mockedDataService.getFS.mockReturnValue({ files: { f1: folder }, rootIds: ['f1'] });
    expect(unifiedExecutor.resolveFolderId('角色文件夹')).toBe('f1');
  });

  it('按英文类型名（characters/world/timeline/outline/chapters/custom）应调用 getRootFolderIdByType', () => {
    mockedDataService.getRootFolderIdByType.mockReturnValue('folder-characters');
    expect(unifiedExecutor.resolveFolderId('characters')).toBe('folder-characters');
    expect(mockedDataService.getRootFolderIdByType).toHaveBeenCalledWith('characters');
  });

  it('按中文类型名（角色/人物/世界/世界观/地点/时间线/大纲/章节）应调用 getRootFolderIdByType', () => {
    mockedDataService.getRootFolderIdByType.mockReturnValue('folder-world');
    expect(unifiedExecutor.resolveFolderId('世界观')).toBe('folder-world');
    expect(mockedDataService.getRootFolderIdByType).toHaveBeenCalledWith('world');
  });

  it('中文名 "角色" 应映射到 characters', () => {
    mockedDataService.getRootFolderIdByType.mockReturnValue('folder-c');
    expect(unifiedExecutor.resolveFolderId('角色')).toBe('folder-c');
    expect(mockedDataService.getRootFolderIdByType).toHaveBeenCalledWith('characters');
  });

  it('无法解析的字符串应返回 null', () => {
    mockedDataService.getFS.mockReturnValue({ files: {}, rootIds: [] });
    mockedDataService.getRootFolderIdByType.mockReturnValue(null);
    expect(unifiedExecutor.resolveFolderId('不存在的名称')).toBeNull();
  });

  it('应 trim 输入字符串', () => {
    const folder = createFolder({ id: 'f1', name: '角色' });
    mockedDataService.getFS.mockReturnValue({ files: { f1: folder }, rootIds: ['f1'] });
    expect(unifiedExecutor.resolveFolderId('  f1  ')).toBe('f1');
  });
});

// ============== 3. executeAction - read_file ==============

describe('executeAction - read_file', () => {
  it('文件存在时应返回文件名和内容', async () => {
    const file = createFile({ id: 'f1', name: '主角.md', content: '角色内容' });
    mockedDataService.getFS.mockReturnValue({ files: { f1: file }, rootIds: [] });

    const result = await unifiedExecutor.executeAction(
      { action: 'read_file', fileId: 'f1' } as ParsedToolCall,
      null,
    );
    expect(result).toContain('主角.md');
    expect(result).toContain('角色内容');
    expect(result).toContain('[id:f1]');
  });

  it('文件不存在时应返回错误信息', async () => {
    mockedDataService.getFS.mockReturnValue({ files: {}, rootIds: [] });
    const result = await unifiedExecutor.executeAction(
      { action: 'read_file', fileId: 'no-such' } as ParsedToolCall,
      null,
    );
    expect(result).toContain('❌');
    expect(result).toContain('未找到');
  });
});

// ============== 4. executeAction - read_folder ==============

describe('executeAction - read_folder', () => {
  it('文件夹不存在时应返回错误信息', async () => {
    mockedDataService.getRootFolderIdByType.mockReturnValue(null);
    mockedDataService.getFS.mockReturnValue({ files: {}, rootIds: [] });

    const result = await unifiedExecutor.executeAction(
      { action: 'read_folder', folderId: 'no-such' } as ParsedToolCall,
      null,
    );
    expect(result).toContain('❌');
    expect(result).toContain('未找到');
  });

  it('文件夹为空时应返回暂无文件', async () => {
    const folder = createFolder({ id: 'f1', name: '角色' });
    mockedDataService.getFS.mockReturnValue({ files: { f1: folder }, rootIds: ['f1'] });
    mockedDataService.getChildren.mockReturnValue([]);

    const result = await unifiedExecutor.executeAction(
      { action: 'read_folder', folderId: 'f1' } as ParsedToolCall,
      null,
    );
    expect(result).toContain('暂无文件');
  });

  it('文件夹有文件时应返回所有文件内容', async () => {
    const folder = createFolder({ id: 'f1', name: '角色' });
    const file1 = createFile({ id: 'file1', name: 'A.md', content: '内容A', parentId: 'f1' });
    const file2 = createFile({ id: 'file2', name: 'B.md', content: '内容B', parentId: 'f1' });
    mockedDataService.getFS.mockReturnValue({ files: { f1: folder, file1, file2 }, rootIds: ['f1'] });
    mockedDataService.getChildren.mockReturnValue([file1, file2]);

    const result = await unifiedExecutor.executeAction(
      { action: 'read_folder', folderId: 'f1' } as ParsedToolCall,
      null,
    );
    expect(result).toContain('A.md');
    expect(result).toContain('内容A');
    expect(result).toContain('B.md');
    expect(result).toContain('2 个文件');
  });
});

// ============== 5. executeAction - batch_read ==============

describe('executeAction - batch_read', () => {
  it('空 fileIds 应返回错误', async () => {
    const result = await unifiedExecutor.executeAction(
      { action: 'batch_read', fileIds: [] } as ParsedToolCall,
      null,
    );
    expect(result).toContain('❌');
    expect(result).toContain('fileIds');
  });

  it('应返回所有找到的文件', async () => {
    const file1 = createFile({ id: 'f1', name: 'A.md', content: 'A内容' });
    const file2 = createFile({ id: 'f2', name: 'B.md', content: 'B内容' });
    mockedDataService.getFS.mockReturnValue({ files: { f1: file1, f2: file2 }, rootIds: [] });

    const result = await unifiedExecutor.executeAction(
      { action: 'batch_read', fileIds: ['f1', 'f2'] } as ParsedToolCall,
      null,
    );
    expect(result).toContain('A.md');
    expect(result).toContain('B.md');
  });

  it('部分文件不存在时应返回错误信息但不影响其他文件', async () => {
    const file1 = createFile({ id: 'f1', name: 'A.md', content: 'A内容' });
    mockedDataService.getFS.mockReturnValue({ files: { f1: file1 }, rootIds: [] });

    const result = await unifiedExecutor.executeAction(
      { action: 'batch_read', fileIds: ['f1', 'no-such'] } as ParsedToolCall,
      null,
    );
    expect(result).toContain('A.md');
    expect(result).toContain('❌');
    expect(result).toContain('no-such');
  });
});

// ============== 6. executeAction - create_file ==============

describe('executeAction - create_file', () => {
  it('内容为空或过短（<5）时应跳过创建', async () => {
    const result = await unifiedExecutor.executeAction(
      { action: 'create_file', name: '空文件', content: '', parentId: 'f1' } as ParsedToolCall,
      null,
    );
    expect(result).toContain('⚠️');
    expect(result).toContain('跳过创建');
    expect(mockedDataService.createFile).not.toHaveBeenCalled();
  });

  it('正常创建文件时应调用 dataService.createFile 并记录 fileOperation', async () => {
    const createdFile = createFile({ id: 'new-1', name: '主角.md' });
    mockedDataService.createFile.mockReturnValue(createdFile);
    mockedDataService.getFile.mockReturnValue(createdFile);

    const result = await unifiedExecutor.executeAction(
      { action: 'create_file', name: '主角.md', content: '角色档案内容', parentId: null } as ParsedToolCall,
      'msg-1',
    );
    expect(result).toContain('✅');
    expect(result).toContain('创建');
    expect(mockedDataService.createFile).toHaveBeenCalled();
    // 应记录 fileOperation
    const ops = unifiedExecutor.getFileOperations().filter(op => op.messageId === 'msg-1');
    expect(ops.length).toBeGreaterThan(0);
    expect(ops[0].type).toBe('create_file');
  });

  it('检测到重复文件时应更新而非创建', async () => {
    const existing = createFile({ id: 'existing-1', name: '主角.md', content: '旧内容' });
    const folder = createFolder({ id: 'f1', name: '角色' });
    mockedDataService.getFS.mockReturnValue({ files: { f1: folder, 'existing-1': existing }, rootIds: ['f1'] });
    mockedDataService.getChildren.mockReturnValue([existing]);
    mockedDataService.getFile.mockReturnValue(existing);

    const result = await unifiedExecutor.executeAction(
      { action: 'create_file', name: '主角.md', content: '新角色档案内容更详细', parentId: 'f1' } as ParsedToolCall,
      'msg-1',
    );
    expect(result).toContain('已更新');
    expect(result).toContain('检测到重复');
    expect(mockedDataService.updateFile).toHaveBeenCalled();
  });

  it('角色文件夹中内容格式无效时应拒绝创建', async () => {
    // isValidCharacterContent 要求 hasRoleTag 或 hasNameField + hasBasicInfo
    // 内容只有"短文本"无法通过验证
    const folder = createFolder({
      id: 'f1',
      name: '角色',
      metadata: { tags: ['characters'], favorited: false, cardType: '', references: [], aiGenerated: false, batchId: null, sortOrder: 0 },
    });
    mockedDataService.getFS.mockReturnValue({ files: { f1: folder }, rootIds: ['f1'] });
    mockedDataService.getRootFolderIdByType.mockReturnValue('f1');
    mockedDataService.getFile.mockReturnValue(folder);
    mockedDataService.getChildren.mockReturnValue([]);

    const result = await unifiedExecutor.executeAction(
      { action: 'create_file', name: '新角色', content: '这是一段普通文本没有角色类型标记也没有姓名字段但足够长的内容', parentId: 'f1' } as ParsedToolCall,
      null,
    );
    expect(result).toContain('❌');
    expect(result).toContain('不是有效的角色档案');
  });

  it('细纲文件夹应按卷拆分创建多文件', async () => {
    const folder = createFolder({
      id: 'f1',
      name: '细纲',
      metadata: { tags: [], favorited: false, cardType: 'detailed_outline', references: [], aiGenerated: false, batchId: null, sortOrder: 0 },
    });
    mockedDataService.getFS.mockReturnValue({ files: { f1: folder }, rootIds: ['f1'] });
    mockedDataService.getFile.mockReturnValue(folder);
    mockedDataService.getRootFolderIdByType.mockReturnValue('f1');

    // 模拟按卷拆分
    let createdCount = 0;
    mockedDataService.createFile.mockImplementation((_pid, data) => {
      createdCount++;
      return createFile({ id: `new-${createdCount}`, name: data.name });
    });

    const content = '第一卷 起源\n内容A\n\n第二卷 发展\n内容B';
    const result = await unifiedExecutor.executeAction(
      { action: 'create_file', name: '细纲', content, parentId: 'f1' } as ParsedToolCall,
      null,
    );
    expect(result).toContain('卷细纲');
    expect(createdCount).toBe(2);
  });

  it('msgId 为 null 时不应记录 fileOperation', async () => {
    const createdFile = createFile({ id: 'new-1', name: '主角.md' });
    mockedDataService.createFile.mockReturnValue(createdFile);
    mockedDataService.getFile.mockReturnValue(createdFile);

    const beforeCount = unifiedExecutor.getFileOperations().length;
    await unifiedExecutor.executeAction(
      { action: 'create_file', name: '主角.md', content: '角色档案内容', parentId: null } as ParsedToolCall,
      null,
    );
    expect(unifiedExecutor.getFileOperations().length).toBe(beforeCount);
  });
});

// ============== 7. executeAction - update_file ==============

describe('executeAction - update_file', () => {
  it('文件不存在时应返回错误', async () => {
    mockedDataService.getFS.mockReturnValue({ files: {}, rootIds: [] });
    const result = await unifiedExecutor.executeAction(
      { action: 'update_file', fileId: 'no-such', content: '新内容' } as ParsedToolCall,
      null,
    );
    expect(result).toContain('❌');
    expect(result).toContain('未找到');
  });

  it('内容为空时应跳过更新', async () => {
    const file = createFile({ id: 'f1', name: 'A.md', content: '旧内容' });
    mockedDataService.getFS.mockReturnValue({ files: { f1: file }, rootIds: [] });

    const result = await unifiedExecutor.executeAction(
      { action: 'update_file', fileId: 'f1', content: '' } as ParsedToolCall,
      null,
    );
    expect(result).toContain('⚠️');
    expect(result).toContain('跳过更新');
    expect(mockedDataService.updateFile).not.toHaveBeenCalled();
  });

  it('正常更新时应调用 updateFile 并记录 fileOperation', async () => {
    const file = createFile({ id: 'f1', name: 'A.md', content: '旧内容' });
    mockedDataService.getFS.mockReturnValue({ files: { f1: file }, rootIds: [] });

    const result = await unifiedExecutor.executeAction(
      { action: 'update_file', fileId: 'f1', content: '新内容' } as ParsedToolCall,
      'msg-1',
    );
    expect(result).toContain('✅');
    expect(result).toContain('已更新');
    expect(mockedDataService.updateFile).toHaveBeenCalledWith('f1', { content: '新内容' });
    // 应记录 fileOperation
    const ops = unifiedExecutor.getFileOperations().filter(op => op.messageId === 'msg-1' && op.type === 'update_file');
    expect(ops).toHaveLength(1);
    expect(ops[0].previousContent).toBe('旧内容');
  });
});

// ============== 8. executeAction - delete_file ==============

describe('executeAction - delete_file', () => {
  it('文件不存在时应返回错误', async () => {
    mockedDataService.getFS.mockReturnValue({ files: {}, rootIds: [] });
    const result = await unifiedExecutor.executeAction(
      { action: 'delete_file', fileId: 'no-such' } as ParsedToolCall,
      null,
    );
    expect(result).toContain('❌');
    expect(result).toContain('未找到');
  });

  it('正常删除时应调用 deleteFile 并记录 fileOperation', async () => {
    const file = createFile({ id: 'f1', name: 'A.md', content: '内容' });
    mockedDataService.getFS.mockReturnValue({ files: { f1: file }, rootIds: [] });

    const result = await unifiedExecutor.executeAction(
      { action: 'delete_file', fileId: 'f1' } as ParsedToolCall,
      'msg-1',
    );
    expect(result).toContain('🗑️');
    expect(result).toContain('已删除');
    expect(mockedDataService.deleteFile).toHaveBeenCalledWith('f1');
    // 应记录 fileOperation 含 previousContent
    const ops = unifiedExecutor.getFileOperations().filter(op => op.messageId === 'msg-1' && op.type === 'delete_file');
    expect(ops).toHaveLength(1);
    expect(ops[0].previousContent).toBe('内容');
  });
});

// ============== 9. executeAction - search ==============

describe('executeAction - search', () => {
  it('无结果时应返回未找到', async () => {
    mockedDataService.searchFiles.mockReturnValue([]);
    const result = await unifiedExecutor.executeAction(
      { action: 'search', query: '不存在的内容' } as ParsedToolCall,
      null,
    );
    expect(result).toContain('未找到');
  });

  it('有结果时应返回文件列表（最多15个）', async () => {
    const files = Array.from({ length: 20 }, (_, i) =>
      createFile({ id: `f${i}`, name: `文件${i}.md`, content: `内容${i}` })
    );
    mockedDataService.searchFiles.mockReturnValue(files);
    mockedDataService.getFS.mockReturnValue({ files: Object.fromEntries(files.map(f => [f.id, f])), rootIds: [] });

    const result = await unifiedExecutor.executeAction(
      { action: 'search', query: '内容' } as ParsedToolCall,
      null,
    );
    expect(result).toContain('找到 20 个匹配');
    expect(result).toContain('还有 5 个结果未显示'); // 20 - 15 = 5
  });

  it('结果不超过15个时不应显示省略提示', async () => {
    const files = [createFile({ id: 'f1', name: 'A.md', content: '内容A' })];
    mockedDataService.searchFiles.mockReturnValue(files);
    mockedDataService.getFS.mockReturnValue({ files: { f1: files[0] }, rootIds: [] });

    const result = await unifiedExecutor.executeAction(
      { action: 'search', query: '内容' } as ParsedToolCall,
      null,
    );
    expect(result).not.toContain('未显示');
  });
});

// ============== 10. executeAction - 空操作类 ==============

describe('executeAction - 空操作类（ask_input/ask_choice/plan）', () => {
  it('ask_input 应返回空字符串', async () => {
    const result = await unifiedExecutor.executeAction(
      { action: 'ask_input' } as ParsedToolCall,
      null,
    );
    expect(result).toBe('');
  });

  it('ask_choice 应返回空字符串', async () => {
    const result = await unifiedExecutor.executeAction(
      { action: 'ask_choice' } as ParsedToolCall,
      null,
    );
    expect(result).toBe('');
  });

  it('plan 应返回空字符串', async () => {
    const result = await unifiedExecutor.executeAction(
      { action: 'plan' } as ParsedToolCall,
      null,
    );
    expect(result).toBe('');
  });
});

// ============== 11. executeAction - 未知操作 ==============

describe('executeAction - 未知操作', () => {
  it('未知 action 应返回警告', async () => {
    const result = await unifiedExecutor.executeAction(
      { action: 'unknown_action' } as ParsedToolCall,
      null,
    );
    expect(result).toContain('⚠️');
    expect(result).toContain('未知操作');
    expect(result).toContain('unknown_action');
  });
});

// ============== 12. executeAll ==============

describe('executeAll', () => {
  it('应分别执行 fileOps 和 nonFileOps', async () => {
    const toolCalls: ParsedToolCall[] = [
      { action: 'search', query: 'test' } as ParsedToolCall,
      { action: 'create_file', name: 'A.md', content: '内容A', parentId: null } as ParsedToolCall,
    ];
    mockedDataService.searchFiles.mockReturnValue([]);
    const createdFile = createFile({ id: 'new-1', name: 'A.md' });
    mockedDataService.createFile.mockReturnValue(createdFile);
    mockedDataService.getFile.mockReturnValue(createdFile);

    const result = await unifiedExecutor.executeAll(toolCalls, '', 'msg-1');
    expect(result.actionResults).toContain('search');
    expect(result.actionResults).toContain('create_file');
    expect(result.fileOps).toHaveLength(1);
    expect(result.fileOps[0].action).toBe('create_file');
  });

  it('create_file 缺 content 时应用 textParts 填充', async () => {
    const toolCalls: ParsedToolCall[] = [
      { action: 'create_file', name: 'A.md', content: '', parentId: null } as ParsedToolCall,
    ];
    const createdFile = createFile({ id: 'new-1', name: 'A.md' });
    mockedDataService.createFile.mockReturnValue(createdFile);
    mockedDataService.getFile.mockReturnValue(createdFile);

    const textParts = '这是从 textParts 填充的内容';
    await unifiedExecutor.executeAll(toolCalls, textParts, 'msg-1');
    // createFile 应被调用，且 content 应为 textParts（经过 cleanFileContent）
    expect(mockedDataService.createFile).toHaveBeenCalled();
    const callArgs = mockedDataService.createFile.mock.calls[0][1];
    expect(callArgs.content).toContain('textParts 填充');
  });

  it('textParts 为空字符串时 create_file content 为空应跳过创建', async () => {
    const toolCalls: ParsedToolCall[] = [
      { action: 'create_file', name: 'A.md', content: '', parentId: null } as ParsedToolCall,
    ];

    const result = await unifiedExecutor.executeAll(toolCalls, '', 'msg-1');
    expect(result.actionResults).toContain('跳过创建');
    expect(mockedDataService.createFile).not.toHaveBeenCalled();
  });

  it('msgId 为 null 时所有操作不应记录 fileOperation', async () => {
    const toolCalls: ParsedToolCall[] = [
      { action: 'create_file', name: 'A.md', content: '内容A', parentId: null } as ParsedToolCall,
    ];
    const createdFile = createFile({ id: 'new-1', name: 'A.md' });
    mockedDataService.createFile.mockReturnValue(createdFile);
    mockedDataService.getFile.mockReturnValue(createdFile);

    const beforeCount = unifiedExecutor.getFileOperations().length;
    await unifiedExecutor.executeAll(toolCalls, '', null);
    expect(unifiedExecutor.getFileOperations().length).toBe(beforeCount);
  });
});

// ============== 13. revertOperations ==============

describe('revertOperations', () => {
  it('create_file 回滚应调用 deleteFile', () => {
    const ops = [{
      id: 'op-1', messageId: 'msg-1', type: 'create_file' as const,
      fileId: 'f1', fileName: 'A.md', parentId: null, timestamp: Date.now(),
    }];
    const result = unifiedExecutor.revertOperations(ops);
    expect(mockedDataService.deleteFile).toHaveBeenCalledWith('f1');
    expect(result[0]).toContain('删除');
    expect(result[0]).toContain('A.md');
  });

  it('delete_file 回滚应调用 createFile 恢复内容', () => {
    const ops = [{
      id: 'op-1', messageId: 'msg-1', type: 'delete_file' as const,
      fileId: 'f1', fileName: 'A.md', parentId: 'folder-1',
      previousContent: '原内容', timestamp: Date.now(),
    }];
    const result = unifiedExecutor.revertOperations(ops);
    expect(mockedDataService.createFile).toHaveBeenCalledWith('folder-1', expect.objectContaining({
      name: 'A.md',
      content: '原内容',
    }));
    expect(result[0]).toContain('恢复');
  });

  it('update_file 回滚应调用 updateFile 恢复 previousContent', () => {
    const ops = [{
      id: 'op-1', messageId: 'msg-1', type: 'update_file' as const,
      fileId: 'f1', fileName: 'A.md', parentId: null,
      previousContent: '原内容', timestamp: Date.now(),
    }];
    const result = unifiedExecutor.revertOperations(ops);
    expect(mockedDataService.updateFile).toHaveBeenCalledWith('f1', { content: '原内容' });
    expect(result[0]).toContain('恢复');
  });

  it('回滚应按逆序执行（后进先回滚）', () => {
    const order: string[] = [];
    mockedDataService.deleteFile.mockImplementation((id) => { order.push(`delete:${id}`); });
    mockedDataService.updateFile.mockImplementation((id) => { order.push(`update:${id}`); return {} as any; });

    const ops = [
      { id: 'op-1', messageId: 'msg-1', type: 'create_file' as const, fileId: 'f1', fileName: 'A', parentId: null, timestamp: Date.now() },
      { id: 'op-2', messageId: 'msg-1', type: 'update_file' as const, fileId: 'f2', fileName: 'B', parentId: null, previousContent: 'old', timestamp: Date.now() },
    ];
    unifiedExecutor.revertOperations(ops);
    // 逆序：先 update_file 后 create_file
    expect(order[0]).toBe('update:f2');
    expect(order[1]).toBe('delete:f1');
  });

  it('回滚异常时应捕获并返回失败信息', () => {
    mockedDataService.deleteFile.mockImplementation(() => {
      throw new Error('删除失败');
    });
    const ops = [{
      id: 'op-1', messageId: 'msg-1', type: 'create_file' as const,
      fileId: 'f1', fileName: 'A.md', parentId: null, timestamp: Date.now(),
    }];
    const result = unifiedExecutor.revertOperations(ops);
    expect(result[0]).toContain('回滚失败');
    expect(result[0]).toContain('A.md');
  });
});
