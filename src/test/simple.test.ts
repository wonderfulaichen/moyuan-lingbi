import { describe, it, expect } from 'vitest';

describe('简单测试验证', () => {
  it('1 + 1 应该等于 2', () => {
    expect(1 + 1).toBe(2);
  });

  it('字符串匹配测试', () => {
    expect('墨渊灵笔').toContain('墨渊');
  });
});
