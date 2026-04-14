"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const api = {
    startPty: (sessionId, cwd, initialPrompt, model) => electron_1.ipcRenderer.invoke('start-pty', sessionId, cwd, initialPrompt, model),
    writePty: (sessionId, data, initialPrompt) => electron_1.ipcRenderer.invoke('write-pty', sessionId, data, initialPrompt),
    resizePty: (sessionId, cols, rows) => electron_1.ipcRenderer.invoke('resize-pty', sessionId, cols, rows),
    killPty: (sessionId) => electron_1.ipcRenderer.invoke('kill-pty', sessionId),
    showNotification: (title, body) => electron_1.ipcRenderer.invoke('show-notification', title, body),
    openExternal: (url) => electron_1.ipcRenderer.invoke('open-external', url),
    onPtyData: (callback) => {
        const listener = (_, data) => callback(data);
        electron_1.ipcRenderer.on('pty-data', listener);
        return () => electron_1.ipcRenderer.removeListener('pty-data', listener);
    },
    onPtyExit: (callback) => {
        const listener = (_, data) => callback(data);
        electron_1.ipcRenderer.on('pty-exit', listener);
        return () => electron_1.ipcRenderer.removeListener('pty-exit', listener);
    },
    onTrabajoTerminado: (callback) => {
        const listener = (_, data) => callback(data);
        electron_1.ipcRenderer.on('trabajo-terminado', listener);
        return () => electron_1.ipcRenderer.removeListener('trabajo-terminado', listener);
    },
    onClaudeAwaitingInput: (callback) => {
        const listener = (_, data) => callback(data);
        electron_1.ipcRenderer.on('claude-awaiting-input', listener);
        return () => electron_1.ipcRenderer.removeListener('claude-awaiting-input', listener);
    },
    windowMinimize: () => electron_1.ipcRenderer.invoke('window-minimize'),
    windowMaximize: () => electron_1.ipcRenderer.invoke('window-maximize'),
    windowClose: () => electron_1.ipcRenderer.invoke('window-close'),
    windowIsMaximized: () => electron_1.ipcRenderer.invoke('window-is-maximized'),
    onWindowMaximized: (callback) => {
        const listener = (_, maximized) => callback(maximized);
        electron_1.ipcRenderer.on('window-maximized', listener);
        return () => electron_1.ipcRenderer.removeListener('window-maximized', listener);
    },
    onClaudeStream: (callback) => {
        const listener = (_, data) => callback(data);
        electron_1.ipcRenderer.on('claude-stream', listener);
        return () => electron_1.ipcRenderer.removeListener('claude-stream', listener);
    },
    onPtyError: (callback) => {
        const listener = (_, data) => callback(data);
        electron_1.ipcRenderer.on('pty-error', listener);
        return () => electron_1.ipcRenderer.removeListener('pty-error', listener);
    },
    getSettings: () => electron_1.ipcRenderer.invoke('get-settings'),
    setSettings: (updates) => electron_1.ipcRenderer.invoke('set-settings', updates),
    getAgentState: () => electron_1.ipcRenderer.invoke('get-agent-state'),
    setAgentState: (agents) => electron_1.ipcRenderer.invoke('set-agent-state', agents),
    getStoreValue: (key) => electron_1.ipcRenderer.invoke('get-store-value', key),
    setStoreValue: (key, value) => electron_1.ipcRenderer.invoke('set-store-value', key, value),
    getSystemMetrics: () => electron_1.ipcRenderer.invoke('get-system-metrics'),
    showDirectoryDialog: () => electron_1.ipcRenderer.invoke('show-directory-dialog'),
};
electron_1.contextBridge.exposeInMainWorld('electron', api);
