import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

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
  startPty: (sessionId: string, cwd?: string, initialPrompt?: string, model?: string) => Promise<{ success: boolean; pid?: number; error?: string }>;
  writePty: (sessionId: string, data: string, initialPrompt?: string) => Promise<{ success: boolean; error?: string }>;
  resizePty: (sessionId: string, cols: number, rows: number) => Promise<{ success: boolean; error?: string }>;
  killPty: (sessionId: string) => Promise<{ success: boolean; error?: string }>;
  showNotification: (title: string, body: string) => Promise<{ success: boolean; error?: string }>;
  openExternal: (url: string) => Promise<{ success: boolean }>;
  onPtyData: (callback: (data: { sessionId: string; data: string }) => void) => () => void;
  onPtyExit: (callback: (data: { sessionId: string; exitCode: number }) => void) => () => void;
  onTrabajoTerminado: (callback: (data: { sessionId: string; value: boolean }) => void) => () => void;
  onClaudeAwaitingInput: (callback: (data: { sessionId: string }) => void) => () => void;
  windowMinimize: () => Promise<void>;
  windowMaximize: () => Promise<void>;
  windowClose: () => Promise<void>;
  windowIsMaximized: () => Promise<boolean>;
  onWindowMaximized: (callback: (maximized: boolean) => void) => () => void;
  onClaudeStream: (callback: (data: { sessionId: string; event: Record<string, unknown> }) => void) => () => void;
  onPtyError: (callback: (data: { sessionId: string; message: string }) => void) => () => void;
  getSettings: () => Promise<AppSettings>;
  setSettings: (updates: Partial<AppSettings>) => Promise<{ success: boolean; error?: string }>;
  getAgentState: () => Promise<Record<string, unknown>>;
  setAgentState: (agents: Record<string, unknown>) => Promise<{ success: boolean; error?: string }>;
  getStoreValue: (key: string) => Promise<unknown>;
  setStoreValue: (key: string, value: unknown) => Promise<{ success: boolean; error?: string }>;
  getSystemMetrics: () => Promise<SystemMetrics>;
  showDirectoryDialog: () => Promise<string | null>;
}

const api: ElectronAPI = {
  startPty: (sessionId, cwd, initialPrompt, model) => ipcRenderer.invoke('start-pty', sessionId, cwd, initialPrompt, model),
  writePty: (sessionId, data, initialPrompt) => ipcRenderer.invoke('write-pty', sessionId, data, initialPrompt),
  resizePty: (sessionId, cols, rows) => ipcRenderer.invoke('resize-pty', sessionId, cols, rows),
  killPty: (sessionId) => ipcRenderer.invoke('kill-pty', sessionId),
  showNotification: (title, body) => ipcRenderer.invoke('show-notification', title, body),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  onPtyData: (callback) => {
    const listener = (_: IpcRendererEvent, data: { sessionId: string; data: string }) => callback(data);
    ipcRenderer.on('pty-data', listener);
    return () => ipcRenderer.removeListener('pty-data', listener);
  },
  onPtyExit: (callback) => {
    const listener = (_: IpcRendererEvent, data: { sessionId: string; exitCode: number }) => callback(data);
    ipcRenderer.on('pty-exit', listener);
    return () => ipcRenderer.removeListener('pty-exit', listener);
  },
  onTrabajoTerminado: (callback) => {
    const listener = (_: IpcRendererEvent, data: { sessionId: string; value: boolean }) => callback(data);
    ipcRenderer.on('trabajo-terminado', listener);
    return () => ipcRenderer.removeListener('trabajo-terminado', listener);
  },
  onClaudeAwaitingInput: (callback) => {
    const listener = (_: IpcRendererEvent, data: { sessionId: string }) => callback(data);
    ipcRenderer.on('claude-awaiting-input', listener);
    return () => ipcRenderer.removeListener('claude-awaiting-input', listener);
  },
  windowMinimize: () => ipcRenderer.invoke('window-minimize'),
  windowMaximize: () => ipcRenderer.invoke('window-maximize'),
  windowClose: () => ipcRenderer.invoke('window-close'),
  windowIsMaximized: () => ipcRenderer.invoke('window-is-maximized'),
  onWindowMaximized: (callback) => {
    const listener = (_: IpcRendererEvent, maximized: boolean) => callback(maximized);
    ipcRenderer.on('window-maximized', listener);
    return () => ipcRenderer.removeListener('window-maximized', listener);
  },
  onClaudeStream: (callback) => {
    const listener = (_: IpcRendererEvent, data: { sessionId: string; event: Record<string, unknown> }) => callback(data);
    ipcRenderer.on('claude-stream', listener);
    return () => ipcRenderer.removeListener('claude-stream', listener);
  },
  onPtyError: (callback) => {
    const listener = (_: IpcRendererEvent, data: { sessionId: string; message: string }) => callback(data);
    ipcRenderer.on('pty-error', listener);
    return () => ipcRenderer.removeListener('pty-error', listener);
  },
  getSettings: () => ipcRenderer.invoke('get-settings'),
  setSettings: (updates) => ipcRenderer.invoke('set-settings', updates),
  getAgentState: () => ipcRenderer.invoke('get-agent-state'),
  setAgentState: (agents) => ipcRenderer.invoke('set-agent-state', agents),
  getStoreValue: (key) => ipcRenderer.invoke('get-store-value', key),
  setStoreValue: (key, value) => ipcRenderer.invoke('set-store-value', key, value),
  getSystemMetrics: () => ipcRenderer.invoke('get-system-metrics'),
  showDirectoryDialog: () => ipcRenderer.invoke('show-directory-dialog'),
};

contextBridge.exposeInMainWorld('electron', api);
