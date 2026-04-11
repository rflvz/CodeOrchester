/**
 * DAW-564: Bug — Topology: conexiones no persisten y routing entre agentes no funciona
 *
 * Fix 1: Global mouseup handler now reads selectedTeamIdRef (not stale state) and auto-detects
 *         shared teamId from agent store, so addConnection() is called and connections persist.
 * Fix 2: All team connections (not just the selected team's) are rendered on the canvas.
 * Fix 3: delegateToConnectedAgents() is called via useEffect when an agent transitions to 'success'.
 */

import { render, act, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Topology } from '../components/Screens/Topology/Topology';
import { useAgentStore } from '../stores/agentStore';
import { useTeamStore } from '../stores/teamStore';
import { useFreeConnectionStore } from '../stores/freeConnectionStore';

const resetStores = () => {
  useAgentStore.setState({ agents: {}, activeAgentId: null });
  useTeamStore.setState({ teams: {}, activeTeamId: null } as Parameters<typeof useTeamStore.setState>[0]);
  useFreeConnectionStore.setState((s) => ({ ...s, connections: [] }));
};

const makeAgent = (name: string, teamId: string | null = null) =>
  useAgentStore.getState().createAgent({
    name,
    description: '',
    status: 'idle',
    teamId,
    skills: [],
    currentTask: null,
    trabajoTerminado: false,
  });

describe('DAW-564 – Topology persistence and routing', () => {
  beforeEach(() => {
    resetStores();
  });

  // ─── Persistence ────────────────────────────────────────────────────────────

  it('connection between agents in the same team is persisted to teamStore', async () => {
    let teamId!: string;
    let aId!: string;
    let bId!: string;

    act(() => {
      const team = useTeamStore.getState().createTeam({
        name: 'ALPHA',
        description: '',
        agents: [],
        topology: 'mesh',
        connections: [],
      });
      teamId = team.id;
      aId = makeAgent('AgentA', teamId).id;
      bId = makeAgent('AgentB', teamId).id;
    });

    render(<Topology />);

    await waitFor(() => {
      expect(document.querySelector(`[data-agent-id="${aId}"]`)).toBeInTheDocument();
      expect(document.querySelector(`[data-agent-id="${bId}"]`)).toBeInTheDocument();
    });

    const handleA = document
      .querySelector(`[data-agent-id="${aId}"]`)!
      .querySelector('[title="Drag to connect"]')!;
    const divB = document.querySelector(`[data-agent-id="${bId}"]`) as HTMLElement;

    act(() => { fireEvent.mouseDown(handleA, { button: 0 }); });

    const originalEFP = document.elementsFromPoint;
    document.elementsFromPoint = () => [divB];
    act(() => { fireEvent.mouseUp(window, { clientX: 700, clientY: 300 }); });
    document.elementsFromPoint = originalEFP;

    await waitFor(() => {
      const connections = useTeamStore.getState().teams[teamId]?.connections ?? [];
      expect(connections.some(c => c.fromAgentId === aId && c.toAgentId === bId)).toBe(true);
    });
  });

  it('persisted connection is rendered on canvas after re-load (read from teamStore)', async () => {
    let teamId!: string;
    let aId!: string;
    let bId!: string;

    // Pre-populate teamStore with a connection (simulates a previous session)
    act(() => {
      const team = useTeamStore.getState().createTeam({
        name: 'BETA',
        description: '',
        agents: [],
        topology: 'mesh',
        connections: [],
      });
      teamId = team.id;
      aId = makeAgent('NodeA', teamId).id;
      bId = makeAgent('NodeB', teamId).id;
      useTeamStore.getState().addConnection(teamId, { fromAgentId: aId, toAgentId: bId });
    });

    render(<Topology />);

    // Connection should appear on canvas (solid path) without any user interaction
    await waitFor(() => {
      const solidPaths = Array.from(document.querySelectorAll('svg path[stroke="#97a9ff"]')).filter(
        (p) => !p.getAttribute('stroke-dasharray')
      );
      expect(solidPaths.length).toBeGreaterThan(0);
    });
  });

  it('connections from ALL teams are rendered, not just the selected team', async () => {
    let team1Id!: string;
    let team2Id!: string;
    let a1!: string;
    let b1!: string;
    let a2!: string;
    let b2!: string;

    act(() => {
      const t1 = useTeamStore.getState().createTeam({ name: 'T1', description: '', agents: [], topology: 'mesh', connections: [] });
      const t2 = useTeamStore.getState().createTeam({ name: 'T2', description: '', agents: [], topology: 'mesh', connections: [] });
      team1Id = t1.id;
      team2Id = t2.id;
      a1 = makeAgent('A1', team1Id).id;
      b1 = makeAgent('B1', team1Id).id;
      a2 = makeAgent('A2', team2Id).id;
      b2 = makeAgent('B2', team2Id).id;
      useTeamStore.getState().addConnection(team1Id, { fromAgentId: a1, toAgentId: b1 });
      useTeamStore.getState().addConnection(team2Id, { fromAgentId: a2, toAgentId: b2 });
    });

    render(<Topology />);

    // Both team connections should render — no team is selected (selectedTeamId is null)
    await waitFor(() => {
      const solidPaths = Array.from(document.querySelectorAll('svg path[stroke="#97a9ff"]')).filter(
        (p) => !p.getAttribute('stroke-dasharray')
      );
      // 2 solid paths: one per team
      expect(solidPaths.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ─── Routing ────────────────────────────────────────────────────────────────

  it('delegateToConnectedAgents is called when agent transitions to success', async () => {
    let teamId!: string;
    let aId!: string;
    let bId!: string;

    act(() => {
      const team = useTeamStore.getState().createTeam({
        name: 'ROUTE_TEAM',
        description: '',
        agents: [],
        topology: 'mesh',
        connections: [],
      });
      teamId = team.id;
      aId = makeAgent('Source', teamId).id;
      bId = makeAgent('Target', teamId).id;
      useTeamStore.getState().addConnection(teamId, { fromAgentId: aId, toAgentId: bId });
    });

    // Mock window.electron.writePty to capture delegated tasks
    const writePtyMock = vi.fn().mockResolvedValue({ success: true });
    (window as unknown as { electron: object }).electron = { writePty: writePtyMock };

    // Mock terminal store to return a session for the target agent
    const { useTerminalStore } = await import('../stores/terminalStore');
    const origGetSessionId = useTerminalStore.getState().getSessionIdByAgentId;
    useTerminalStore.setState({
      ...useTerminalStore.getState(),
      getSessionIdByAgentId: (agentId: string) => agentId === bId ? 'session-b' : null,
    } as Parameters<typeof useTerminalStore.setState>[0]);

    render(<Topology />);

    await waitFor(() => {
      expect(document.querySelector(`[data-agent-id="${aId}"]`)).toBeInTheDocument();
    });

    // Transition source agent from idle → success (simulates trabajo_terminado=true)
    act(() => {
      useAgentStore.getState().updateAgent(aId, { status: 'success', currentTask: 'do the thing' });
    });

    await waitFor(() => {
      expect(writePtyMock).toHaveBeenCalledWith('session-b', expect.stringContaining('do the thing'));
    });

    // Restore
    useTerminalStore.setState({
      ...useTerminalStore.getState(),
      getSessionIdByAgentId: origGetSessionId,
    } as Parameters<typeof useTerminalStore.setState>[0]);
  });

  it('delegateToConnectedAgents is NOT called on subsequent success ticks (only on transition)', async () => {
    let teamId!: string;
    let aId!: string;
    let bId!: string;

    act(() => {
      const team = useTeamStore.getState().createTeam({
        name: 'NO_DOUBLE_ROUTE',
        description: '',
        agents: [],
        topology: 'mesh',
        connections: [],
      });
      teamId = team.id;
      aId = makeAgent('SrcB', teamId).id;
      bId = makeAgent('TgtB', teamId).id;
      useTeamStore.getState().addConnection(teamId, { fromAgentId: aId, toAgentId: bId });
      // Start agent already in success state
      useAgentStore.getState().updateAgent(aId, { status: 'success' });
    });

    const writePtyMock = vi.fn().mockResolvedValue({ success: true });
    (window as unknown as { electron: object }).electron = { writePty: writePtyMock };

    const { useTerminalStore } = await import('../stores/terminalStore');
    useTerminalStore.setState({
      ...useTerminalStore.getState(),
      getSessionIdByAgentId: (agentId: string) => agentId === bId ? 'session-b2' : null,
    } as Parameters<typeof useTerminalStore.setState>[0]);

    render(<Topology />);

    await waitFor(() => {
      expect(document.querySelector(`[data-agent-id="${aId}"]`)).toBeInTheDocument();
    });

    // Update something else on the already-success agent (no transition → no delegation)
    act(() => {
      useAgentStore.getState().updateAgent(aId, { currentTask: 'new task' });
    });

    // Give it a tick to settle
    await new Promise((r) => setTimeout(r, 50));
    expect(writePtyMock).not.toHaveBeenCalled();
  });
});
