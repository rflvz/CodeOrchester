/// <reference types="vite/client" />

declare global {
  interface Window {
    electron?: {
      startPty: (sessionId: string, cwd?: string, initialPrompt?: string) => Promise<{ success: boolean; pid?: number; error?: string }>;
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
      getSettings: () => Promise<Record<string, unknown>>;
      setSettings: (updates: Record<string, unknown>) => Promise<{ success: boolean }>;
      getAgentState: () => Promise<Record<string, unknown>>;
      setAgentState: (agents: Record<string, unknown>) => Promise<{ success: boolean }>;
      getSystemMetrics: () => Promise<{ cpuPercent: number; memoryMB: number; memoryTotalMB: number }>;
    };
  }
}

export {};
