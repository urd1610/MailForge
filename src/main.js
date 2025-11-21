const path = require('path');
const { app, BrowserWindow, ipcMain } = require('electron');
const { watchThunderbirdMail } = require('./thunderbird');

let mainWindow;
let stopWatchingMail = null;

/** Create the main window that hosts the empty form UI. */
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 680,
    resizable: false,
    webPreferences: {
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/** Start watching Thunderbird mail storage and forward activity to renderer. */
function startThunderbirdWatcher() {
  console.log('Starting Thunderbird watcher...');
  if (stopWatchingMail) {
    console.log('Already watching.');
    return { ok: true, message: 'already watching' };
  }

  try {
    const { stop, watchedPaths } = watchThunderbirdMail({
      onActivity: (activity) => {
        console.log('Activity detected:', activity);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('thunderbird-mail-activity', activity);
        }
      },
      onError: (error, directory) => {
        console.error('Error in watcher:', error, directory);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('thunderbird-mail-error', {
            message: error.message,
            directory,
          });
        }
      },
    });

    console.log('Watcher started. Paths:', watchedPaths);
    stopWatchingMail = stop;
    return { ok: true, watchedPaths };
  } catch (error) {
    console.error('Failed to start watcher:', error);
    stopWatchingMail = null;
    return { ok: false, message: error.message };
  }
}

function stopThunderbirdWatcher() {
  if (stopWatchingMail) {
    stopWatchingMail();
    stopWatchingMail = null;
    return { ok: true };
  }

  return { ok: true, message: 'not watching' };
}

function registerThunderbirdWatchIpc() {
  ipcMain.handle('thunderbird-watch-start', () => startThunderbirdWatcher());
  ipcMain.handle('thunderbird-watch-stop', () => stopThunderbirdWatcher());
}

app.whenReady().then(() => {
  createMainWindow();
  registerThunderbirdWatchIpc();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    stopThunderbirdWatcher();
    app.quit();
  }
});
