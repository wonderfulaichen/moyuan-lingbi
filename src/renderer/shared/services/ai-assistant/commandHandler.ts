export const COMMAND_MAP: Record<string, { type: string; label: string }> = {
  '/角色':   { type: 'characters', label: '角色' },
  '/人物':   { type: 'characters', label: '角色' },
  '/character': { type: 'characters', label: '角色' },
  '/地点':   { type: 'world',     label: '地点' },
  '/地图':   { type: 'world',     label: '地点' },
  '/location':  { type: 'world',     label: '地点' },
  '/时间线': { type: 'timeline',  label: '时间线' },
  '/时间':   { type: 'timeline',  label: '时间线' },
  '/事件':   { type: 'custom',    label: '事件' },
  '/剧情':   { type: 'custom',    label: '事件' },
  '/势力':   { type: 'custom',    label: '势力' },
  '/组织':   { type: 'custom',    label: '组织' },
  '/规则':   { type: 'custom',    label: '规则体系' },
  '/魔法':   { type: 'custom',    label: '魔法/修炼体系' },
  '/科技':   { type: 'custom',    label: '科技水平' },
};

export function tryHandleCommand(text: string): { instruction: string; label: string; type: string } | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith('/')) return null;
  const spaceIdx = trimmed.indexOf(' ');
  const cmd = spaceIdx > 0 ? trimmed.substring(0, spaceIdx).toLowerCase() : trimmed.toLowerCase();
  const desc = spaceIdx > 0 ? trimmed.substring(spaceIdx + 1).trim() : '';
  const mapped = COMMAND_MAP[cmd];
  if (!mapped) return null;

  const { dataService } = require('../DataService');
  const parentId = dataService.getRootFolderIdByType(mapped.type);
  if (!parentId) return null;
  return {
    instruction: `请在「${mapped.label}」文件夹中创建关于「${desc || mapped.label}」的详细内容。要求内容完整、结构清晰，使用 create_file 工具直接创建文件。`,
    label: mapped.label,
    type: mapped.type,
  };
}
