const { contextBridge, ipcRenderer } = require('electron');

function subscribeToChannel(channel, handler) {
  const listener = (_event, payload) => handler(payload);
  ipcRenderer.on(channel, listener);
  return () => {
    ipcRenderer.removeListener(channel, listener);
  };
}
