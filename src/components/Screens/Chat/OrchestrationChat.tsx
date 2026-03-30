import { useState, useRef, useEffect } from 'react';
import { Send, Bot, User } from 'lucide-react';
import { useAgentStore } from '../../../stores/agentStore';

interface ChatMessage {
  id: string;
  type: 'user' | 'agent' | 'system';
  content: string;
  timestamp: Date;
}

export function OrchestrationChat() {
  const { agents, createAgent } = useAgentStore();
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: '1',
      type: 'system',
      content: 'Bienvenido a CodeOrchester. Puedo ayudarte a orquestar agentes IA para tareas de código.',
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const agentsList = Object.values(agents);

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

    // Simulate agent response
    setTimeout(() => {
      const agentMessage: ChatMessage = {
        id: crypto.randomUUID(),
        type: 'agent',
        content: `Procesando: "${input}"\n\n` +
          `Este es un mensaje de demostración. La integración con Claude CLI vendrá pronto.\n\n` +
          `Para probar el flag trabajo_terminado, escribe: trabajo_terminado=false`,
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
      {/* Header */}
      <div className="p-4 border-b border-outline-variant/15">
        <h1 className="text-xl font-headline font-bold text-on-surface">Chat de Orquestación</h1>
        <p className="text-on-surface-variant text-sm">Comunícate con tus agentes</p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex gap-3 ${
              message.type === 'user' ? 'flex-row-reverse' : ''
            }`}
          >
            {message.type === 'agent' ? (
              <div className="w-8 h-8 rounded-md bg-primary-container/20 flex items-center justify-center">
                <Bot className="w-4 h-4 text-primary" />
              </div>
            ) : message.type === 'user' ? (
              <div className="w-8 h-8 rounded-md bg-surface-container flex items-center justify-center">
                <User className="w-4 h-4 text-on-surface-variant" />
              </div>
            ) : null}

            <div
              className={`max-w-[70%] rounded-lg p-3 ${
                message.type === 'system'
                  ? 'bg-surface-container-low text-on-surface-variant text-sm'
                  : message.type === 'user'
                  ? 'bg-primary-container/20 text-on-surface'
                  : 'bg-surface-container text-on-surface'
              }`}
            >
              <p className="whitespace-pre-wrap">{message.content}</p>
              <p className="text-xs text-on-surface-variant mt-1 opacity-60">
                {message.timestamp.toLocaleTimeString()}
              </p>
            </div>
          </div>
        ))}
        {isProcessing && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-md bg-primary-container/20 flex items-center justify-center">
              <Bot className="w-4 h-4 text-primary animate-pulse" />
            </div>
            <div className="bg-surface-container rounded-lg p-3">
              <p className="text-on-surface-variant animate-pulse">Procesando...</p>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-outline-variant/15">
        <div className="flex gap-3">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder="Escribe un mensaje..."
            rows={1}
            className="flex-1 px-4 py-2 bg-surface-container rounded-md text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
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
    </div>
  );
}
