import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("horizon", {
  ping: () => ipcRenderer.invoke("app:ping"),
});
