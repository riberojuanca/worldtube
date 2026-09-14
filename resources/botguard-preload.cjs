const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('botguardNetwork', {
  request: (request) => ipcRenderer.invoke('worldtube:botguard:request', request)
})
