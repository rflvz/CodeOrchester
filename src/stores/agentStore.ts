import { create } from 'zustand';
import { Agent, AgentStatus } from '../types';

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

export const useAgentStore = create<AgentStore>((set, get) => ({
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
    const state = get();
    const agent = state.agents[id];
    if (!agent) return;

    const status: AgentStatus = value ? 'success' : 'error';

    set((state) => ({
      agents: {
        ...state.agents,
        [id]: {
          ...agent,
          trabajoTerminado: value,
          status,
        },
      },
    }));
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
}));
