import { app, BrowserWindow, ipcMain, Notification, shell } from 'electron';
import path from 'path';
import { spawn, IPty } from 'node-pty';
import os from 'os';

let mainWindow: BrowserWindow | null = null;
const ptys: Map<string, IPty> = new Map();
// Rastrear sesiones esperando respuesta de Claude — se emite 'claude-awaiting-input' cuando llega data
const awaitingResponse: Set<string> = new Set();

interface AppSettings {
  minimaxApiKey: string;
  minimaxAppId: string;
  claudeCliPath: string;
  claudeWorkDir: string;
  darkMode: boolean;
  desktopNotifications: boolean;
  notificationSound: boolean;
  fontSize: 'sm' | 'md' | 'lg';
  accentColor: 'indigo' | 'violet' | 'cyan' | 'emerald';
  density: 'compact' | 'normal' | 'relaxed';
  animationsEnabled: boolean;
}

const defaultSettings: AppSettings = {
  minimaxApiKey: '',
  minimaxAppId: '',
  claudeCliPath: 'claude',
  claudeWorkDir: '',
  darkMode: true,
  desktopNotifications: true,
  notificationSound: true,
  fontSize: 'md',
  accentColor: 'indigo',
  density: 'normal',
  animationsEnabled: true,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let store: any = null;

async function initStore() {
  const { default: Store } = await import('electron-store');
  store = new Store({ defaults: { settings: defaultSettings, agents: {} } });
}

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

app.whenReady().then(async () => {
  await initStore();
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

// IPC Handlers — settings and agent persistence
ipcMain.handle('get-settings', () => {
  const saved = store?.get('settings') ?? {};
  return { ...defaultSettings, ...saved };
});

ipcMain.handle('set-settings', (_event, updates: Partial<AppSettings>) => {
  const current = store?.get('settings') ?? defaultSettings;
  store?.set('settings', { ...current, ...updates });
  return { success: true };
});

ipcMain.handle('get-agent-state', () => {
  return store?.get('agents') ?? {};
});

ipcMain.handle('set-agent-state', (_event, agents: Record<string, unknown>) => {
  store?.set('agents', agents);
  return { success: true };
});

ipcMain.handle('get-system-metrics', () => {
  const mem = process.memoryUsage();
  const cpus = os.cpus();
  const load = cpus.reduce((acc, cpu) => {
    const total = Object.values(cpu.times).reduce((a, b) => a + b, 0);
    return acc + ((total - cpu.times.idle) / total) * 100;
  }, 0) / cpus.length;
  return {
    cpuPercent: Math.round(load * 10) / 10,
    memoryMB: Math.round(mem.rss / 1024 / 1024),
    memoryTotalMB: Math.round(os.totalmem() / 1024 / 1024),
  };
});

// IPC Handlers — PTY
ipcMain.handle('start-pty', async (_event, sessionId: string, cwd: string, initialPrompt?: string) => {
  // Kill any existing session with the same ID to prevent leaks
  const existing = ptys.get(sessionId);
  if (existing) {
    try { existing.kill(); } catch { /* ignore */ }
    ptys.delete(sessionId);
  }

  const savedSettings: AppSettings = store?.get('settings') ?? defaultSettings;
  const resolvedClaCliPath = savedSettings.claudeCliPath?.trim() || '';
  // On Windows, use cmd.exe /c to properly resolve 'claude' via PATH (just like terminal does)
  const useCmd = process.platform === 'win32';
  const claudeCmd = resolvedClaCliPath || 'claude';
  const claudePath = useCmd ? 'cmd.exe' : claudeCmd;
  const claudeArgs = useCmd ? ['/c', claudeCmd] : [];

  const ptyEnv: Record<string, string> = {
    ...process.env,
    MINIMAX_API_KEY: savedSettings.minimaxApiKey || process.env.MINIMAX_API_KEY || '',
    MINIMAX_APP_ID: savedSettings.minimaxAppId || process.env.MINIMAX_APP_ID || '',
  };

  const resolvedCwd = cwd?.trim() || savedSettings.claudeWorkDir?.trim() || os.homedir();

  const pty = spawn(claudePath, claudeArgs, {
    cwd: resolvedCwd,
    env: ptyEnv,
  });

  ptys.set(sessionId, pty);

  // Auto-accept workspace trust prompt on Windows (appears ~1s after spawn)
  if (process.platform === 'win32') {
    await new Promise<void>((resolve) => setTimeout(resolve, 1500));
    pty.write('\r'); // Accept workspace trust prompt
  }

  // Escribir el prompt inicial con el contexto del agente (instructions + skills)
  // después de que el workspace sea aceptado y Claude esté listo
  if (initialPrompt) {
    awaitingResponse.add(sessionId);
    await new Promise<void>((resolve) => setTimeout(resolve, 2500)); // Wait for Claude to fully start
    pty.write(initialPrompt + '\n');
  }

  pty.onData((data) => {
    mainWindow?.webContents.send('pty-data', { sessionId, data });

    // Si estabamos esperando respuesta de Claude, esta data es la respuesta — notificar al renderer
    if (awaitingResponse.has(sessionId)) {
      awaitingResponse.delete(sessionId);
      mainWindow?.webContents.send('claude-awaiting-input', { sessionId });
    }

    // Parse trabajo_terminado flag
    if (data.includes('trabajo_terminado=true')) {
      mainWindow?.webContents.send('trabajo-terminado', { sessionId, value: true });
    } else if (data.includes('trabajo_terminado=false')) {
      mainWindow?.webContents.send('trabajo-terminado', { sessionId, value: false });
    }
  });

  pty.onExit(({ exitCode }) => {
    awaitingResponse.delete(sessionId);
    mainWindow?.webContents.send('pty-exit', { sessionId, exitCode });
    ptys.delete(sessionId);
  });

  return { success: true, pid: pty.pid };
});

ipcMain.handle('write-pty', async (_event, sessionId: string, data: string) => {
  const pty = ptys.get(sessionId);
  if (pty) {
    awaitingResponse.add(sessionId);
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
