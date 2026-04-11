import { app, BrowserWindow, ipcMain, Notification, shell } from 'electron';
import path from 'path';
import { spawn, IPty } from 'node-pty';
import { spawn as cpSpawn, ChildProcess } from 'child_process';
import os from 'os';

let mainWindow: BrowserWindow | null = null;
const ptys: Map<string, IPty> = new Map();
// Agent sessions use child_process (clean pipes, no ANSI pollution from PTY)
const agentProcs: Map<string, ChildProcess> = new Map();

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

  // Kill any existing agent child process for this session
  const existingProc = agentProcs.get(sessionId);
  if (existingProc) {
    try { existingProc.kill(); } catch { /* ignore */ }
    agentProcs.delete(sessionId);
  }
  // Also kill any legacy PTY for this session
  const existingPty = ptys.get(sessionId);
  if (existingPty) {
    try { existingPty.kill(); } catch { /* ignore */ }
    ptys.delete(sessionId);
  }
  jsonLineBuffer.set(sessionId, '');

  const savedSettings: AppSettings = store?.get('settings') ?? defaultSettings;
  const resolvedClaCliPath = savedSettings.claudeCliPath?.trim() || '';
  const resolvedCwd = savedSettings.claudeWorkDir?.trim() || os.homedir();

  const ptyEnv: NodeJS.ProcessEnv = {
    ...process.env,
    MINIMAX_API_KEY: savedSettings.minimaxApiKey || process.env.MINIMAX_API_KEY || '',
    MINIMAX_APP_ID: savedSettings.minimaxAppId || process.env.MINIMAX_APP_ID || '',
  };

  // Sanitize identity: newlines/special chars break argument parsing
  const identity = (agentIdentity.get(sessionId) ?? '').replace(/[\r\n]+/g, ' ').trim();
  const existingClaudeSessionId = claudeSessionIds.get(sessionId);

  const claudeCmd = resolvedClaCliPath || 'claude';

  // Pass user message via stdin to avoid shell argument quoting issues on Windows
  let cliArgs: string[];
  if (existingClaudeSessionId) {
    cliArgs = ['-p', '--verbose', '--resume', existingClaudeSessionId,
               '--output-format', 'stream-json', '--include-partial-messages'];
  } else {
    const sessionUUID = crypto.randomUUID();
    claudeSessionIds.set(sessionId, sessionUUID);
    cliArgs = ['-p', '--verbose', '--session-id', sessionUUID,
               '--system-prompt', identity,
               '--output-format', 'stream-json', '--include-partial-messages'];
  }

  // Use child_process.spawn with shell:true (resolves .cmd on Windows) and piped stdio.
  // User message sent via stdin — avoids all Windows shell argument quoting issues.
  const proc = cpSpawn(claudeCmd, cliArgs, {
    cwd: resolvedCwd,
    env: ptyEnv,
    shell: true,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  // Write user message to stdin and close the pipe
  proc.stdin?.write(data.trim() + '\n');
  proc.stdin?.end();
  agentProcs.set(sessionId, proc);
  jsonLineBuffer.set(sessionId, '');

  let stderrOutput = '';
  let receivedStreamingChunks = false;

  const handleNdjsonChunk = (chunk: Buffer | string) => {
    const buffered = (jsonLineBuffer.get(sessionId) ?? '') + chunk.toString();
    jsonLineBuffer.set(sessionId, buffered);
    const lines = buffered.split(/\r?\n/);
    jsonLineBuffer.set(sessionId, lines.pop() ?? '');

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const event = JSON.parse(line);
        mainWindow?.webContents.send('claude-stream', { sessionId, event });

        if (event.type === 'error') {
          const errMsg = (event as { error?: { message?: string } }).error?.message
            ?? (event as { message?: string }).message
            ?? 'Unknown error';
          stderrOutput += errMsg + '\n';
          mainWindow?.webContents.send('pty-error', { sessionId, message: errMsg });
        }

        // Streaming text chunks
        if (event.type === 'content_block_delta') {
          const delta = (event as { delta?: { type?: string; text?: string } }).delta;
          if (delta?.text) {
            receivedStreamingChunks = true;
            mainWindow?.webContents.send('pty-data', { sessionId, data: delta.text });
          }
        }

        // Final result: always send as fallback if no streaming chunks arrived
        if (event.type === 'result') {
          const resultSessionId = (event as { session_id?: string }).session_id;
          if (resultSessionId) claudeSessionIds.set(sessionId, resultSessionId);

          const result = (event as { result?: string }).result ?? '';
          // Use result text only if streaming didn't already deliver it
          if (!receivedStreamingChunks && result.trim()) {
            mainWindow?.webContents.send('pty-data', { sessionId, data: result });
          }

          if (result.includes('trabajo_terminado=true')) {
            mainWindow?.webContents.send('trabajo-terminado', { sessionId, value: true });
          } else if (result.includes('trabajo_terminado=false')) {
            mainWindow?.webContents.send('trabajo-terminado', { sessionId, value: false });
          }
        }
      } catch {
        // Not JSON — plain-text error output
        stderrOutput += line + '\n';
      }
    }
  };

  proc.stdout?.on('data', handleNdjsonChunk);
  proc.stderr?.on('data', (chunk: Buffer) => { stderrOutput += chunk.toString(); });

  proc.on('close', (exitCode) => {
    jsonLineBuffer.delete(sessionId);
    agentProcs.delete(sessionId);
    mainWindow?.webContents.send('pty-exit', { sessionId, exitCode: exitCode ?? 0 });

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
  const proc = agentProcs.get(sessionId);
  if (proc) {
    try { proc.kill(); } catch { /* ignore */ }
    agentProcs.delete(sessionId);
  }
  const pty = ptys.get(sessionId);
  if (pty) {
    try { pty.kill(); } catch { /* ignore */ }
    ptys.delete(sessionId);
  }
  claudeSessionIds.delete(sessionId);
  agentIdentity.delete(sessionId);
  jsonLineBuffer.delete(sessionId);
  if (proc || pty) return { success: true };
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
