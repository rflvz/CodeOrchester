import { useAgentStore } from '../../../stores/agentStore';
import { useTeamStore } from '../../../stores/teamStore';
import { AgentAvatar } from '../../Shared/AgentAvatar';
import { StatusChip } from '../../Shared/StatusChip';

export function Topology() {
  const { agents } = useAgentStore();
  const { teams } = useTeamStore();

  const agentsList = Object.values(agents);
  const teamsList = Object.values(teams);

  const getAgentsByTeam = (teamId: string | null) => {
    return agentsList.filter((a) => a.teamId === teamId);
  };

  return (
    <div className="h-full p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-headline font-bold text-on-surface">Topología de Nodos</h1>
        <p className="text-on-surface-variant text-sm mt-1">
          Visualiza la estructura de tus equipos y agentes
        </p>
      </div>

      {teamsList.length === 0 && agentsList.length === 0 ? (
        <div className="agent-card text-center py-16">
          <p className="text-on-surface-variant">No hay equipos ni agentes configurados</p>
        </div>
      ) : (
        <div className="flex gap-6 overflow-auto">
          {/* Teams Column */}
          {teamsList.length > 0 && (
            <div className="flex-1 space-y-4">
              <h2 className="text-lg font-headline font-semibold text-on-surface">Equipos</h2>
              {teamsList.map((team) => {
                const teamAgents = getAgentsByTeam(team.id);
                return (
                  <div key={team.id} className="surface-card p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-3 h-3 rounded-full bg-primary" />
                      <h3 className="font-headline font-semibold text-on-surface">{team.name}</h3>
                      <span className="text-on-surface-variant text-xs ml-auto">
                        {team.topology}
                      </span>
                    </div>
                    <p className="text-on-surface-variant text-sm mb-3">{team.description}</p>
                    <div className="space-y-2">
                      {teamAgents.map((agent) => (
                        <div
                          key={agent.id}
                          className="flex items-center gap-3 p-2 rounded bg-surface-container-low"
                        >
                          <AgentAvatar name={agent.name} size="sm" />
                          <span className="text-on-surface text-sm flex-1">{agent.name}</span>
                          <StatusChip
                            status={agent.status}
                            trabajoTerminado={agent.trabajoTerminado}
                            size="sm"
                            showLabel={false}
                          />
                        </div>
                      ))}
                      {teamAgents.length === 0 && (
                        <p className="text-on-surface-variant text-xs text-center py-2">
                          Sin agentes
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Unassigned Agents */}
          <div className="flex-1 space-y-4">
            <h2 className="text-lg font-headline font-semibold text-on-surface">
              Agentes Sin Equipo
            </h2>
            {agentsList.filter((a) => !a.teamId).length === 0 ? (
              <div className="surface-card p-4 text-center">
                <p className="text-on-surface-variant text-sm">Todos los agentes están en equipos</p>
              </div>
            ) : (
              agentsList
                .filter((a) => !a.teamId)
                .map((agent) => (
                  <div
                    key={agent.id}
                    className="agent-card flex items-center gap-3"
                  >
                    <AgentAvatar name={agent.name} size="md" />
                    <div className="flex-1">
                      <h3 className="font-medium text-on-surface">{agent.name}</h3>
                      <p className="text-on-surface-variant text-xs">{agent.description}</p>
                    </div>
                    <StatusChip
                      status={agent.status}
                      trabajoTerminado={agent.trabajoTerminado}
                      size="sm"
                    />
                  </div>
                ))
            )}
          </div>
        </div>
      )}

      {/* Visual Graph Placeholder */}
      <div className="mt-8">
        <h2 className="text-lg font-headline font-semibold text-on-surface mb-4">Grafo de Conexiones</h2>
        <div className="surface-card h-64 flex items-center justify-center">
          <p className="text-on-surface-variant">
            Visualización de grafo próximamente...
          </p>
        </div>
      </div>
    </div>
  );
}
