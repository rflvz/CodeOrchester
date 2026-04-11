import { create } from 'zustand';

export type Screen = 'dashboard' | 'topology' | 'chat' | 'orchestration' | 'agents' | 'skills' | 'skillconfig' | 'automations' | 'codemonitor' | 'settings';

interface UIStore {
  currentScreen: Screen;
  sidebarCollapsed: boolean;
  rightPanelOpen: boolean;
  rightPanelContent: 'terminal' | 'details' | 'none';
  notificationsPanelOpen: boolean;

  setScreen: (screen: Screen) => void;
  toggleSidebar: () => void;
  setRightPanel: (open: boolean, content?: 'terminal' | 'details') => void;
  toggleNotificationsPanel: () => void;
}

export const useUIStore = create<UIStore>((set) => ({
  currentScreen: 'dashboard',
  sidebarCollapsed: false,
  rightPanelOpen: false,
  rightPanelContent: 'none',
  notificationsPanelOpen: false,

  setScreen: (screen) => {
    set({ currentScreen: screen });
  },

  toggleSidebar: () => {
    set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed }));
  },

  setRightPanel: (open, content = 'details') => {
    set({ rightPanelOpen: open, rightPanelContent: content });
  },

  toggleNotificationsPanel: () => {
    set((state) => ({ notificationsPanelOpen: !state.notificationsPanelOpen }));
  },
}));
