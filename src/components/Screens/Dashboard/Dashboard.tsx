import { useState } from 'react';
import { Plus, Search, Bot, Users, Wrench, Activity } from 'lucide-react';
import { useAgentStore } from '../../../stores/agentStore';
import { useTeamStore } from '../../../stores/teamStore';
import { useSkillStore } from '../../../stores/skillStore';
import { StatusChip } from '../../Shared/StatusChip';
import { AgentAvatar } from '../../Shared/AgentAvatar';
import { GlassModal } from '../../Shared/GlassModal';

export function Dashboard() {
  const { agents, createAgent, setActiveAgent } = useAgentStore();
  const { teams } = useTeamStore();
  const { skills } = useSkillStore();
  const [showNewAgentModal, setShowNewAgentModal] = useState(false);
  const [newAgentName, setNewAgentName] = useState('');

  const agentsList = Object.values(agents);
  const teamsList = Object.values(teams);
  const skillsList = Object.values(skills);

  const handleCreateAgent = () => {
    if (!newAgentName.trim()) return;
    createAgent({
      name: newAgentName,
      description: 'New agent',
      status: 'idle',
      teamId: null,
      skills: [],
      currentTask: null,
      trabajoTerminado: true,
    });
    setNewAgentName('');
    setShowNewAgentModal(false);
  };

  const stats = [
    { label: 'Total Agents', value: agentsList.length, icon: <Bot className="w-5 h-5" />, color: 'text-primary' },
    { label: 'Active', value: agentsList.filter((a) => a.status === 'active').length, icon: <Activity className="w-5 h-5" />, color: 'text-secondary' },
    { label: 'Teams', value: teamsList.length, icon: <Users className="w-5 h-5" />, color: 'text-tertiary' },
    { label: 'Skills', value: skillsList.length, icon: <Wrench className="w-5 h-5" />, color: 'text-primary' },
  ];

  return (
    <div className="h-full p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-headline font-bold text-on-surface">Dashboard de Orquestación</h1>
          <p className="text-on-surface-variant text-sm mt-1">Gestiona tus agentes y equipos</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant" />
            <input
              type="text"
              placeholder="Buscar agentes..."
              className="pl-10 pr-4 py-2 bg-surface-container rounded-md text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:ring-2 focus:ring-primary/50 w-64"
            />
          </div>
          <button
            onClick={() => setShowNewAgentModal(true)}
            className="btn-primary flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Nuevo Agente
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {stats.map((stat) => (
          <div key={stat.label} className="agent-card">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-on-surface-variant text-xs uppercase tracking-wide">{stat.label}</p>
                <p className={`text-3xl font-headline font-bold mt-1 ${stat.color}`}>{stat.value}</p>
              </div>
              <div className={`p-3 rounded-md bg-surface-container-low ${stat.color}`}>
                {stat.icon}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Agents Grid */}
      <div>
        <h2 className="text-lg font-headline font-semibold text-on-surface mb-4">Agentes Activos</h2>
        {agentsList.length === 0 ? (
          <div className="agent-card text-center py-12">
            <Bot className="w-12 h-12 text-on-surface-variant mx-auto mb-4" />
            <p className="text-on-surface-variant">No hay agentes creados</p>
            <p className="text-on-surface-variant text-sm mt-1">Crea tu primer agente para comenzar</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-4">
            {agentsList.map((agent) => (
              <div
                key={agent.id}
                className="agent-card cursor-pointer hover:bg-surface-container-high transition-colors"
                onClick={() => setActiveAgent(agent.id)}
              >
                <div className="flex items-start gap-3">
                  <AgentAvatar name={agent.name} size="lg" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <h3 className="font-headline font-semibold text-on-surface truncate">
                        {agent.name}
                      </h3>
                      <StatusChip
                        status={agent.status}
                        trabajoTerminado={agent.trabajoTerminado}
                        size="sm"
                      />
                    </div>
                    <p className="text-on-surface-variant text-sm mt-1 truncate">
                      {agent.description}
                    </p>
                    {agent.teamId && (
                      <p className="text-primary text-xs mt-2">
                        Team: {teams[agent.teamId]?.name || 'Unknown'}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* New Agent Modal */}
      <GlassModal
        isOpen={showNewAgentModal}
        onClose={() => setShowNewAgentModal(false)}
        title="Crear Nuevo Agente"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-on-surface mb-2">
              Nombre del Agente
            </label>
            <input
              type="text"
              value={newAgentName}
              onChange={(e) => setNewAgentName(e.target.value)}
              placeholder="Ej: Code Review Agent"
              className="w-full px-4 py-2 bg-surface-container-low rounded-md text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
          <div className="flex justify-end gap-3">
            <button
              onClick={() => setShowNewAgentModal(false)}
              className="btn-secondary"
            >
              Cancelar
            </button>
            <button onClick={handleCreateAgent} className="btn-primary">
              Crear Agente
            </button>
          </div>
        </div>
      </GlassModal>
    </div>
  );
}
