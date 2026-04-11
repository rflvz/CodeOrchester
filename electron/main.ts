import { app, BrowserWindow, ipcMain, Notification, shell } from 'electron';
import path from 'path';
import { spawn, IPty } from 'node-pty';
import os from 'os';

let mainWindow: BrowserWindow | null = null;
const ptys: Map<string, IPty> = new Map();

// Per-session Claude CLI session UUIDs for --resume persistence
// sessionId (PTY/agent) → claudeUUID (passed to --session-id / --resume)
const claudeSessionIds: Map<string, string> = new Map();
// Per-session agent identity (system prompt for first turn)
const agentIdentity: Map<string, string> = new Map();
// Per-session line buffer for NDJSON parsing (claude -p --output-format stream-json)
const jsonLineBuffer: Map<string, string> = new Map();

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
// Per-turn approach: each user message spawns a new claude -p process with full conversation history.
// This gives clean NDJSON output (no terminal chrome/echo) AND proper multi-turn context.

ipcMain.handle('start-pty', async (_event, sessionId: string, cwd: string, initialPrompt?: string) => {
  // Kill any existing PTY for this session
  const existing = ptys.get(sessionId);
  if (existing) {
    try { existing.kill(); } catch { /* ignore */ }
    ptys.delete(sessionId);
  }
  jsonLineBuffer.delete(sessionId);
  claudeSessionIds.delete(sessionId);

  const savedSettings: AppSettings = store?.get('settings') ?? defaultSettings;
  const resolvedClaCliPath = savedSettings.claudeCliPath?.trim() || '';
  const resolvedCwd = cwd?.trim() || savedSettings.claudeWorkDir?.trim() || os.homedir();

  const ptyEnv: Record<string, string> = {
    ...process.env,
    MINIMAX_API_KEY: savedSettings.minimaxApiKey || process.env.MINIMAX_API_KEY || '',
    MINIMAX_APP_ID: savedSettings.minimaxAppId || process.env.MINIMAX_APP_ID || '',
  };

  const useCmd = process.platform === 'win32';
  const claudeCmd = resolvedClaCliPath || 'claude';
  const claudePath = useCmd ? 'cmd.exe' : claudeCmd;

  if (initialPrompt) {
    // Agent session: store identity; actual PTY spawned on first write-pty.
    agentIdentity.set(sessionId, initialPrompt);
    jsonLineBuffer.set(sessionId, '');
    // claudeSessionIds not set yet — will be created on first write-pty

    return { success: true };
  }

  // No initialPrompt — interactive terminal for CodeMonitor (plain PTY)
  const args = useCmd ? ['/c', claudeCmd] : [claudeCmd];
  const pty = spawn(claudePath, args, { cwd: resolvedCwd, env: ptyEnv });
  ptys.set(sessionId, pty);
  jsonLineBuffer.set(sessionId, '');

  if (process.platform === 'win32') {
    await new Promise<void>((resolve) => setTimeout(resolve, 1500));
    pty.write('\r');
  }

  pty.onData((data: string) => {
    mainWindow?.webContents.send('pty-data', { sessionId, data });
    if (data.includes('trabajo_terminado=true')) {
      mainWindow?.webContents.send('trabajo-terminado', { sessionId, value: true });
    } else if (data.includes('trabajo_terminado=false')) {
      mainWindow?.webContents.send('trabajo-terminado', { sessionId, value: false });
    }
  });

  pty.onExit(({ exitCode }) => {
    mainWindow?.webContents.send('pty-exit', { sessionId, exitCode });
    ptys.delete(sessionId);
    jsonLineBuffer.delete(sessionId);
  });

  return { success: true, pid: pty.pid };
});

ipcMain.handle('write-pty', async (_event, sessionId: string, data: string, initialPrompt?: string) => {
  // Lazy initialization: handle the race where handleSend fires before start-pty completes.
  if (!jsonLineBuffer.has(sessionId)) {
    jsonLineBuffer.set(sessionId, '');
  }
  if (initialPrompt && !agentIdentity.has(sessionId)) {
    agentIdentity.set(sessionId, initialPrompt);
  }

  // Kill any existing PTY process for this session before spawning new turn
  const existing = ptys.get(sessionId);
  if (existing) {
    try { existing.kill(); } catch { /* ignore */ }
    ptys.delete(sessionId);
  }
  jsonLineBuffer.set(sessionId, '');

  const savedSettings: AppSettings = store?.get('settings') ?? defaultSettings;
  const resolvedClaCliPath = savedSettings.claudeCliPath?.trim() || '';
  const resolvedCwd = savedSettings.claudeWorkDir?.trim() || os.homedir();

  const ptyEnv: Record<string, string> = {
    ...process.env,
    MINIMAX_API_KEY: savedSettings.minimaxApiKey || process.env.MINIMAX_API_KEY || '',
    MINIMAX_APP_ID: savedSettings.minimaxAppId || process.env.MINIMAX_APP_ID || '',
  };

  const identity = agentIdentity.get(sessionId) ?? '';
  const existingClaudeSessionId = claudeSessionIds.get(sessionId);

  const useCmd = process.platform === 'win32';
  const claudeCmd = resolvedClaCliPath || 'claude';
  const claudePath = useCmd ? 'cmd.exe' : claudeCmd;

  let args: string[];
  if (existingClaudeSessionId) {
    // Subsequent turns: use --resume to continue the existing Claude CLI session
    args = useCmd
      ? ['/c', claudeCmd, '-p', '--resume', existingClaudeSessionId,
         '--output-format', 'stream-json', '--include-partial-messages', '--', data.trim()]
      : [claudeCmd, '-p', '--resume', existingClaudeSessionId,
         '--output-format', 'stream-json', '--include-partial-messages', '--', data.trim()];
  } else {
    // First turn: create a new Claude CLI session with --session-id and --system-prompt
    const sessionUUID = crypto.randomUUID();
    claudeSessionIds.set(sessionId, sessionUUID);
    args = useCmd
      ? ['/c', claudeCmd, '-p', '--session-id', sessionUUID,
         '--system-prompt', identity,
         '--output-format', 'stream-json', '--include-partial-messages', '--', data.trim()]
      : [claudeCmd, '-p', '--session-id', sessionUUID,
         '--system-prompt', identity,
         '--output-format', 'stream-json', '--include-partial-messages', '--', data.trim()];
  }

  const pty = spawn(claudePath, args, { cwd: resolvedCwd, env: ptyEnv });
  ptys.set(sessionId, pty);
  jsonLineBuffer.set(sessionId, '');

  let stderrOutput = '';

  pty.onData((rawData: string) => {
    // Accumulate raw PTY output, parse NDJSON lines
    const buffered = (jsonLineBuffer.get(sessionId) ?? '') + rawData;
    jsonLineBuffer.set(sessionId, buffered);
    const lines = buffered.split(/\r?\n/);
    jsonLineBuffer.set(sessionId, lines.pop() ?? '');

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const event = JSON.parse(line);
        // Forward full event for raw JSON logging (on separate channel)
        mainWindow?.webContents.send('claude-stream', { sessionId, event });

        // Handle error events from Claude CLI
        if (event.type === 'error') {
          const errMsg = (event as { error?: { message?: string } }).error?.message
            ?? (event as { message?: string }).message
            ?? 'Unknown error';
          stderrOutput += errMsg + '\n';
          mainWindow?.webContents.send('pty-error', { sessionId, message: errMsg });
        }

        // Extract streaming text from content_block_delta (partial messages)
        if (event.type === 'content_block_delta') {
          const delta = (event as { delta?: { type?: string; text?: string } }).delta;
          if (delta?.text) {
            const textLines = delta.text.split('\n').filter(l => l.trim());
            for (const tl of textLines) {
              mainWindow?.webContents.send('pty-data', { sessionId, data: tl });
            }
          }
        }

        // Handle assistant message events (streaming partial messages)
        if (event.type === 'assistant') {
          const content = (event as { message?: { content?: { type?: string; text?: string }[] } }).message?.content;
          if (Array.isArray(content)) {
            for (const block of content) {
              if (block.type === 'text' && block.text) {
                const textLines = block.text.split('\n').filter((l: string) => l.trim());
                for (const tl of textLines) {
                  mainWindow?.webContents.send('pty-data', { sessionId, data: tl });
                }
              }
            }
          }
        }

        // Extract clean text from the final result event
        if (event.type === 'result' && (event as { result?: string }).result !== undefined) {
          const result = (event as { result?: string }).result ?? '';

          // Update claudeSessionIds if the result carries a session_id
          const resultSessionId = (event as { session_id?: string }).session_id;
          if (resultSessionId) {
            claudeSessionIds.set(sessionId, resultSessionId);
          }

          // Send each line of the result as pty-data
          const textLines = result.split('\n').filter(l => l.trim());
          for (const tl of textLines) {
            mainWindow?.webContents.send('pty-data', { sessionId, data: tl });
          }

          // Parse trabajo_terminado
          if (result.includes('trabajo_terminado=true')) {
            mainWindow?.webContents.send('trabajo-terminado', { sessionId, value: true });
          } else if (result.includes('trabajo_terminado=false')) {
            mainWindow?.webContents.send('trabajo-terminado', { sessionId, value: false });
          }
        }
      } catch { /* incomplete JSON — will be processed when more data arrives */ }
    }
  });

  pty.onExit(({ exitCode }) => {
    jsonLineBuffer.delete(sessionId);
    mainWindow?.webContents.send('pty-exit', { sessionId, exitCode });
    ptys.delete(sessionId);

    // On non-zero exit, clear the Claude session ID so next turn starts fresh,
    // and notify the renderer about the failure.
    if (exitCode !== 0) {
      claudeSessionIds.delete(sessionId);
      const errMsg = stderrOutput.trim() || `Claude CLI exited with code ${exitCode}`;
      mainWindow?.webContents.send('pty-error', { sessionId, message: errMsg });
    }
  });

  return { success: true };
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
    claudeSessionIds.delete(sessionId);
    agentIdentity.delete(sessionId);
    jsonLineBuffer.delete(sessionId);
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
