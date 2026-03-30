/**
 * DAW-551: Bug — No permite entrar al chat de un agente desde AgentDashboard
 *
 * Fix: Eliminated the setTimeout(50ms) from handleChatAgent.
 * Zustand updates are synchronous so setActiveAgent + setScreen can run back-to-back.
 */

import { render, screen, act, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AgentDashboard } from '../components/Screens/Agents/AgentDashboard';
import { useAgentStore } from '../stores/agentStore';
import { useUIStore } from '../stores/uiStore';

// Mock complex sub-components that aren't relevant to this test
vi.mock('../components/Shared/CreateAgentModal', () => ({
  CreateAgentModal: () => null,
}));

// Helper to reset Zustand stores between tests
const resetStores = () => {
  useAgentStore.setState({ agents: {}, activeAgentId: null });
  useUIStore.setState({ currentScreen: 'agents' });
};

describe('DAW-551 – Chat navigation from AgentDashboard', () => {
  beforeEach(() => {
    resetStores();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('sets activeAgentId and navigates to chat when CHAT button is clicked', async () => {
    const user = userEvent.setup();

    // Create an agent in the store
    let agentId: string;
    act(() => {
      const agent = useAgentStore.getState().createAgent({
        name: 'AlphaBot',
        description: 'Test agent',
        status: 'idle',
        teamId: null,
        skills: [],
        currentTask: null,
        trabajoTerminado: false,
      });
      agentId = agent.id;
    });

    render(<AgentDashboard />);

    // The CHAT button should be visible
    const chatButton = screen.getByRole('button', { name: /chat/i });
    expect(chatButton).toBeInTheDocument();

    await user.click(chatButton);

    // Both store updates must have happened
    const { activeAgentId } = useAgentStore.getState();
    const { currentScreen } = useUIStore.getState();

    expect(activeAgentId).toBe(agentId!);
    expect(currentScreen).toBe('chat');
  });

  it('navigation to chat does NOT schedule a setTimeout (synchronous flow)', async () => {
    const user = userEvent.setup();

    act(() => {
      useAgentStore.getState().createAgent({
        name: 'BetaBot',
        description: 'Test agent',
        status: 'idle',
        teamId: null,
        skills: [],
        currentTask: null,
        trabajoTerminado: false,
      });
    });

    render(<AgentDashboard />);

    const chatButton = screen.getByRole('button', { name: /chat/i });

    // Spy on window.setTimeout to detect any deferred navigation
    const setTimeoutSpy = vi.spyOn(window, 'setTimeout');

    await user.click(chatButton);

    // Navigation must have happened
    expect(useUIStore.getState().currentScreen).toBe('chat');

    // And no setTimeout should have been used for navigation
    const navTimeouts = setTimeoutSpy.mock.calls.filter(
      ([fn]) => typeof fn === 'function' && fn.toString().includes('setScreen')
    );
    expect(navTimeouts).toHaveLength(0);

    setTimeoutSpy.mockRestore();
  });

  it('clicking CHAT on first agent selects the first one (not always the last)', async () => {
    const user = userEvent.setup();

    let firstId!: string;
    act(() => {
      firstId = useAgentStore.getState().createAgent({
        name: 'AlphaFirst',
        description: '',
        status: 'idle',
        teamId: null,
        skills: [],
        currentTask: null,
        trabajoTerminado: false,
      }).id;
      useAgentStore.getState().createAgent({
        name: 'BetaSecond',
        description: '',
        status: 'idle',
        teamId: null,
        skills: [],
        currentTask: null,
        trabajoTerminado: false,
      });
    });

    render(<AgentDashboard />);
    const chatButtons = screen.getAllByRole('button', { name: /chat/i });
    await user.click(chatButtons[0]); // first agent

    expect(useAgentStore.getState().activeAgentId).toBe(firstId);
    expect(useUIStore.getState().currentScreen).toBe('chat');
  });

  it('stores the correct agentId when multiple agents exist and a specific one is selected', async () => {
    const user = userEvent.setup();

    let firstId!: string;
    let secondId!: string;
    act(() => {
      firstId = useAgentStore.getState().createAgent({
        name: 'FirstBot',
        description: '',
        status: 'idle',
        teamId: null,
        skills: [],
        currentTask: null,
        trabajoTerminado: false,
      }).id;
      secondId = useAgentStore.getState().createAgent({
        name: 'SecondBot',
        description: '',
        status: 'idle',
        teamId: null,
        skills: [],
        currentTask: null,
        trabajoTerminado: false,
      }).id;
    });

    render(<AgentDashboard />);

    // Click the CHAT button for the second agent (last in the list)
    const chatButtons = screen.getAllByRole('button', { name: /chat/i });
    await user.click(chatButtons[1]); // second agent's CHAT button

    expect(useAgentStore.getState().activeAgentId).toBe(secondId);
    expect(useUIStore.getState().currentScreen).toBe('chat');
  });

  it('switching active agent updates activeAgentId correctly (no stale reference)', async () => {
    const user = userEvent.setup();

    let idA!: string;
    let idB!: string;
    act(() => {
      idA = useAgentStore.getState().createAgent({
        name: 'AgentA',
        description: '',
        status: 'idle',
        teamId: null,
        skills: [],
        currentTask: null,
        trabajoTerminado: false,
      }).id;
      idB = useAgentStore.getState().createAgent({
        name: 'AgentB',
        description: '',
        status: 'active',
        teamId: null,
        skills: [],
        currentTask: null,
        trabajoTerminado: false,
      }).id;
    });

    render(<AgentDashboard />);
    const chatButtons = screen.getAllByRole('button', { name: /chat/i });

    // First click — select agent A
    await user.click(chatButtons[0]);
    expect(useAgentStore.getState().activeAgentId).toBe(idA);

    // Navigate back to agents screen, re-render
    act(() => { useUIStore.getState().setScreen('agents'); });

    // Second click — select agent B
    await user.click(chatButtons[1]);
    expect(useAgentStore.getState().activeAgentId).toBe(idB);
    expect(useUIStore.getState().currentScreen).toBe('chat');
  });

  it('activeAgentId is set BEFORE screen changes (no window where activeAgentId is null while on chat)', async () => {
    const user = userEvent.setup();

    let agentId!: string;
    act(() => {
      agentId = useAgentStore.getState().createAgent({
        name: 'OrderBot',
        description: '',
        status: 'idle',
        teamId: null,
        skills: [],
        currentTask: null,
        trabajoTerminado: false,
      }).id;
    });

    render(<AgentDashboard />);

    // Intercept store updates to capture the order they happen
    const callOrder: string[] = [];
    const origSetActive = useAgentStore.getState().setActiveAgent;
    const origSetScreen = useUIStore.getState().setScreen;

    useAgentStore.setState({
      setActiveAgent: (id) => {
        callOrder.push('setActiveAgent');
        origSetActive(id);
      },
    });
    useUIStore.setState({
      setScreen: (screen) => {
        callOrder.push('setScreen');
        origSetScreen(screen);
      },
    });

    const chatButton = screen.getByRole('button', { name: /chat/i });
    await user.click(chatButton);

    // setActiveAgent MUST be called before setScreen
    expect(callOrder[0]).toBe('setActiveAgent');
    expect(callOrder[1]).toBe('setScreen');
    expect(useAgentStore.getState().activeAgentId).toBe(agentId);
    expect(useUIStore.getState().currentScreen).toBe('chat');
  });

  it('agent status is preserved in store after chat navigation', async () => {
    const user = userEvent.setup();

    act(() => {
      useAgentStore.getState().createAgent({
        name: 'ActiveBot',
        description: '',
        status: 'active',
        teamId: null,
        skills: ['coding'],
        currentTask: 'Building feature X',
        trabajoTerminado: false,
      });
    });

    render(<AgentDashboard />);
    await user.click(screen.getByRole('button', { name: /chat/i }));

    const activeAgent = useAgentStore.getState().agents[useAgentStore.getState().activeAgentId!];
    // Status and data must not be corrupted by navigation
    expect(activeAgent.status).toBe('active');
    expect(activeAgent.skills).toContain('coding');
    expect(activeAgent.currentTask).toBe('Building feature X');
  });
});
