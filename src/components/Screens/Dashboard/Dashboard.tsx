import { useState } from 'react';
import { Settings, Terminal, Bot } from 'lucide-react';
import { useAgentStore } from '../../../stores/agentStore';
import { useUIStore } from '../../../stores/uiStore';
import { StatusChip } from '../../Shared/StatusChip';
import { AgentAvatar } from '../../Shared/AgentAvatar';
import { CreateAgentModal } from '../../Shared/CreateAgentModal';

interface ConsoleLog {
  id: string;
  message: string;
  type: 'info' | 'debug' | 'alert' | 'success';
  timestamp: string;
}

interface Activity {
  id: string;
  time: string;
  message: string;
  status: 'SUCCESS' | 'WARNING' | 'ERROR';
}

export function Dashboard() {
  const { agents, setActiveAgent } = useAgentStore();
  const { setScreen } = useUIStore();
  const [showNewAgentModal, setShowNewAgentModal] = useState(false);

  const agentsList = Object.values(agents);

  const [consoleLogs] = useState<ConsoleLog[]>([
    { id: '1', message: 'INFO: Dispatching task 0x9AF4 to agent CORE_ORCHESTRATOR', type: 'info', timestamp: '12:45:02' },
    { id: '2', message: 'DEBUG: Memory allocation for sub-agent successful (1.2GB)', type: 'debug', timestamp: '12:45:03' },
    { id: '3', message: 'SYSTEM: Node cluster 4 health verified', type: 'success', timestamp: '12:45:05' },
    { id: '4', message: 'ALERT: High entropy detected in model inference stream', type: 'alert', timestamp: '12:45:10' },
  ]);

  const [activities] = useState<Activity[]>([
    { id: '1', time: '12:45:02', message: 'CORE_ORCHESTRATOR deployed Vision_Processor to node 7.', status: 'SUCCESS' },
    { id: '2', time: '12:42:18', message: 'SYSTEM detected anomaly in API_LATENCY [452ms]. Auto-scaling initiated.', status: 'WARNING' },
    { id: '3', time: '12:38:55', message: 'DATA_HARVESTER completed batch sync with [AWS_REGION_US_EAST].', status: 'SUCCESS' },
    { id: '4', time: '12:35:10', message: 'CODE_EXPERT_V3 successfully refactored module auth_service.py.', status: 'SUCCESS' },
  ]);

  const metrics = [
    { label: 'CPU_LOAD', value: '42.8%', icon: '⚡' },
    { label: 'MEMORY_USAGE', value: '12.4GB', icon: '💾' },
    { label: 'API_LATENCY', value: '14MS', icon: '⚡' },
    { label: 'UPTIME', value: '182HR', icon: '⏱️' },
  ];

  const getLogColor = (type: ConsoleLog['type']) => {
    switch (type) {
      case 'alert': return 'text-error';
      case 'debug': return 'text-on-surface-variant';
      case 'info': return 'text-primary';
      case 'success': return 'text-secondary';
      default: return 'text-tertiary';
    }
  };

  return (
    <div className="h-full flex flex-col bg-background text-on-surface">
      {/* Header */}
      <header className="border-b border-outline-variant/15 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-8">
            <h1 className="text-xl font-headline font-bold tracking-wide text-primary">CODEORCHESTRATOR</h1>
            <nav className="flex gap-6 text-sm">
              <button onClick={() => setScreen('dashboard')} className="text-on-surface hover:text-primary transition-colors">Dashboard</button>
              <button onClick={() => setScreen('chat')} className="text-on-surface-variant hover:text-primary transition-colors">Chat</button>
              <button onClick={() => setScreen('skills')} className="text-on-surface-variant hover:text-primary transition-colors">Skills</button>
              <button onClick={() => setScreen('codemonitor')} className="text-on-surface-variant hover:text-primary transition-colors">Monitor</button>
            </nav>
          </div>
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
            <span className="text-on-surface-variant">System_Health: <span className="text-secondary font-bold">98%</span></span>
            <span className="text-on-surface-variant">Active_Agents: <span className="text-tertiary font-bold">{agentsList.filter(a => a.status === 'active').length}</span></span>
          </div>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          {metrics.map((metric) => (
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
                  <span className="text-on-surface-variant">Sub_Agents: <span className="text-on-surface font-mono">04</span></span>
                  <span className="text-on-surface-variant">Thread_ID: <span className="text-on-surface font-mono">{agent.id.slice(0, 8).toUpperCase()}</span></span>
                </div>
              </div>
            ))
          )}

          {/* Live Console */}
          <div className="bg-surface-container p-6 rounded-md border border-outline-variant/15">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-headline font-bold text-on-surface">LIVE_CONSOLE</h2>
              <span className="flex items-center gap-1 text-xs text-secondary">
                <span className="w-2 h-2 bg-secondary rounded-full animate-pulse"></span>
                Live
              </span>
            </div>
            <div className="bg-surface-container-lowest p-4 rounded font-mono text-xs h-48 overflow-y-auto">
              <p className="text-on-surface-variant mb-2">system@codeorchester:~$ tail -f /var/log/orchestrator.log</p>
              {consoleLogs.map((log) => (
                <p key={log.id} className={`mb-1 ${getLogColor(log.type)}`}>
                  [{log.timestamp}] {log.message}
                </p>
              ))}
            </div>
          </div>
        </div>

        {/* Recent Activities */}
        <div className="bg-surface-container p-6 rounded-md border border-outline-variant/15">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-headline font-bold text-on-surface">RECENT_ACTIVITIES</h2>
            <button className="text-sm text-tertiary hover:underline">VIEW_FULL_LOG</button>
          </div>
          <div className="space-y-2 text-sm">
            {activities.map((activity) => (
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
