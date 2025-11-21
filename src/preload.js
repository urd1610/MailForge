const { contextBridge, ipcRenderer } = require('electron');

function subscribeToChannel(channel, handler) {
  const listener = (_event, payload) => handler(payload);
  ipcRenderer.on(channel, listener);
  return () => {
    ipcRenderer.removeListener(channel, listener);
  };
}

contextBridge.exposeInMainWorld('mailForge', {
  startThunderbirdWatch: () => ipcRenderer.invoke('thunderbird-watch-start'),
  stopThunderbirdWatch: () => ipcRenderer.invoke('thunderbird-watch-stop'),
  onThunderbirdMail: (handler) => subscribeToChannel('thunderbird-mail-activity', handler),
  onThunderbirdError: (handler) => subscribeToChannel('thunderbird-mail-error', handler),
});
