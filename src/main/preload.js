const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // 文件系统操作
  getAppDataPath: () => ipcRenderer.invoke('get-app-data-path'),
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
  writeFile: (filePath, data) => ipcRenderer.invoke('write-file', filePath, data),
  exists: (filePath) => ipcRenderer.invoke('file-exists', filePath),
  unlink: (filePath) => ipcRenderer.invoke('delete-file', filePath),

  // 对话框
  openFileDialog: (options) => ipcRenderer.invoke('open-file-dialog', options),
  saveFileDialog: (options) => ipcRenderer.invoke('save-file-dialog', options),

  // 应用信息
  getVersion: () => process.versions.electron,
  getPlatform: () => process.platform,

  // 窗口控制
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
});
