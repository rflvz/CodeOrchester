import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { Agent, AgentStatus } from '../types';
import { electronStorage } from './electronStorage';
import { useTeamStore } from './teamStore';
import { useFreeConnectionStore } from './freeConnectionStore';

interface AgentStore {
  agents: Record<string, Agent>;
  activeAgentId: string | null;

  createAgent: (agent: Omit<Agent, 'id' | 'createdAt'>) => Agent;
  updateAgent: (id: string, updates: Partial<Agent>) => void;
  deleteAgent: (id: string) => void;
  setActiveAgent: (id: string | null) => void;
  setTrabajoTerminado: (id: string, value: boolean) => void;
  setAgentStatus: (id: string, status: AgentStatus) => void;
}

const generateId = () => crypto.randomUUID();

export const useAgentStore = create<AgentStore>()(
  persist(
    (set, _get) => ({
      agents: {},
      activeAgentId: null,

      createAgent: (agentData) => {
        const id = generateId();
        const agent: Agent = {
          ...agentData,
          id,
          createdAt: new Date(),
        };
        set((state) => ({
          agents: { ...state.agents, [id]: agent },
        }));
        return agent;
      },

      updateAgent: (id, updates) => {
        set((state) => {
          const agent = state.agents[id];
          if (!agent) return state;
          return {
            agents: {
              ...state.agents,
              [id]: { ...agent, ...updates },
            },
          };
        });
      },

      deleteAgent: (id) => {
        // Bug 1 + Bug 2: clean team references and team/free connections before removing the agent
        const teams = useTeamStore.getState().teams;
        for (const team of Object.values(teams)) {
          if (team.agents.includes(id)) {
            useTeamStore.getState().removeAgentFromTeam(id, team.id);
          }
        }
        const freeConnections = useFreeConnectionStore.getState().connections;
        for (const conn of freeConnections) {
          if (conn.fromAgentId === id || conn.toAgentId === id) {
            useFreeConnectionStore.getState().removeConnection(conn.id);
          }
        }

        set((state) => {
          const { [id]: _, ...rest } = state.agents;
          return {
            agents: rest,
            activeAgentId: state.activeAgentId === id ? null : state.activeAgentId,
          };
        });
      },

      setActiveAgent: (id) => {
        set({ activeAgentId: id });
      },

      setTrabajoTerminado: (id, value) => {
        set((state) => {
          const agent = state.agents[id];
          if (!agent) return state;
          const status: AgentStatus = value ? 'success' : 'idle';
          return {
            agents: {
              ...state.agents,
              [id]: { ...agent, trabajoTerminado: value, status },
            },
          };
        });
      },

      setAgentStatus: (id, status) => {
        set((state) => {
          const agent = state.agents[id];
          if (!agent) return state;
          return {
            agents: {
              ...state.agents,
              [id]: { ...agent, status },
            },
          };
        });
      },
    }),
    {
      name: 'agent-store',
      storage: createJSONStorage(() => electronStorage),
      partialize: (state) => ({ agents: state.agents }),
    }
  )
);
