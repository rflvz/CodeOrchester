import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { Notification } from '../types';

interface NotificationStore {
  notifications: Notification[];
  unreadCount: number;

  addNotification: (notification: Omit<Notification, 'id' | 'createdAt' | 'read'>) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearNotifications: () => void;
}

const generateId = () => crypto.randomUUID();
const countUnread = (notifications: Notification[]) => notifications.filter((n) => !n.read).length;

export const useNotificationStore = create<NotificationStore>()(
  persist(
    (set) => ({
      notifications: [],
      unreadCount: 0,

      addNotification: (notificationData) => {
        const notification: Notification = {
          ...notificationData,
          id: generateId(),
          read: false,
          createdAt: new Date(),
        };
        set((state) => {
          const notifications = [notification, ...state.notifications];
          return { notifications, unreadCount: countUnread(notifications) };
        });
      },

      markAsRead: (id) => {
        set((state) => {
          const notifications = state.notifications.map((n) =>
            n.id === id ? { ...n, read: true } : n
          );
          return { notifications, unreadCount: countUnread(notifications) };
        });
      },

      markAllAsRead: () => {
        set((state) => ({
          notifications: state.notifications.map((n) => ({ ...n, read: true })),
          unreadCount: 0,
        }));
      },

      clearNotifications: () => {
        set({ notifications: [], unreadCount: 0 });
      },
    }),
    {
      name: 'notification-store',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ notifications: state.notifications }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.unreadCount = countUnread(state.notifications);
        }
      },
    }
  )
);
