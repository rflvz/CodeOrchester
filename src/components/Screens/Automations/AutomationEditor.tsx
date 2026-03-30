import { useState } from 'react';
import { Play, Pause, Plus, Trash2, Workflow, Zap, CheckCircle, AlertCircle } from 'lucide-react';

interface AutomationStep {
  id: string;
  name: string;
  type: 'trigger' | 'action' | 'condition';
  status: 'idle' | 'running' | 'success' | 'error';
}

const stepTypeOptions = ['trigger', 'action', 'condition'] as const;

export function AutomationEditor() {
  const [isRunning, setIsRunning] = useState(false);
  const [steps, setSteps] = useState<AutomationStep[]>([
    { id: '1', name: 'ON_TASK_RECEIVED', type: 'trigger', status: 'idle' },
    { id: '2', name: 'VALIDATE_INPUT', type: 'action', status: 'idle' },
    { id: '3', name: 'CHECK_AGENT_POOL', type: 'condition', status: 'idle' },
    { id: '4', name: 'DISPATCH_TO_AGENT', type: 'action', status: 'idle' },
  ]);
  const [showNewStepModal, setShowNewStepModal] = useState(false);
  const [newStepName, setNewStepName] = useState('');
  const [newStepType, setNewStepType] = useState<'trigger' | 'action' | 'condition'>('action');

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

  const handleRun = () => {
    setIsRunning(true);
    let stepIndex = 0;

    const runStep = () => {
      if (stepIndex < steps.length) {
        setSteps(prev => prev.map((step, i) =>
          i === stepIndex ? { ...step, status: 'running' as const } : step
        ));

        setTimeout(() => {
          setSteps(prev => prev.map((step, i) =>
            i === stepIndex ? { ...step, status: 'success' as const } : step
          ));
          stepIndex++;
          if (stepIndex < steps.length) {
            runStep();
          } else {
            setIsRunning(false);
          }
        }, 1000);
      }
    };

    runStep();
  };

  const handleReset = () => {
    setSteps(prev => prev.map(step => ({ ...step, status: 'idle' as const })));
    setIsRunning(false);
  };

  const handleAddStep = () => {
    const newStep: AutomationStep = {
      id: crypto.randomUUID(),
      name: newStepName || `STEP_${String(steps.length + 1).padStart(2, '0')}`,
      type: newStepType,
      status: 'idle',
    };
    setSteps([...steps, newStep]);
    setNewStepName('');
    setNewStepType('action');
    setShowNewStepModal(false);
  };

  const handleDeleteStep = (stepId: string) => {
    setSteps(steps.filter(s => s.id !== stepId));
  };

  const handleOpenNewStepModal = () => {
    setNewStepName('');
    setNewStepType('action');
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
                      </p>
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
            <div className="bg-surface-container-lowest rounded p-4 font-mono text-xs space-y-1">
              <p className="text-tertiary">[12:45:02] SYSTEM: Automation engine initialized</p>
              <p className="text-on-surface-variant">[12:45:03] INFO: 4 steps loaded</p>
              {isRunning && (
                <>
                  <p className="text-primary">[12:45:04] RUN: Executing ON_TASK_RECEIVED</p>
                  <p className="text-tertiary">[12:45:05] OK: Trigger fired successfully</p>
                </>
              )}
              {!isRunning && steps.some(s => s.status === 'success') && (
                <p className="text-tertiary">[12:45:06] COMPLETE: All steps executed</p>
              )}
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
