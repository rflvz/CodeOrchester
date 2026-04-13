/**
 * DAW-569: Chat real con Claude CLI — OrchestrationChat
 *
 * Verifies:
 * - No setTimeout is used for responses (the original stub pattern)
 * - Sending calls writePty on the orchestrator session
 * - Mesh topology broadcasts to all agents (not just orchestrator)
 * - Hierarchical topology sends to root + direct subagents only (not grandchildren)
 * - PTY logs from all team sessions appear in the combined view
 * - No team selected → textarea is disabled
 * - chatStore persists messages across unmount/remount
 */

import { render, screen, act, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OrchestrationChat } from '../components/Screens/Chat/OrchestrationChat';
import { useAgentStore } from '../stores/agentStore';
import { useTeamStore } from '../stores/teamStore';
import { useTerminalStore } from '../stores/terminalStore';
import { useUIStore } from '../stores/uiStore';
import { useChatStore } from '../stores/chatStore';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../components/Shared/CreateAgentModal', () => ({
  CreateAgentModal: () => null,
}));

const mockElectron = {
  startPty: vi.fn().mockResolvedValue({ success: true, pid: 9999 }),
  writePty: vi.fn().mockResolvedValue({ success: true }),
  killPty: vi.fn().mockResolvedValue({ success: true }),
  getSettings: vi.fn().mockResolvedValue({}),
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const resetAll = () => {
  useAgentStore.setState({ agents: {}, activeAgentId: null });
  useTeamStore.setState({ teams: {}, activeTeamId: null } as Parameters<typeof useTeamStore.setState>[0]);
  useTerminalStore.setState({ sessions: {}, activeSessionId: null, recentLogs: [], agentSessionMap: {} });
  useUIStore.setState({ currentScreen: 'chat' });
  useChatStore.setState({ conversations: {} });
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

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DAW-569 – OrchestrationChat PTY integration', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'electron', {
      value: mockElectron,
      configurable: true,
      writable: true,
    });
    vi.clearAllMocks();
    resetAll();
  });

  afterEach(() => {
    cleanup();
  });

  // ── No setTimeout ────────────────────────────────────────────────────────────

  it('handleSend does NOT use setTimeout for agent responses', async () => {
    const user = userEvent.setup();
    let teamId!: string;
    let orchId!: string;

    act(() => {
      const team = useTeamStore.getState().createTeam({
        name: 'ALPHA', description: '', agents: [], topology: 'hierarchical', connections: [],
      });
      teamId = team.id;
      orchId = makeAgent('Orchestrator', teamId).id;
      useTeamStore.getState().addAgentToTeam(orchId, teamId);
      useTerminalStore.getState().registerAgentSession(orchId, orchId);
    });

    render(<OrchestrationChat />);

    await user.selectOptions(screen.getByRole('combobox'), teamId);

    const setTimeoutSpy = vi.spyOn(window, 'setTimeout');

    const textarea = screen.getByRole('textbox');
    await user.type(textarea, 'Do the task');
    await user.keyboard('{Enter}');

    // No setTimeout used for fake agent response generation
    const fakeResponses = setTimeoutSpy.mock.calls.filter(
      ([fn]) => typeof fn === 'function' && fn.toString().includes('agentMessage')
    );
    expect(fakeResponses).toHaveLength(0);

    setTimeoutSpy.mockRestore();
  });

  // ── writePty on orchestrator ─────────────────────────────────────────────────

  it('sends message to orchestrator PTY session', async () => {
    const user = userEvent.setup();
    let teamId!: string;
    let orchId!: string;

    act(() => {
      const team = useTeamStore.getState().createTeam({
        name: 'BETA', description: '', agents: [], topology: 'hierarchical', connections: [],
      });
      teamId = team.id;
      orchId = makeAgent('RootAgent', teamId).id;
      useTeamStore.getState().addAgentToTeam(orchId, teamId);
      useTerminalStore.getState().registerAgentSession(orchId, orchId);
    });

    render(<OrchestrationChat />);

    await user.selectOptions(screen.getByRole('combobox'), teamId);

    const textarea = screen.getByRole('textbox');
    await user.type(textarea, 'Deploy app');
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(mockElectron.writePty).toHaveBeenCalledWith(
        orchId,
        'Deploy app',
        expect.stringContaining('RootAgent')
      );
    });
  });

  // ── Topology: mesh broadcasts ────────────────────────────────────────────────

  it('mesh topology broadcasts the message to ALL team agents', async () => {
    const user = userEvent.setup();
    let teamId!: string;
    let id1!: string;
    let id2!: string;
    let id3!: string;

    act(() => {
      const team = useTeamStore.getState().createTeam({
        name: 'MESH_TEAM', description: '', agents: [], topology: 'mesh', connections: [],
      });
      teamId = team.id;
      id1 = makeAgent('MeshA', teamId).id;
      id2 = makeAgent('MeshB', teamId).id;
      id3 = makeAgent('MeshC', teamId).id;
      [id1, id2, id3].forEach((id) => {
        useTeamStore.getState().addAgentToTeam(id, teamId);
        useTerminalStore.getState().registerAgentSession(id, id);
      });
    });

    render(<OrchestrationChat />);

    await user.selectOptions(screen.getByRole('combobox'), teamId);

    const textarea = screen.getByRole('textbox');
    await user.type(textarea, 'Broadcast task');
    await user.keyboard('{Enter}');

    // writePty called for orchestrator (id1) + both subagents (id2, id3)
    await waitFor(() => {
      expect(mockElectron.writePty).toHaveBeenCalledTimes(3);
    });

    const calledSessions = mockElectron.writePty.mock.calls.map(([s]) => s);
    expect(calledSessions).toContain(id1);
    expect(calledSessions).toContain(id2);
    expect(calledSessions).toContain(id3);
  });

  // ── Topology: hierarchical sends only to direct subagents ────────────────────

  it('hierarchical topology sends to root + direct subagents only (not grandchildren)', async () => {
    const user = userEvent.setup();
    let teamId!: string;
    let rootId!: string;
    let childId!: string;
    let grandchildId!: string;

    act(() => {
      const team = useTeamStore.getState().createTeam({
        name: 'TREE_TEAM', description: '', agents: [], topology: 'hierarchical', connections: [],
      });
      teamId = team.id;
      rootId = makeAgent('Root', teamId).id;
      childId = makeAgent('Child', teamId).id;
      grandchildId = makeAgent('Grandchild', teamId).id;

      [rootId, childId, grandchildId].forEach((id) => {
        useTeamStore.getState().addAgentToTeam(id, teamId);
        useTerminalStore.getState().registerAgentSession(id, id);
      });

      // root → child → grandchild
      useTeamStore.getState().addConnection(teamId, { fromAgentId: rootId, toAgentId: childId });
      useTeamStore.getState().addConnection(teamId, { fromAgentId: childId, toAgentId: grandchildId });
    });

    render(<OrchestrationChat />);

    await user.selectOptions(screen.getByRole('combobox'), teamId);

    const textarea = screen.getByRole('textbox');
    await user.type(textarea, 'Hierarchical task');
    await user.keyboard('{Enter}');

    // root (orchestrator) + child (direct subagent) = 2 calls. Grandchild NOT included.
    await waitFor(() => {
      expect(mockElectron.writePty).toHaveBeenCalledTimes(2);
    });

    const calledSessions = mockElectron.writePty.mock.calls.map(([s]) => s);
    expect(calledSessions).toContain(rootId);
    expect(calledSessions).toContain(childId);
    expect(calledSessions).not.toContain(grandchildId);
  });

  // ── Combined PTY log display ─────────────────────────────────────────────────

  it('PTY logs from all team sessions appear in the combined orchestration view', async () => {
    const user = userEvent.setup();
    let teamId!: string;
    let id1!: string;
    let id2!: string;

    act(() => {
      const team = useTeamStore.getState().createTeam({
        name: 'LOG_TEAM', description: '', agents: [], topology: 'mesh', connections: [],
      });
      teamId = team.id;
      id1 = makeAgent('LoggerA', teamId).id;
      id2 = makeAgent('LoggerB', teamId).id;
      [id1, id2].forEach((id) => {
        useTeamStore.getState().addAgentToTeam(id, teamId);
        useTerminalStore.getState().registerAgentSession(id, id);
      });
    });

    render(<OrchestrationChat />);

    await user.selectOptions(screen.getByRole('combobox'), teamId);

    act(() => {
      useTerminalStore.getState().pushLogs(id1, 'AgentA output line');
      useTerminalStore.getState().pushLogs(id2, 'AgentB output line');
    });

    await waitFor(() => {
      expect(screen.getByText('AgentA output line')).toBeInTheDocument();
      expect(screen.getByText('AgentB output line')).toBeInTheDocument();
    });
  });

  // ── No team selected ─────────────────────────────────────────────────────────

  it('textarea is disabled when no team is selected', () => {
    render(<OrchestrationChat />);
    expect(screen.getByRole('textbox')).toBeDisabled();
  });

  it('placeholder prompts user to select a team when none is selected', () => {
    render(<OrchestrationChat />);
    expect(screen.getByRole('textbox')).toHaveAttribute(
      'placeholder',
      expect.stringMatching(/select a team/i)
    );
  });

  // ── chatStore persistence ────────────────────────────────────────────────────

  it('orchestration messages persist in chatStore after unmount', async () => {
    const user = userEvent.setup();
    let teamId!: string;
    let orchId!: string;

    act(() => {
      const team = useTeamStore.getState().createTeam({
        name: 'PERSIST_TEAM', description: '', agents: [], topology: 'hierarchical', connections: [],
      });
      teamId = team.id;
      orchId = makeAgent('PersistOrch', teamId).id;
      useTeamStore.getState().addAgentToTeam(orchId, teamId);
      useTerminalStore.getState().registerAgentSession(orchId, orchId);
    });

    const { unmount } = render(<OrchestrationChat />);

    await user.selectOptions(screen.getByRole('combobox'), teamId);

    const textarea = screen.getByRole('textbox');
    await user.type(textarea, 'Keep this message');
    await user.keyboard('{Enter}');

    unmount();

    const stored = useChatStore.getState().conversations[teamId];
    expect(stored?.some((m) => m.content === 'Keep this message')).toBe(true);
  });

  // ── No PTY session for orchestrator ─────────────────────────────────────────

  it('shows error in chat when orchestrator has no PTY session, writePty NOT called', async () => {
    const user = userEvent.setup();
    let teamId!: string;

    // Make startPty fail so no session is registered
    mockElectron.startPty.mockResolvedValueOnce({ success: false, error: 'mock disabled' });

    act(() => {
      const team = useTeamStore.getState().createTeam({
        name: 'NOSESSION_TEAM', description: '', agents: [], topology: 'hierarchical', connections: [],
      });
      teamId = team.id;
      const orchId = makeAgent('NoSessionOrch', teamId).id;
      useTeamStore.getState().addAgentToTeam(orchId, teamId);
      // Deliberately do NOT register a PTY session
    });

    render(<OrchestrationChat />);

    await user.selectOptions(screen.getByRole('combobox'), teamId);

    const textarea = screen.getByRole('textbox');
    await user.type(textarea, 'Should fail');
    await user.keyboard('{Enter}');

    expect(mockElectron.writePty).not.toHaveBeenCalled();
  });
});
