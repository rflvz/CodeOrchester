/**
 * DAW-563: Bug — evaluateCondition no está definida en el momento que handleRun la llama
 *
 * Fix: evaluateCondition (const arrow function) fue movida a ANTES de handleRun, ya que
 * las const arrow functions no tienen hoisting y causaban un ReferenceError en runtime.
 * Además se añadió un timeout de 60 s al polling de trabajoTerminado para evitar promise leaks.
 */

import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AutomationEditor } from '../../components/Screens/Automations/AutomationEditor';
import { useAgentStore } from '../../stores/agentStore';

// Reset Zustand store between tests
const resetStores = () => {
  useAgentStore.setState({ agents: {}, activeAgentId: null });
};

// Minimal localStorage mock (jsdom provides one but we clear it explicitly)
beforeEach(() => {
  localStorage.removeItem('automation-steps');
  resetStores();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Helper: extract evaluateCondition logic for unit-level tests.
// We do this by rendering AutomationEditor and then triggering a condition step
// through the UI — or by testing the observable side effects on the execution log.
// Since evaluateCondition is a private const inside the component, we test it
// indirectly through the handleRun flow, which is the actual integration point.
// ---------------------------------------------------------------------------

describe('DAW-563 – evaluateCondition is reachable from handleRun', () => {
  it('renders EXECUTE button without throwing (basic smoke test)', () => {
    render(<AutomationEditor />);
    expect(screen.getByRole('button', { name: /execute/i })).toBeInTheDocument();
  });

  it('clicking EXECUTE does not throw ReferenceError for condition steps', async () => {
    // Set up a single condition step via localStorage so handleRun encounters one
    const conditionStep = {
      id: 'c1',
      name: 'CHECK_TRUE',
      type: 'condition',
      status: 'idle',
      condition: 'true',
    };
    localStorage.setItem('automation-steps', JSON.stringify([conditionStep]));

    render(<AutomationEditor />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /execute/i }));
    });

    // If evaluateCondition was still below handleRun this would throw.
    // The log panel should show the CONDITION entry instead.
    await waitFor(() => {
      // Execution log is rendered in the component — look for the condition trace
      expect(screen.getByText(/true → true/i)).toBeInTheDocument();
    });
  });

  it('evaluateCondition returns TRUE for a valid truthy JS expression', async () => {
    // Seed an agent in the store so the expression can reference "agents"
    act(() => {
      useAgentStore.getState().createAgent({
        name: 'TestBot',
        description: '',
        status: 'active',
        teamId: null,
        skills: [],
        currentTask: null,
        trabajoTerminado: false,
      });
    });

    const trueStep = {
      id: 't1',
      name: 'ALWAYS_TRUE',
      type: 'condition',
      status: 'idle',
      condition: 'Object.values(agents).some(a => a.status === "active")',
    };
    localStorage.setItem('automation-steps', JSON.stringify([trueStep]));

    render(<AutomationEditor />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /execute/i }));
    });

    await waitFor(() => {
      expect(
        screen.getByText(/Object\.values\(agents\)\.some\(a => a\.status === "active"\) → TRUE/i)
      ).toBeInTheDocument();
    });
  });

  it('evaluateCondition returns FALSE for a valid falsy JS expression', async () => {
    const falseStep = {
      id: 'f1',
      name: 'ALWAYS_FALSE',
      type: 'condition',
      status: 'idle',
      condition: 'false',
    };
    localStorage.setItem('automation-steps', JSON.stringify([falseStep]));

    render(<AutomationEditor />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /execute/i }));
    });

    await waitFor(() => {
      expect(screen.getByText(/false → false/i)).toBeInTheDocument();
    });
  });

  it('evaluateCondition returns FALSE (no throw) for an invalid/broken JS expression', async () => {
    const invalidStep = {
      id: 'e1',
      name: 'BROKEN_EXPR',
      type: 'condition',
      status: 'idle',
      condition: 'this is not valid javascript !!!',
    };
    localStorage.setItem('automation-steps', JSON.stringify([invalidStep]));

    render(<AutomationEditor />);

    // Should NOT throw; the component must catch and log the error
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /execute/i }));
    });

    await waitFor(() => {
      // Error is logged to the execution log panel
      expect(
        screen.getByText(/Condition evaluation failed: this is not valid javascript !!!/i)
      ).toBeInTheDocument();
    });
  });
});
