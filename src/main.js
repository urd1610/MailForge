const path = require('path');
const { app, BrowserWindow } = require('electron');

/** Create the main window that hosts the empty form UI. */
function createMainWindow() {
  const window = new BrowserWindow({
    width: 900,
    height: 680,
    resizable: false,
    webPreferences: {
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  window.loadFile(path.join(__dirname, 'index.html'));
}

app.whenReady().then(() => {
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
