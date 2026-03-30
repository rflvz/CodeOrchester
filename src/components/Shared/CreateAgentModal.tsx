import { useState } from 'react';
import { Plus, Settings, Brain, Database, Shield, Languages } from 'lucide-react';
import { useAgentStore } from '../../stores/agentStore';

interface CreateAgentModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const capabilityOptions = [
  { id: 'code_analysis', label: 'Code Analysis', description: 'Debug, refactor, and review' },
  { id: 'web_search', label: 'Web Search', description: 'Real-time external indexing' },
  { id: 'data_synthesis', label: 'Data Synthesis', description: 'Multi-modal pattern matching' },
  { id: 'network_access', label: 'Network Access', description: 'Control remote terminal nodes' },
];

export function CreateAgentModal({ isOpen, onClose }: CreateAgentModalProps) {
  const { createAgent } = useAgentStore();

  const [agentName, setAgentName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedIcon, setSelectedIcon] = useState('psychology');
  const [capabilities, setCapabilities] = useState<string[]>(['code_analysis', 'data_synthesis']);
  const [initialInstructions, setInitialInstructions] = useState('');

  const handleToggleCapability = (id: string) => {
    setCapabilities((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  };

  const handleCreate = () => {
    if (!agentName.trim()) return;
    createAgent({
      name: agentName.toUpperCase().replace(/\s+/g, '_'),
      description,
      status: 'idle',
      teamId: null,
      skills: capabilities,
      currentTask: null,
      trabajoTerminado: true,
    });
    setAgentName('');
    setDescription('');
    setSelectedIcon('psychology');
    setCapabilities(['code_analysis', 'data_synthesis']);
    setInitialInstructions('');
    onClose();
  };

  if (!isOpen) return null;

  const iconOptions = [
    { id: 'psychology', icon: <Brain className="w-6 h-6" />, label: 'Psychology' },
    { id: 'memory', icon: <Database className="w-6 h-6" />, label: 'Memory' },
    { id: 'security', icon: <Shield className="w-6 h-6" />, label: 'Security' },
    { id: 'language', icon: <Languages className="w-6 h-6" />, label: 'Language' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-5xl mx-4 bg-surface-container rounded-lg shadow-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-outline-variant/15 bg-surface">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-2xl font-headline font-bold text-on-surface uppercase tracking-tight">
                Initialize Agent
              </h2>
              <p className="text-xs text-on-surface-variant uppercase tracking-wider font-mono mt-1">
                Configuration Protocol: NEW_ENTITY_{String(Math.floor(Math.random() * 9999)).padStart(4, '0')}
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-surface-container-high rounded transition-colors"
            >
              <Settings className="w-5 h-5 text-on-surface-variant" />
            </button>
          </div>

          {/* Steps Indicator */}
          <div className="flex items-center gap-4">
            <div className="flex flex-col items-center gap-1">
              <div className="w-20 h-1 heat-gradient"></div>
              <span className="text-[10px] font-bold text-primary uppercase tracking-wider">Identity</span>
            </div>
            <div className="w-8 h-[1px] bg-outline-variant/30 mb-4"></div>
            <div className="flex flex-col items-center gap-1 opacity-40">
              <div className="w-20 h-1 bg-surface-container-highest"></div>
              <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">Intellect</span>
            </div>
            <div className="w-8 h-[1px] bg-outline-variant/30 mb-4"></div>
            <div className="flex flex-col items-center gap-1 opacity-40">
              <div className="w-20 h-1 bg-surface-container-highest"></div>
              <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">Deployment</span>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          <div className="grid grid-cols-12 gap-8">
            {/* Left Column - Form */}
            <div className="col-span-7 space-y-8">
              {/* Identity Section */}
              <section className="space-y-6">
                <div className="flex items-center gap-3">
                  <span className="text-primary font-black font-headline text-lg">01</span>
                  <h3 className="text-sm font-bold text-on-surface uppercase tracking-wider">Identity & Core Purpose</h3>
                </div>

                <div className="space-y-6">
                  {/* Agent Name */}
                  <div>
                    <label className="block text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-2">
                      Agent Name
                    </label>
                    <input
                      type="text"
                      value={agentName}
                      onChange={(e) => setAgentName(e.target.value)}
                      placeholder="e.g. VECTOR_SIGMA"
                      className="w-full bg-surface-container-lowest border-0 ring-1 ring-outline-variant/15 focus:ring-primary/40 p-4 text-on-surface font-mono text-sm tracking-tight placeholder:text-on-surface-variant/50 transition-all"
                    />
                  </div>

                  {/* Purpose */}
                  <div>
                    <label className="block text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-2">
                      Purpose / Description
                    </label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Define the primary operational objective of this entity..."
                      rows={3}
                      className="w-full bg-surface-container-lowest border-0 ring-1 ring-outline-variant/15 focus:ring-primary/40 p-4 text-on-surface font-mono text-sm tracking-tight placeholder:text-on-surface-variant/50 transition-all resize-none"
                    />
                  </div>

                  {/* Profile Image */}
                  <div>
                    <label className="block text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-3">
                      Profile Image
                    </label>
                    <div className="flex items-center gap-3">
                      {iconOptions.map((opt) => (
                        <button
                          key={opt.id}
                          onClick={() => setSelectedIcon(opt.id)}
                          className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${
                            selectedIcon === opt.id
                              ? 'ring-2 ring-primary bg-surface-container-high text-primary'
                              : 'ring-1 ring-outline-variant/20 bg-surface-container text-on-surface-variant hover:ring-primary/50'
                          }`}
                        >
                          {opt.icon}
                        </button>
                      ))}
                      <button className="w-14 h-14 rounded-full ring-1 ring-dashed ring-outline-variant/30 hover:ring-primary/50 flex items-center justify-center text-on-surface-variant transition-all">
                        <Plus className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                </div>
              </section>

              {/* Intellect Section */}
              <section className="space-y-6 pt-6 border-t border-outline-variant/15">
                <div className="flex items-center gap-3">
                  <span className="text-on-surface-variant font-black font-headline text-lg opacity-40">02</span>
                  <h3 className="text-sm font-bold text-on-surface uppercase tracking-wider opacity-60">Capabilities & Initial Intellect</h3>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {capabilityOptions.map((cap) => (
                    <label
                      key={cap.id}
                      className="flex items-center gap-3 p-4 bg-surface-container-low hover:bg-surface-container cursor-pointer transition-colors rounded"
                    >
                      <input
                        type="checkbox"
                        checked={capabilities.includes(cap.id)}
                        onChange={() => handleToggleCapability(cap.id)}
                        className="w-5 h-5 bg-surface-container-lowest border border-outline-variant/30 text-primary-container focus:ring-0 rounded-sm"
                      />
                      <div className="flex flex-col">
                        <span className="text-xs font-bold text-on-surface uppercase tracking-wider">{cap.label}</span>
                        <span className="text-[10px] text-on-surface-variant uppercase">{cap.description}</span>
                      </div>
                    </label>
                  ))}
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-2">
                    Initial Instructions
                  </label>
                  <textarea
                    value={initialInstructions}
                    onChange={(e) => setInitialInstructions(e.target.value)}
                    placeholder="Direct system prompt or specialized logic constraints..."
                    rows={6}
                    className="w-full bg-surface-container-lowest border-0 ring-1 ring-outline-variant/15 focus:ring-primary/40 p-4 text-on-surface font-mono text-sm tracking-tight placeholder:text-on-surface-variant/50 transition-all resize-none"
                  />
                </div>
              </section>
            </div>

            {/* Right Column - Live Preview */}
            <div className="col-span-5">
              <div className="sticky top-0 space-y-4">
                {/* Node Preview */}
                <div className="bg-surface-container/70 backdrop-blur-sm border border-outline-variant/10 p-6 rounded-lg relative">
                  <div className="absolute top-3 right-3">
                    <span className="text-[10px] font-bold text-tertiary-container uppercase tracking-widest">Live Preview</span>
                  </div>

                  <div className="flex flex-col items-center py-8 space-y-4">
                    {/* Dynamic Node Circle */}
                    <div className="relative">
                      {/* Orbital Ring */}
                      <div className="absolute inset-[-15px] rounded-full border border-dashed border-primary/20"></div>
                      <div className="w-28 h-28 rounded-full heat-gradient flex items-center justify-center shadow-[0_0_60px_-10px_rgba(255,86,55,0.5)]">
                        {selectedIcon === 'psychology' && <Brain className="w-12 h-12 text-white" />}
                        {selectedIcon === 'memory' && <Database className="w-12 h-12 text-white" />}
                        {selectedIcon === 'security' && <Shield className="w-12 h-12 text-white" />}
                        {selectedIcon === 'language' && <Languages className="w-12 h-12 text-white" />}
                      </div>
                      {/* Data Particles */}
                      <div className="absolute top-0 -right-2 w-3 h-3 bg-tertiary rounded-full shadow-[0_0_15px_#7cd0ff]"></div>
                      <div className="absolute bottom-4 -left-4 w-2 h-2 bg-secondary rounded-full shadow-[0_0_10px_#ffb2ba]"></div>
                    </div>

                    <div className="text-center">
                      <h3 className="text-xl font-black font-headline uppercase tracking-tighter text-on-surface">
                        {agentName || 'VECTOR_SIGMA'}
                      </h3>
                      <p className="text-[10px] text-on-surface-variant uppercase tracking-widest mt-1">
                        Status: Uninitialized
                      </p>
                    </div>
                  </div>

                  {/* System Logs */}
                  <div className="bg-surface-container-lowest/50 p-3 rounded-sm border-l-2 border-primary">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-[10px] font-bold text-on-surface-variant uppercase">System Logs</span>
                      <div className="flex gap-1">
                        <div className="w-1.5 h-1.5 rounded-full bg-error animate-pulse"></div>
                        <div className="w-1.5 h-1.5 rounded-full bg-surface-container-high"></div>
                      </div>
                    </div>
                    <div className="font-mono text-[10px] text-on-surface-variant space-y-1">
                      <p>&gt; WAITING FOR SEED CONFIG...</p>
                      <p>&gt; SCHEMA DETECTED: [AGENT_CORE_V1]</p>
                      <p>&gt; RESOURCE ALLOCATION: 4096MB</p>
                    </div>
                  </div>
                </div>

                {/* Skills Summary */}
                <div className="bg-surface-container-low p-4 border-r-2 border-primary/40 rounded">
                  <h4 className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-3">
                    Assigned Skills
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {capabilities.length > 0 ? (
                      capabilities.map((cap) => (
                        <span
                          key={cap}
                          className="bg-surface-container-highest px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-primary border border-primary/20 rounded-sm"
                        >
                          {capabilityOptions.find((c) => c.id === cap)?.label}
                        </span>
                      ))
                    ) : (
                      <span className="text-[10px] text-on-surface-variant">No skills selected</span>
                    )}
                  </div>
                </div>

                {/* Technical Specs */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-surface-container-low rounded">
                    <span className="block text-[10px] font-bold text-on-surface-variant uppercase mb-1">Architecture</span>
                    <span className="text-xs font-black text-on-surface uppercase">Transformer-L4</span>
                  </div>
                  <div className="p-3 bg-surface-container-low rounded">
                    <span className="block text-[10px] font-bold text-on-surface-variant uppercase mb-1">Latency Tier</span>
                    <span className="text-xs font-black text-on-surface uppercase">&lt; 150ms / Ultra</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-outline-variant/15 bg-surface flex justify-end">
          <button
            onClick={handleCreate}
            disabled={!agentName.trim()}
            className="heat-gradient text-white font-black font-headline px-10 py-3 rounded-sm hover:scale-[1.02] active:scale-[0.98] transition-all tracking-[0.15em] uppercase text-xs shadow-[0_20px_40px_-15px_rgba(255,86,55,0.3)] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
          >
            Create Agent
          </button>
        </div>
      </div>
    </div>
  );
}
