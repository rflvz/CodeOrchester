import { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Zap, Plus, Activity, Terminal, Users, ChevronDown } from 'lucide-react';
import { useUIStore } from '../../../stores/uiStore';
import { useAgentStore } from '../../../stores/agentStore';
import { useTeamStore } from '../../../stores/teamStore';
import { useTerminalStore } from '../../../stores/terminalStore';
import { useChatStore, ChatMessage } from '../../../stores/chatStore';
import { CreateAgentModal } from '../../Shared/CreateAgentModal';
import { Team } from '../../../types';

// Stable fallback — prevents useChatStore selector from returning a new [] reference
// each render, which would cause an infinite re-render loop via useSyncExternalStore.
const EMPTY_MESSAGES: ChatMessage[] = [];

// ── Topology helpers ────────────────────────────────────────────────────────

/** Returns the ID of the orchestrator agent for a given team and topology. */
function resolveOrchestratorId(team: Team): string | null {
  if (team.agents.length === 0) return null;
  const targeted = new Set(team.connections.map((c) => c.toAgentId));

  switch (team.topology) {
    case 'hierarchical':
    case 'chain': {
      // Root = agent not targeted by any connection
      const root = team.agents.find((id) => !targeted.has(id));
      return root ?? team.agents[0];
    }
    case 'star': {
      // Hub = agent with most outgoing connections
      const outCount = new Map<string, number>();
      team.connections.forEach((c) => {
        outCount.set(c.fromAgentId, (outCount.get(c.fromAgentId) ?? 0) + 1);
      });
      return team.agents.reduce((best, id) =>
        (outCount.get(id) ?? 0) > (outCount.get(best) ?? 0) ? id : best
      , team.agents[0]);
    }
    case 'mesh':
    default:
      return team.agents[0];
  }
}

/**
 * Returns the IDs of agents the orchestrator should dispatch to, based on topology.
 * For mesh: all other agents. For others: direct connection targets.
 */
function resolveDispatchTargets(team: Team, orchestratorId: string): string[] {
  if (team.topology === 'mesh') {
    return team.agents.filter((id) => id !== orchestratorId);
  }
  return team.connections
    .filter((c) => c.fromAgentId === orchestratorId)
    .map((c) => c.toAgentId);
}

// ── Component ───────────────────────────────────────────────────────────────

export function OrchestrationChat() {
  const { setScreen } = useUIStore();
  const { agents } = useAgentStore();
  const { teams, activeTeamId } = useTeamStore();
  const recentLogs = useTerminalStore((state) => state.recentLogs);
  const agentsList = Object.values(agents);

  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(activeTeamId);
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [showNewAgentModal, setShowNewAgentModal] = useState(false);
  const [savedSettings, setSavedSettings] = useState<{ claudeWorkDir?: string } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  // Tracks how many logs per sessionId have already been added to chat
  const processedPerSession = useRef<Record<string, number>>({});

  const selectedTeam = selectedTeamId ? teams[selectedTeamId] : null;
  const orchestratorId = selectedTeam ? resolveOrchestratorId(selectedTeam) : null;
  const orchestrator = orchestratorId ? agents[orchestratorId] : null;

  // Conversation key per team — persists in chatStore across screen navigation
  const convKey = selectedTeamId ?? 'orchestration';

  const messages = useChatStore((state) => state.conversations[convKey] ?? EMPTY_MESSAGES);

  const activeAgentCount = agentsList.filter((a) => a.status === 'active').length;
  const systemHealth = agentsList.length === 0
    ? 100
    : Math.round((agentsList.filter((a) => a.status !== 'error').length / agentsList.length) * 100);

  useEffect(() => {
    window.electron?.getSettings().then((s) => {
      if (s) setSavedSettings(s as { claudeWorkDir?: string });
    });
  }, []);

  // Reset processed counters when team changes
  useEffect(() => {
    processedPerSession.current = {};
  }, [selectedTeamId]);

  // Init conversation with system message on team select
  useEffect(() => {
    if (!selectedTeam) return;
    const bootMsg: ChatMessage = {
      id: crypto.randomUUID(),
      type: 'system',
      content: [
        `// ORCHESTRATION_CONTROL — ${new Date().toISOString()}`,
        `// Team: ${selectedTeam.name} (${selectedTeam.topology})`,
        `// Agents: ${selectedTeam.agents.length}`,
        orchestratorId
          ? `// Orchestrator: ${agents[orchestratorId]?.name ?? orchestratorId}`
          : '// No orchestrator found',
        `// Ready`,
      ].join('\n'),
      timestamp: new Date(),
    };
    useChatStore.getState().initConversation(convKey, [bootMsg]);
  }, [selectedTeamId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-start orchestrator PTY session when team is selected (if not running yet)
  useEffect(() => {
    if (!orchestratorId || !selectedTeam) return;
    const { agentSessionMap } = useTerminalStore.getState();
    if (agentSessionMap[orchestratorId]) return; // already running

    const agent = agents[orchestratorId];
    if (!agent) return;

    const prompt = `You are ${agent.name}, the orchestrator agent for team "${selectedTeam.name}". ${agent.instructions ?? ''}`;
    window.electron?.startPty(
      orchestratorId,
      savedSettings?.claudeWorkDir ?? undefined,
      prompt
    ).then((result) => {
      if (result?.success) {
        useTerminalStore.getState().registerAgentSession(orchestratorId, orchestratorId);
      } else {
        useChatStore.getState().addMessage(convKey, {
          id: crypto.randomUUID(),
          type: 'system',
          content: `⚠️ Failed to start orchestrator session: ${result?.error ?? 'unknown error'}`,
          timestamp: new Date(),
        });
      }
    });
  }, [orchestratorId, selectedTeamId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Feed PTY logs from all team agent sessions into the orchestration chat
  useEffect(() => {
    if (!selectedTeam) return;

    const { agentSessionMap } = useTerminalStore.getState();

    // Build sessionId → agentId map for agents in this team
    const sessionToAgent = new Map<string, string>();
    selectedTeam.agents.forEach((agentId) => {
      const sessionId = agentSessionMap[agentId];
      if (sessionId) sessionToAgent.set(sessionId, agentId);
    });
    if (sessionToAgent.size === 0) return;

    const newMessages: ChatMessage[] = [];

    sessionToAgent.forEach((agentId, sessionId) => {
      const sessionLogs = recentLogs.filter((l) => l.sessionId === sessionId);
      const prevCount = processedPerSession.current[sessionId] ?? 0;
      if (sessionLogs.length <= prevCount) return;

      const newLogs = sessionLogs.slice(prevCount);
      processedPerSession.current[sessionId] = sessionLogs.length;

      const agent = agents[agentId];
      newLogs.forEach((l) => {
        newMessages.push({
          id: crypto.randomUUID(),
          type: l.isError ? 'system' : 'agent',
          content: l.isError ? `⚠️ ${l.line}` : l.line,
          timestamp: new Date(l.ts),
          agentId: l.isError ? undefined : agentId,
          agentName: l.isError ? undefined : agent?.name,
        });
      });
    });

    if (newMessages.length > 0) {
      useChatStore.getState().addMessages(convKey, newMessages);
      setIsProcessing(false);
    }
  }, [recentLogs, selectedTeam, convKey, agents]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isProcessing) return;

    const text = input.trim();
    setInput('');

    // Show user message immediately
    useChatStore.getState().addMessage(convKey, {
      id: crypto.randomUUID(),
      type: 'user',
      content: text,
      timestamp: new Date(),
      status: 'sent',
    });

    if (!orchestratorId) {
      useChatStore.getState().addMessage(convKey, {
        id: crypto.randomUUID(),
        type: 'system',
        content: '⚠️ No team selected or team has no agents. Please select a team first.',
        timestamp: new Date(),
      });
      return;
    }

    const { agentSessionMap } = useTerminalStore.getState();
    const orchestratorSession = agentSessionMap[orchestratorId];

    if (!orchestratorSession) {
      useChatStore.getState().addMessage(convKey, {
        id: crypto.randomUUID(),
        type: 'system',
        content: `⚠️ No active PTY session for orchestrator "${orchestrator?.name}". Session may still be starting.`,
        timestamp: new Date(),
      });
      return;
    }

    setIsProcessing(true);

    // Send to orchestrator
    const orchPrompt = `You are ${orchestrator?.name}, the orchestrator. ${orchestrator?.instructions ?? ''}`;
    try {
      await window.electron?.writePty(orchestratorSession, text, orchPrompt);
    } catch (err) {
      setIsProcessing(false);
      useChatStore.getState().addMessage(convKey, {
        id: crypto.randomUUID(),
        type: 'system',
        content: `⚠️ Failed to send to orchestrator: ${err instanceof Error ? err.message : String(err)}`,
        timestamp: new Date(),
      });
      return;
    }

    // Propagate to subagents based on topology
    if (selectedTeam) {
      const subagentIds = resolveDispatchTargets(selectedTeam, orchestratorId);
      for (const subId of subagentIds) {
        const subSession = agentSessionMap[subId];
        if (!subSession) continue;
        const subAgent = agents[subId];
        const subPrompt = `You are ${subAgent?.name ?? subId}. ${subAgent?.instructions ?? ''}`;
        try {
          await window.electron?.writePty(subSession, text, subPrompt);
        } catch (err) {
          useChatStore.getState().addMessage(convKey, {
            id: crypto.randomUUID(),
            type: 'system',
            content: `⚠️ Failed to dispatch to ${subAgent?.name ?? subId}: ${err instanceof Error ? err.message : String(err)}`,
            timestamp: new Date(),
          });
        }
      }
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-outline-variant/15 bg-surface-container-low">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary-container/20 rounded heat-gradient">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-headline font-bold text-on-surface tracking-tight uppercase">
                ORCHESTRATION_CONTROL
              </h1>
              <p className="text-on-surface-variant text-xs uppercase tracking-wider font-mono">
                Neural command interface
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setScreen('codemonitor')}
              className="btn-secondary flex items-center gap-2 text-sm"
            >
              <Terminal className="w-4 h-4" />
              MONITOR
            </button>
            <button
              onClick={() => setScreen('agents')}
              className="btn-secondary flex items-center gap-2 text-sm"
            >
              <Users className="w-4 h-4" />
              AGENTS
            </button>
            <button
              onClick={() => setShowNewAgentModal(true)}
              className="btn-primary flex items-center gap-2 text-sm"
            >
              <Plus className="w-4 h-4" />
              NEW_AGENT
            </button>
          </div>
        </div>

        {/* Team selector + status bar */}
        <div className="flex items-center gap-4 mt-3 pt-3 border-t border-outline-variant/15">
          {/* Team selector */}
          <div className="relative">
            <select
              value={selectedTeamId ?? ''}
              onChange={(e) => setSelectedTeamId(e.target.value || null)}
              className="appearance-none pl-3 pr-8 py-1.5 bg-surface-container rounded text-xs font-mono text-on-surface border border-outline-variant/30 focus:outline-none focus:ring-2 focus:ring-primary/50 cursor-pointer"
            >
              <option value="">— Select team —</option>
              {Object.values(teams).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.topology})
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-on-surface-variant pointer-events-none" />
          </div>

          {orchestrator && (
            <span className="text-xs font-mono text-secondary">
              Orch: <span className="font-bold">{orchestrator.name}</span>
            </span>
          )}

          <div className="flex items-center gap-2 ml-auto">
            <Activity className="w-4 h-4 text-primary" />
            <span className="text-xs text-on-surface-variant uppercase tracking-wider">
              Active:
            </span>
            <span className="text-xs font-bold text-primary">{String(activeAgentCount).padStart(2, '0')}</span>
            <span className="text-xs text-on-surface-variant uppercase tracking-wider ml-2">
              Health:
            </span>
            <span className="text-xs font-bold text-secondary">{systemHealth}%</span>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-auto p-4 space-y-4 stream-terminal">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex gap-3 ${message.type === 'user' ? 'flex-row-reverse' : ''}`}
          >
            {message.type === 'agent' && (
              <div className="w-8 h-8 rounded bg-primary-container/20 flex items-center justify-center flex-shrink-0">
                <Bot className="w-4 h-4 text-primary" />
              </div>
            )}
            {message.type === 'user' && (
              <div className="w-8 h-8 rounded bg-surface-container-highest flex items-center justify-center flex-shrink-0">
                <User className="w-4 h-4 text-on-surface" />
              </div>
            )}
            {message.type === 'system' && (
              <div className="w-8 h-8 rounded bg-tertiary-container/20 flex items-center justify-center flex-shrink-0">
                <Zap className="w-4 h-4 text-tertiary" />
              </div>
            )}

            <div className="flex-1 max-w-[75%]">
              {message.agentName && (
                <span className="text-[10px] font-bold text-primary uppercase block mb-1">
                  {message.agentName}
                </span>
              )}
              <div
                className={`rounded p-3 ${
                  message.type === 'system' && message.content.startsWith('⚠️')
                    ? 'bg-error/10 text-error text-xs border-l-2 border-error'
                    : message.type === 'system'
                    ? 'bg-surface-container-lowest text-tertiary text-xs'
                    : message.type === 'user'
                    ? 'bg-primary-container/20 text-on-surface'
                    : 'bg-surface-container text-on-surface'
                }`}
              >
                <pre className="whitespace-pre-wrap font-mono text-sm leading-relaxed">
                  {message.content}
                </pre>
              </div>
              <p className="text-xs text-on-surface-variant mt-1 opacity-60 font-mono">
                [{message.timestamp.toLocaleTimeString()}]
              </p>
            </div>
          </div>
        ))}

        {isProcessing && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded bg-primary-container/20 flex items-center justify-center">
              <Bot className="w-4 h-4 text-primary animate-pulse" />
            </div>
            <div className="bg-surface-container rounded p-3">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-outline-variant/15 bg-surface-container-low">
        <div className="flex gap-3">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder={
              selectedTeam
                ? `$ Send instruction to ${orchestrator?.name ?? 'orchestrator'}...`
                : '$ Select a team above to begin...'
            }
            disabled={!selectedTeam}
            rows={1}
            className="flex-1 px-4 py-2 bg-surface-container-lowest rounded text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none font-mono text-sm disabled:opacity-40 disabled:cursor-not-allowed"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isProcessing || !selectedTeam}
            className="btn-primary px-4 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
        {selectedTeam && (
          <p className="text-[10px] text-on-surface-variant mt-2 font-mono">
            topology: {selectedTeam.topology} •{' '}
            {selectedTeam.topology === 'mesh'
              ? `broadcasting to all ${selectedTeam.agents.length} agents`
              : `orchestrator → ${resolveDispatchTargets(selectedTeam, orchestratorId!).length} subagents`}
          </p>
        )}
      </div>

      <CreateAgentModal
        isOpen={showNewAgentModal}
        onClose={() => setShowNewAgentModal(false)}
      />
    </div>
  );
}
