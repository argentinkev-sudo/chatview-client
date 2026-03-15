const { app, BrowserWindow, session, ipcMain, desktopCapturer, shell } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');

// Configuration auto-updater
autoUpdater.autoDownload = true;  // Ne pas télécharger automatiquement
autoUpdater.autoInstallOnAppQuit = true;  // Installer au redémarrage

// Ouvrir les liens dans le navigateur externe
ipcMain.handle('open-external', async (event, url) => {
  await shell.openExternal(url);
});

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


// Événements auto-updater
autoUpdater.on('update-available', (info) => {
  console.log('Mise à jour disponible:', info.version);
  // TODO: Afficher une notification à l'utilisateur
});

autoUpdater.on('update-not-available', () => {
  console.log('Application à jour');
});

autoUpdater.on('download-progress', (progress) => {
  console.log(`Téléchargement: ${Math.round(progress.percent)}%`);
});

autoUpdater.on('update-downloaded', () => {
  console.log('Mise à jour téléchargée, redémarrage...');
  // false = ne pas forcer la fermeture, true = redémarrage silencieux
  autoUpdater.quitAndInstall(false, true);
});

// Gérer la demande de sources d'écran
ipcMain.handle('get-desktop-sources', async () => {
  const sources = await desktopCapturer.getSources({ 
    types: ['screen', 'window'],
    thumbnailSize: { width: 150, height: 150 }
  });
  return sources;
});

app.on('ready', () => {
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    if (['media', 'microphone', 'camera', 'desktopCapture'].includes(permission)) return callback(true);
    callback(false);
  });
  createWindow();
  
  // Vérifier les updates 5 secondes après le lancement
  setTimeout(() => {
    autoUpdater.checkForUpdates();
  }, 5000);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});