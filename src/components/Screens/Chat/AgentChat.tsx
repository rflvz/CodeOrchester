import { useAgentStore } from '../../../stores/agentStore';
import { AgentAvatar } from '../../Shared/AgentAvatar';
import { StatusChip } from '../../Shared/StatusChip';
import { X, ExternalLink } from 'lucide-react';

export function AgentChat() {
  const { agents, setActiveAgent, activeAgentId } = useAgentStore();
  const agentsList = Object.values(agents);

  return (
    <div className="h-full flex">
      {/* Agent List */}
      <div className="w-72 bg-surface-container-low border-r border-outline-variant/15 flex flex-col">
        <div className="p-4 border-b border-outline-variant/15">
          <h2 className="font-headline font-semibold text-on-surface">Agentes</h2>
        </div>
        <div className="flex-1 overflow-auto p-2 space-y-1">
          {agentsList.length === 0 ? (
            <p className="text-on-surface-variant text-sm text-center py-4">
              No hay agentes
            </p>
          ) : (
            agentsList.map((agent) => (
              <button
                key={agent.id}
                onClick={() => setActiveAgent(agent.id)}
                className={`w-full flex items-center gap-3 p-3 rounded-md transition-colors ${
                  activeAgentId === agent.id
                    ? 'bg-primary-container/20'
                    : 'hover:bg-surface-container'
                }`}
              >
                <AgentAvatar name={agent.name} size="sm" />
                <div className="flex-1 text-left min-w-0">
                  <p className="text-on-surface text-sm font-medium truncate">
                    {agent.name}
                  </p>
                  <StatusChip
                    status={agent.status}
                    trabajoTerminado={agent.trabajoTerminado}
                    size="sm"
                    showLabel={false}
                  />
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col">
        {activeAgentId && agents[activeAgentId] ? (
          <>
            {/* Agent Header */}
            <div className="p-4 border-b border-outline-variant/15 flex items-center gap-4">
              <AgentAvatar name={agents[activeAgentId].name} size="lg" />
              <div className="flex-1">
                <h2 className="font-headline font-semibold text-on-surface">
                  {agents[activeAgentId].name}
                </h2>
                <p className="text-on-surface-variant text-sm">
                  {agents[activeAgentId].description}
                </p>
              </div>
              <StatusChip
                status={agents[activeAgentId].status}
                trabajoTerminado={agents[activeAgentId].trabajoTerminado}
              />
            </div>

            {/* Chat Messages Placeholder */}
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <Bot className="w-16 h-16 text-on-surface-variant mx-auto mb-4" />
                <p className="text-on-surface-variant">
                  Chat con {agents[activeAgentId].name}
                </p>
                <p className="text-on-surface-variant text-sm mt-1">
                  La integración con Claude CLI vendrá pronto
                </p>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <Bot className="w-16 h-16 text-on-surface-variant mx-auto mb-4" />
              <p className="text-on-surface-variant">Selecciona un agente para chatear</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
