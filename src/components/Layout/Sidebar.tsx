import {
  LayoutDashboard,
  GitBranch,
  MessageSquare,
  Cpu,
  Users,
  Wrench,
  Workflow,
  Terminal,
  Settings,
  ChevronLeft,
  ChevronRight,
  Bell,
  Settings2,
} from 'lucide-react';
import { useUIStore, Screen } from '../../stores/uiStore';
import { useNotificationStore } from '../../stores/notificationStore';

const navItems: { id: Screen; label: string; icon: React.ReactNode }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="w-5 h-5" /> },
  { id: 'topology', label: 'Topology', icon: <GitBranch className="w-5 h-5" /> },
  { id: 'chat', label: 'Agent Chat', icon: <MessageSquare className="w-5 h-5" /> },
  { id: 'orchestration', label: 'Orchestration', icon: <Cpu className="w-5 h-5" /> },
  { id: 'agents', label: 'Agents', icon: <Users className="w-5 h-5" /> },
  { id: 'skills', label: 'Skills', icon: <Wrench className="w-5 h-5" /> },
  { id: 'skillconfig', label: 'Skill Params', icon: <Settings2 className="w-5 h-5" /> },
  { id: 'automations', label: 'Automation', icon: <Workflow className="w-5 h-5" /> },
  { id: 'codemonitor', label: 'Terminal', icon: <Terminal className="w-5 h-5" /> },
];

export function Sidebar() {
  const { currentScreen, setScreen, sidebarCollapsed, toggleSidebar } = useUIStore();
  const { unreadCount } = useNotificationStore();

  return (
    <aside
      className={`bg-surface-container-low h-full flex flex-col transition-all duration-300 ${
        sidebarCollapsed ? 'w-16' : 'w-60'
      }`}
    >
      {/* Logo */}
      <div className="h-14 flex items-center justify-between px-4 border-b border-outline-variant/15">
        {!sidebarCollapsed && (
          <span className="font-headline font-bold text-sm text-primary tracking-widest uppercase">
            CODEORCHESTRATOR
          </span>
        )}
        <button
          onClick={toggleSidebar}
          className="p-1.5 rounded hover:bg-surface-container-high transition-colors"
        >
          {sidebarCollapsed ? (
            <ChevronRight className="w-4 h-4 text-on-surface-variant" />
          ) : (
            <ChevronLeft className="w-4 h-4 text-on-surface-variant" />
          )}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-2 space-y-1">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setScreen(item.id)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors ${
              currentScreen === item.id
                ? 'bg-primary-container/20 text-primary'
                : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
            }`}
          >
            {item.icon}
            {!sidebarCollapsed && (
              <span className="font-medium text-sm uppercase tracking-wider">{item.label}</span>
            )}
          </button>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-2 border-t border-outline-variant/15 space-y-1">
        <button
          onClick={() => setScreen('settings')}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors ${
            currentScreen === 'settings'
              ? 'bg-primary-container/20 text-primary'
              : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
          }`}
        >
          <Bell className="w-5 h-5" />
          {!sidebarCollapsed && <span className="font-medium text-sm">Notificaciones</span>}
          {unreadCount > 0 && !sidebarCollapsed && (
            <span className="ml-auto bg-error text-on-error text-xs font-bold px-1.5 py-0.5 rounded-full">
              {unreadCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setScreen('settings')}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors ${
            currentScreen === 'settings'
              ? 'bg-primary-container/20 text-primary'
              : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
          }`}
        >
          <Settings className="w-5 h-5" />
          {!sidebarCollapsed && <span className="font-medium text-sm">Settings</span>}
        </button>
      </div>
    </aside>
  );
}
