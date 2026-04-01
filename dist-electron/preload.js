"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const api = {
    startPty: (sessionId, cwd) => electron_1.ipcRenderer.invoke('start-pty', sessionId, cwd),
    writePty: (sessionId, data) => electron_1.ipcRenderer.invoke('write-pty', sessionId, data),
    resizePty: (sessionId, cols, rows) => electron_1.ipcRenderer.invoke('resize-pty', sessionId, cols, rows),
    killPty: (sessionId) => electron_1.ipcRenderer.invoke('kill-pty', sessionId),
    showNotification: (title, body) => electron_1.ipcRenderer.invoke('show-notification', title, body),
    openExternal: (url) => electron_1.ipcRenderer.invoke('open-external', url),
    onPtyData: (callback) => {
        electron_1.ipcRenderer.removeAllListeners('pty-data');
        electron_1.ipcRenderer.on('pty-data', (_event, data) => callback(data));
    },
    onPtyExit: (callback) => {
        electron_1.ipcRenderer.removeAllListeners('pty-exit');
        electron_1.ipcRenderer.on('pty-exit', (_event, data) => callback(data));
    },
    onTrabajoTerminado: (callback) => {
        electron_1.ipcRenderer.removeAllListeners('trabajo-terminado');
        electron_1.ipcRenderer.on('trabajo-terminado', (_event, data) => callback(data));
    },
    windowMinimize: () => electron_1.ipcRenderer.invoke('window-minimize'),
    windowMaximize: () => electron_1.ipcRenderer.invoke('window-maximize'),
    windowClose: () => electron_1.ipcRenderer.invoke('window-close'),
    windowIsMaximized: () => electron_1.ipcRenderer.invoke('window-is-maximized'),
    onWindowMaximized: (callback) => {
        electron_1.ipcRenderer.removeAllListeners('window-maximized');
        electron_1.ipcRenderer.on('window-maximized', (_event, maximized) => callback(maximized));
    },
};
electron_1.contextBridge.exposeInMainWorld('electron', api);
