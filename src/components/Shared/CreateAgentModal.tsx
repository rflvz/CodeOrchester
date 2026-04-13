import { useState, useEffect } from 'react';
import { Plus, Settings, Brain, Database, Shield, Languages, ChevronRight, ChevronLeft } from 'lucide-react';
import { useAgentStore } from '../../stores/agentStore';

interface CreateAgentModalProps {
  isOpen: boolean;
  onClose: () => void;
  agentId?: string;
}

const capabilityOptions = [
  { id: 'code_analysis', label: 'Code Analysis', description: 'Debug, refactor, and review' },
  { id: 'web_search', label: 'Web Search', description: 'Real-time external indexing' },
  { id: 'data_synthesis', label: 'Data Synthesis', description: 'Multi-modal pattern matching' },
  { id: 'network_access', label: 'Network Access', description: 'Control remote terminal nodes' },
];

const iconOptions = [
  { id: 'psychology', icon: <Brain className="w-6 h-6" />, label: 'Psychology' },
  { id: 'memory', icon: <Database className="w-6 h-6" />, label: 'Memory' },
  { id: 'security', icon: <Shield className="w-6 h-6" />, label: 'Security' },
  { id: 'language', icon: <Languages className="w-6 h-6" />, label: 'Language' },
];

type Step = 1 | 2 | 3;

export function CreateAgentModal({ isOpen, onClose, agentId }: CreateAgentModalProps) {
  const { agents, createAgent, updateAgent } = useAgentStore();
  const isEditing = Boolean(agentId);
  const existingAgent = agentId ? agents[agentId] : null;

  const [currentStep, setCurrentStep] = useState<Step>(1);
  const [agentName, setAgentName] = useState('');
  const [nameError, setNameError] = useState('');
  const [description, setDescription] = useState('');
  const [selectedIcon, setSelectedIcon] = useState('psychology');
  const [capabilities, setCapabilities] = useState<string[]>(['code_analysis', 'data_synthesis']);
  const [initialInstructions, setInitialInstructions] = useState('');
  const [inactivityTimeout, setInactivityTimeout] = useState(5);

  useEffect(() => {
    if (isOpen && existingAgent) {
      setAgentName(existingAgent.name);
      setDescription(existingAgent.description);
      setSelectedIcon(existingAgent.icon || 'psychology');
      setCapabilities(existingAgent.skills);
      setInitialInstructions(existingAgent.instructions || '');
      setInactivityTimeout(existingAgent.inactivityTimeout ?? 5);
    } else if (isOpen && !isEditing) {
      setAgentName('');
      setDescription('');
      setSelectedIcon('psychology');
      setCapabilities(['code_analysis', 'data_synthesis']);
      setInitialInstructions('');
      setInactivityTimeout(5);
    }
    if (isOpen) {
      setCurrentStep(1);
      setNameError('');
    }
  }, [isOpen, agentId]);

  const handleToggleCapability = (id: string) => {
    setCapabilities((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  };

  const validateName = (name: string): string => {
    if (!name.trim()) return 'El nombre del agente es requerido';
    const normalized = name.trim().toUpperCase().replace(/\s+/g, '_');
    const isDuplicate = Object.values(agents).some(
      (a) => a.name === normalized && a.id !== agentId
    );
    if (isDuplicate) return 'Ya existe un agente con ese nombre';
    return '';
  };

  const handleNextStep = () => {
    if (currentStep === 1) {
      const error = validateName(agentName);
      if (error) { setNameError(error); return; }
      setNameError('');
    }
    if (currentStep < 3) setCurrentStep((s) => (s + 1) as Step);
  };

  const handlePrevStep = () => {
    if (currentStep > 1) setCurrentStep((s) => (s - 1) as Step);
  };

  const handleSubmit = () => {
    const error = validateName(agentName);
    if (error) { setNameError(error); return; }

    const agentData = {
      name: agentName.trim().toUpperCase().replace(/\s+/g, '_'),
      description,
      skills: capabilities,
      icon: selectedIcon,
      instructions: initialInstructions,
      inactivityTimeout,
    };

    if (isEditing && agentId) {
      updateAgent(agentId, agentData);
    } else {
      createAgent({
        ...agentData,
        status: 'idle',
        teamId: null,
        currentTask: null,
        trabajoTerminado: true,
      });
    }

    onClose();
  };

  const steps = [
    { n: 1, label: 'Identity' },
    { n: 2, label: 'Intellect' },
    { n: 3, label: 'Deployment' },
  ];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-5xl mx-4 bg-surface-container rounded-lg shadow-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-outline-variant/15 bg-surface">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-2xl font-headline font-bold text-on-surface uppercase tracking-tight">
                {isEditing ? 'Edit Agent' : 'Initialize Agent'}
              </h2>
              <p className="text-xs text-on-surface-variant uppercase tracking-wider font-mono mt-1">
                {isEditing
                  ? `Editing: ${existingAgent?.name || agentId}`
                  : `Configuration Protocol: NEW_ENTITY_${String(Math.floor(Math.random() * 9999)).padStart(4, '0')}`}
              </p>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-surface-container-high rounded transition-colors">
              <Settings className="w-5 h-5 text-on-surface-variant" />
            </button>
          </div>

          {/* Steps Indicator */}
          {!isEditing && (
            <div className="flex items-center gap-4">
              {steps.map((step, i) => (
                <div key={step.n} className="flex items-center gap-4">
                  <div className="flex flex-col items-center gap-1">
                    <div className={`w-20 h-1 ${currentStep >= step.n ? 'heat-gradient' : 'bg-surface-container-highest'}`} />
                    <span className={`text-[10px] font-bold uppercase tracking-wider ${
                      currentStep >= step.n ? 'text-primary' : 'text-on-surface-variant opacity-40'
                    }`}>
                      {step.label}
                    </span>
                  </div>
                  {i < steps.length - 1 && (
                    <div className="w-8 h-[1px] bg-outline-variant/30 mb-4" />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          <div className="grid grid-cols-12 gap-8">
            {/* Left Column - Form */}
            <div className="col-span-7 space-y-8">
              {/* Step 1: Identity */}
              {(isEditing || currentStep === 1) && (
                <section className="space-y-6">
                  <div className="flex items-center gap-3">
                    <span className="text-primary font-black font-headline text-lg">01</span>
                    <h3 className="text-sm font-bold text-on-surface uppercase tracking-wider">Identity & Core Purpose</h3>
                  </div>

                  <div className="space-y-6">
                    <div>
                      <label className="block text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-2">
                        Agent Name
                      </label>
                      <input
                        type="text"
                        value={agentName}
                        onChange={(e) => { setAgentName(e.target.value); setNameError(''); }}
                        placeholder="e.g. VECTOR_SIGMA"
                        className={`w-full bg-surface-container-lowest border-0 ring-1 focus:ring-primary/40 p-4 text-on-surface font-mono text-sm tracking-tight placeholder:text-on-surface-variant/50 transition-all ${
                          nameError ? 'ring-error/60' : 'ring-outline-variant/15'
                        }`}
                      />
                      {nameError && (
                        <p className="text-error text-xs mt-1 font-mono">{nameError}</p>
                      )}
                    </div>

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
              )}

              {/* Step 2: Intellect */}
              {(isEditing || currentStep === 2) && (
                <section className="space-y-6">
                  <div className="flex items-center gap-3">
                    <span className="text-primary font-black font-headline text-lg">02</span>
                    <h3 className="text-sm font-bold text-on-surface uppercase tracking-wider">Capabilities & Initial Intellect</h3>
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
              )}

              {/* Step 3: Deployment */}
              {(isEditing || currentStep === 3) && (
                <section className="space-y-6">
                  <div className="flex items-center gap-3">
                    <span className="text-primary font-black font-headline text-lg">03</span>
                    <h3 className="text-sm font-bold text-on-surface uppercase tracking-wider">Deployment Configuration</h3>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-4 bg-surface-container-low rounded">
                      <span className="block text-[10px] font-bold text-on-surface-variant uppercase mb-1">Architecture</span>
                      <span className="text-xs font-black text-on-surface uppercase">Transformer-L4</span>
                    </div>
                    <div className="p-4 bg-surface-container-low rounded">
                      <span className="block text-[10px] font-bold text-on-surface-variant uppercase mb-1">Latency Tier</span>
                      <span className="text-xs font-black text-on-surface uppercase">&lt; 150ms / Ultra</span>
                    </div>
                    <div className="p-4 bg-surface-container-low rounded">
                      <span className="block text-[10px] font-bold text-on-surface-variant uppercase mb-1">Memory Allocation</span>
                      <span className="text-xs font-black text-on-surface uppercase">4096MB</span>
                    </div>
                    <div className="p-4 bg-surface-container-low rounded">
                      <span className="block text-[10px] font-bold text-on-surface-variant uppercase mb-1">Runtime</span>
                      <span className="text-xs font-black text-on-surface uppercase">Claude CLI</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-2">
                      Inactivity Timeout (minutes)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={60}
                      value={inactivityTimeout}
                      onChange={(e) => setInactivityTimeout(Math.max(1, Math.min(60, Number(e.target.value))))}
                      className="w-full bg-surface-container-lowest border-0 ring-1 ring-outline-variant/15 focus:ring-primary/40 p-4 text-on-surface font-mono text-sm tracking-tight transition-all"
                    />
                    <p className="text-[10px] text-on-surface-variant font-mono mt-1">
                      Si no hay output del agente en este tiempo, se marcará como error. Default: 5 min.
                    </p>
                  </div>

                  <p className="text-xs text-on-surface-variant font-mono">
                    El agente usará Claude CLI como runtime. Las credenciales MiniMax se inyectan automáticamente desde Configuración.
                  </p>
                </section>
              )}
            </div>

            {/* Right Column - Live Preview */}
            <div className="col-span-5">
              <div className="sticky top-0 space-y-4">
                <div className="bg-surface-container/70 backdrop-blur-sm border border-outline-variant/10 p-6 rounded-lg relative">
                  <div className="absolute top-3 right-3">
                    <span className="text-[10px] font-bold text-tertiary-container uppercase tracking-widest">Live Preview</span>
                  </div>

                  <div className="flex flex-col items-center py-8 space-y-4">
                    <div className="relative">
                      <div className="absolute inset-[-15px] rounded-full border border-dashed border-primary/20"></div>
                      <div className="w-28 h-28 rounded-full heat-gradient flex items-center justify-center shadow-[0_0_60px_-10px_rgba(255,86,55,0.5)]">
                        {selectedIcon === 'psychology' && <Brain className="w-12 h-12 text-white" />}
                        {selectedIcon === 'memory' && <Database className="w-12 h-12 text-white" />}
                        {selectedIcon === 'security' && <Shield className="w-12 h-12 text-white" />}
                        {selectedIcon === 'language' && <Languages className="w-12 h-12 text-white" />}
                      </div>
                      <div className="absolute top-0 -right-2 w-3 h-3 bg-tertiary rounded-full shadow-[0_0_15px_#7cd0ff]"></div>
                      <div className="absolute bottom-4 -left-4 w-2 h-2 bg-secondary rounded-full shadow-[0_0_10px_#ffb2ba]"></div>
                    </div>

                    <div className="text-center">
                      <h3 className="text-xl font-black font-headline uppercase tracking-tighter text-on-surface">
                        {agentName || 'VECTOR_SIGMA'}
                      </h3>
                      <p className="text-[10px] text-on-surface-variant uppercase tracking-widest mt-1">
                        Status: {isEditing ? existingAgent?.status || 'Unknown' : 'Uninitialized'}
                      </p>
                    </div>
                  </div>

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
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-outline-variant/15 bg-surface flex items-center justify-between">
          {/* Back button */}
          {!isEditing && currentStep > 1 ? (
            <button
              onClick={handlePrevStep}
              className="flex items-center gap-2 px-6 py-3 text-xs font-bold uppercase tracking-wider text-on-surface-variant hover:text-on-surface border border-outline-variant/30 rounded-sm transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              Back
            </button>
          ) : <div />}

          {/* Next / Submit */}
          {!isEditing && currentStep < 3 ? (
            <button
              onClick={handleNextStep}
              className="flex items-center gap-2 heat-gradient text-white font-black font-headline px-10 py-3 rounded-sm hover:scale-[1.02] active:scale-[0.98] transition-all tracking-[0.15em] uppercase text-xs shadow-[0_20px_40px_-15px_rgba(255,86,55,0.3)]"
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={!agentName.trim()}
              className="heat-gradient text-white font-black font-headline px-10 py-3 rounded-sm hover:scale-[1.02] active:scale-[0.98] transition-all tracking-[0.15em] uppercase text-xs shadow-[0_20px_40px_-15px_rgba(255,86,55,0.3)] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
            >
              {isEditing ? 'Save Changes' : 'Create Agent'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
