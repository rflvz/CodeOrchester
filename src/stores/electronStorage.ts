import { StateStorage } from 'zustand/middleware';

export const electronStorage: StateStorage = {
  getItem: async (_key: string) => {
    const electron = (window as Window & {
      electron?: {
        getAgentState: () => Promise<Record<string, unknown>>;
      };
    }).electron;
    if (!electron) return null;
    const agents = await electron.getAgentState();
    return JSON.stringify({ state: { agents, activeAgentId: null }, version: 0 });
  },
  setItem: async (_key: string, value: string) => {
    const electron = (window as Window & {
      electron?: {
        setAgentState: (a: Record<string, unknown>) => Promise<{ success: boolean }>;
      };
    }).electron;
    if (!electron) return;
    const parsed = JSON.parse(value) as { state: { agents: Record<string, unknown> } };
    await electron.setAgentState(parsed.state.agents);
  },
  removeItem: async (_key: string) => {
    const electron = (window as Window & {
      electron?: {
        setAgentState: (a: Record<string, unknown>) => Promise<{ success: boolean }>;
      };
    }).electron;
    if (!electron) return;
    await electron.setAgentState({});
  },
};
