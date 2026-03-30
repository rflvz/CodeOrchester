import { create } from 'zustand';
import { TerminalSession } from '../types';

interface TerminalStore {
  sessions: Record<string, TerminalSession>;
  activeSessionId: string | null;

  createSession: (session: Omit<TerminalSession, 'id'>) => TerminalSession;
  closeSession: (id: string) => void;
  setActiveSession: (id: string | null) => void;
  updateSession: (id: string, updates: Partial<TerminalSession>) => void;
}

const generateId = () => crypto.randomUUID();

export const useTerminalStore = create<TerminalStore>((set) => ({
  sessions: {},
  activeSessionId: null,

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
}));
