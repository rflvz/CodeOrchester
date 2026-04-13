import { StateStorage } from 'zustand/middleware';

type ElectronWithStorage = Window & {
  electron?: {
    getAgentState: () => Promise<Record<string, unknown>>;
    setAgentState: (a: Record<string, unknown>) => Promise<{ success: boolean }>;
    getStoreValue: (key: string) => Promise<unknown>;
    setStoreValue: (key: string, value: unknown) => Promise<{ success: boolean }>;
  };
};

// Legacy storage for agentStore — uses dedicated agent IPC calls.
export const electronStorage: StateStorage = {
  getItem: async (_key: string) => {
    const electron = (window as ElectronWithStorage).electron;
    if (!electron) return null;
    const agents = await electron.getAgentState();
    return JSON.stringify({ state: { agents, activeAgentId: null }, version: 0 });
  },
  setItem: async (_key: string, value: string) => {
    const electron = (window as ElectronWithStorage).electron;
    if (!electron) return;
    const parsed = JSON.parse(value) as { state: { agents: Record<string, unknown> } };
    await electron.setAgentState(parsed.state.agents);
  },
  removeItem: async (_key: string) => {
    const electron = (window as ElectronWithStorage).electron;
    if (!electron) return;
    await electron.setAgentState({});
  },
};

/**
 * Generic Electron-backed storage for Zustand persist middleware.
 * Data is stored via electron-store in the OS user data directory,
 * surviving renderer cache clears.
 *
 * @param storeKey - electron-store key to use (e.g. 'notification-store')
 */
export function createElectronStorage(storeKey: string): StateStorage {
  return {
    getItem: async (_key: string) => {
      const electron = (window as ElectronWithStorage).electron;
      if (!electron?.getStoreValue) return null;
      const value = await electron.getStoreValue(storeKey);
      if (value == null) return null;
      return typeof value === 'string' ? value : JSON.stringify(value);
    },
    setItem: async (_key: string, value: string) => {
      const electron = (window as ElectronWithStorage).electron;
      if (!electron?.setStoreValue) return;
      // Parse so we store a plain object, not a JSON string-of-string
      try {
        await electron.setStoreValue(storeKey, JSON.parse(value));
      } catch {
        await electron.setStoreValue(storeKey, value);
      }
    },
    removeItem: async (_key: string) => {
      const electron = (window as ElectronWithStorage).electron;
      if (!electron?.setStoreValue) return;
      await electron.setStoreValue(storeKey, null);
    },
  };
}
