import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { Team, AgentConnection } from '../types';
import { createElectronStorage } from './electronStorage';

interface TeamStore {
  teams: Record<string, Team>;
  activeTeamId: string | null;

  createTeam: (team: Omit<Team, 'id' | 'createdAt'>) => Team;
  updateTeam: (id: string, updates: Partial<Team>) => void;
  deleteTeam: (id: string) => void;
  setActiveTeam: (id: string | null) => void;
  addAgentToTeam: (agentId: string, teamId: string) => void;
  removeAgentFromTeam: (agentId: string, teamId: string) => void;
  addConnection: (teamId: string, connection: Omit<AgentConnection, 'id'>) => void;
  removeConnection: (teamId: string, connectionId: string) => void;
}

const generateId = () => crypto.randomUUID();

export const useTeamStore = create<TeamStore>()(
  persist(
    (set) => ({
      teams: {},
      activeTeamId: null,

      createTeam: (teamData) => {
        const id = generateId();
        const team: Team = {
          ...teamData,
          id,
          createdAt: new Date(),
        };
        set((state) => ({
          teams: { ...state.teams, [id]: team },
        }));
        return team;
      },

      updateTeam: (id, updates) => {
        set((state) => {
          const team = state.teams[id];
          if (!team) return state;
          return {
            teams: { ...state.teams, [id]: { ...team, ...updates } },
          };
        });
      },

      deleteTeam: (id) => {
        set((state) => {
          const { [id]: _, ...rest } = state.teams;
          return {
            teams: rest,
            activeTeamId: state.activeTeamId === id ? null : state.activeTeamId,
          };
        });
      },

      setActiveTeam: (id) => {
        set({ activeTeamId: id });
      },

      addAgentToTeam: (agentId, teamId) => {
        set((state) => {
          const team = state.teams[teamId];
          if (!team || team.agents.includes(agentId)) return state;
          return {
            teams: {
              ...state.teams,
              [teamId]: { ...team, agents: [...team.agents, agentId] },
            },
          };
        });
      },

      removeAgentFromTeam: (agentId, teamId) => {
        set((state) => {
          const team = state.teams[teamId];
          if (!team) return state;
          return {
            teams: {
              ...state.teams,
              [teamId]: { ...team, agents: team.agents.filter((id) => id !== agentId) },
            },
          };
        });
      },

      addConnection: (teamId, connection) => {
        set((state) => {
          const team = state.teams[teamId];
          if (!team) return state;
          const exists = team.connections.some(
            (c) => c.fromAgentId === connection.fromAgentId && c.toAgentId === connection.toAgentId
          );
          if (exists) return state;
          return {
            teams: {
              ...state.teams,
              [teamId]: {
                ...team,
                connections: [...team.connections, { ...connection, id: generateId() }],
              },
            },
          };
        });
      },

      removeConnection: (teamId, connectionId) => {
        set((state) => {
          const team = state.teams[teamId];
          if (!team) return state;
          return {
            teams: {
              ...state.teams,
              [teamId]: {
                ...team,
                connections: team.connections.filter((c) => c.id !== connectionId),
              },
            },
          };
        });
      },
    }),
    {
      name: 'team-store',
      storage: createJSONStorage(() => createElectronStorage('team-store')),
      partialize: (state) => ({ teams: state.teams }),
    }
  )
);
