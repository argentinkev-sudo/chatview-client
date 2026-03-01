const { app, BrowserWindow, session, ipcMain, desktopCapturer } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    backgroundColor: '#1e1f22',
    show: false
  });

  win.loadFile('src/index.html');
  win.once('ready-to-show', () => win.show());
}

// Gérer la demande de sources d'écran
ipcMain.handle('get-desktop-sources', async () => {
  const sources = await desktopCapturer.getSources({ 
    types: ['screen', 'window'],
    thumbnailSize: { width: 150, height: 150 }
  });
  return sources;
});

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    if (['media', 'microphone', 'camera', 'desktopCapture'].includes(permission)) return callback(true);
    callback(false);
  });
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});