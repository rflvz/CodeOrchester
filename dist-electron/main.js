"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
const node_pty_1 = require("node-pty");
const child_process_1 = require("child_process");
const os_1 = __importDefault(require("os"));
let mainWindow = null;
const ptys = new Map();
// Agent sessions use child_process (clean pipes, no ANSI pollution from PTY)
const agentProcs = new Map();
// Per-session Claude CLI session UUIDs for --resume persistence
// sessionId (PTY/agent) → claudeUUID (passed to --session-id / --resume)
const claudeSessionIds = new Map();
// Per-session agent identity (system prompt for first turn)
const agentIdentity = new Map();
// Per-session line buffer for NDJSON parsing (claude -p --output-format stream-json)
const jsonLineBuffer = new Map();
const defaultSettings = {
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
let store = null;
async function initStore() {
    const { default: Store } = await Promise.resolve().then(() => __importStar(require('electron-store')));
    store = new Store({ defaults: { settings: defaultSettings, agents: {} } });
}
const isDev = process.env.NODE_ENV === 'development' || !electron_1.app.isPackaged;
function createWindow() {
    mainWindow = new electron_1.BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1024,
        minHeight: 700,
        backgroundColor: '#0c0e11',
        frame: false,
        titleBarStyle: 'hidden',
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
electron_1.app.whenReady().then(async () => {
    await initStore();
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
// IPC Handlers — settings and agent persistence
electron_1.ipcMain.handle('get-settings', () => {
    const saved = store?.get('settings') ?? {};
    return { ...defaultSettings, ...saved };
});
electron_1.ipcMain.handle('set-settings', (_event, updates) => {
    const current = store?.get('settings') ?? defaultSettings;
    store?.set('settings', { ...current, ...updates });
    return { success: true };
});
electron_1.ipcMain.handle('get-agent-state', () => {
    return store?.get('agents') ?? {};
});
electron_1.ipcMain.handle('set-agent-state', (_event, agents) => {
    store?.set('agents', agents);
    return { success: true };
});
electron_1.ipcMain.handle('get-system-metrics', () => {
    const mem = process.memoryUsage();
    const cpus = os_1.default.cpus();
    const load = cpus.reduce((acc, cpu) => {
        const total = Object.values(cpu.times).reduce((a, b) => a + b, 0);
        return acc + ((total - cpu.times.idle) / total) * 100;
    }, 0) / cpus.length;
    return {
        cpuPercent: Math.round(load * 10) / 10,
        memoryMB: Math.round(mem.rss / 1024 / 1024),
        memoryTotalMB: Math.round(os_1.default.totalmem() / 1024 / 1024),
    };
});
// IPC Handlers — PTY
// Per-turn approach: each user message spawns a new claude -p process with full conversation history.
// This gives clean NDJSON output (no terminal chrome/echo) AND proper multi-turn context.
electron_1.ipcMain.handle('start-pty', async (_event, sessionId, cwd, initialPrompt) => {
    // Kill any existing PTY for this session
    const existing = ptys.get(sessionId);
    if (existing) {
        try {
            existing.kill();
        }
        catch { /* ignore */ }
        ptys.delete(sessionId);
    }
    jsonLineBuffer.delete(sessionId);
    claudeSessionIds.delete(sessionId);
    const savedSettings = store?.get('settings') ?? defaultSettings;
    const resolvedClaCliPath = savedSettings.claudeCliPath?.trim() || '';
    const resolvedCwd = cwd?.trim() || savedSettings.claudeWorkDir?.trim() || os_1.default.homedir();
    const ptyEnv = {
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
    const pty = (0, node_pty_1.spawn)(claudePath, args, { cwd: resolvedCwd, env: ptyEnv });
    ptys.set(sessionId, pty);
    jsonLineBuffer.set(sessionId, '');
    if (process.platform === 'win32') {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        pty.write('\r');
    }
    pty.onData((data) => {
        mainWindow?.webContents.send('pty-data', { sessionId, data });
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
        jsonLineBuffer.delete(sessionId);
    });
    return { success: true, pid: pty.pid };
});
electron_1.ipcMain.handle('write-pty', async (_event, sessionId, data, initialPrompt) => {
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
        try {
            existingProc.kill();
        }
        catch { /* ignore */ }
        agentProcs.delete(sessionId);
    }
    // Also kill any legacy PTY for this session
    const existingPty = ptys.get(sessionId);
    if (existingPty) {
        try {
            existingPty.kill();
        }
        catch { /* ignore */ }
        ptys.delete(sessionId);
    }
    jsonLineBuffer.set(sessionId, '');
    const savedSettings = store?.get('settings') ?? defaultSettings;
    const resolvedClaCliPath = savedSettings.claudeCliPath?.trim() || '';
    const resolvedCwd = savedSettings.claudeWorkDir?.trim() || os_1.default.homedir();
    const ptyEnv = {
        ...process.env,
        MINIMAX_API_KEY: savedSettings.minimaxApiKey || process.env.MINIMAX_API_KEY || '',
        MINIMAX_APP_ID: savedSettings.minimaxAppId || process.env.MINIMAX_APP_ID || '',
    };
    // Sanitize identity: newlines/special chars break argument parsing
    const identity = (agentIdentity.get(sessionId) ?? '').replace(/[\r\n]+/g, ' ').trim();
    const existingClaudeSessionId = claudeSessionIds.get(sessionId);
    const claudeCmd = resolvedClaCliPath || 'claude';
    // Pass user message via stdin to avoid shell argument quoting issues on Windows
    let cliArgs;
    if (existingClaudeSessionId) {
        cliArgs = ['-p', '--verbose', '--resume', existingClaudeSessionId,
            '--output-format', 'stream-json', '--include-partial-messages'];
    }
    else {
        const sessionUUID = crypto.randomUUID();
        claudeSessionIds.set(sessionId, sessionUUID);
        cliArgs = ['-p', '--verbose', '--session-id', sessionUUID,
            '--system-prompt', identity,
            '--output-format', 'stream-json', '--include-partial-messages'];
    }
    // Use child_process.spawn with shell:true (resolves .cmd on Windows) and piped stdio.
    // User message sent via stdin — avoids all Windows shell argument quoting issues.
    const proc = (0, child_process_1.spawn)(claudeCmd, cliArgs, {
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
    const handleNdjsonChunk = (chunk) => {
        const buffered = (jsonLineBuffer.get(sessionId) ?? '') + chunk.toString();
        jsonLineBuffer.set(sessionId, buffered);
        const lines = buffered.split(/\r?\n/);
        jsonLineBuffer.set(sessionId, lines.pop() ?? '');
        for (const line of lines) {
            if (!line.trim())
                continue;
            try {
                const event = JSON.parse(line);
                mainWindow?.webContents.send('claude-stream', { sessionId, event });
                if (event.type === 'error') {
                    const errMsg = event.error?.message
                        ?? event.message
                        ?? 'Unknown error';
                    stderrOutput += errMsg + '\n';
                    mainWindow?.webContents.send('pty-error', { sessionId, message: errMsg });
                }
                // Streaming text chunks
                if (event.type === 'content_block_delta') {
                    const delta = event.delta;
                    if (delta?.text) {
                        receivedStreamingChunks = true;
                        mainWindow?.webContents.send('pty-data', { sessionId, data: delta.text });
                    }
                }
                // Final result: always send as fallback if no streaming chunks arrived
                if (event.type === 'result') {
                    const resultSessionId = event.session_id;
                    if (resultSessionId)
                        claudeSessionIds.set(sessionId, resultSessionId);
                    const result = event.result ?? '';
                    // Use result text only if streaming didn't already deliver it
                    if (!receivedStreamingChunks && result.trim()) {
                        mainWindow?.webContents.send('pty-data', { sessionId, data: result });
                    }
                    if (result.includes('trabajo_terminado=true')) {
                        mainWindow?.webContents.send('trabajo-terminado', { sessionId, value: true });
                    }
                    else if (result.includes('trabajo_terminado=false')) {
                        mainWindow?.webContents.send('trabajo-terminado', { sessionId, value: false });
                    }
                }
            }
            catch {
                // Not JSON — plain-text error output
                stderrOutput += line + '\n';
            }
        }
    };
    proc.stdout?.on('data', handleNdjsonChunk);
    proc.stderr?.on('data', (chunk) => { stderrOutput += chunk.toString(); });
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
electron_1.ipcMain.handle('resize-pty', async (_event, sessionId, cols, rows) => {
    const pty = ptys.get(sessionId);
    if (pty) {
        pty.resize(cols, rows);
        return { success: true };
    }
    return { success: false, error: 'Session not found' };
});
electron_1.ipcMain.handle('kill-pty', async (_event, sessionId) => {
    const proc = agentProcs.get(sessionId);
    if (proc) {
        try {
            proc.kill();
        }
        catch { /* ignore */ }
        agentProcs.delete(sessionId);
    }
    const pty = ptys.get(sessionId);
    if (pty) {
        try {
            pty.kill();
        }
        catch { /* ignore */ }
        ptys.delete(sessionId);
    }
    claudeSessionIds.delete(sessionId);
    agentIdentity.delete(sessionId);
    jsonLineBuffer.delete(sessionId);
    if (proc || pty)
        return { success: true };
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
electron_1.ipcMain.handle('window-minimize', () => {
    mainWindow?.minimize();
});
electron_1.ipcMain.handle('window-maximize', () => {
    if (mainWindow?.isMaximized()) {
        mainWindow?.restore();
    }
    else {
        mainWindow?.maximize();
    }
});
electron_1.ipcMain.handle('window-close', () => {
    mainWindow?.close();
});
electron_1.ipcMain.handle('window-is-maximized', () => {
    return mainWindow?.isMaximized() ?? false;
});
