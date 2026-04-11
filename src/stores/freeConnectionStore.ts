import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { AgentConnection } from '../types';

interface FreeConnectionStore {
  connections: AgentConnection[];
  addConnection: (fromAgentId: string, toAgentId: string) => void;
  removeConnection: (id: string) => void;
}

export const useFreeConnectionStore = create<FreeConnectionStore>()(
  persist(
    (set) => ({
      connections: [],

      addConnection: (fromAgentId, toAgentId) => {
        set((state) => {
          const exists = state.connections.some(
            (c) =>
              (c.fromAgentId === fromAgentId && c.toAgentId === toAgentId) ||
              (c.fromAgentId === toAgentId && c.toAgentId === fromAgentId)
          );
          if (exists) return state;
          return {
            connections: [
              ...state.connections,
              { id: crypto.randomUUID(), fromAgentId, toAgentId },
            ],
          };
        });
      },

      removeConnection: (id) => {
        set((state) => ({
          connections: state.connections.filter((c) => c.id !== id),
        }));
      },
    }),
    {
      name: 'free-connection-store',
      storage: createJSONStorage(() => localStorage),
    }
  )
);
