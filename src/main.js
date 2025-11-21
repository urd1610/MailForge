const path = require('path');
const { app, BrowserWindow, ipcMain } = require('electron');
const { watchThunderbirdMail, getAvailableMailDirectories } = require('./thunderbird');

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
function startThunderbirdWatcher(selectedPaths = null) {
  console.log('Starting Thunderbird watcher...', selectedPaths ? `with selected paths: ${selectedPaths.join(', ')}` : 'with all paths');
  if (stopWatchingMail) {
    console.log('Already watching.');
    return { ok: true, message: 'already watching' };
  }

  try {
    const { stop, watchedPaths } = watchThunderbirdMail({
      selectedPaths,
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
    
    // エラーコードに基づいて詳細情報を追加
    let errorMessage = error.message;
    if (error.code === 'NO_PROFILE') {
      errorMessage = `${error.message}\n\n💡 対処法:\n1. Thunderbirdをインストールして起動してください\n2. メールアカウントを設定してください\n3. 少なくとも1回はメールを受信してください`;
    } else if (error.code === 'NO_MAIL_DIRECTORIES') {
      errorMessage = `${error.message}\n\n💡 対処法:\n1. Thunderbirdでメールアカウントを設定してください\n2. 少なくとも1通のメールを受信してください\n3. メールフォルダが作成されるのを確認してください`;
    } else if (error.code === 'WATCH_FAILED') {
      errorMessage = `${error.message}\n\n💡 対処法:\n1. Thunderbirdを再起動してください\n2. 管理者権限でMailForgeを再実行してください\n3. ウイルス対策ソフトの設定を確認してください`;
    }
    
    return { ok: false, message: errorMessage, code: error.code };
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
  ipcMain.handle('thunderbird-watch-start', (event, selectedPaths = null) => startThunderbirdWatcher(selectedPaths));
  ipcMain.handle('thunderbird-watch-stop', () => stopThunderbirdWatcher());
  
  // 利用可能なメールディレクトリ一覧を取得
  ipcMain.handle('thunderbird-get-directories', () => {
    try {
      const directories = getAvailableMailDirectories();
      return { ok: true, directories };
    } catch (error) {
      console.error('Failed to get directories:', error);
      return { ok: false, message: error.message, code: error.code };
    }
  });
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
