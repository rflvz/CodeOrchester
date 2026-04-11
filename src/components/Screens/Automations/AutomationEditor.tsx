import { useState, useEffect } from 'react';
import { Play, Pause, Plus, Trash2, Workflow, Zap, CheckCircle, AlertCircle } from 'lucide-react';
import { useAgentStore } from '../../../stores/agentStore';
import { useTerminalStore } from '../../../stores/terminalStore';

interface AutomationStep {
  id: string;
  name: string;
  type: 'trigger' | 'action' | 'condition';
  status: 'idle' | 'running' | 'success' | 'error' | 'skipped';
  agentId?: string;
  prompt?: string;
  condition?: string;
  falseBranch?: string;
}

const STEPS_STORAGE_KEY = 'automation-steps';

const defaultSteps: AutomationStep[] = [
  { id: '1', name: 'ON_TASK_RECEIVED', type: 'trigger', status: 'idle' },
  { id: '2', name: 'VALIDATE_INPUT', type: 'action', status: 'idle' },
  { id: '3', name: 'CHECK_AGENT_POOL', type: 'condition', status: 'idle' },
  { id: '4', name: 'DISPATCH_TO_AGENT', type: 'action', status: 'idle' },
];

interface LogEntry {
  ts: string;
  level: 'INFO' | 'RUN' | 'OK' | 'ERROR' | 'SYSTEM' | 'CONDITION';
  message: string;
}

const stepTypeOptions = ['trigger', 'action', 'condition'] as const;

function loadSteps(): AutomationStep[] {
  try {
    const raw = localStorage.getItem(STEPS_STORAGE_KEY);
    if (raw) return JSON.parse(raw) as AutomationStep[];
  } catch { /* ignore */ }
  return defaultSteps;
}

export function AutomationEditor() {
  const [isRunning, setIsRunning] = useState(false);
  const [steps, setSteps] = useState<AutomationStep[]>(loadSteps);
  const [executionLog, setExecutionLog] = useState<LogEntry[]>([
    { ts: new Date().toLocaleTimeString(), level: 'SYSTEM', message: 'Automation engine initialized' },
    { ts: new Date().toLocaleTimeString(), level: 'INFO', message: `${loadSteps().length} steps loaded` },
  ]);

  // Persist steps on every change
  useEffect(() => {
    localStorage.setItem(STEPS_STORAGE_KEY, JSON.stringify(steps.map(s => ({ ...s, status: 'idle' as const }))));
  }, [steps]);

  const addLog = (level: LogEntry['level'], message: string) => {
    setExecutionLog((prev) => [...prev, { ts: new Date().toLocaleTimeString(), level, message }]);
  };
  const [showNewStepModal, setShowNewStepModal] = useState(false);
  const [newStepName, setNewStepName] = useState('');
  const [newStepType, setNewStepType] = useState<'trigger' | 'action' | 'condition'>('action');
  const [newStepAgentId, setNewStepAgentId] = useState('');
  const [newStepPrompt, setNewStepPrompt] = useState('');
  const [newStepCondition, setNewStepCondition] = useState('');
  const [newStepFalseBranch, setNewStepFalseBranch] = useState('');

  const getStepIcon = (type: AutomationStep['type']) => {
    switch (type) {
      case 'trigger':
        return <Zap className="w-4 h-4 text-tertiary" />;
      case 'action':
        return <Workflow className="w-4 h-4 text-primary" />;
      case 'condition':
        return <AlertCircle className="w-4 h-4 text-secondary" />;
    }
  };

  const getStatusIcon = (status: AutomationStep['status']) => {
    switch (status) {
      case 'idle':
        return <div className="w-2 h-2 rounded-full bg-on-surface-variant" />;
      case 'running':
        return <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />;
      case 'success':
        return <CheckCircle className="w-4 h-4 text-tertiary" />;
      case 'error':
        return <AlertCircle className="w-4 h-4 text-secondary" />;
      case 'skipped':
        return <div className="w-2 h-2 rounded-full bg-outline-variant" />;
    }
  };

  const getStepColor = (type: AutomationStep['type']) => {
    switch (type) {
      case 'trigger':
        return 'border-l-tertiary';
      case 'action':
        return 'border-l-primary';
      case 'condition':
        return 'border-l-secondary';
    }
  };

  const handleRun = async () => {
    setIsRunning(true);
    addLog('SYSTEM', 'Starting automation run...');

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      addLog('RUN', `Executing ${step.name}`);
      setSteps(prev => prev.map((s, idx) =>
        idx === i ? { ...s, status: 'running' as const } : s
      ));

      if (step.type === 'condition' && step.condition) {
        const conditionMet = evaluateCondition(step.condition);
        addLog('CONDITION', `${step.condition} → ${conditionMet ? 'TRUE' : 'FALSE'}`);
        if (!conditionMet && step.falseBranch) {
          const jumpIdx = steps.findIndex(s => s.id === step.falseBranch);
          if (jumpIdx !== -1) {
            setSteps(prev => prev.map((s, idx) =>
              idx === i + 1 ? { ...s, status: 'skipped' as const } : s
            ));
            i = jumpIdx - 1;
            continue;
          }
        }
        setSteps(prev => prev.map((s, idx) =>
          idx === i ? { ...s, status: 'success' as const } : s
        ));
        continue;
      }

      if (step.type === 'action' && step.agentId && step.prompt) {
        const sessionId = useTerminalStore.getState().getSessionIdByAgentId(step.agentId);
        if (!sessionId) {
          addLog('ERROR', `No PTY session found for agent ${step.agentId}`);
          setSteps(prev => prev.map((s, idx) =>
            idx === i ? { ...s, status: 'error' as const } : s
          ));
          setIsRunning(false);
          return;
        }

        await window.electron?.writePty(sessionId, step.prompt + '\n');

        // Esperar trabajo_terminado para este agentId
        const done = await new Promise<boolean>((resolve) => {
          const interval = setInterval(() => {
            const agent = useAgentStore.getState().agents[step.agentId!];
            if (agent?.trabajoTerminado !== undefined) {
              clearInterval(interval);
              resolve(agent.trabajoTerminado);
            }
          }, 200);
        });

        setSteps(prev => prev.map((s, idx) =>
          idx === i ? { ...s, status: done ? 'success' : 'error' as const } : s
        ));
        addLog(done ? 'OK' : 'ERROR', `${step.name} → ${done}`);
        continue;
      }

      // trigger: solo marca success
      setSteps(prev => prev.map((s, idx) =>
        idx === i ? { ...s, status: 'success' as const } : s
      ));
    }

    setIsRunning(false);
    addLog('SYSTEM', 'Automation run completed');
  };

  // Evaluación simple de condiciones. Admite expresiones como: "agent.status === 'active'"
  const evaluateCondition = (expr: string): boolean => {
    try {
      const agents = useAgentStore.getState().agents;
      const agentList = Object.values(agents);
      // eslint-disable-next-line no-new-func
      return new Function('agents', `return ${expr}`)(agents) as boolean;
    } catch {
      addLog('ERROR', `Condition evaluation failed: ${expr}`);
      return false;
    }
  };

  const handleReset = () => {
    setSteps(prev => prev.map(step => ({ ...step, status: 'idle' as const })));
    setIsRunning(false);
  };

  const handleAddStep = () => {
    const name = newStepName || `STEP_${String(steps.length + 1).padStart(2, '0')}`;
    const newStep: AutomationStep = {
      id: crypto.randomUUID(),
      name,
      type: newStepType,
      status: 'idle',
      ...(newStepType === 'action' && newStepAgentId && { agentId: newStepAgentId, prompt: newStepPrompt }),
      ...(newStepType === 'condition' && newStepCondition && {
        condition: newStepCondition,
        falseBranch: newStepFalseBranch || undefined,
      }),
    };
    setSteps([...steps, newStep]);
    addLog('INFO', `Step added: ${name}`);
    setNewStepName('');
    setNewStepType('action');
    setNewStepAgentId('');
    setNewStepPrompt('');
    setNewStepCondition('');
    setNewStepFalseBranch('');
    setShowNewStepModal(false);
  };

  const handleDeleteStep = (stepId: string) => {
    const step = steps.find((s) => s.id === stepId);
    setSteps(steps.filter(s => s.id !== stepId));
    if (step) addLog('INFO', `Step removed: ${step.name}`);
  };

  const handleOpenNewStepModal = () => {
    setNewStepName('');
    setNewStepType('action');
    setNewStepAgentId('');
    setNewStepPrompt('');
    setNewStepCondition('');
    setNewStepFalseBranch('');
    setShowNewStepModal(true);
  };

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header - Kinetic Terminal style */}
      <div className="p-4 border-b border-outline-variant/15 bg-surface-container-low">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary-container/20 rounded">
              <Workflow className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-headline font-bold text-on-surface tracking-tight">
                AUTOMATION_ENGINE
              </h1>
              <p className="text-on-surface-variant text-xs uppercase tracking-wider font-mono">
                Workflow orchestration matrix
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-on-surface-variant font-mono uppercase">
              Status: {isRunning ? (
                <span className="text-primary">RUNNING</span>
              ) : (
                <span className="text-tertiary">STANDBY</span>
              )}
            </span>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="px-4 py-3 border-b border-outline-variant/15 bg-surface-container">
        <div className="flex items-center gap-3">
          <button
            onClick={handleOpenNewStepModal}
            className="btn-primary flex items-center gap-2 text-sm"
          >
            <Plus className="w-4 h-4" />
            NEW_STEP
          </button>
          <div className="flex-1" />
          {isRunning ? (
            <button
              onClick={handleReset}
              className="btn-secondary flex items-center gap-2 text-sm"
            >
              <Pause className="w-4 h-4 text-secondary" />
              ABORT
            </button>
          ) : (
            <button
              onClick={handleRun}
              className="btn-primary flex items-center gap-2 text-sm"
            >
              <Play className="w-4 h-4" />
              EXECUTE
            </button>
          )}
        </div>
      </div>

      {/* Workflow Canvas */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-2xl mx-auto">
          {/* Workflow Steps - Kinetic Terminal style */}
          <div className="space-y-4">
            {steps.map((step, index) => (
              <div key={step.id} className="relative">
                {/* Connection Line */}
                {index < steps.length - 1 && (
                  <div className="absolute left-5 top-full w-0.5 h-4 bg-outline-variant/30 z-0" />
                )}

                <div
                  className={`relative bg-surface-container rounded p-4 border-l-4 ${getStepColor(step.type)} cursor-pointer hover:bg-surface-container-high transition-colors`}
                >
                  <div className="flex items-center gap-4">
                    <div className="p-2 bg-surface-container-low rounded">
                      {getStepIcon(step.type)}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-on-surface-variant font-mono uppercase">
                          {String(index + 1).padStart(2, '0')}
                        </span>
                        <h3 className="font-headline font-semibold text-on-surface font-mono">
                          {step.name}
                        </h3>
                      </div>
                      <p className="text-xs text-on-surface-variant mt-1 uppercase tracking-wider">
                        Type: {step.type} | Status: {step.status}
                        {step.agentId && ` | Agent: ${step.agentId}`}
                      </p>
                      {step.prompt && (
                        <p className="text-xs text-primary/70 mt-1 font-mono truncate" title={step.prompt}>
                          → {step.prompt}
                        </p>
                      )}
                      {step.condition && (
                        <p className="text-xs text-secondary/70 mt-1 font-mono">
                          IF: {step.condition}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {getStatusIcon(step.status)}
                      <button
                        onClick={() => handleDeleteStep(step.id)}
                        className="p-1.5 hover:bg-surface-container-highest rounded transition-colors"
                      >
                        <Trash2 className="w-4 h-4 text-on-surface-variant hover:text-error" />
                      </button>
                    </div>
                  </div>

                  {/* Running Animation */}
                  {step.status === 'running' && (
                    <div className="mt-3 h-1 bg-surface-container-low rounded overflow-hidden">
                      <div className="h-full bg-primary animate-pulse" style={{ width: '60%' }} />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Add Step */}
          <button
            onClick={handleOpenNewStepModal}
            className="w-full mt-4 p-4 border-2 border-dashed border-outline-variant/30 rounded bg-surface-container-low/50 hover:bg-surface-container-low transition-colors"
          >
            <div className="flex items-center justify-center gap-2 text-on-surface-variant">
              <Plus className="w-4 h-4" />
              <span className="text-sm font-mono uppercase tracking-wider">Add Step</span>
            </div>
          </button>

          {/* Execution Log */}
          <div className="mt-8">
            <h3 className="font-headline font-semibold text-on-surface mb-3 text-sm uppercase tracking-wider">
              Execution Log
            </h3>
            <div className="bg-surface-container-lowest rounded p-4 font-mono text-xs space-y-1 max-h-40 overflow-y-auto">
              {executionLog.map((entry, i) => (
                <p key={i} className={
                  entry.level === 'SYSTEM' ? 'text-tertiary'
                  : entry.level === 'RUN' ? 'text-primary'
                  : entry.level === 'OK' ? 'text-secondary'
                  : entry.level === 'ERROR' ? 'text-error'
                  : entry.level === 'CONDITION' ? 'text-secondary'
                  : 'text-on-surface-variant'
                }>
                  [{entry.ts}] {entry.level}: {entry.message}
                </p>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* New Step Modal */}
      {showNewStepModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowNewStepModal(false)} />
          <div className="relative bg-surface-container rounded-lg p-6 w-full max-w-md shadow-2xl border border-outline-variant/15">
            <h3 className="text-lg font-headline font-bold text-on-surface uppercase tracking-tight mb-4">
              New Automation Step
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs uppercase tracking-wider text-on-surface-variant mb-2">
                  Step Name
                </label>
                <input
                  type="text"
                  value={newStepName}
                  onChange={(e) => setNewStepName(e.target.value)}
                  placeholder="e.g. VALIDATE_INPUT"
                  className="w-full px-4 py-2 bg-surface-container-low text-on-surface placeholder:text-on-surface-variant rounded font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <div>
                <label className="block text-xs uppercase tracking-wider text-on-surface-variant mb-2">
                  Step Type
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {stepTypeOptions.map((type) => (
                    <button
                      key={type}
                      onClick={() => setNewStepType(type)}
                      className={`p-3 rounded text-xs font-bold uppercase tracking-wider transition-colors ${
                        newStepType === type
                          ? type === 'trigger'
                            ? 'bg-tertiary/20 text-tertiary border border-tertiary'
                            : type === 'action'
                            ? 'bg-primary/20 text-primary border border-primary'
                            : 'bg-secondary/20 text-secondary border border-secondary'
                          : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container'
                      }`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>

              {newStepType === 'action' && (
                <>
                  <div>
                    <label className="block text-xs uppercase tracking-wider text-on-surface-variant mb-2">
                      Target Agent
                    </label>
                    <select
                      value={newStepAgentId}
                      onChange={(e) => setNewStepAgentId(e.target.value)}
                      className="w-full px-4 py-2 bg-surface-container-low text-on-surface rounded font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                    >
                      <option value="">Select agent...</option>
                      {Object.values(useAgentStore.getState().agents).map((agent) => (
                        <option key={agent.id} value={agent.id}>{agent.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs uppercase tracking-wider text-on-surface-variant mb-2">
                      Prompt / Task
                    </label>
                    <textarea
                      value={newStepPrompt}
                      onChange={(e) => setNewStepPrompt(e.target.value)}
                      placeholder="Task to send to agent via PTY..."
                      rows={3}
                      className="w-full px-4 py-2 bg-surface-container-low text-on-surface placeholder:text-on-surface-variant rounded font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                    />
                  </div>
                </>
              )}

              {newStepType === 'condition' && (
                <>
                  <div>
                    <label className="block text-xs uppercase tracking-wider text-on-surface-variant mb-2">
                      Condition (JS expression, e.g. agents[agentId]?.status === 'active')
                    </label>
                    <input
                      type="text"
                      value={newStepCondition}
                      onChange={(e) => setNewStepCondition(e.target.value)}
                      placeholder="e.g. agents[agentId]?.status === 'success'"
                      className="w-full px-4 py-2 bg-surface-container-low text-on-surface placeholder:text-on-surface-variant rounded font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs uppercase tracking-wider text-on-surface-variant mb-2">
                      False Branch Step ID (optional)
                    </label>
                    <input
                      type="text"
                      value={newStepFalseBranch}
                      onChange={(e) => setNewStepFalseBranch(e.target.value)}
                      placeholder="Step ID to jump to if condition is false"
                      className="w-full px-4 py-2 bg-surface-container-low text-on-surface placeholder:text-on-surface-variant rounded font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                  </div>
                </>
              )}
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowNewStepModal(false)}
                className="btn-secondary"
              >
                CANCEL
              </button>
              <button
                onClick={handleAddStep}
                className="btn-primary"
              >
                ADD_STEP
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
