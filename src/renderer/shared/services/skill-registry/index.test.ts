/**
 * SkillRegistry 单元测试
 */
import { describe, it, expect } from 'vitest';
import { skillRegistry } from './index';

describe('SkillRegistry', () => {
  it('内置 Skill 应包含 3 个', () => {
    const all = skillRegistry.listAll();
    expect(all?.length ?? 0).toBeGreaterThanOrEqual(3);
  });

  it('按 ID 查找应返回正确的 Skill', () => {
    const s = skillRegistry.find('skill-token-saver');
    expect(s).toBeDefined();
    expect(s!.name).toBe('Token 优化');
  });

  it('按分类过滤应返回正确的数量', () => {
    const tokenSkills = skillRegistry.getByCategory('token');
    expect(tokenSkills.length).toBeGreaterThanOrEqual(2);
  });

  it('关键词搜索应返回匹配结果', () => {
    const results = skillRegistry.search('一致性');
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].id).toBe('skill-consistency-check');
  });

  it('不存在的 Skill 应返回错误', async () => {
    const result = await skillRegistry.execute('skill-not-exist', { params: {} });
    expect(result.success).toBe(false);
    expect(result.result).toContain('不存在');
  });

  it('token-saver analyze 应返回分析结果', async () => {
    const result = await skillRegistry.execute('skill-token-saver', {
      params: { action: 'analyze', content: '你好\n\n\n世界' },
    });
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data!.savedPercent).toBeGreaterThanOrEqual(0);
  });

  it('token-saver compress 应压缩内容', async () => {
    const result = await skillRegistry.execute('skill-token-saver', {
      params: { action: 'compress', content: 'a\n\n\nb\n\n\nc' },
    });
    expect(result.success).toBe(true);
    expect((result.data!.compressed as string).length).toBeLessThan(10);
  });

  it('context-compress 应压缩长文档', async () => {
    const longContent = Array(500).fill('## 第X章\nThe quick brown fox jumps over the lazy dog. This is a test sentence to make each chapter entry longer so that compression can take effect.').join('\n');
    const result = await skillRegistry.execute('skill-context-compress', {
      params: { content: longContent, type: 'plot', maxTokens: 100 },
    });
    expect(result.success).toBe(true);
    expect(result.data!.compressedLength).toBeLessThan(longContent.length);
  });

  it('consistency-check 应检测角色名混用', async () => {
    const content = '主角走进了森林。主人公遇到了老者。男主说话了。';
    const result = await skillRegistry.execute('skill-consistency-check', {
      params: { content },
    });
    expect(result.success).toBe(true);
    expect((result.data as any)!.issues.length).toBeGreaterThanOrEqual(1);
  });

  it('consistency-check 无问题应返回通过', async () => {
    const result = await skillRegistry.execute('skill-consistency-check', {
      params: { content: '这是一个简单的测试文本，没有明显的矛盾。' },
    });
    expect(result.success).toBe(true);
    expect(result.data!.passed).toBe(true);
  });

  it('自定义注册应可用', () => {
    skillRegistry.register({
      id: 'skill-test',
      name: '测试技能',
      description: '测试用',
      category: 'system',
      execute: () => ({ success: true, result: 'ok' }),
    });
    const s = skillRegistry.find('skill-test');
    expect(s).toBeDefined();
  });

  it('buildSkillListForPrompt 应返回格式化字符串', () => {
    const prompt = skillRegistry.buildSkillListForPrompt();
    expect(prompt).toContain('可用技能列表');
    expect(prompt).toContain('invoke_skill');
  });
});
