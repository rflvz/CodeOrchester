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
});
