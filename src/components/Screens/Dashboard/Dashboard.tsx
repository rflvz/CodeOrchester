import { useState, useEffect } from 'react';
import { Settings, Terminal, Bot } from 'lucide-react';
import { useAgentStore } from '../../../stores/agentStore';
import { useUIStore } from '../../../stores/uiStore';
import { useTerminalStore } from '../../../stores/terminalStore';
import { StatusChip } from '../../Shared/StatusChip';
import { AgentAvatar } from '../../Shared/AgentAvatar';
import { CreateAgentModal } from '../../Shared/CreateAgentModal';

interface SystemMetrics {
  cpuPercent: number;
  memoryMB: number;
  memoryTotalMB: number;
}

export function Dashboard() {
  const { agents, setActiveAgent } = useAgentStore();
  const { setScreen } = useUIStore();
  const { recentLogs } = useTerminalStore();
  const [showNewAgentModal, setShowNewAgentModal] = useState(false);
  const [showAllActivities, setShowAllActivities] = useState(false);
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [uptimeStart] = useState(() => Date.now());
  const [uptime, setUptime] = useState(0);

  const agentsList = Object.values(agents);
  const activeCount = agentsList.filter((a) => a.status === 'active').length;
  const systemHealth = agentsList.length === 0
    ? 100
    : Math.round((agentsList.filter((a) => a.status !== 'error').length / agentsList.length) * 100);

  // Poll system metrics every 5s
  useEffect(() => {
    const fetchMetrics = async () => {
      if (!window.electron?.getSystemMetrics) return;
      const m = await window.electron.getSystemMetrics();
      setMetrics(m);
    };
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 5000);
    return () => clearInterval(interval);
  }, []);

  // Track uptime in hours
  useEffect(() => {
    const interval = setInterval(() => {
      setUptime(Math.floor((Date.now() - uptimeStart) / 3600000 * 100) / 100);
    }, 60000);
    return () => clearInterval(interval);
  }, [uptimeStart]);

  const metricCards = [
    {
      label: 'CPU_LOAD',
      value: metrics ? `${metrics.cpuPercent.toFixed(1)}%` : '—',
      icon: '⚡',
    },
    {
      label: 'MEMORY_USAGE',
      value: metrics ? `${metrics.memoryMB}MB` : '—',
      icon: '💾',
    },
    {
      label: 'ACTIVE_AGENTS',
      value: String(activeCount),
      icon: '🤖',
    },
    {
      label: 'UPTIME',
      value: uptime < 1 ? '<1HR' : `${uptime.toFixed(1)}HR`,
      icon: '⏱️',
    },
  ];

  const getLogColor = (line: string) => {
    if (line.includes('ERROR') || line.includes('ALERT') || line.includes('error')) return 'text-error';
    if (line.includes('DEBUG') || line.includes('debug')) return 'text-on-surface-variant';
    if (line.includes('SUCCESS') || line.includes('success')) return 'text-secondary';
    return 'text-primary';
  };

  const consoleLogs = recentLogs.slice(-20);

  // Derive activities from agent status — show each agent's last known state
  const activities = agentsList
    .filter((a) => a.status !== 'idle')
    .map((a) => ({
      id: a.id,
      time: new Date().toLocaleTimeString(),
      message: `${a.name}: ${a.currentTask ?? 'status=' + a.status}`,
      status: a.status === 'error' ? 'ERROR' as const
        : a.status === 'active' || a.status === 'processing' ? 'WARNING' as const
        : 'SUCCESS' as const,
    }));

  return (
    <div className="h-full flex flex-col bg-background text-on-surface">
      {/* Header — no duplicate nav buttons */}
      <header className="border-b border-outline-variant/15 px-6 py-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-headline font-bold tracking-wide text-primary">CODEORCHESTRATOR</h1>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setShowNewAgentModal(true)}
              className="btn-primary text-sm"
            >
              + NEW_AGENT
            </button>
            <div className="flex gap-2">
              <button
                onClick={() => setScreen('settings')}
                className="p-2 hover:bg-surface-container rounded transition-colors"
              >
                <Settings className="w-4 h-4 text-on-surface-variant" />
              </button>
              <button
                onClick={() => setScreen('codemonitor')}
                className="p-2 hover:bg-surface-container rounded transition-colors"
              >
                <Terminal className="w-4 h-4 text-on-surface-variant" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-6">
        {/* Status Bar */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-6">
            <div className="text-sm">
              <span className="text-on-surface-variant">OPERATOR_01</span>
              <span className="ml-2 px-2 py-0.5 bg-primary-container text-on-primary text-xs rounded font-medium">Admin Access</span>
            </div>
            <span className="text-lg font-headline font-bold text-on-surface">CODEORCHESTRATOR</span>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-on-surface-variant">System_Health: <span className="text-secondary font-bold">{systemHealth}%</span></span>
            <span className="text-on-surface-variant">Active_Agents: <span className="text-tertiary font-bold">{activeCount}</span></span>
          </div>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          {metricCards.map((metric) => (
            <div key={metric.label} className="bg-surface-container p-4 rounded-md border border-outline-variant/15">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-on-surface-variant uppercase tracking-wider font-mono">{metric.label}</span>
                <span>{metric.icon}</span>
              </div>
              <span className="text-2xl font-headline font-bold text-tertiary">{metric.value}</span>
            </div>
          ))}
        </div>

        {/* Main Content Grid - Agent Cards */}
        <div className="grid grid-cols-2 gap-6 mb-6">
          {agentsList.length === 0 ? (
            <div className="col-span-2 bg-surface-container p-8 rounded-md border border-outline-variant/15 text-center">
              <Bot className="w-12 h-12 text-on-surface-variant mx-auto mb-4" />
              <p className="text-on-surface-variant">No hay agentes configurados</p>
              <p className="text-on-surface-variant text-sm mt-1">Crea tu primer agente para comenzar</p>
              <button
                onClick={() => setShowNewAgentModal(true)}
                className="mt-4 btn-primary text-sm"
              >
                + NEW_AGENT
              </button>
            </div>
          ) : (
            agentsList.slice(0, 4).map((agent) => (
              <div
                key={agent.id}
                className="bg-surface-container p-6 rounded-md border border-outline-variant/15 cursor-pointer hover:border-primary/30 transition-colors"
                onClick={() => setActiveAgent(agent.id)}
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <AgentAvatar name={agent.name} size="md" />
                    <h2 className="text-lg font-headline font-bold text-on-surface">{agent.name}</h2>
                  </div>
                  <StatusChip
                    status={agent.status}
                    trabajoTerminado={agent.trabajoTerminado}
                    size="sm"
                  />
                </div>
                <p className="text-sm text-on-surface-variant mb-4">{agent.description || 'Sin descripción'}</p>
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-on-surface-variant">Sub_Agents: <span className="text-on-surface font-mono">{String(agentsList.length).padStart(2, '0')}</span></span>
                  <span className="text-on-surface-variant">Thread_ID: <span className="text-on-surface font-mono">{agent.id.slice(0, 8).toUpperCase()}</span></span>
                </div>
              </div>
            ))
          )}

          {/* Live Console — streams from terminalStore */}
          <div className="bg-surface-container p-6 rounded-md border border-outline-variant/15">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-headline font-bold text-on-surface">LIVE_CONSOLE</h2>
              <span className="flex items-center gap-1 text-xs text-secondary">
                <span className="w-2 h-2 bg-secondary rounded-full animate-pulse"></span>
                Live
              </span>
            </div>
            <div className="bg-surface-container-lowest p-4 rounded font-mono text-xs h-48 overflow-y-auto">
              {consoleLogs.length === 0 ? (
                <p className="text-on-surface-variant">system@codeorchester:~$ Esperando output de agentes...</p>
              ) : (
                consoleLogs.map((log, i) => (
                  <p key={i} className={`mb-1 ${getLogColor(log.line)}`}>
                    [{log.ts}] {log.line}
                  </p>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Recent Activities — derived from agentStore state */}
        <div className="bg-surface-container p-6 rounded-md border border-outline-variant/15">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-headline font-bold text-on-surface">RECENT_ACTIVITIES</h2>
            <button
              onClick={() => setShowAllActivities((v) => !v)}
              className="text-sm text-tertiary hover:underline"
            >
              {showAllActivities ? 'COLLAPSE_LOG' : 'VIEW_FULL_LOG'}
            </button>
          </div>
          {activities.length === 0 ? (
            <p className="text-on-surface-variant text-sm">Sin actividad reciente. Los cambios de estado de los agentes aparecerán aquí.</p>
          ) : (
            <div className="space-y-2 text-sm">
              {(showAllActivities ? activities : activities.slice(0, 3)).map((activity) => (
                <div key={activity.id} className="flex items-center gap-4 p-3 bg-surface-container-low rounded">
                  <span className="text-on-surface-variant font-mono text-xs">{activity.time}</span>
                  <span className="flex-1 text-on-surface">{activity.message}</span>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                    activity.status === 'SUCCESS'
                      ? 'bg-secondary/20 text-secondary'
                      : activity.status === 'WARNING'
                      ? 'bg-tertiary/20 text-tertiary'
                      : 'bg-error/20 text-error'
                  }`}>
                    {activity.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* New Agent Modal */}
      <CreateAgentModal
        isOpen={showNewAgentModal}
        onClose={() => setShowNewAgentModal(false)}
      />
    </div>
  );
}
