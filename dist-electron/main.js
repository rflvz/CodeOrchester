"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
const node_pty_1 = require("node-pty");
const os_1 = __importDefault(require("os"));
let mainWindow = null;
const ptys = new Map();
const isDev = process.env.NODE_ENV === 'development' || !electron_1.app.isPackaged;
function createWindow() {
    mainWindow = new electron_1.BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1024,
        minHeight: 700,
        backgroundColor: '#0c0e11',
        webPreferences: {
            preload: path_1.default.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
        show: false,
    });
    mainWindow.once('ready-to-show', () => {
        mainWindow?.show();
    });
    if (isDev) {
        mainWindow.loadURL('http://localhost:5173');
        mainWindow.webContents.openDevTools();
    }
    else {
        mainWindow.loadFile(path_1.default.join(__dirname, '../dist/index.html'));
    }
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}
electron_1.app.whenReady().then(() => {
    createWindow();
    electron_1.app.on('activate', () => {
        if (electron_1.BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});
electron_1.app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        electron_1.app.quit();
    }
});
// IPC Handlers
electron_1.ipcMain.handle('start-pty', async (_event, sessionId, cwd) => {
    const shell = process.platform === 'win32' ? 'powershell.exe' : 'bash';
    const pty = (0, node_pty_1.spawn)(shell, [], {
        cwd: cwd || os_1.default.homedir(),
        env: {
            ...process.env,
            MINIMAX_API_KEY: process.env.MINIMAX_API_KEY || '',
        },
    });
    ptys.set(sessionId, pty);
    pty.onData((data) => {
        mainWindow?.webContents.send('pty-data', { sessionId, data });
        // Parse trabajo_terminado flag
        if (data.includes('trabajo_terminado=true')) {
            mainWindow?.webContents.send('trabajo-terminado', { sessionId, value: true });
        }
        else if (data.includes('trabajo_terminado=false')) {
            mainWindow?.webContents.send('trabajo-terminado', { sessionId, value: false });
        }
    });
    pty.onExit(({ exitCode }) => {
        mainWindow?.webContents.send('pty-exit', { sessionId, exitCode });
        ptys.delete(sessionId);
    });
    return { success: true, pid: pty.pid };
});
electron_1.ipcMain.handle('write-pty', async (_event, sessionId, data) => {
    const pty = ptys.get(sessionId);
    if (pty) {
        pty.write(data);
        return { success: true };
    }
    return { success: false, error: 'Session not found' };
});
electron_1.ipcMain.handle('resize-pty', async (_event, sessionId, cols, rows) => {
    const pty = ptys.get(sessionId);
    if (pty) {
        pty.resize(cols, rows);
        return { success: true };
    }
    return { success: false, error: 'Session not found' };
});
electron_1.ipcMain.handle('kill-pty', async (_event, sessionId) => {
    const pty = ptys.get(sessionId);
    if (pty) {
        pty.kill();
        ptys.delete(sessionId);
        return { success: true };
    }
    return { success: false, error: 'Session not found' };
});
electron_1.ipcMain.handle('show-notification', async (_event, title, body) => {
    if (electron_1.Notification.isSupported()) {
        new electron_1.Notification({ title, body }).show();
        return { success: true };
    }
    return { success: false, error: 'Notifications not supported' };
});
electron_1.ipcMain.handle('open-external', async (_event, url) => {
    await electron_1.shell.openExternal(url);
    return { success: true };
});
