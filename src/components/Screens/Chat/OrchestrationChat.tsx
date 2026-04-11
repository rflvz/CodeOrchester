import { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Zap, Plus, Activity, Terminal, Users } from 'lucide-react';
import { useUIStore } from '../../../stores/uiStore';
import { useAgentStore } from '../../../stores/agentStore';
import { CreateAgentModal } from '../../Shared/CreateAgentModal';

interface ChatMessage {
  id: string;
  type: 'user' | 'agent' | 'system';
  content: string;
  timestamp: Date;
}

export function OrchestrationChat() {
  const { setScreen } = useUIStore();
  const { agents } = useAgentStore();
  const agentsList = Object.values(agents);
  const activeAgentCount = agentsList.filter((a) => a.status === 'active').length;
  const systemHealth = agentsList.length === 0
    ? 100
    : Math.round((agentsList.filter((a) => a.status !== 'error').length / agentsList.length) * 100);

  const bootMessage = [
    `// CODEORCHESTRATOR v1.0`,
    `// Neural command interface initialized — ${new Date().toISOString()}`,
    `// Agents registered: ${agentsList.length}`,
    `// Ready for agent orchestration`,
  ].join('\n');

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: '1',
      type: 'system',
      content: bootMessage,
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [showNewAgentModal, setShowNewAgentModal] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isProcessing) return;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      type: 'user',
      content: input,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsProcessing(true);

    // Simulate agent response - Kinetic Terminal style
    setTimeout(() => {
      const agentMessage: ChatMessage = {
        id: crypto.randomUUID(),
        type: 'agent',
        content: `[${new Date().toLocaleTimeString()}] INFO: Processing task\n` +
          `Command: "${input}"\n\n` +
          `[${new Date().toLocaleTimeString()}] DEBUG: Neural pathway established\n` +
          `Status: READY_FOR_ORCHESTRATION\n\n` +
          `Test trabajo_terminado flag: write trabajo_terminado=false`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, agentMessage]);
      setIsProcessing(false);
    }, 1000);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header - Kinetic Terminal style */}
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
        {/* Active agents status bar */}
        <div className="flex items-center gap-4 mt-3 pt-3 border-t border-outline-variant/15">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" />
            <span className="text-xs text-on-surface-variant uppercase tracking-wider">
              Active Agents:
            </span>
            <span className="text-xs font-bold text-primary">{String(activeAgentCount).padStart(2, '0')}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-on-surface-variant uppercase tracking-wider">
              System Health:
            </span>
            <span className="text-xs font-bold text-secondary">{systemHealth}%</span>
          </div>
        </div>
      </div>

      {/* Messages - Stream Terminal style */}
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

            <div
              className={`max-w-[75%] rounded p-3 ${
                message.type === 'system'
                  ? 'bg-surface-container-lowest text-tertiary text-xs'
                  : message.type === 'user'
                  ? 'bg-primary-container/20 text-on-surface'
                  : 'bg-surface-container text-on-surface'
              }`}
            >
              <pre className="whitespace-pre-wrap font-mono text-sm leading-relaxed">
                {message.content}
              </pre>
              <p className="text-xs text-on-surface-variant mt-2 opacity-60 font-mono">
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

      {/* Input - Kinetic Terminal style */}
      <div className="p-4 border-t border-outline-variant/15 bg-surface-container-low">
        <div className="flex gap-3">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder="$ Enter command..."
            rows={1}
            className="flex-1 px-4 py-2 bg-surface-container-lowest rounded text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none font-mono text-sm"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isProcessing}
            className="btn-primary px-4 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send className="w-4 h-4" />
          </button>
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
