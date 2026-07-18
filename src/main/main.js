const { app, BrowserWindow, dialog, nativeImage, safeStorage } = require('electron');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');

let mainWindow;

function getAppIcon() {
  if (app.isPackaged) return path.join(process.resourcesPath, 'icon.png');
  const appPath = app.getAppPath();
  const candidates = [
    path.join(appPath, 'src/assets/icon.png'),
    path.join(appPath, 'assets/icon.png'),
    path.join(__dirname, '../../src/assets/icon.png'),
    path.join(__dirname, '../assets/icon.png'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      const img = nativeImage.createFromPath(p);
      console.log(`[icon] Found: ${p}, size: ${img.getSize()}, empty: ${img.isEmpty()}`);
      return img;
    }
  }
  console.warn('[icon] No icon file found, using default');
  return undefined;
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: getAppIcon(),
    titleBarStyle: 'default',
    autoHideMenuBar: true
  });

  // 优先加载构建好的文件，无论是否打包
  const builtPath = path.join(__dirname, '../renderer/index.html');
  const devUrl = 'http://localhost:5180';

  if (app.isPackaged || fs.existsSync(builtPath)) {
    mainWindow.loadFile(builtPath).catch(err => {
      console.error('Failed to load index.html:', err);
      // 回退到 dev server
      mainWindow.loadURL(devUrl).catch(err2 => {
        console.error('Failed to load dev server:', err2);
      });
    });
  } else {
    mainWindow.loadURL(devUrl).catch(err => {
      console.error('Failed to load dev server:', err);
    });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ========== IPC 处理函数 ==========
function setupIpcHandlers() {
  const monolith = require('electron');
  const ipcMain = monolith.ipcMain;

  ipcMain.handle('get-app-data-path', () => {
    return app.getPath('userData');
  });

  ipcMain.handle('read-file', async (_event, filePath) => {
    try {
      const content = await fsp.readFile(filePath, 'utf-8');
      return content;
    } catch (error) {
      throw new Error(`Failed to read file: ${error.message}`);
    }
  });

  ipcMain.handle('write-file', async (_event, filePath, data) => {
    try {
      const dir = path.dirname(filePath);
      await fsp.mkdir(dir, { recursive: true });
      await fsp.writeFile(filePath, data, 'utf-8');
    } catch (error) {
      throw new Error(`Failed to write file: ${error.message}`);
    }
  });

  ipcMain.handle('file-exists', async (_event, filePath) => {
    try {
      await fsp.access(filePath);
      return true;
    } catch {
      return false;
    }
  });

  ipcMain.handle('delete-file', async (_event, filePath) => {
    try {
      await fsp.unlink(filePath);
    } catch (error) {
      throw new Error(`Failed to delete file: ${error.message}`);
    }
  });

  ipcMain.handle('open-file-dialog', async (_event, options) => {
    const result = await dialog.showOpenDialog(mainWindow, options);
    return result.canceled ? null : result.filePaths;
  });

  ipcMain.handle('save-file-dialog', async (_event, options) => {
    const result = await dialog.showSaveDialog(mainWindow, options);
    return result.canceled ? null : result.filePath;
  });

  ipcMain.on('window-minimize', () => {
    if (mainWindow) mainWindow.minimize();
  });

  ipcMain.on('window-maximize', () => {
    if (mainWindow) {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
      } else {
        mainWindow.maximize();
      }
    }
  });

  ipcMain.on('window-close', () => {
    if (mainWindow) mainWindow.close();
  });

  // safeStorage: OS 原生加密（Windows Credential Manager / macOS Keychain）
  ipcMain.handle('safe-storage-available', () => {
    return safeStorage.isEncryptionAvailable();
  });

  ipcMain.handle('safe-storage-encrypt', (_event, plaintext) => {
    try {
      const buf = safeStorage.encryptString(plaintext);
      return buf.toString('base64');
    } catch (err) {
      throw new Error(`safeStorage encrypt failed: ${err.message}`);
    }
  });

  ipcMain.handle('safe-storage-decrypt', (_event, base64Cipher) => {
    try {
      const buf = Buffer.from(base64Cipher, 'base64');
      return safeStorage.decryptString(buf);
    } catch (err) {
      throw new Error(`safeStorage decrypt failed: ${err.message}`);
    }
  });
}

// ========== App 生命周期 ==========
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.whenReady().then(() => {
  setupIpcHandlers();
  createWindow();
});
