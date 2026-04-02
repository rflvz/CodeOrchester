import { contextBridge, ipcRenderer } from 'electron';

export interface AppSettings {
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

export interface SystemMetrics {
  cpuPercent: number;
  memoryMB: number;
  memoryTotalMB: number;
}

export interface ElectronAPI {
  startPty: (sessionId: string, cwd?: string, initialPrompt?: string) => Promise<{ success: boolean; pid?: number; error?: string }>;
  writePty: (sessionId: string, data: string) => Promise<{ success: boolean; error?: string }>;
  resizePty: (sessionId: string, cols: number, rows: number) => Promise<{ success: boolean; error?: string }>;
  killPty: (sessionId: string) => Promise<{ success: boolean; error?: string }>;
  showNotification: (title: string, body: string) => Promise<{ success: boolean; error?: string }>;
  openExternal: (url: string) => Promise<{ success: boolean }>;
  onPtyData: (callback: (data: { sessionId: string; data: string }) => void) => void;
  onPtyExit: (callback: (data: { sessionId: string; exitCode: number }) => void) => void;
  onTrabajoTerminado: (callback: (data: { sessionId: string; value: boolean }) => void) => void;
  onClaudeAwaitingInput: (callback: (data: { sessionId: string }) => void) => void;
  windowMinimize: () => Promise<void>;
  windowMaximize: () => Promise<void>;
  windowClose: () => Promise<void>;
  windowIsMaximized: () => Promise<boolean>;
  onWindowMaximized: (callback: (maximized: boolean) => void) => void;
  getSettings: () => Promise<AppSettings>;
  setSettings: (updates: Partial<AppSettings>) => Promise<{ success: boolean }>;
  getAgentState: () => Promise<Record<string, unknown>>;
  setAgentState: (agents: Record<string, unknown>) => Promise<{ success: boolean }>;
  getSystemMetrics: () => Promise<SystemMetrics>;
}

const api: ElectronAPI = {
  startPty: (sessionId, cwd, initialPrompt) => ipcRenderer.invoke('start-pty', sessionId, cwd, initialPrompt),
  writePty: (sessionId, data) => ipcRenderer.invoke('write-pty', sessionId, data),
  resizePty: (sessionId, cols, rows) => ipcRenderer.invoke('resize-pty', sessionId, cols, rows),
  killPty: (sessionId) => ipcRenderer.invoke('kill-pty', sessionId),
  showNotification: (title, body) => ipcRenderer.invoke('show-notification', title, body),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  onPtyData: (callback) => {
    ipcRenderer.removeAllListeners('pty-data');
    ipcRenderer.on('pty-data', (_event, data) => callback(data));
  },
  onPtyExit: (callback) => {
    ipcRenderer.removeAllListeners('pty-exit');
    ipcRenderer.on('pty-exit', (_event, data) => callback(data));
  },
  onTrabajoTerminado: (callback) => {
    ipcRenderer.removeAllListeners('trabajo-terminado');
    ipcRenderer.on('trabajo-terminado', (_event, data) => callback(data));
  },
  onClaudeAwaitingInput: (callback) => {
    ipcRenderer.removeAllListeners('claude-awaiting-input');
    ipcRenderer.on('claude-awaiting-input', (_event, data) => callback(data));
  },
  windowMinimize: () => ipcRenderer.invoke('window-minimize'),
  windowMaximize: () => ipcRenderer.invoke('window-maximize'),
  windowClose: () => ipcRenderer.invoke('window-close'),
  windowIsMaximized: () => ipcRenderer.invoke('window-is-maximized'),
  onWindowMaximized: (callback) => {
    ipcRenderer.removeAllListeners('window-maximized');
    ipcRenderer.on('window-maximized', (_event, maximized) => callback(maximized));
  },
  getSettings: () => ipcRenderer.invoke('get-settings'),
  setSettings: (updates) => ipcRenderer.invoke('set-settings', updates),
  getAgentState: () => ipcRenderer.invoke('get-agent-state'),
  setAgentState: (agents) => ipcRenderer.invoke('set-agent-state', agents),
  getSystemMetrics: () => ipcRenderer.invoke('get-system-metrics'),
};

contextBridge.exposeInMainWorld('electron', api);
