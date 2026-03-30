/// <reference types="vite/client" />

declare global {
  interface Window {
    electron?: {
      startPty: (sessionId: string, cwd?: string) => Promise<{ success: boolean; pid?: number; error?: string }>;
      writePty: (sessionId: string, data: string) => Promise<{ success: boolean; error?: string }>;
      resizePty: (sessionId: string, cols: number, rows: number) => Promise<{ success: boolean; error?: string }>;
      killPty: (sessionId: string) => Promise<{ success: boolean; error?: string }>;
      showNotification: (title: string, body: string) => Promise<{ success: boolean; error?: string }>;
      onPtyData: (callback: (data: { sessionId: string; data: string }) => void) => void;
      onPtyExit: (callback: (data: { sessionId: string; exitCode: number }) => void) => void;
      onTrabajoTerminado: (callback: (data: { sessionId: string; value: boolean }) => void) => void;
    };
  }
}

export {};
