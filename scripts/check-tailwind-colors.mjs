#!/usr/bin/env node
/**
 * Tailwind 原生色阶类防回退检查
 *
 * 检测 src/renderer 下的 .tsx/.ts 文件中是否引入了 text-red-400、bg-blue-50 等
 * 原生色阶类（这些类不随主题切换，会破坏主题化效果）。
 *
 * 用法：
 *   node scripts/check-tailwind-colors.mjs            # 全量扫描（检测整文件）
 *   node scripts/check-tailwind-colors.mjs --staged   # 仅检测暂存区新增行（pre-commit 用）
 *
 * --staged 模式只检测 git diff 中的 + 行，不阻塞已有代码的提交，
 * 真正实现"防回退"——阻止新增硬编码，不强制清理历史代码。
 *
 * 详见 docs/会话记录-P2-CSS硬编码修复阶段1+2-2026-07-21.md
 */

import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

// 匹配 text-red-400 / bg-blue-50 / border-amber-200 / from-emerald-600 等原生色阶类
// 不匹配 text-[var(--color-xxx)]、text-primary、text-red-DEFAULT 等
const TAILWIND_COLOR_RE =
  /\b(text|bg|border|from|to|via|shadow|ring)-(red|green|blue|yellow|amber|emerald|teal|cyan|sky|indigo|violet|purple|fuchsia|pink|rose|gray|slate|zinc|neutral|stone|orange|lime)-\d{2,3}\b/g;

// 阶段3 待处理文件（已知大量硬编码，全量扫描时豁免，staged 模式仍检测新增行）
// 阶段3 已完成：SettingsModal.tsx 和 StepWorld.tsx 已主题化，从白名单移除
const PHASE3_PENDING = new Set([
  // 如未来有新的大批量硬编码文件，可添加到此白名单
]);

// 业务色常量模块（合法使用 Tailwind 类字符串作为业务标识色，完全豁免）
const ALLOWED_MODULES = new Set([
  'src/renderer/features/settings/folderColors.ts',
]);

/** 从 git diff -U0 输出中提取新增行（+ 开头的行）及其行号 */
function extractAddedLines(diffOutput) {
  const added = [];
  let lineNum = 0;
  for (const line of diffOutput.split('\n')) {
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (hunk) {
      lineNum = parseInt(hunk[1], 10);
      continue;
    }
    if (line.startsWith('+') && !line.startsWith('+++')) {
      added.push({ line: lineNum, content: line.slice(1) });
      lineNum++;
    } else if (!line.startsWith('-')) {
      lineNum++;
    }
  }
  return added;
}

/** 获取待检测文件列表 */
function getTargetFiles(stagedOnly) {
  const cmd = stagedOnly
    ? 'git diff --cached --name-only --diff-filter=ACM'
    : 'git ls-files "src/renderer/**/*.tsx" "src/renderer/**/*.ts"';
  return execSync(cmd, { encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)
    .filter((f) => /\.(tsx|ts)$/.test(f) && f.startsWith('src/renderer/'))
    .filter((f) => !f.endsWith('.test.ts'));
}

/** 检测文件中的硬编码（staged 模式只检测新增行） */
function checkFile(relPath, stagedOnly) {
  const normalized = relPath.replace(/\\/g, '/');

  // 业务色常量模块：完全豁免
  if (ALLOWED_MODULES.has(normalized)) {
    return { file: normalized, skipped: true, matches: [] };
  }

  let linesToCheck;
  if (stagedOnly) {
    // staged 模式：只检测新增行，即使是 PHASE3_PENDING 文件也检测（防止新增硬编码）
    let diff;
    try {
      diff = execSync(`git diff --cached -U0 -- ${relPath}`, { encoding: 'utf8' });
    } catch {
      return { file: normalized, skipped: true, matches: [] };
    }
    if (!diff) return { file: normalized, skipped: true, matches: [] };
    linesToCheck = extractAddedLines(diff);
  } else {
    // 全量模式：整文件扫描，PHASE3_PENDING 文件豁免
    if (PHASE3_PENDING.has(normalized)) {
      return { file: normalized, skipped: true, matches: [] };
    }
    let content;
    try {
      content = readFileSync(relPath, 'utf8');
    } catch {
      return { file: normalized, skipped: true, matches: [] };
    }
    linesToCheck = content.split('\n').map((c, i) => ({ line: i + 1, content: c }));
  }

  const matches = [];
  for (const { line, content } of linesToCheck) {
    let m;
    TAILWIND_COLOR_RE.lastIndex = 0;
    while ((m = TAILWIND_COLOR_RE.exec(content)) !== null) {
      matches.push({ line, col: m.index + 1, text: m[0] });
    }
  }
  return { file: normalized, skipped: false, matches };
}

function main() {
  const stagedOnly = process.argv.includes('--staged');
  const files = getTargetFiles(stagedOnly);
  const results = files.map((f) => checkFile(f, stagedOnly));
  const violations = results.filter((r) => !r.skipped && r.matches.length > 0);
  const skipped = results.filter((r) => r.skipped).map((r) => r.file);

  if (violations.length === 0) {
    console.log('[lint:colors] ✓ 未发现 Tailwind 原生色阶类硬编码');
    if (skipped.length > 0 && !stagedOnly) {
      console.log(`\n已豁免 ${skipped.length} 个文件（阶段3 待处理或合法业务色模块）:`);
      skipped.forEach((f) => console.log(`  - ${f}`));
    }
    return 0;
  }

  const total = violations.reduce((sum, r) => sum + r.matches.length, 0);
  const scope = stagedOnly ? '新增' : '';
  console.log(`[lint:colors] ✗ 发现 ${total} 处${scope} Tailwind 原生色阶类硬编码:\n`);

  for (const r of violations) {
    console.log(`${r.file}:`);
    for (const m of r.matches) {
      console.log(`  L${m.line}:${m.col}  ${m.text}`);
    }
    console.log('');
  }

  console.log('请改用 CSS 变量（如 text-[var(--color-error)]、bg-[var(--color-surface-muted)]）。');
  console.log('紧急情况可用 git commit --no-verify 跳过。');
  return 1;
}

process.exit(main());
