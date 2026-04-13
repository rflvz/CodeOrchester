/**
 * DAW-569: Chat real con Claude CLI — AgentChat
 *
 * Verifies:
 * - Selecting an agent starts a real PTY session via window.electron.startPty
 * - Sending a message calls window.electron.writePty (not a setTimeout fake)
 * - PTY logs from terminalStore.pushLogs appear as agent messages in the chat
 * - Message history persists in chatStore across unmount/remount
 * - Missing PTY session → system error message shown in chat (no throw)
 * - writePty failure → system error message shown in chat (no throw)
 */

import { render, screen, act, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AgentChat } from '../components/Screens/Chat/AgentChat';
import { useAgentStore } from '../stores/agentStore';
import { useTeamStore } from '../stores/teamStore';
import { useTerminalStore } from '../stores/terminalStore';
import { useUIStore } from '../stores/uiStore';
import { useChatStore } from '../stores/chatStore';

// ── Electron mock ─────────────────────────────────────────────────────────────

const mockElectron = {
  startPty: vi.fn().mockResolvedValue({ success: true, pid: 1234 }),
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

const makeAgent = (name = 'TestBot') =>
  useAgentStore.getState().createAgent({
    name,
    description: 'Test agent',
    status: 'idle',
    teamId: null,
    skills: ['coding'],
    currentTask: null,
    trabajoTerminado: false,
  });

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DAW-569 – AgentChat PTY integration', () => {
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

  // ── startPty ────────────────────────────────────────────────────────────────

  it('selecting an agent calls startPty with the agent ID', async () => {
    const user = userEvent.setup();
    let agentId!: string;

    act(() => { agentId = makeAgent('AlphaBot').id; });

    render(<AgentChat />);

    // Click the agent button in the sidebar
    const agentBtn = screen.getByText('AlphaBot').closest('button')!;
    await user.click(agentBtn);

    await waitFor(() => {
      expect(mockElectron.startPty).toHaveBeenCalledWith(
        agentId,
        undefined,
        expect.stringContaining('AlphaBot')
      );
    });
  });

  it('startPty registers the session in terminalStore', async () => {
    const user = userEvent.setup();
    let agentId!: string;

    act(() => { agentId = makeAgent('BetaBot').id; });

    render(<AgentChat />);

    await user.click(screen.getByText('BetaBot').closest('button')!);

    await waitFor(() => {
      expect(useTerminalStore.getState().getSessionIdByAgentId(agentId)).toBe(agentId);
    });
  });

  // ── writePty ────────────────────────────────────────────────────────────────

  it('sending a message calls writePty — never setTimeout', async () => {
    const user = userEvent.setup();
    let agentId!: string;

    act(() => {
      agentId = makeAgent('GammaBot').id;
      useTerminalStore.getState().registerAgentSession(agentId, agentId);
      useAgentStore.getState().setActiveAgent(agentId);
    });

    const setTimeoutSpy = vi.spyOn(window, 'setTimeout');

    render(<AgentChat />);

    const textarea = screen.getByPlaceholderText(/message gammabot/i);
    await user.type(textarea, 'Hello agent');
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(mockElectron.writePty).toHaveBeenCalledWith(
        agentId,
        'Hello agent',
        expect.any(String)
      );
    });

    // No setTimeout should have been used to generate a fake response
    const fakeResponses = setTimeoutSpy.mock.calls.filter(
      ([fn]) => typeof fn === 'function' && fn.toString().includes('agentMessage')
    );
    expect(fakeResponses).toHaveLength(0);

    setTimeoutSpy.mockRestore();
  });

  it('sent message appears in the chat immediately (before PTY response)', async () => {
    const user = userEvent.setup();
    let agentId!: string;

    act(() => {
      agentId = makeAgent('DeltaBot').id;
      useTerminalStore.getState().registerAgentSession(agentId, agentId);
      useAgentStore.getState().setActiveAgent(agentId);
    });

    render(<AgentChat />);

    const textarea = screen.getByPlaceholderText(/message deltabot/i);
    await user.type(textarea, 'Test message');
    await user.keyboard('{Enter}');

    expect(screen.getByText('Test message')).toBeInTheDocument();
  });

  // ── PTY logs → messages ──────────────────────────────────────────────────────

  it('PTY logs pushed to terminalStore appear as agent messages', async () => {
    let agentId!: string;

    act(() => {
      agentId = makeAgent('EpsilonBot').id;
      useTerminalStore.getState().registerAgentSession(agentId, agentId);
      useAgentStore.getState().setActiveAgent(agentId);
    });

    render(<AgentChat />);

    act(() => {
      useTerminalStore.getState().pushLogs(agentId, 'Hello from Claude CLI');
    });

    await waitFor(() => {
      expect(screen.getByText('Hello from Claude CLI')).toBeInTheDocument();
    });
  });

  it('PTY error logs appear as system error messages', async () => {
    let agentId!: string;

    act(() => {
      agentId = makeAgent('ZetaBot').id;
      useTerminalStore.getState().registerAgentSession(agentId, agentId);
      useAgentStore.getState().setActiveAgent(agentId);
    });

    render(<AgentChat />);

    act(() => {
      useTerminalStore.getState().pushError(agentId, 'Claude CLI crashed');
    });

    await waitFor(() => {
      // getAllByText handles the case where React 18 renders the message in multiple DOM nodes
      expect(screen.getAllByText(/Claude CLI crashed/).length).toBeGreaterThan(0);
    });
  });

  // ── chatStore persistence ────────────────────────────────────────────────────

  it('messages persist in chatStore after the component unmounts', async () => {
    const user = userEvent.setup();
    let agentId!: string;

    act(() => {
      agentId = makeAgent('PersistBot').id;
      useTerminalStore.getState().registerAgentSession(agentId, agentId);
      useAgentStore.getState().setActiveAgent(agentId);
    });

    const { unmount } = render(<AgentChat />);

    const textarea = screen.getByPlaceholderText(/message persistbot/i);
    await user.type(textarea, 'Remember me');
    await user.keyboard('{Enter}');

    unmount();

    const stored = useChatStore.getState().conversations[agentId];
    expect(stored?.some((m) => m.content === 'Remember me')).toBe(true);
  });

  it('history is restored when re-selecting the same agent', () => {
    let agentId!: string;

    act(() => {
      agentId = makeAgent('HistoryBot').id;
      useTerminalStore.getState().registerAgentSession(agentId, agentId);
      useChatStore.getState().initConversation(agentId, [
        { id: '1', type: 'user', content: 'Previous message', timestamp: new Date(), status: 'sent' },
      ]);
      useAgentStore.getState().setActiveAgent(agentId);
    });

    render(<AgentChat />);

    expect(screen.getByText('Previous message')).toBeInTheDocument();
  });

  // ── Error handling ───────────────────────────────────────────────────────────

  it('no PTY session → shows error in chat, writePty NOT called', async () => {
    const user = userEvent.setup();
    let agentId!: string;

    act(() => {
      agentId = makeAgent('NoSessionBot').id;
      // Deliberately do NOT register a session
      useAgentStore.getState().setActiveAgent(agentId);
    });

    render(<AgentChat />);

    const textarea = screen.getByPlaceholderText(/message nosessionbot/i);
    await user.type(textarea, 'This will fail');
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(screen.getAllByText(/No active PTY session/i).length).toBeGreaterThan(0);
    });

    expect(mockElectron.writePty).not.toHaveBeenCalled();
  });

  it('writePty failure → shows error message in chat', async () => {
    const user = userEvent.setup();
    mockElectron.writePty.mockRejectedValueOnce(new Error('PTY write failed'));

    let agentId!: string;
    act(() => {
      agentId = makeAgent('FailBot').id;
      useTerminalStore.getState().registerAgentSession(agentId, agentId);
      useAgentStore.getState().setActiveAgent(agentId);
    });

    render(<AgentChat />);

    const textarea = screen.getByPlaceholderText(/message failbot/i);
    await user.type(textarea, 'Fail me');
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(screen.getAllByText(/PTY write failed/i).length).toBeGreaterThan(0);
    });
  });
});
