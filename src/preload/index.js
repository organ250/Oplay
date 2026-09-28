import { contextBridge, ipcRenderer, webUtils } from 'electron'

contextBridge.exposeInMainWorld('oplay', {
  openFiles: () => ipcRenderer.invoke('dialog:open-files'),
  openFolder: () => ipcRenderer.invoke('dialog:open-folder'),
  openSubtitle: () => ipcRenderer.invoke('dialog:open-subtitle'),
  readSubtitle: (p) => ipcRenderer.invoke('subtitle:read', p),
  findSubtitle: (p) => ipcRenderer.invoke('subtitle:find', p),
  expandPaths: (paths) => ipcRenderer.invoke('fs:expand', paths),
  getLaunchFiles: () => ipcRenderer.invoke('app:launch-files'),
  pathForFile: (file) => webUtils.getPathForFile(file),
  onOpenFiles: (cb) => {
    const h = (_e, files) => cb(files)
    ipcRenderer.on('app:open-files', h)
    return () => ipcRenderer.removeListener('app:open-files', h)
  }
})
