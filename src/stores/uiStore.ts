import { create } from 'zustand';

export type Screen = 'dashboard' | 'topology' | 'chat' | 'agents' | 'skills' | 'skillconfig' | 'automations' | 'codemonitor' | 'settings';

interface UIStore {
  currentScreen: Screen;
  sidebarCollapsed: boolean;
  rightPanelOpen: boolean;
  rightPanelContent: 'terminal' | 'details' | 'none';

  setScreen: (screen: Screen) => void;
  toggleSidebar: () => void;
  setRightPanel: (open: boolean, content?: 'terminal' | 'details') => void;
}

export const useUIStore = create<UIStore>((set) => ({
  currentScreen: 'dashboard',
  sidebarCollapsed: false,
  rightPanelOpen: false,
  rightPanelContent: 'none',

  setScreen: (screen) => {
    set({ currentScreen: screen });
  },

  toggleSidebar: () => {
    set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed }));
  },

  setRightPanel: (open, content = 'details') => {
    set({ rightPanelOpen: open, rightPanelContent: content });
  },
}));
