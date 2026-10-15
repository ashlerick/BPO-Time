import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("bpoTime", {
  minimize: () => ipcRenderer.send("panel:minimize"),
  openPortal: () => ipcRenderer.send("portal:open"),
  quit: () => ipcRenderer.send("app:quit"),
});
