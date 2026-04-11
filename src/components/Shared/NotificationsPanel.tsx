import { X, CheckCheck, Trash2, Bell } from 'lucide-react';
import { useNotificationStore } from '../../stores/notificationStore';
import { useUIStore } from '../../stores/uiStore';

export function NotificationsPanel() {
  const { notifications, markAsRead, markAllAsRead, clearNotifications } = useNotificationStore();
  const { notificationsPanelOpen, toggleNotificationsPanel } = useUIStore();

  if (!notificationsPanelOpen) return null;

  const typeColor: Record<string, string> = {
    info: 'text-primary',
    success: 'text-secondary',
    warning: 'text-tertiary',
    error: 'text-error',
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        onClick={toggleNotificationsPanel}
      />

      {/* Panel */}
      <div className="fixed right-0 top-0 h-full w-80 z-50 bg-surface-container-low border-l border-outline-variant/15 flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-outline-variant/15">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-primary" />
            <h2 className="font-headline font-semibold text-on-surface text-sm uppercase tracking-wider">
              Notificaciones
            </h2>
          </div>
          <button
            onClick={toggleNotificationsPanel}
            className="p-1 hover:bg-surface-container-high rounded transition-colors"
          >
            <X className="w-4 h-4 text-on-surface-variant" />
          </button>
        </div>

        {/* Actions */}
        {notifications.length > 0 && (
          <div className="flex items-center gap-2 px-4 py-2 border-b border-outline-variant/15">
            <button
              onClick={markAllAsRead}
              className="flex items-center gap-1 text-xs text-on-surface-variant hover:text-on-surface transition-colors"
            >
              <CheckCheck className="w-3 h-3" />
              Marcar todo como leído
            </button>
            <span className="text-outline-variant/30">|</span>
            <button
              onClick={clearNotifications}
              className="flex items-center gap-1 text-xs text-on-surface-variant hover:text-error transition-colors"
            >
              <Trash2 className="w-3 h-3" />
              Limpiar
            </button>
          </div>
        )}

        {/* Notifications list */}
        <div className="flex-1 overflow-auto">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-on-surface-variant gap-2">
              <Bell className="w-8 h-8 opacity-30" />
              <p className="text-sm">Sin notificaciones</p>
            </div>
          ) : (
            <div className="divide-y divide-outline-variant/10">
              {notifications.map((n) => (
                <button
                  key={n.id}
                  onClick={() => markAsRead(n.id)}
                  className={`w-full text-left px-4 py-3 hover:bg-surface-container-high transition-colors ${
                    n.read ? 'opacity-60' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-semibold uppercase tracking-wider ${typeColor[n.type] ?? 'text-on-surface'}`}>
                        {n.title}
                      </p>
                      <p className="text-xs text-on-surface-variant mt-1 truncate">{n.body}</p>
                    </div>
                    {!n.read && (
                      <span className="w-2 h-2 bg-primary rounded-full flex-shrink-0 mt-1" />
                    )}
                  </div>
                  <p className="text-[10px] text-on-surface-variant mt-1 font-mono">
                    {new Date(n.createdAt).toLocaleTimeString()}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
