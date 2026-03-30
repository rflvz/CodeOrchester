import { useEffect } from 'react';
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';
import { useNotificationStore } from '../../stores/notificationStore';
import { Notification } from '../../types';

export function ToastNotification() {
  const { notifications, markAsRead, unreadCount } = useNotificationStore();

  const getIcon = (type: Notification['type']) => {
    switch (type) {
      case 'success':
        return <CheckCircle className="w-5 h-5 text-secondary" />;
      case 'error':
        return <AlertCircle className="w-5 h-5 text-error" />;
      case 'warning':
        return <AlertTriangle className="w-5 h-5 text-tertiary" />;
      default:
        return <Info className="w-5 h-5 text-primary" />;
    }
  };

  const unread = notifications.filter((n) => !n.read);

  if (unread.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {unread.slice(0, 3).map((notification) => (
        <div
          key={notification.id}
          className="bg-surface-container-highest rounded-lg p-4 shadow-lg flex items-start gap-3 animate-slide-in"
          style={{
            boxShadow: '0 40px 40px rgba(151, 169, 255, 0.06)',
          }}
        >
          {getIcon(notification.type)}
          <div className="flex-1 min-w-0">
            <p className="font-medium text-on-surface text-sm">{notification.title}</p>
            <p className="text-on-surface-variant text-xs mt-0.5 truncate">
              {notification.body}
            </p>
          </div>
          <button
            onClick={() => markAsRead(notification.id)}
            className="p-1 rounded hover:bg-surface-container transition-colors"
          >
            <X className="w-4 h-4 text-on-surface-variant" />
          </button>
        </div>
      ))}
    </div>
  );
}
