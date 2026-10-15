import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("bpoTime", {
  setCollapsed: (collapsed: boolean) => ipcRenderer.send("panel:collapsed", collapsed),
  setHeight: (height: number) => ipcRenderer.send("panel:height", height),
  minimize: () => ipcRenderer.send("panel:minimize"),
  openPortal: () => ipcRenderer.send("portal:open"),
  quit: () => ipcRenderer.send("app:quit"),
});
