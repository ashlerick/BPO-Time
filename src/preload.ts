import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("bpoTime", {
  minimize: () => ipcRenderer.send("panel:minimize"),
  openPortal: () => ipcRenderer.send("portal:open"),
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
});
