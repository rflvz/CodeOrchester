import { create } from 'zustand';
import { TerminalSession } from '../types';

export interface PtyLogEntry {
  sessionId: string;
  line: string;
  ts: string;
  isError?: boolean;
}

const MAX_RECENT_LOGS = 100;

// agentSessionMap: agentId → sessionId. Used by App.tsx (TODO #4) and AgentChat (TODO #5)
// to resolve which PTY session belongs to which agent.
interface TerminalStore {
  sessions: Record<string, TerminalSession>;
  activeSessionId: string | null;
  recentLogs: PtyLogEntry[];
  agentSessionMap: Record<string, string>;

  createSession: (session: Omit<TerminalSession, 'id'>) => TerminalSession;
  closeSession: (id: string) => void;
  setActiveSession: (id: string | null) => void;
  updateSession: (id: string, updates: Partial<TerminalSession>) => void;
  pushLogs: (sessionId: string, data: string) => void;
  pushError: (sessionId: string, message: string) => void;
  registerAgentSession: (agentId: string, sessionId: string) => void;
  unregisterAgentSession: (agentId: string) => void;
  getSessionIdByAgentId: (agentId: string) => string | undefined;
}

const generateId = () => crypto.randomUUID();

export const useTerminalStore = create<TerminalStore>((set, get) => ({
  sessions: {},
  activeSessionId: null,
  recentLogs: [],
  agentSessionMap: {},

  createSession: (sessionData) => {
    const id = generateId();
    const session: TerminalSession = { ...sessionData, id };
    set((state) => ({
      sessions: { ...state.sessions, [id]: session },
      activeSessionId: id,
    }));
    return session;
  },

  closeSession: (id) => {
    set((state) => {
      const { [id]: _, ...rest } = state.sessions;
      return {
        sessions: rest,
        activeSessionId: state.activeSessionId === id ? null : state.activeSessionId,
      };
    });
  },

  setActiveSession: (id) => {
    set({ activeSessionId: id });
  },

  updateSession: (id, updates) => {
    set((state) => {
      const session = state.sessions[id];
      if (!session) return state;
      return {
        sessions: { ...state.sessions, [id]: { ...session, ...updates } },
      };
    });
  },

  pushLogs: (sessionId, data) => {
    const ts = new Date().toISOString();
    // Strip ANSI escape codes before storing
    const clean = data
      .replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '')
      .replace(/\x1b\]0;.*?\x07/g, '')
      .replace(/\x1b\]9;.*?\x07/g, '')
      .replace(/\x1b\][^\x07]*\x07/g, '');
    const lines = clean.split(/\r?\n/).filter((l) => {
      const t = l.trim();
      if (t.length === 0) return false;
      // Filter Claude CLI UI chrome: box-drawing-only lines, keyboard hints, status dots, × artifacts
      if (/^[\u2500-\u257F\s\-=*#]+$/.test(t)) return false;
      if (/ctrl\+\w/i.test(t)) return false;
      if (/^\s*[●•◆▸]/.test(t)) return false;
      if (/[×]{2,}/.test(t)) return false;
      return true;
    });
    if (lines.length === 0) return;
    const entries: PtyLogEntry[] = lines.map((line) => ({ sessionId, line, ts }));
    set((state) => {
      const updated = [...state.recentLogs, ...entries];
      return { recentLogs: updated.slice(-MAX_RECENT_LOGS) };
    });
  },

  pushError: (sessionId, message) => {
    const ts = new Date().toISOString();
    const entry: PtyLogEntry = { sessionId, line: message, ts, isError: true };
    set((state) => {
      const updated = [...state.recentLogs, entry];
      return { recentLogs: updated.slice(-MAX_RECENT_LOGS) };
    });
  },

  registerAgentSession: (agentId, sessionId) => {
    set((state) => ({
      agentSessionMap: { ...state.agentSessionMap, [agentId]: sessionId },
    }));
  },

  unregisterAgentSession: (agentId) => {
    set((state) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { [agentId]: _, ...rest } = state.agentSessionMap;
      return { agentSessionMap: rest };
    });
  },

  getSessionIdByAgentId: (agentId) => get().agentSessionMap[agentId],
}));
