import { useState } from 'react';
import { Plus, Search, Bot, Edit2, Trash2, MessageSquare, Activity, Settings, AlertTriangle } from 'lucide-react';
import { useAgentStore } from '../../../stores/agentStore';
import { useUIStore } from '../../../stores/uiStore';
import { useNotificationStore } from '../../../stores/notificationStore';
import { AgentAvatar } from '../../Shared/AgentAvatar';
import { StatusChip } from '../../Shared/StatusChip';
import { CreateAgentModal } from '../../Shared/CreateAgentModal';

export function AgentDashboard() {
  const { agents, deleteAgent, setActiveAgent } = useAgentStore();
  const { setScreen } = useUIStore();
  const { addNotification } = useNotificationStore();
  const [showNewAgentModal, setShowNewAgentModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingAgent, setEditingAgent] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const agentsList = Object.values(agents);
  const filteredAgents = agentsList.filter((agent) =>
    agent.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    agent.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const stats = {
    total: agentsList.length,
    active: agentsList.filter((a) => a.status === 'active').length,
    idle: agentsList.filter((a) => a.status === 'idle').length,
    success: agentsList.filter((a) => a.status === 'success').length,
    error: agentsList.filter((a) => a.status === 'error').length,
  };

  const handleEditAgent = (agentId: string) => {
    setEditingAgent(agentId);
    setActiveAgent(agentId);
  };

  const handleDeleteConfirm = () => {
    if (!deleteConfirmId) return;
    try {
      deleteAgent(deleteConfirmId);
    } catch (err) {
      addNotification({
        type: 'error',
        title: 'Error al eliminar agente',
        body: err instanceof Error ? err.message : 'No se pudo eliminar el agente',
        agentId: deleteConfirmId,
        taskId: null,
      });
    } finally {
      setDeleteConfirmId(null);
    }
  };

  const handleChatAgent = (agentId: string) => {
    setActiveAgent(agentId);
    setScreen('chat');
  };

  const handleViewTopology = (agentId: string) => {
    setActiveAgent(agentId);
    setScreen('topology');
  };

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <header className="px-6 py-4 border-b border-outline-variant/15">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-headline font-bold tracking-wide text-primary uppercase">
              Agent Management
            </h1>
            <span className="text-on-surface-variant text-sm font-mono">
              {stats.total} agents registered
            </span>
          </div>
          <button
            onClick={() => setShowNewAgentModal(true)}
            className="btn-primary flex items-center gap-2 text-sm"
          >
            <Plus className="w-4 h-4" />
            NEW_AGENT
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-6">
        {/* Stats Bar */}
        <div className="grid grid-cols-5 gap-4 mb-6">
          <div className="bg-surface-container p-4 rounded-md border border-outline-variant/15">
            <div className="flex items-center gap-2 mb-2">
              <Bot className="w-4 h-4 text-on-surface-variant" />
              <span className="text-xs text-on-surface-variant uppercase tracking-wider font-mono">Total</span>
            </div>
            <span className="text-2xl font-headline font-bold text-on-surface">{stats.total}</span>
          </div>
          <div className="bg-surface-container p-4 rounded-md border border-outline-variant/15">
            <div className="flex items-center gap-2 mb-2">
              <Activity className="w-4 h-4 text-tertiary" />
              <span className="text-xs text-on-surface-variant uppercase tracking-wider font-mono">Active</span>
            </div>
            <span className="text-2xl font-headline font-bold text-tertiary">{stats.active}</span>
          </div>
          <div className="bg-surface-container p-4 rounded-md border border-outline-variant/15">
            <div className="flex items-center gap-2 mb-2">
              <Bot className="w-4 h-4 text-primary" />
              <span className="text-xs text-on-surface-variant uppercase tracking-wider font-mono">Idle</span>
            </div>
            <span className="text-2xl font-headline font-bold text-primary">{stats.idle}</span>
          </div>
          <div className="bg-surface-container p-4 rounded-md border border-outline-variant/15">
            <div className="flex items-center gap-2 mb-2">
              <Settings className="w-4 h-4 text-secondary" />
              <span className="text-xs text-on-surface-variant uppercase tracking-wider font-mono">Success</span>
            </div>
            <span className="text-2xl font-headline font-bold text-secondary">{stats.success}</span>
          </div>
          <div className="bg-surface-container p-4 rounded-md border border-outline-variant/15">
            <div className="flex items-center gap-2 mb-2">
              <Activity className="w-4 h-4 text-error" />
              <span className="text-xs text-on-surface-variant uppercase tracking-wider font-mono">Error</span>
            </div>
            <span className="text-2xl font-headline font-bold text-error">{stats.error}</span>
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative mb-6">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search agents..."
            className="w-full pl-12 pr-4 py-2 bg-surface-container-low text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:ring-2 focus:ring-primary/50 rounded-md font-mono text-sm"
          />
        </div>

        {/* Agents Grid */}
        {filteredAgents.length === 0 ? (
          <div className="bg-surface-container p-8 rounded-md border border-outline-variant/15 text-center">
            <Bot className="w-12 h-12 text-on-surface-variant mx-auto mb-4 opacity-50" />
            <p className="text-on-surface-variant font-mono text-sm uppercase tracking-wider">
              {searchQuery ? 'No agents found' : 'No agents registered'}
            </p>
            {!searchQuery && (
              <button
                onClick={() => setShowNewAgentModal(true)}
                className="mt-4 btn-primary text-sm"
              >
                <Plus className="w-4 h-4 mr-2" />
                CREATE_FIRST_AGENT
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {filteredAgents.map((agent) => (
              <div
                key={agent.id}
                className="bg-surface-container p-6 rounded-md border border-outline-variant/15 hover:border-primary/30 transition-colors"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <AgentAvatar name={agent.name} size="md" />
                    <div>
                      <h3 className="text-lg font-headline font-bold text-on-surface uppercase tracking-tight">
                        {agent.name}
                      </h3>
                      <p className="text-xs text-on-surface-variant font-mono mt-1">
                        ID: {agent.id.slice(0, 8).toUpperCase()}
                      </p>
                    </div>
                  </div>
                  <StatusChip
                    status={agent.status}
                    trabajoTerminado={agent.trabajoTerminado}
                    size="sm"
                  />
                </div>

                <p className="text-sm text-on-surface-variant mb-4">
                  {agent.description || 'Sin descripción'}
                </p>

                {/* Skills */}
                {agent.skills.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-4">
                    {agent.skills.map((skill) => (
                      <span
                        key={skill}
                        className="px-2 py-1 bg-surface-container-high text-xs font-mono text-primary border border-primary/20 rounded-sm"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-2 pt-4 border-t border-outline-variant/15">
                  <button
                    onClick={() => handleChatAgent(agent.id)}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-surface-container-low hover:bg-surface-container-high rounded text-xs font-medium text-on-surface-variant hover:text-on-surface transition-colors"
                  >
                    <MessageSquare className="w-3 h-3" />
                    CHAT
                  </button>
                  <button
                    onClick={() => handleViewTopology(agent.id)}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-surface-container-low hover:bg-surface-container-high rounded text-xs font-medium text-on-surface-variant hover:text-on-surface transition-colors"
                  >
                    <Activity className="w-3 h-3" />
                    TOPOLOGY
                  </button>
                  <button
                    onClick={() => handleEditAgent(agent.id)}
                    className="p-2 bg-surface-container-low hover:bg-surface-container-high rounded text-xs text-on-surface-variant hover:text-primary transition-colors"
                  >
                    <Edit2 className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => setDeleteConfirmId(agent.id)}
                    className="p-2 bg-surface-container-low hover:bg-error/20 rounded text-xs text-on-surface-variant hover:text-error transition-colors"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* New / Edit Agent Modal */}
      <CreateAgentModal
        isOpen={showNewAgentModal || editingAgent !== null}
        agentId={editingAgent ?? undefined}
        onClose={() => {
          setShowNewAgentModal(false);
          setEditingAgent(null);
        }}
      />

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setDeleteConfirmId(null)} />
          <div className="relative bg-surface-container rounded-lg p-6 max-w-sm w-full mx-4 shadow-2xl border border-error/20">
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle className="w-5 h-5 text-error flex-shrink-0" />
              <h3 className="font-headline font-bold text-on-surface uppercase tracking-wide">Eliminar Agente</h3>
            </div>
            <p className="text-sm text-on-surface-variant mb-1">
              ¿Seguro que deseas eliminar al agente
            </p>
            <p className="text-sm font-bold text-on-surface font-mono mb-6">
              {agents[deleteConfirmId]?.name ?? deleteConfirmId}
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="px-4 py-2 text-sm text-on-surface-variant hover:text-on-surface border border-outline-variant/30 rounded transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleDeleteConfirm}
                className="px-4 py-2 text-sm font-bold text-on-error bg-error rounded hover:bg-error/90 transition-colors"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
