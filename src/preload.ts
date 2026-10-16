import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("bpoTime", {
  minimize: () => ipcRenderer.send("panel:minimize"),
  canMinimize: () => ipcRenderer.invoke("minimize:get"),
  onCanMinimize: (fn: (can: boolean) => void) => ipcRenderer.on("minimize:available", (_e, can: boolean) => fn(can)),
  openPortal: (page?: string, id?: string) => ipcRenderer.send("portal:open", page, id),
  appVersion: () => ipcRenderer.invoke("app:version"),
  onUpdateReady: (fn: (version: string) => void) => ipcRenderer.on("update:ready", (_e, v: string) => fn(v)),
  installUpdate: () => ipcRenderer.send("update:install"),
  getFeed: () => ipcRenderer.invoke("feed:get"),
  onFeed: (fn: (f: unknown) => void) => ipcRenderer.on("feed:state", (_e, f) => fn(f)),
  getCounts:() => ipcRenderer.invoke("counts:get"),
  onCounts: (fn: (c: unknown) => void) => ipcRenderer.on("counts:state", (_e, c) => fn(c)),
  quit: () => ipcRenderer.send("app:quit"),
  getAuth: () => ipcRenderer.invoke("auth:get"),
  onAuth: (fn: (state: unknown) => void) => ipcRenderer.on("auth:state", (_e, state) => fn(state)),
  onToast: (fn: (message: string, error: boolean) => void) =>
    ipcRenderer.on("toast", (_e, message: string, error: boolean) => fn(message, error)),
  signOut: () => ipcRenderer.send("auth:signout"),
  getAttendance: () => ipcRenderer.invoke("attendance:get"),
  onAttendance: (fn: (a: unknown) => void) => ipcRenderer.on("attendance:state", (_e, a) => fn(a)),
  clockIn: () => ipcRenderer.invoke("attendance:clockIn"),
  clockOut: () => ipcRenderer.invoke("attendance:clockOut"),
  startBreak: (slot: string, copy: boolean) => ipcRenderer.invoke("attendance:startBreak", slot, copy),
  endBreak: (copy: boolean) => ipcRenderer.invoke("attendance:endBreak", copy),
});
