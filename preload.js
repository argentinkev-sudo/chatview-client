const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  getDesktopSources: () => ipcRenderer.invoke('get-desktop-sources')
});