const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const ELECTRON_DIST = path.join(ROOT, 'node_modules', 'electron', 'dist');
const BUILD_DIR = path.join(ROOT, 'build');
const OUTPUT = path.join(BUILD_DIR, 'portable', '墨渊灵笔');
const RESOURCES_APP = path.join(OUTPUT, 'resources', 'app');

console.log('=== 墨渊灵笔 便携版打包 ===\n');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function copyFile(src, dest) {
  if (!fs.existsSync(src)) {
    console.log(`  ⚠ 跳过(不存在): ${path.basename(src)}`);
    return;
  }
  fs.copyFileSync(src, dest);
}

function copyDir(srcDir, destDir) {
  if (!fs.existsSync(srcDir)) return;
  ensureDir(destDir);
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const src = path.join(srcDir, entry.name);
    const dest = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      copyDir(src, dest);
    } else {
      copyFile(src, dest);
    }
  }
}

console.log('1/5 创建输出目录...');
ensureDir(OUTPUT);
ensureDir(RESOURCES_APP);
ensureDir(path.join(RESOURCES_APP, 'build', 'main'));
ensureDir(path.join(RESOURCES_APP, 'build', 'renderer'));

console.log('2/5 复制 Electron 运行时...');
const essentialFiles = [
  'chrome_100_percent.pak',
  'icudtl.dat',
  'libEGL.dll',
  'libGLESv2.dll',
  'v8_context_snapshot.bin',
  'snapshot_blob.bin',
  'resources.pak',
  'vk_swiftshader.dll',
  'vk_swiftshader_icd.json',
  'vulkan-1.dll',
  'ffmpeg.dll',
  'dxcompiler.dll',
  'dxil.dll',
  'd3dcompiler_47.dll',
  'LICENSE',
  'LICENSES.chromium.html',
  'version',
];
for (const f of essentialFiles) {
  copyFile(path.join(ELECTRON_DIST, f), path.join(OUTPUT, f));
}

console.log('3/5 复制中文语言包...');
ensureDir(path.join(OUTPUT, 'locales'));
copyFile(
  path.join(ELECTRON_DIST, 'locales', 'zh-CN.pak'),
  path.join(OUTPUT, 'locales', 'zh-CN.pak')
);

console.log('4/5 复制应用代码...');
copyDir(path.join(BUILD_DIR, 'renderer'), path.join(RESOURCES_APP, 'build', 'renderer'));
copyDir(path.join(BUILD_DIR, 'main'), path.join(RESOURCES_APP, 'build', 'main'));

const appPackage = {
  name: 'moyuan-lingbi',
  version: '0.1.0',
  main: 'build/main/main.js',
};
fs.writeFileSync(
  path.join(RESOURCES_APP, 'package.json'),
  JSON.stringify(appPackage, null, 2)
);

console.log('5/5 复制 electron.exe 并重命名...');
copyFile(path.join(ELECTRON_DIST, 'electron.exe'), path.join(OUTPUT, '墨渊灵笔.exe'));

console.log('\n✅ 打包完成！');
console.log(`\n📁 输出目录: ${OUTPUT}`);
console.log('📄 可执行文件: 墨渊灵笔.exe');
console.log('\n直接双击 墨渊灵笔.exe 即可运行！');
