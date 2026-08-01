const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  saveImage: (dataUrl, suggestedName) =>
    ipcRenderer.invoke('save-image', dataUrl, suggestedName),
  showInFolder: (filePath) => ipcRenderer.invoke('show-in-folder', filePath),
  platform: process.platform,
  testConnection: (provider) => ipcRenderer.invoke('test-connection', provider),
  fetchModels: (provider) => ipcRenderer.invoke('fetch-models', provider),
  generateImage: (params) => ipcRenderer.invoke('generate-image', params),
  pickImageFile: () => ipcRenderer.invoke('pick-image-file'),
  pickTextFile: () => ipcRenderer.invoke('pick-text-file'),
  savePastedImage: (dataUrl) => ipcRenderer.invoke('save-pasted-image', dataUrl),
  optimizePrompt: (params) => ipcRenderer.invoke('optimize-prompt', params),

  // ===== 自动更新（仅检测，跳转 GitHub 下载） =====
  updateGetCurrentVersion: () => ipcRenderer.invoke('update-get-current-version'),
  updateCheck: () => ipcRenderer.invoke('update-check'),
  openReleasePage: () => ipcRenderer.invoke('update-open-release-page'),
  onUpdateStatus: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('update-status', listener);
    return () => ipcRenderer.off('update-status', listener);
  },
});