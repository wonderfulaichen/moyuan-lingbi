#!/usr/bin/env node
/**
 * 一键安装 git pre-commit hook（无 husky 依赖）
 *
 * 将 .git/hooks/pre-commit 指向 scripts/check-tailwind-colors.mjs --staged
 * 仅检测暂存区文件，性能最优。
 *
 * 用法：node scripts/install-hook.mjs
 */

import { writeFileSync, mkdirSync, existsSync, chmodSync } from 'node:fs';
import { resolve } from 'node:path';

const GIT_DIR = resolve(process.cwd(), '.git');
const HOOK_PATH = resolve(GIT_DIR, 'hooks', 'pre-commit');

const HOOK_CONTENT = `#!/bin/sh
# 自动生成于 ${new Date().toISOString()} by scripts/install-hook.mjs
# 检测暂存区文件中的 Tailwind 原生色阶类硬编码
node scripts/check-tailwind-colors.mjs --staged
`;

if (!existsSync(GIT_DIR)) {
  console.error('✗ 当前目录不是 git 仓库根目录（未找到 .git/）');
  console.error('  请在项目根目录运行：npm run setup:hooks');
  process.exit(1);
}

mkdirSync(resolve(GIT_DIR, 'hooks'), { recursive: true });
writeFileSync(HOOK_PATH, HOOK_CONTENT, { mode: 0o755 });
chmodSync(HOOK_PATH, 0o755);

console.log('✓ git pre-commit hook 已安装');
console.log(`  位置: ${HOOK_PATH}`);
console.log('  检测脚本: scripts/check-tailwind-colors.mjs --staged');
console.log('');
console.log('跳过方式: git commit --no-verify');
