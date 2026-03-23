const { app, BrowserWindow, session, ipcMain, desktopCapturer, shell, Tray, Menu } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');

autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

let splashWindow = null;
let mainWindow = null;
let tray = null;

ipcMain.handle('open-external', async (event, url) => {
  await shell.openExternal(url);
});

function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 300,
    height: 350,
    frame: false,
    transparent: true,
    resizable: false,
    center: true,
    alwaysOnTop: true,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });
  splashWindow.loadFile('src/splash.html');
  splashWindow.once('ready-to-show', () => {
    splashWindow.show();
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      partition: 'persist:main'
    },
    backgroundColor: '#1e1f22',
    show: false
  });

  mainWindow.loadFile('src/index.html');

  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.webContents.once('did-finish-load', () => {
    setTimeout(() => {
      if (splashWindow) {
        splashWindow.close();
        splashWindow = null;
      }
      mainWindow.show();
    }, 3000);
  });
}

function createTray() {
  const iconPath = app.isPackaged 
    ? path.join(process.resourcesPath, 'icon.png')
    : path.join(__dirname, 'build/icon.png');

  tray = new Tray(iconPath);

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Ouvrir ChatView', click: () => { mainWindow.show(); } },
    { type: 'separator' },
    { label: 'Quitter', click: () => { app.isQuitting = true; app.quit(); } }
  ]);

  tray.setToolTip('ChatView');
  tray.setContextMenu(contextMenu);

  tray.on('double-click', () => {
    mainWindow.show();
  });
}

autoUpdater.on('update-available', (info) => {
  console.log('Mise à jour disponible:', info.version);
});

autoUpdater.on('update-not-available', () => {
  console.log('Application à jour');
});

autoUpdater.on('download-progress', (progress) => {
  console.log(`Téléchargement: ${Math.round(progress.percent)}%`);
});

autoUpdater.on('update-downloaded', () => {
  console.log('Mise à jour téléchargée, redémarrage...');
  app.isQuitting = true;
  autoUpdater.quitAndInstall(false, true);
});

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

  createSplashWindow();
  createWindow();
  createTray();

  setTimeout(() => {
    autoUpdater.checkForUpdates();
  }, 5000);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    if (tray) tray.destroy();
    app.quit();
  }
});