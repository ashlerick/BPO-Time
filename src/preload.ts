import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("bpoTime", {
  setCollapsed: (collapsed: boolean) => ipcRenderer.send("panel:collapsed", collapsed),
  openPortal: () => ipcRenderer.send("portal:open"),
  quit: () => ipcRenderer.send("app:quit"),
});
