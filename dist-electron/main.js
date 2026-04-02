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
const os_1 = __importDefault(require("os"));
let mainWindow = null;
const ptys = new Map();
const conversationHistory = new Map();
// Per-session agent identity (system prompt)
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
    conversationHistory.delete(sessionId);
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
        // Agent session: store identity and initialize history; actual PTY spawned on first write-pty.
        const history = [];
        conversationHistory.set(sessionId, history);
        agentIdentity.set(sessionId, initialPrompt);
        jsonLineBuffer.set(sessionId, '');
        // No PTY spawned here — write-pty handles that lazily
        return { success: true };
    }
    // No initialPrompt — interactive terminal for CodeMonitor (plain PTY)
    const args = useCmd ? ['/c', claudeCmd] : [claudeCmd];
    const pty = (0, node_pty_1.spawn)(claudePath, args, { cwd: resolvedCwd, env: ptyEnv });
    ptys.set(sessionId, pty);
    conversationHistory.set(sessionId, []);
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
        conversationHistory.delete(sessionId);
        jsonLineBuffer.delete(sessionId);
    });
    return { success: true, pid: pty.pid };
});
electron_1.ipcMain.handle('write-pty', async (_event, sessionId, data, initialPrompt) => {
    // Lazy initialization: if no PTY exists for this session, initialize the history
    // and identity. This handles the race where handleSend fires before start-pty completes.
    if (!conversationHistory.has(sessionId)) {
        conversationHistory.set(sessionId, []);
        jsonLineBuffer.set(sessionId, '');
    }
    if (initialPrompt && !agentIdentity.has(sessionId)) {
        agentIdentity.set(sessionId, initialPrompt);
    }
    // Kill any existing PTY process for this session before spawning new turn
    const existing = ptys.get(sessionId);
    if (existing) {
        try {
            existing.kill();
        }
        catch { /* ignore */ }
        ptys.delete(sessionId);
    }
    jsonLineBuffer.delete(sessionId);
    const savedSettings = store?.get('settings') ?? defaultSettings;
    const resolvedClaCliPath = savedSettings.claudeCliPath?.trim() || '';
    const resolvedCwd = savedSettings.claudeWorkDir?.trim() || os_1.default.homedir();
    const ptyEnv = {
        ...process.env,
        MINIMAX_API_KEY: savedSettings.minimaxApiKey || process.env.MINIMAX_API_KEY || '',
        MINIMAX_APP_ID: savedSettings.minimaxAppId || process.env.MINIMAX_APP_ID || '',
    };
    const history = conversationHistory.get(sessionId);
    const identity = agentIdentity.get(sessionId) ?? '';
    // Build full prompt: agent identity (if first turn) + conversation history + new user message
    const historyText = history.length > 0
        ? '\n\nConversation so far:\n' + history.map(h => `${h.role === 'user' ? 'User' : 'Assistant'}: ${h.content}`).join('\n')
        : '';
    const firstTurnPrefix = history.length === 0 && identity ? identity + '\n\n' : '';
    const fullPrompt = firstTurnPrefix + historyText + '\n\nUser: ' + data;
    // Add user message to history
    history.push({ role: 'user', content: data });
    const useCmd = process.platform === 'win32';
    const claudeCmd = resolvedClaCliPath || 'claude';
    const claudePath = useCmd ? 'cmd.exe' : claudeCmd;
    const args = useCmd
        ? ['/c', claudeCmd, '-p', '--verbose', '--output-format', 'stream-json', '--no-session-persistence', '--', fullPrompt]
        : [claudeCmd, '-p', '--verbose', '--output-format', 'stream-json', '--no-session-persistence', '--', fullPrompt];
    const pty = (0, node_pty_1.spawn)(claudePath, args, { cwd: resolvedCwd, env: ptyEnv });
    ptys.set(sessionId, pty);
    jsonLineBuffer.set(sessionId, '');
    pty.onData((data) => {
        // Accumulate raw PTY output, parse NDJSON lines
        const buffered = (jsonLineBuffer.get(sessionId) ?? '') + data;
        jsonLineBuffer.set(sessionId, buffered);
        const lines = buffered.split(/\r?\n/);
        jsonLineBuffer.set(sessionId, lines.pop() ?? '');
        for (const line of lines) {
            if (!line.trim())
                continue;
            try {
                const event = JSON.parse(line);
                // Forward full event for raw JSON logging (on separate channel)
                mainWindow?.webContents.send('claude-stream', { sessionId, event });
                // Extract clean text and send via pty-data for display
                if (event.type === 'result' && event.result !== undefined) {
                    const result = event.result ?? '';
                    history.push({ role: 'assistant', content: result });
                    // Send each line of the result as a pty-data entry
                    const textLines = result.split('\n').filter(l => l.trim());
                    for (const tl of textLines) {
                        mainWindow?.webContents.send('pty-data', { sessionId, data: tl });
                    }
                    // Parse trabajo_terminado
                    if (result.includes('trabajo_terminado=true')) {
                        mainWindow?.webContents.send('trabajo-terminado', { sessionId, value: true });
                    }
                    else if (result.includes('trabajo_terminado=false')) {
                        mainWindow?.webContents.send('trabajo-terminado', { sessionId, value: false });
                    }
                }
                // Also extract streaming text from content_block_delta if available
                if (event.type === 'content_block_delta') {
                    const delta = event.delta;
                    if (delta?.text) {
                        const textLines = delta.text.split('\n').filter(l => l.trim());
                        for (const tl of textLines) {
                            mainWindow?.webContents.send('pty-data', { sessionId, data: tl });
                        }
                    }
                }
            }
            catch { /* incomplete JSON — will be processed when more data arrives */ }
        }
    });
    pty.onExit(({ exitCode }) => {
        jsonLineBuffer.delete(sessionId);
        mainWindow?.webContents.send('pty-exit', { sessionId, exitCode });
        ptys.delete(sessionId);
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
    const pty = ptys.get(sessionId);
    if (pty) {
        pty.kill();
        ptys.delete(sessionId);
        conversationHistory.delete(sessionId);
        agentIdentity.delete(sessionId);
        jsonLineBuffer.delete(sessionId);
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
