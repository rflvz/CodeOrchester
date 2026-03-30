/**
 * DAW-550 & DAW-552: Bug — Topology drag-to-connect entre agentes no crea conexiones
 *
 * Fix: Replaced onMouseUp on agent node divs with a global window.addEventListener('mouseup')
 * that uses document.elementsFromPoint to find the target agent regardless of which child
 * element received the event. Also added data-agent-id attributes to agent divs.
 */

import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Topology } from '../components/Screens/Topology/Topology';
import { useAgentStore } from '../stores/agentStore';
import { useTeamStore } from '../stores/teamStore';

// Reset Zustand stores before each test
const resetStores = () => {
  useAgentStore.setState({ agents: {}, activeAgentId: null });
  // Reset teams to empty
  useTeamStore.setState({ teams: {} } as Parameters<typeof useTeamStore.setState>[0]);
};

describe('DAW-550 / DAW-552 – Topology agent connections', () => {
  beforeEach(() => {
    resetStores();
  });

  it('agent node divs have data-agent-id attribute (required for elementsFromPoint lookup)', async () => {
    let agentId!: string;
    act(() => {
      agentId = useAgentStore.getState().createAgent({
        name: 'NodeA',
        description: '',
        status: 'idle',
        teamId: null,
        skills: [],
        currentTask: null,
        trabajoTerminado: false,
      }).id;
    });

    render(<Topology />);

    // Let the nodePositions useEffect run
    await waitFor(() => {
      const nodeDiv = document.querySelector(`[data-agent-id="${agentId}"]`);
      expect(nodeDiv).toBeInTheDocument();
    });
  });

  it('connection handle is visible at rest (opacity-30, not opacity-0)', async () => {
    act(() => {
      useAgentStore.getState().createAgent({
        name: 'NodeB',
        description: '',
        status: 'idle',
        teamId: null,
        skills: [],
        currentTask: null,
        trabajoTerminado: false,
      });
    });

    render(<Topology />);

    await waitFor(() => {
      const handle = document.querySelector('[title="Drag to connect"]');
      expect(handle).toBeInTheDocument();
      // Should have opacity-30 class (always visible, not opacity-0)
      expect(handle?.className).toContain('opacity-30');
      expect(handle?.className).not.toContain('opacity-0');
    });
  });

  it('global mouseup on window creates a connection when target has data-agent-id', async () => {
    let fromId!: string;
    let toId!: string;

    act(() => {
      fromId = useAgentStore.getState().createAgent({
        name: 'Source',
        description: '',
        status: 'idle',
        teamId: null,
        skills: [],
        currentTask: null,
        trabajoTerminado: false,
      }).id;
      toId = useAgentStore.getState().createAgent({
        name: 'Target',
        description: '',
        status: 'idle',
        teamId: null,
        skills: [],
        currentTask: null,
        trabajoTerminado: false,
      }).id;
    });

    render(<Topology />);

    // Wait for nodePositions useEffect to populate positions
    await waitFor(() => {
      expect(document.querySelector(`[data-agent-id="${fromId}"]`)).toBeInTheDocument();
      expect(document.querySelector(`[data-agent-id="${toId}"]`)).toBeInTheDocument();
    });

    // Simulate mousedown on the connection handle of the source agent
    // The handle's onMouseDown sets connectionDraw only if nodePositions[agentId] exists
    const sourceHandle = document
      .querySelector(`[data-agent-id="${fromId}"]`)!
      .querySelector('[title="Drag to connect"]')!;

    act(() => {
      fireEvent.mouseDown(sourceHandle, { button: 0 });
    });

    // Now the global window mouseup listener should be active.
    // Mock elementsFromPoint — jsdom doesn't implement it, so we assign directly.
    const targetDiv = document.querySelector(`[data-agent-id="${toId}"]`) as HTMLElement;
    const originalEFP = document.elementsFromPoint;
    document.elementsFromPoint = () => [targetDiv];

    act(() => {
      fireEvent.mouseUp(window, { clientX: 800, clientY: 300 });
    });

    document.elementsFromPoint = originalEFP;

    // A connection SVG path should now exist between the two agents
    await waitFor(() => {
      // The SVG contains paths for connections; after connecting, at least one path should exist
      const paths = document.querySelectorAll('svg path[stroke="#97a9ff"]');
      // A solid (non-dashed) connection path should have appeared
      const connectionPaths = Array.from(paths).filter(
        (p) => !p.getAttribute('stroke-dasharray')
      );
      expect(connectionPaths.length).toBeGreaterThan(0);
    });
  });

  it('dropping on the same source agent does not create a self-connection', async () => {
    let agentId!: string;

    act(() => {
      agentId = useAgentStore.getState().createAgent({
        name: 'Solo',
        description: '',
        status: 'idle',
        teamId: null,
        skills: [],
        currentTask: null,
        trabajoTerminado: false,
      }).id;
    });

    render(<Topology />);

    await waitFor(() => {
      expect(document.querySelector(`[data-agent-id="${agentId}"]`)).toBeInTheDocument();
    });

    const handle = document
      .querySelector(`[data-agent-id="${agentId}"]`)!
      .querySelector('[title="Drag to connect"]')!;

    act(() => {
      fireEvent.mouseDown(handle, { button: 0 });
    });

    // Mock elementsFromPoint to return the SAME agent (self-drop)
    const sameDiv = document.querySelector(`[data-agent-id="${agentId}"]`) as HTMLElement;
    const originalEFP2 = document.elementsFromPoint;
    document.elementsFromPoint = () => [sameDiv];

    act(() => {
      fireEvent.mouseUp(window, { clientX: 100, clientY: 100 });
    });

    document.elementsFromPoint = originalEFP2;

    await waitFor(() => {
      // No solid connection paths should exist (no self-loops)
      const paths = document.querySelectorAll('svg path[stroke="#97a9ff"]');
      const solidPaths = Array.from(paths).filter(
        (p) => !p.getAttribute('stroke-dasharray')
      );
      expect(solidPaths.length).toBe(0);
    });
  });
});
