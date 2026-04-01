import { app, BrowserWindow, ipcMain, Notification, shell } from 'electron';
import path from 'path';
import { spawn, IPty } from 'node-pty';
import os from 'os';

let mainWindow: BrowserWindow | null = null;
const ptys: Map<string, IPty> = new Map();

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: '#0c0e11',
    frame: false,
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
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
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.on('maximize', () => {
    mainWindow?.webContents.send('window-maximized', true);
  });
  mainWindow.on('unmaximize', () => {
    mainWindow?.webContents.send('window-maximized', false);
  });
  mainWindow.on('restore', () => {
    mainWindow?.webContents.send('window-maximized', false);
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC Handlers
ipcMain.handle('start-pty', async (_event, sessionId: string, cwd: string) => {
  // Kill any existing session with the same ID to prevent leaks
  const existing = ptys.get(sessionId);
  if (existing) {
    try { existing.kill(); } catch { /* ignore */ }
    ptys.delete(sessionId);
  }

  const shell = process.platform === 'win32' ? 'powershell.exe' : 'bash';
  const pty = spawn(shell, [], {
    cwd: cwd || os.homedir(),
    env: {
      ...process.env,
      MINIMAX_API_KEY: process.env.MINIMAX_API_KEY || '',
    } as Record<string, string>,
  });

  ptys.set(sessionId, pty);

  pty.onData((data) => {
    mainWindow?.webContents.send('pty-data', { sessionId, data });

    // Parse trabajo_terminado flag
    if (data.includes('trabajo_terminado=true')) {
      mainWindow?.webContents.send('trabajo-terminado', { sessionId, value: true });
    } else if (data.includes('trabajo_terminado=false')) {
      mainWindow?.webContents.send('trabajo-terminado', { sessionId, value: false });
    }
  });

  pty.onExit(({ exitCode }) => {
    mainWindow?.webContents.send('pty-exit', { sessionId, exitCode });
    ptys.delete(sessionId);
  });

  return { success: true, pid: pty.pid };
});

ipcMain.handle('write-pty', async (_event, sessionId: string, data: string) => {
  const pty = ptys.get(sessionId);
  if (pty) {
    pty.write(data);
    return { success: true };
  }
  return { success: false, error: 'Session not found' };
});

ipcMain.handle('resize-pty', async (_event, sessionId: string, cols: number, rows: number) => {
  const pty = ptys.get(sessionId);
  if (pty) {
    pty.resize(cols, rows);
    return { success: true };
  }
  return { success: false, error: 'Session not found' };
});

ipcMain.handle('kill-pty', async (_event, sessionId: string) => {
  const pty = ptys.get(sessionId);
  if (pty) {
    pty.kill();
    ptys.delete(sessionId);
    return { success: true };
  }
  return { success: false, error: 'Session not found' };
});

ipcMain.handle('show-notification', async (_event, title: string, body: string) => {
  if (Notification.isSupported()) {
    new Notification({ title, body }).show();
    return { success: true };
  }
  return { success: false, error: 'Notifications not supported' };
});

ipcMain.handle('open-external', async (_event, url: string) => {
  await shell.openExternal(url);
  return { success: true };
});

ipcMain.handle('window-minimize', () => {
  mainWindow?.minimize();
});

ipcMain.handle('window-maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow?.restore();
  } else {
    mainWindow?.maximize();
  }
});

ipcMain.handle('window-close', () => {
  mainWindow?.close();
});

ipcMain.handle('window-is-maximized', () => {
  return mainWindow?.isMaximized() ?? false;
});
