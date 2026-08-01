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
});