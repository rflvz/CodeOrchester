import { useState, useRef, useEffect } from 'react';
import {
  Send, Bot, User, Terminal, Activity, Zap, Copy, Check,
  Search, Phone, Video, Settings, MessageSquare, ChevronDown, Clock, Trash2
} from 'lucide-react';
import { useAgentStore } from '../../../stores/agentStore';
import { useTerminalStore } from '../../../stores/terminalStore';
import { useUIStore } from '../../../stores/uiStore';
import { useChatStore, ChatMessage } from '../../../stores/chatStore';
import { AgentAvatar } from '../../Shared/AgentAvatar';

// Stable fallback — prevents useChatStore selector from returning a new [] reference
// each render, which would cause an infinite re-render loop via useSyncExternalStore.
const EMPTY_MESSAGES: ChatMessage[] = [];

const MODEL_IDS: Record<string, string> = {
  haiku: 'claude-haiku-4-5-20251001',
  sonnet: 'claude-sonnet-4-6',
  opus:   'claude-opus-4-6',
};
const getModelId = (model?: string): string | undefined =>
  model ? MODEL_IDS[model] : undefined;
import { StatusChip } from '../../Shared/StatusChip';

interface ConvMeta {
  lastActivity: Date;
  unread: number;
}

export function AgentChat() {
  const { agents, setActiveAgent, activeAgentId } = useAgentStore();
  const { setScreen } = useUIStore();
  const agentsList = Object.values(agents);
  const activeAgent = activeAgentId ? agents[activeAgentId] : null;

  // Messages come from the persistent chatStore (survives screen navigation)
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const messages = useChatStore(
    (state) => state.conversations[activeConversationId ?? ''] ?? EMPTY_MESSAGES
  );
  const allConversations = useChatStore((state) => state.conversations);

  // Metadata per conversation (lastActivity, unread) — ephemeral UI state
  const [convMeta, setConvMeta] = useState<Record<string, ConvMeta>>({});

  const [agentSearchQuery, setAgentSearchQuery] = useState('');
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [showAgentList, setShowAgentList] = useState(!activeAgentId);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [typingAgents, setTypingAgents] = useState<Set<string>>(new Set());
  // Incremented to force the auto-start effect to re-run when the model is changed mid-session
  const [sessionRestartTrigger, setSessionRestartTrigger] = useState(0);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [savedSettings, setSavedSettings] = useState<{ claudeWorkDir?: string; claudeCliPath?: string } | null>(null);
  // Ref so that the auto-PTY effect always reads the latest settings without becoming a dep
  const savedSettingsRef = useRef<{ claudeWorkDir?: string; claudeCliPath?: string } | null>(null);

  useEffect(() => {
    window.electron?.getSettings().then((s) => {
      if (s) setSavedSettings(s as { claudeWorkDir?: string; claudeCliPath?: string });
    });
  }, []);

  useEffect(() => { savedSettingsRef.current = savedSettings; }, [savedSettings]);

  // Ref para trackear cuántos logs del session activo ya se mostraron
  const processedCountRef = useRef(0);

  // Sync processedCount when activeAgentId changes (including on component mount).
  // Setting to 0 would cause recentLogs already in chatStore to be re-processed
  // and duplicated every time the screen is left and returned to.
  // Instead, we fast-forward to the current log count so only NEW logs get added.
  useEffect(() => {
    if (activeAgentId) {
      const sessionId = useTerminalStore.getState().getSessionIdByAgentId(activeAgentId);
      processedCountRef.current = sessionId
        ? useTerminalStore.getState().recentLogs.filter((l) => l.sessionId === sessionId).length
        : 0;
    } else {
      processedCountRef.current = 0;
    }
    setIsProcessing(false);
    setTypingAgents(new Set());
  }, [activeAgentId]);

  const recentLogs = useTerminalStore((state) => state.recentLogs);

  // Feed PTY logs from the active agent's session into the chatStore
  useEffect(() => {
    // Guard: only when activeConversationId has caught up with activeAgentId.
    // Without this, logs/labels from one agent can bleed into another agent's conversation
    // during the render gap between activeAgentId changing and the state update settling.
    if (!activeAgentId || !activeConversationId || !activeAgent) return;
    if (activeConversationId !== activeAgentId) return;

    const sessionId = useTerminalStore.getState().getSessionIdByAgentId(activeAgentId);
    if (!sessionId) return;

    const sessionLogs = recentLogs.filter((l) => l.sessionId === sessionId);
    if (sessionLogs.length <= processedCountRef.current) return;

    const newLogs = sessionLogs.slice(processedCountRef.current);
    processedCountRef.current = sessionLogs.length;

    const newMsgs: ChatMessage[] = newLogs.map((l) => ({
      id: crypto.randomUUID(),
      type: l.isError ? ('system' as const) : ('agent' as const),
      content: l.isError ? `⚠️ ${l.line}` : l.line,
      timestamp: new Date(l.ts),
      agentId: l.isError ? undefined : activeAgent.id,
      agentName: l.isError ? undefined : activeAgent.name,
      status: 'sent' as const,
    }));

    useChatStore.getState().addMessages(activeConversationId, newMsgs);
    setConvMeta((prev) => ({
      ...prev,
      [activeConversationId]: { lastActivity: new Date(), unread: prev[activeConversationId]?.unread ?? 0 },
    }));

    setIsProcessing(false);
    setTypingAgents(new Set());
  }, [recentLogs, activeAgentId, activeConversationId, activeAgent]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Initialize conversation when selecting agent — restores existing history if any.
  // Depends only on activeAgentId to avoid re-running on every agents-store update.
  useEffect(() => {
    if (!activeAgentId) return;
    const agent = agents[activeAgentId];
    if (!agent) return;

    const systemMsg: ChatMessage = {
      id: '1',
      type: 'system',
      content: `Conversación iniciada con ${agent.name}.\nEstado: ${agent.status}\nSkills: ${agent.skills.join(', ') || 'Ninguna'}`,
      timestamp: new Date(),
    };
    useChatStore.getState().initConversation(activeAgentId, [systemMsg]);
    setConvMeta((prev) => ({
      ...prev,
      [activeAgentId]: prev[activeAgentId] ?? { lastActivity: new Date(), unread: 0 },
    }));
    setActiveConversationId(activeAgentId);
  }, [activeAgentId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the system message (id:'1') in sync when the agent's name or skills are edited.
  // Only fires on those two fields to avoid running on every heartbeat status change.
  // Guard: skip when activeConversationId hasn't settled to activeAgentId yet (agent switch race).
  const agentName = activeAgent?.name ?? '';
  const agentSkillsKey = activeAgent?.skills.join('\x00') ?? '';
  useEffect(() => {
    if (!activeConversationId || !activeAgent || !activeAgentId) return;
    if (activeConversationId !== activeAgentId) return;
    const updated = `Conversación iniciada con ${activeAgent.name}.\nEstado: ${activeAgent.status}\nSkills: ${activeAgent.skills.join(', ') || 'Ninguna'}`;
    useChatStore.getState().updateMessage(activeConversationId, '1', updated);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeConversationId, agentName, agentSkillsKey]);

  // When the same agent's model is changed, kill the current PTY and restart with the new model.
  // Uses agentId::model key to distinguish a genuine model edit from an agent switch
  // (switching agents also changes activeAgent?.model but should NOT trigger a restart).
  const agentModelKeyRef = useRef('');
  const agentModelKey = `${activeAgentId ?? ''}::${activeAgent?.model ?? ''}`;
  useEffect(() => {
    const prevKey = agentModelKeyRef.current;
    agentModelKeyRef.current = agentModelKey;

    if (!prevKey || !activeAgentId) return; // initial mount — nothing to compare yet

    const colonIdx = prevKey.indexOf('::');
    const prevAgentId = prevKey.slice(0, colonIdx);
    const prevModel  = prevKey.slice(colonIdx + 2);
    const currModel  = activeAgent?.model ?? '';

    // Agent switch: different agent — don't restart, just record new baseline
    if (prevAgentId !== activeAgentId) return;
    // Same model — nothing changed
    if (prevModel === currModel) return;

    // Same agent, different model → restart session with new model
    window.electron?.killPty(activeAgentId).catch(() => {});
    useTerminalStore.getState().unregisterAgentSession(activeAgentId);

    // Use activeAgentId directly as conv key (it always equals activeConversationId when synced)
    useChatStore.getState().addMessage(activeAgentId, {
      id: crypto.randomUUID(),
      type: 'system',
      content: `🔄 Modelo actualizado a ${(currModel || 'DEFAULT').toUpperCase()} — sesión reiniciada.`,
      timestamp: new Date(),
    });

    setSessionRestartTrigger((n) => n + 1);
  }, [agentModelKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-start PTY whenever activeAgentId changes or a session restart is requested.
  // Also covers external navigation from AgentDashboard. Skips if a session already exists.
  useEffect(() => {
    if (!activeAgentId) return;
    const existingSession = useTerminalStore.getState().getSessionIdByAgentId(activeAgentId);
    if (existingSession) return;
    const agent = useAgentStore.getState().agents[activeAgentId];
    if (!agent) return;
    const skillsCtx = agent.skills.length > 0
      ? `Your skills: ${agent.skills.join(', ')}`
      : 'You have no specific skills configured.';
    const prompt = `You are ${agent.name}. ${agent.instructions || ''}\n\n${skillsCtx}`;
    const modelId = getModelId(agent.model);
    window.electron?.startPty(activeAgentId, savedSettingsRef.current?.claudeWorkDir || undefined, prompt, modelId)
      .then((result) => {
        if (result?.success) {
          useTerminalStore.getState().registerAgentSession(activeAgentId, activeAgentId);
        } else {
          console.error('[AgentChat] auto-startPty failed:', result?.error);
        }
      })
      .catch((err) => console.error('[AgentChat] auto-startPty exception:', err));
  }, [activeAgentId, sessionRestartTrigger]); // uses getState() internally to avoid stale closure deps

  const handleSelectAgent = (agentId: string) => {
    setActiveAgent(agentId);
    setShowAgentList(false);
    // PTY start is handled by the auto-start effect above
  };

  const handleSend = async () => {
    if (!input.trim() || !activeAgent || isProcessing) return;

    const textToSend = input.trim();
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      type: 'user',
      content: textToSend,
      timestamp: new Date(),
      status: 'sent',
    };

    setInput('');

    if (activeConversationId) {
      useChatStore.getState().addMessage(activeConversationId, userMessage);
      setConvMeta((prev) => ({
        ...prev,
        [activeConversationId]: { ...prev[activeConversationId], lastActivity: new Date() },
      }));
    }

    const sessionId = useTerminalStore.getState().getSessionIdByAgentId(activeAgent.id);
    if (!sessionId) {
      console.error('[AgentChat] No PTY session found for agent:', activeAgent.id);
      if (activeConversationId) {
        useChatStore.getState().addMessage(activeConversationId, {
          id: crypto.randomUUID(),
          type: 'system',
          content: '⚠️ No active PTY session for this agent. Please re-select the agent to restart the session.',
          timestamp: new Date(),
        });
      }
      return;
    }

    const skillsContext = activeAgent.skills.length > 0
      ? `Your skills: ${activeAgent.skills.join(', ')}`
      : 'You have no specific skills configured.';
    const initialPrompt = `You are ${activeAgent.name}. ${activeAgent.instructions || ''}\n\n${skillsContext}`;

    setIsProcessing(true);
    setTypingAgents(new Set([activeAgent.id]));

    try {
      await window.electron?.writePty(sessionId, textToSend, initialPrompt);
    } catch (err) {
      console.error('[AgentChat] writePty failed:', err);
      setIsProcessing(false);
      setTypingAgents(new Set());
      if (activeConversationId) {
        useChatStore.getState().addMessage(activeConversationId, {
          id: crypto.randomUUID(),
          type: 'system',
          content: `⚠️ Failed to send message: ${err instanceof Error ? err.message : String(err)}`,
          timestamp: new Date(),
        });
      }
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleCopyMessage = (messageId: string, content: string) => {
    navigator.clipboard.writeText(content);
    setCopiedMessageId(messageId);
    setTimeout(() => setCopiedMessageId(null), 2000);
  };

  const handleEditMessage = (messageId: string, content: string) => {
    setEditingMessageId(messageId);
    setEditContent(content);
  };

  const handleSaveEdit = () => {
    if (!editingMessageId || !editContent.trim() || !activeConversationId) return;
    useChatStore.getState().updateMessage(activeConversationId, editingMessageId, editContent);
    setEditingMessageId(null);
    setEditContent('');
  };

  const handleDeleteMessage = (messageId: string) => {
    if (!confirm('¿Eliminar este mensaje?') || !activeConversationId) return;
    useChatStore.getState().deleteMessage(activeConversationId, messageId);
  };

  const formatTimestamp = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);

    if (minutes < 1) return 'Ahora';
    if (minutes < 60) return `${minutes}m ago`;
    if (minutes < 1440) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  return (
    <div className="h-full flex bg-background">
      {/* Agent List Sidebar */}
      <div className={`${showAgentList ? 'w-72' : 'w-0'} bg-surface-container-low flex flex-col transition-all duration-300 overflow-hidden`}>
        <div className="p-4 border-b border-outline-variant/15">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-headline font-semibold text-on-surface tracking-tight">AGENTS</h2>
            <span className="text-xs text-on-surface-variant">{agentsList.length} connected</span>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant" />
            <input
              type="text"
              value={agentSearchQuery}
              onChange={(e) => setAgentSearchQuery(e.target.value)}
              placeholder="Search agents..."
              className="w-full pl-9 pr-3 py-2 bg-surface-container rounded text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
        </div>

        <div className="flex-1 overflow-auto p-2 space-y-1">
          {agentsList.length === 0 ? (
            <div className="text-center py-8">
              <Bot className="w-8 h-8 text-on-surface-variant mx-auto mb-2 opacity-50" />
              <p className="text-on-surface-variant text-sm">No agents connected</p>
            </div>
          ) : (
            agentsList.filter((a) =>
              a.name.toLowerCase().includes(agentSearchQuery.toLowerCase())
            ).map((agent) => {
              const agentMsgs = allConversations[agent.id];
              const meta = convMeta[agent.id];
              const isActive = activeAgentId === agent.id;
              const isTyping = typingAgents.has(agent.id);

              return (
                <button
                  key={agent.id}
                  onClick={() => handleSelectAgent(agent.id)}
                  className={`w-full flex items-start gap-3 p-3 rounded transition-colors ${
                    isActive
                      ? 'bg-primary-container/20 border-l-2 border-primary'
                      : 'hover:bg-surface-container'
                  }`}
                >
                  <div className="relative">
                    <AgentAvatar name={agent.name} size="md" />
                    {isTyping && (
                      <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-tertiary rounded-full animate-pulse">
                        <span className="absolute inset-0 bg-tertiary rounded-full animate-ping opacity-75" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <div className="flex items-center justify-between">
                      <p className="text-on-surface text-sm font-medium truncate font-mono">
                        {agent.name}
                      </p>
                      {meta && (
                        <span className="text-[10px] text-on-surface-variant">
                          {formatTimestamp(meta.lastActivity)}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <StatusChip
                        status={agent.status}
                        trabajoTerminado={agent.trabajoTerminado}
                        size="sm"
                        showLabel={false}
                      />
                      {(meta?.unread ?? 0) > 0 && (
                        <span className="bg-primary text-on-primary text-[10px] font-bold px-1.5 rounded-full">
                          {meta!.unread}
                        </span>
                      )}
                    </div>
                    {agentMsgs && agentMsgs.length > 1 && (
                      <p className="text-xs text-on-surface-variant mt-1 truncate">
                        {agentMsgs[agentMsgs.length - 1]?.content.slice(0, 50)}...
                      </p>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Agent Stats */}
        <div className="p-4 border-t border-outline-variant/15">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-surface-container rounded p-2">
              <p className="text-lg font-bold text-primary">{agentsList.filter(a => a.status === 'active').length}</p>
              <p className="text-[10px] text-on-surface-variant uppercase">Active</p>
            </div>
            <div className="bg-surface-container rounded p-2">
              <p className="text-lg font-bold text-secondary">{agentsList.filter(a => a.status === 'success').length}</p>
              <p className="text-[10px] text-on-surface-variant uppercase">Success</p>
            </div>
            <div className="bg-surface-container rounded p-2">
              <p className="text-lg font-bold text-error">{agentsList.filter(a => a.status === 'error').length}</p>
              <p className="text-[10px] text-on-surface-variant uppercase">Error</p>
            </div>
          </div>
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col bg-surface">
        {activeAgent ? (
          <>
            {/* Agent Header */}
            <div className="p-4 border-b border-outline-variant/15 bg-surface-container-low">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => setShowAgentList(!showAgentList)}
                    className="p-2 hover:bg-surface-container rounded transition-colors"
                    title="Toggle agent list"
                  >
                    <ChevronDown className={`w-4 h-4 text-on-surface-variant transition-transform ${showAgentList ? 'rotate-0' : '-rotate-90'}`} />
                  </button>
                  <AgentAvatar name={activeAgent.name} size="lg" />
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="font-headline font-bold text-on-surface tracking-tight uppercase">
                        {activeAgent.name}
                      </h2>
                      <StatusChip
                        status={activeAgent.status}
                        trabajoTerminado={activeAgent.trabajoTerminado}
                      />
                    </div>
                    <p className="text-on-surface-variant text-xs uppercase tracking-wider">
                      {activeAgent.description || 'Agent interface'} • ID: {activeAgent.id.slice(0, 8)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => window.alert('Llamada de voz no disponible en esta versión')}
                    title="Función no disponible"
                    className="p-2 hover:bg-surface-container rounded transition-colors opacity-50 cursor-not-allowed"
                  >
                    <Phone className="w-4 h-4 text-on-surface-variant" />
                  </button>
                  <button
                    onClick={() => window.alert('Videollamada no disponible en esta versión')}
                    title="Función no disponible"
                    className="p-2 hover:bg-surface-container rounded transition-colors opacity-50 cursor-not-allowed"
                  >
                    <Video className="w-4 h-4 text-on-surface-variant" />
                  </button>
                  <button
                    onClick={() => setScreen('codemonitor')}
                    className="p-2 hover:bg-surface-container rounded transition-colors"
                  >
                    <Terminal className="w-4 h-4 text-on-surface-variant" />
                  </button>
                  <button
                    onClick={() => setScreen('topology')}
                    className="p-2 hover:bg-surface-container rounded transition-colors"
                  >
                    <Activity className="w-4 h-4 text-on-surface-variant" />
                  </button>
                  <button
                    onClick={() => setScreen('agents')}
                    title="Configurar agente"
                    className="p-2 hover:bg-surface-container rounded transition-colors"
                  >
                    <Settings className="w-4 h-4 text-on-surface-variant" />
                  </button>
                </div>
              </div>

              {/* Agent Skills */}
              {activeAgent.skills.length > 0 && (
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-outline-variant/15">
                  <span className="text-xs text-on-surface-variant uppercase tracking-wider">Skills:</span>
                  <div className="flex flex-wrap gap-1">
                    {activeAgent.skills.map((skill) => (
                      <span
                        key={skill}
                        className="px-2 py-0.5 bg-surface-container-high text-xs font-mono text-primary border border-primary/20 rounded-sm"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-auto p-4 space-y-4">
              {messages.length === 0 && (
                <div className="h-full flex items-center justify-center">
                  <div className="text-center">
                    <Bot className="w-12 h-12 text-on-surface-variant mx-auto mb-4 opacity-50" />
                    <p className="text-on-surface-variant font-mono text-sm">
                      Start a conversation with {activeAgent.name}
                    </p>
                    <p className="text-on-surface-variant text-xs mt-2 opacity-60">
                      Type a message below to begin
                    </p>
                  </div>
                </div>
              )}

              {/* Group messages by date */}
              {messages.reduce((groups: { date: string; messages: ChatMessage[] }[], message) => {
                const date = message.timestamp.toLocaleDateString();
                const existing = groups.find(g => g.date === date);
                if (existing) {
                  existing.messages.push(message);
                } else {
                  groups.push({ date, messages: [message] });
                }
                return groups;
              }, []).map((group) => (
                <div key={group.date}>
                  <div className="flex items-center gap-4 my-4">
                    <div className="flex-1 h-px bg-outline-variant/30" />
                    <span className="text-xs text-on-surface-variant font-mono">{group.date}</span>
                    <div className="flex-1 h-px bg-outline-variant/30" />
                  </div>
                  {group.messages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex gap-3 mb-4 ${message.type === 'user' ? 'flex-row-reverse' : ''}`}
                    >
                      {message.type === 'agent' && (
                        <div className="w-8 h-8 rounded bg-primary-container/20 flex items-center justify-center flex-shrink-0">
                          <Bot className="w-4 h-4 text-primary" />
                        </div>
                      )}
                      {message.type === 'user' && (
                        <div className="w-8 h-8 rounded bg-surface-container-high flex items-center justify-center flex-shrink-0">
                          <User className="w-4 h-4 text-on-surface-variant" />
                        </div>
                      )}
                      {message.type === 'system' && (
                        <div className="w-8 h-8 rounded bg-tertiary-container/20 flex items-center justify-center flex-shrink-0">
                          <Zap className="w-4 h-4 text-tertiary" />
                        </div>
                      )}

                      <div className="flex-1 max-w-[70%]">
                        <div className="flex items-center gap-2 mb-1">
                          {message.agentName && (
                            <span className="text-xs font-bold text-primary uppercase">
                              {message.agentName}
                            </span>
                          )}
                          <span className="text-[10px] text-on-surface-variant flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatTimestamp(message.timestamp)}
                          </span>
                          {message.status === 'sending' && (
                            <span className="text-[10px] text-tertiary">Enviando...</span>
                          )}
                        </div>

                        {editingMessageId === message.id ? (
                          <div className="space-y-2">
                            <textarea
                              value={editContent}
                              onChange={(e) => setEditContent(e.target.value)}
                              className="w-full p-3 bg-surface-container-low rounded text-on-surface font-mono text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/50"
                              rows={3}
                            />
                            <div className="flex gap-2">
                              <button onClick={handleSaveEdit} className="btn-primary text-xs">
                                Guardar
                              </button>
                              <button onClick={() => setEditingMessageId(null)} className="btn-secondary text-xs">
                                Cancelar
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div
                            className={`rounded-lg p-3 ${
                              message.type === 'system' && message.content.startsWith('⚠️')
                                ? 'bg-error/10 text-error text-xs border-l-2 border-error'
                                : message.type === 'system'
                                ? 'bg-surface-container-lowest text-tertiary text-xs border-l-2 border-tertiary'
                                : message.type === 'user'
                                ? 'bg-primary-container/20 text-on-surface'
                                : 'bg-surface-container text-on-surface'
                            }`}
                          >
                            <pre className="whitespace-pre-wrap font-mono text-sm leading-relaxed">
                              {message.content}
                            </pre>
                          </div>
                        )}

                        {/* Message Actions */}
                        {editingMessageId !== message.id && (
                          <div className={`flex items-center gap-1 mt-1 ${message.type === 'user' ? 'justify-end' : ''}`}>
                            <button
                              onClick={() => handleCopyMessage(message.id, message.content)}
                              className="p-1 rounded hover:bg-surface-container text-on-surface-variant transition-colors"
                            >
                              {copiedMessageId === message.id ? (
                                <Check className="w-3 h-3 text-secondary" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </button>
                            {message.type === 'user' && (
                              <button
                                onClick={() => handleEditMessage(message.id, message.content)}
                                className="p-1 rounded hover:bg-surface-container text-on-surface-variant transition-colors"
                              >
                                <MessageSquare className="w-3 h-3" />
                              </button>
                            )}
                            <button
                              onClick={() => handleDeleteMessage(message.id)}
                              className="p-1 rounded hover:bg-error/20 text-on-surface-variant hover:text-error transition-colors"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ))}

              {/* Typing Indicator */}
              {typingAgents.size > 0 && (
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded bg-primary-container/20 flex items-center justify-center">
                    <Bot className="w-4 h-4 text-primary animate-pulse" />
                  </div>
                  <div className="bg-surface-container rounded-lg p-3">
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
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyPress}
                  placeholder={`Message ${activeAgent.name}...`}
                  rows={1}
                  className="flex-1 px-4 py-3 bg-surface-container-lowest rounded-lg text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none font-mono text-sm"
                />
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || isProcessing}
                  className="btn-primary px-6 disabled:opacity-50 disabled:cursor-not-allowed self-end"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
              <div className="flex items-center justify-between mt-2 text-xs text-on-surface-variant">
                <span>Enter para enviar, Shift+Enter para nueva línea</span>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <Bot className="w-16 h-16 text-on-surface-variant mx-auto mb-4 opacity-30" />
              <p className="text-on-surface-variant font-mono text-sm uppercase tracking-wider">
                Select an agent to start chatting
              </p>
              <button
                onClick={() => setScreen('agents')}
                className="mt-4 btn-primary"
              >
                View Agents
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
