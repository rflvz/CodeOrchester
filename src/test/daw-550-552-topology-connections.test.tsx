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

  it('duplicate A→B connection is rejected if A→B already exists', async () => {
    let aId!: string;
    let bId!: string;

    act(() => {
      aId = useAgentStore.getState().createAgent({ name: 'A', description: '', status: 'idle', teamId: null, skills: [], currentTask: null, trabajoTerminado: false }).id;
      bId = useAgentStore.getState().createAgent({ name: 'B', description: '', status: 'idle', teamId: null, skills: [], currentTask: null, trabajoTerminado: false }).id;
    });

    render(<Topology />);

    await waitFor(() => {
      expect(document.querySelector(`[data-agent-id="${aId}"]`)).toBeInTheDocument();
    });

    const handleA = document.querySelector(`[data-agent-id="${aId}"]`)!.querySelector('[title="Drag to connect"]')!;
    const divB = document.querySelector(`[data-agent-id="${bId}"]`) as HTMLElement;

    // First connection A→B
    act(() => { fireEvent.mouseDown(handleA, { button: 0 }); });
    const originalEFP1 = document.elementsFromPoint;
    document.elementsFromPoint = () => [divB];
    act(() => { fireEvent.mouseUp(window, { clientX: 700, clientY: 300 }); });
    document.elementsFromPoint = originalEFP1;

    // Second connection A→B (duplicate)
    act(() => { fireEvent.mouseDown(handleA, { button: 0 }); });
    const originalEFP2 = document.elementsFromPoint;
    document.elementsFromPoint = () => [divB];
    act(() => { fireEvent.mouseUp(window, { clientX: 700, clientY: 300 }); });
    document.elementsFromPoint = originalEFP2;

    await waitFor(() => {
      const solidPaths = Array.from(document.querySelectorAll('svg path[stroke="#97a9ff"]')).filter(
        (p) => !p.getAttribute('stroke-dasharray')
      );
      // Still only ONE connection, not two
      expect(solidPaths.length).toBe(1);
    });
  });

  it('reverse duplicate B→A is rejected when A→B already exists (undirected)', async () => {
    let aId!: string;
    let bId!: string;

    act(() => {
      aId = useAgentStore.getState().createAgent({ name: 'A2', description: '', status: 'idle', teamId: null, skills: [], currentTask: null, trabajoTerminado: false }).id;
      bId = useAgentStore.getState().createAgent({ name: 'B2', description: '', status: 'idle', teamId: null, skills: [], currentTask: null, trabajoTerminado: false }).id;
    });

    render(<Topology />);
    await waitFor(() => { expect(document.querySelector(`[data-agent-id="${aId}"]`)).toBeInTheDocument(); });

    const handleA = document.querySelector(`[data-agent-id="${aId}"]`)!.querySelector('[title="Drag to connect"]')!;
    const handleB = document.querySelector(`[data-agent-id="${bId}"]`)!.querySelector('[title="Drag to connect"]')!;
    const divB = document.querySelector(`[data-agent-id="${bId}"]`) as HTMLElement;
    const divA = document.querySelector(`[data-agent-id="${aId}"]`) as HTMLElement;

    // Create A→B
    act(() => { fireEvent.mouseDown(handleA, { button: 0 }); });
    const efp1 = document.elementsFromPoint;
    document.elementsFromPoint = () => [divB];
    act(() => { fireEvent.mouseUp(window, { clientX: 700, clientY: 300 }); });
    document.elementsFromPoint = efp1;

    // Try B→A (reverse)
    act(() => { fireEvent.mouseDown(handleB, { button: 0 }); });
    const efp2 = document.elementsFromPoint;
    document.elementsFromPoint = () => [divA];
    act(() => { fireEvent.mouseUp(window, { clientX: 100, clientY: 300 }); });
    document.elementsFromPoint = efp2;

    await waitFor(() => {
      const solidPaths = Array.from(document.querySelectorAll('svg path[stroke="#97a9ff"]')).filter(
        (p) => !p.getAttribute('stroke-dasharray')
      );
      expect(solidPaths.length).toBe(1); // still only one
    });
  });

  it('multiple distinct connections can be created (A→B and A→C)', async () => {
    let aId!: string;
    let bId!: string;
    let cId!: string;

    act(() => {
      aId = useAgentStore.getState().createAgent({ name: 'Hub', description: '', status: 'idle', teamId: null, skills: [], currentTask: null, trabajoTerminado: false }).id;
      bId = useAgentStore.getState().createAgent({ name: 'Spoke1', description: '', status: 'idle', teamId: null, skills: [], currentTask: null, trabajoTerminado: false }).id;
      cId = useAgentStore.getState().createAgent({ name: 'Spoke2', description: '', status: 'idle', teamId: null, skills: [], currentTask: null, trabajoTerminado: false }).id;
    });

    render(<Topology />);
    await waitFor(() => { expect(document.querySelector(`[data-agent-id="${aId}"]`)).toBeInTheDocument(); });

    const handleA = document.querySelector(`[data-agent-id="${aId}"]`)!.querySelector('[title="Drag to connect"]')!;
    const divB = document.querySelector(`[data-agent-id="${bId}"]`) as HTMLElement;
    const divC = document.querySelector(`[data-agent-id="${cId}"]`) as HTMLElement;

    // Connect A→B
    act(() => { fireEvent.mouseDown(handleA, { button: 0 }); });
    const efp1 = document.elementsFromPoint;
    document.elementsFromPoint = () => [divB];
    act(() => { fireEvent.mouseUp(window, { clientX: 700, clientY: 200 }); });
    document.elementsFromPoint = efp1;

    // Connect A→C
    act(() => { fireEvent.mouseDown(handleA, { button: 0 }); });
    const efp2 = document.elementsFromPoint;
    document.elementsFromPoint = () => [divC];
    act(() => { fireEvent.mouseUp(window, { clientX: 700, clientY: 400 }); });
    document.elementsFromPoint = efp2;

    await waitFor(() => {
      const solidPaths = Array.from(document.querySelectorAll('svg path[stroke="#97a9ff"]')).filter(
        (p) => !p.getAttribute('stroke-dasharray')
      );
      expect(solidPaths.length).toBe(2); // both connections exist
    });
  });

  it('releasing on empty canvas clears draw state without creating a connection', async () => {
    let agentId!: string;

    act(() => {
      agentId = useAgentStore.getState().createAgent({ name: 'Dangling', description: '', status: 'idle', teamId: null, skills: [], currentTask: null, trabajoTerminado: false }).id;
    });

    render(<Topology />);
    await waitFor(() => { expect(document.querySelector(`[data-agent-id="${agentId}"]`)).toBeInTheDocument(); });

    const handle = document.querySelector(`[data-agent-id="${agentId}"]`)!.querySelector('[title="Drag to connect"]')!;

    act(() => { fireEvent.mouseDown(handle, { button: 0 }); });

    // Release on empty canvas — elementsFromPoint returns no agent divs
    const originalEFP = document.elementsFromPoint;
    document.elementsFromPoint = () => [];
    act(() => { fireEvent.mouseUp(window, { clientX: 9999, clientY: 9999 }); });
    document.elementsFromPoint = originalEFP;

    await waitFor(() => {
      const solidPaths = Array.from(document.querySelectorAll('svg path[stroke="#97a9ff"]')).filter(
        (p) => !p.getAttribute('stroke-dasharray')
      );
      // No connection should have been created
      expect(solidPaths.length).toBe(0);
    });
  });

  it('connection handle becomes fully visible (opacity-100) when node is hovered', async () => {
    act(() => {
      useAgentStore.getState().createAgent({ name: 'HoverMe', description: '', status: 'idle', teamId: null, skills: [], currentTask: null, trabajoTerminado: false });
    });

    render(<Topology />);

    await waitFor(() => {
      const handle = document.querySelector('[title="Drag to connect"]');
      expect(handle).toBeInTheDocument();
    });

    const agentDiv = document.querySelector('[data-agent-id]')!;
    const handle = agentDiv.querySelector('[title="Drag to connect"]')!;

    // Before hover: opacity-30
    expect(handle.className).toContain('opacity-30');

    // Hover the agent node
    act(() => { fireEvent.mouseEnter(agentDiv); });

    // After hover: opacity-100
    expect(handle.className).toContain('opacity-100');
    expect(handle.className).not.toContain('opacity-30');

    // Leave hover: back to opacity-30
    act(() => { fireEvent.mouseLeave(agentDiv); });
    expect(handle.className).toContain('opacity-30');
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
