const { build, Platform } = require('electron-builder');
const path = require('path');

console.log('Starting Electron build for Windows...');
console.log('Working directory:', process.cwd());

build({
  targets: Platform.WINDOWS.createTarget('portable'),
  config: {
    appId: 'com.moyuan.lingbi',
    productName: 'moyuan',
    directories: {
      output: path.join(process.cwd(), 'build', 'release'),
    },
    files: [
      'build/renderer/**/*',
      'build/main/**/*',
      'package.json',
    ],
    win: {
      target: 'portable',
      artifactName: 'moyuan-portable.exe',
    },
    asar: true,
  },
})
  .then((result) => {
    console.log('\n✅ Build successful!');
    if (result) {
      for (const r of result) {
        console.log('Output:', r);
      }
    }
  })
  .catch((error) => {
    console.error('\n❌ Build failed!');
    console.error(error);
    process.exit(1);
  });
