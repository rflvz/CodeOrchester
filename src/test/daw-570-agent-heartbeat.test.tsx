/**
 * DAW-570: [Feature] Agent heartbeat — detectar y marcar agentes colgados por timeout
 *
 * Verifies:
 * 1. Timeout detection: agent marked as 'error' after inactivity period
 * 2. Timer reset: new PTY output resets the inactivity countdown
 * 3. Cancellation on trabajo_terminado: completed agents are not timed out
 * 4. Cancellation on PTY exit: exiting agents are not timed out
 * 5. Per-agent configurable timeout via agent.inactivityTimeout
 * 6. Default timeout is 5 minutes when inactivityTimeout is not set
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, act, cleanup } from '@testing-library/react';
import App from '../App';
import { useAgentStore } from '../stores/agentStore';
import { useTerminalStore } from '../stores/terminalStore';

// ─── Types ────────────────────────────────────────────────────────────────────

type PtyDataCb = (d: { sessionId: string; data: string }) => void;
type TrabajoTerminadoCb = (d: { sessionId: string; value: boolean }) => void;
type PtyExitCb = (d: { sessionId: string; exitCode: number }) => void;
type PtyErrorCb = (d: { sessionId: string; message: string }) => void;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const resetStores = () => {
  useAgentStore.setState({ agents: {}, activeAgentId: null });
  useTerminalStore.setState({ sessions: {}, activeSessionId: null, recentLogs: [], agentSessionMap: {} });
};

/** Creates an agent in 'active' state with optional timeout override */
const makeActiveAgent = (opts: { inactivityTimeout?: number } = {}) => {
  const agent = useAgentStore.getState().createAgent({
    name: 'TEST_AGENT',
    description: 'test',
    status: 'active',
    teamId: null,
    skills: [],
    currentTask: 'Running task',
    trabajoTerminado: false,
    ...opts,
  });
  return agent;
};

/** Links an agentId to a sessionId in the terminal store */
const linkSession = (agentId: string, sessionId: string) => {
  useTerminalStore.getState().registerAgentSession(agentId, sessionId);
};

// ─── Electron mock factory ────────────────────────────────────────────────────

/**
 * Creates a controllable electron mock that captures registered callbacks
 * so tests can fire PTY events on demand.
 */
const makeControllableElectronMock = () => {
  let ptyDataCb: PtyDataCb | null = null;
  let trabajoTerminadoCb: TrabajoTerminadoCb | null = null;
  let ptyExitCb: PtyExitCb | null = null;
  let ptyErrorCb: PtyErrorCb | null = null;

  const mock = {
    onPtyData: vi.fn((cb: PtyDataCb) => { ptyDataCb = cb; return () => { ptyDataCb = null; }; }),
    onTrabajoTerminado: vi.fn((cb: TrabajoTerminadoCb) => { trabajoTerminadoCb = cb; return () => { trabajoTerminadoCb = null; }; }),
    onClaudeStream: vi.fn(() => () => {}),
    onPtyError: vi.fn((cb: PtyErrorCb) => { ptyErrorCb = cb; return () => { ptyErrorCb = null; }; }),
    onPtyExit: vi.fn((cb: PtyExitCb) => { ptyExitCb = cb; return () => { ptyExitCb = null; }; }),

    // Fire helpers for tests
    firePtyData: (sessionId: string, data = 'output') => ptyDataCb?.({ sessionId, data }),
    fireTrabajoTerminado: (sessionId: string, value: boolean) => trabajoTerminadoCb?.({ sessionId, value }),
    firePtyExit: (sessionId: string) => ptyExitCb?.({ sessionId, exitCode: 0 }),
    firePtyError: (sessionId: string, message: string) => ptyErrorCb?.({ sessionId, message }),
  };

  return mock;
};

// ═══════════════════════════════════════════════════════════════════════════════
// 1. Agent type — inactivityTimeout field
// ═══════════════════════════════════════════════════════════════════════════════

describe('DAW-570 – Agent interface: inactivityTimeout field', () => {
  beforeEach(resetStores);

  it('createAgent accepts inactivityTimeout field', () => {
    const agent = makeActiveAgent({ inactivityTimeout: 10 });
    expect(agent.inactivityTimeout).toBe(10);
  });

  it('inactivityTimeout is optional — agent without it is valid', () => {
    const agent = makeActiveAgent();
    expect(agent.inactivityTimeout).toBeUndefined();
  });

  it('updateAgent can set inactivityTimeout after creation', () => {
    const agent = makeActiveAgent();
    useAgentStore.getState().updateAgent(agent.id, { inactivityTimeout: 3 });
    expect(useAgentStore.getState().agents[agent.id].inactivityTimeout).toBe(3);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. Timeout detection
// ═══════════════════════════════════════════════════════════════════════════════

describe('DAW-570 – Heartbeat: timeout marks agent as error', () => {
  let electronMock: ReturnType<typeof makeControllableElectronMock>;

  beforeEach(() => {
    vi.useFakeTimers();
    resetStores();
    electronMock = makeControllableElectronMock();
    Object.defineProperty(window, 'electron', {
      value: electronMock,
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it('agent marked as error after default 5-minute inactivity', async () => {
    const agent = makeActiveAgent(); // no inactivityTimeout → default 5 min
    linkSession(agent.id, 'sess-1');

    render(<App />);

    // Trigger initial PTY data to start the heartbeat timer
    act(() => { electronMock.firePtyData('sess-1'); });

    // Advance just under 5 minutes — agent should still be active
    act(() => { vi.advanceTimersByTime(4 * 60 * 1000 + 59_000); });
    expect(useAgentStore.getState().agents[agent.id].status).toBe('active');

    // Advance past 5 minutes — timeout fires
    act(() => { vi.advanceTimersByTime(2_000); });
    expect(useAgentStore.getState().agents[agent.id].status).toBe('error');
  });

  it('currentTask set to "Timeout: sin actividad" on timeout', async () => {
    const agent = makeActiveAgent({ inactivityTimeout: 1 }); // 1 minute
    linkSession(agent.id, 'sess-1');

    render(<App />);
    act(() => { electronMock.firePtyData('sess-1'); });
    act(() => { vi.advanceTimersByTime(60_001); });

    expect(useAgentStore.getState().agents[agent.id].currentTask).toBe('Timeout: sin actividad');
  });

  it('respects custom inactivityTimeout (2 minutes)', () => {
    const agent = makeActiveAgent({ inactivityTimeout: 2 });
    linkSession(agent.id, 'sess-2');

    render(<App />);
    act(() => { electronMock.firePtyData('sess-2'); });

    // 1 minute 59 seconds — no timeout yet
    act(() => { vi.advanceTimersByTime(119_000); });
    expect(useAgentStore.getState().agents[agent.id].status).toBe('active');

    // Cross 2 minutes — timeout fires
    act(() => { vi.advanceTimersByTime(2_000); });
    expect(useAgentStore.getState().agents[agent.id].status).toBe('error');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. Timer reset on new PTY output
// ═══════════════════════════════════════════════════════════════════════════════

describe('DAW-570 – Heartbeat: new PTY output resets the timer', () => {
  let electronMock: ReturnType<typeof makeControllableElectronMock>;

  beforeEach(() => {
    vi.useFakeTimers();
    resetStores();
    electronMock = makeControllableElectronMock();
    Object.defineProperty(window, 'electron', {
      value: electronMock,
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it('PTY data arriving before timeout resets the countdown', () => {
    const agent = makeActiveAgent({ inactivityTimeout: 1 }); // 1 minute
    linkSession(agent.id, 'sess-1');

    render(<App />);

    // First PTY data → timer starts
    act(() => { electronMock.firePtyData('sess-1'); });

    // Advance 45 seconds (within the 1 min window)
    act(() => { vi.advanceTimersByTime(45_000); });
    expect(useAgentStore.getState().agents[agent.id].status).toBe('active');

    // New PTY data → timer resets
    act(() => { electronMock.firePtyData('sess-1', 'more output'); });

    // Advance another 45 seconds from the new reset point (total: 90s but window reset)
    act(() => { vi.advanceTimersByTime(45_000); });
    expect(useAgentStore.getState().agents[agent.id].status).toBe('active');

    // Now advance past 1 minute from last reset — timeout fires
    act(() => { vi.advanceTimersByTime(20_000); });
    expect(useAgentStore.getState().agents[agent.id].status).toBe('error');
  });

  it('multiple data events keep pushing the timeout further', () => {
    const agent = makeActiveAgent({ inactivityTimeout: 1 });
    linkSession(agent.id, 'sess-a');

    render(<App />);

    for (let i = 0; i < 5; i++) {
      act(() => { electronMock.firePtyData('sess-a'); });
      act(() => { vi.advanceTimersByTime(30_000); }); // 30s between each event
    }

    // After 5 events × 30s = 150s total, but each event reset the timer.
    // Last reset was at t=120s. At t=150s, only 30s have elapsed since last reset.
    // Agent should still be active (60s timer not expired).
    expect(useAgentStore.getState().agents[agent.id].status).toBe('active');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. Cancellation on trabajo_terminado
// ═══════════════════════════════════════════════════════════════════════════════

describe('DAW-570 – Heartbeat: cancelled when trabajo_terminado fires', () => {
  let electronMock: ReturnType<typeof makeControllableElectronMock>;

  beforeEach(() => {
    vi.useFakeTimers();
    resetStores();
    electronMock = makeControllableElectronMock();
    Object.defineProperty(window, 'electron', {
      value: electronMock,
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it('agent does not time out when trabajo_terminado=true arrives before timeout', () => {
    const agent = makeActiveAgent({ inactivityTimeout: 1 });
    linkSession(agent.id, 'sess-1');

    render(<App />);
    act(() => { electronMock.firePtyData('sess-1'); });

    // Agent completes at 30s
    act(() => { vi.advanceTimersByTime(30_000); });
    act(() => { electronMock.fireTrabajoTerminado('sess-1', true); });

    // Status is now 'success' (setTrabajoTerminado sets it)
    expect(useAgentStore.getState().agents[agent.id].status).toBe('success');

    // Advance well past the 1-minute timeout — should NOT switch back to error
    act(() => { vi.advanceTimersByTime(90_000); });
    expect(useAgentStore.getState().agents[agent.id].status).toBe('success');
  });

  it('trabajo_terminado=false sets agent to idle, not error', () => {
    const agent = makeActiveAgent({ inactivityTimeout: 1 });
    linkSession(agent.id, 'sess-1');

    render(<App />);
    act(() => { electronMock.firePtyData('sess-1'); });
    act(() => { electronMock.fireTrabajoTerminado('sess-1', false); });
    act(() => { vi.advanceTimersByTime(90_000); });

    // setTrabajoTerminado(id, false) → status = 'idle'. Timer should be cancelled.
    expect(useAgentStore.getState().agents[agent.id].status).toBe('idle');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. Cancellation on PTY exit
// ═══════════════════════════════════════════════════════════════════════════════

describe('DAW-570 – Heartbeat: cancelled when PTY exits', () => {
  let electronMock: ReturnType<typeof makeControllableElectronMock>;

  beforeEach(() => {
    vi.useFakeTimers();
    resetStores();
    electronMock = makeControllableElectronMock();
    Object.defineProperty(window, 'electron', {
      value: electronMock,
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it('agent does not time out when PTY exits before timeout fires', () => {
    const agent = makeActiveAgent({ inactivityTimeout: 1 });
    linkSession(agent.id, 'sess-exit');

    render(<App />);
    act(() => { electronMock.firePtyData('sess-exit'); });

    // PTY exits at 30s — heartbeat should be cancelled
    act(() => { vi.advanceTimersByTime(30_000); });
    act(() => { electronMock.firePtyExit('sess-exit'); });

    // Advance past 1-minute timeout
    act(() => { vi.advanceTimersByTime(90_000); });

    // Status should NOT be 'error' — PTY exit cancelled the timer
    expect(useAgentStore.getState().agents[agent.id].status).not.toBe('error');
  });

  it('PTY exit unregisters the agent session from the map', () => {
    const agent = makeActiveAgent({ inactivityTimeout: 1 });
    linkSession(agent.id, 'sess-exit');

    render(<App />);
    act(() => { electronMock.firePtyExit('sess-exit'); });

    // agentSessionMap should no longer contain this agent
    const map = useTerminalStore.getState().agentSessionMap;
    expect(map[agent.id]).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. Idle agents do not get a heartbeat timer started
// ═══════════════════════════════════════════════════════════════════════════════

describe('DAW-570 – Heartbeat: idle agents are not affected', () => {
  let electronMock: ReturnType<typeof makeControllableElectronMock>;

  beforeEach(() => {
    vi.useFakeTimers();
    resetStores();
    electronMock = makeControllableElectronMock();
    Object.defineProperty(window, 'electron', {
      value: electronMock,
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it('idle agent receiving PTY data does not get a timeout timer', () => {
    const agent = useAgentStore.getState().createAgent({
      name: 'IDLE_AGENT',
      description: 'test',
      status: 'idle',
      teamId: null,
      skills: [],
      currentTask: null,
      trabajoTerminado: true,
      inactivityTimeout: 1,
    });
    linkSession(agent.id, 'sess-idle');

    render(<App />);
    act(() => { electronMock.firePtyData('sess-idle'); });

    // Advance past 1 minute — no timer should have been set for idle agents
    act(() => { vi.advanceTimersByTime(90_000); });
    expect(useAgentStore.getState().agents[agent.id].status).toBe('idle');
  });

  it('success agent receiving PTY data does not get a timeout timer', () => {
    const agent = useAgentStore.getState().createAgent({
      name: 'SUCCESS_AGENT',
      description: 'test',
      status: 'success',
      teamId: null,
      skills: [],
      currentTask: null,
      trabajoTerminado: true,
      inactivityTimeout: 1,
    });
    linkSession(agent.id, 'sess-success');

    render(<App />);
    act(() => { electronMock.firePtyData('sess-success'); });
    act(() => { vi.advanceTimersByTime(90_000); });
    expect(useAgentStore.getState().agents[agent.id].status).toBe('success');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 7. Multiple agents — independent timers
// ═══════════════════════════════════════════════════════════════════════════════

describe('DAW-570 – Heartbeat: multiple agents have independent timers', () => {
  let electronMock: ReturnType<typeof makeControllableElectronMock>;

  beforeEach(() => {
    vi.useFakeTimers();
    resetStores();
    electronMock = makeControllableElectronMock();
    Object.defineProperty(window, 'electron', {
      value: electronMock,
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it('timing out one agent does not affect others', () => {
    const agentA = makeActiveAgent({ inactivityTimeout: 1 });
    const agentB = makeActiveAgent({ inactivityTimeout: 2 });
    (agentB as typeof agentA & { name: string }).name; // suppress unused warn
    useAgentStore.getState().updateAgent(agentB.id, { name: 'AGENT_B' });

    linkSession(agentA.id, 'sess-a');
    linkSession(agentB.id, 'sess-b');

    render(<App />);

    act(() => { electronMock.firePtyData('sess-a'); });
    act(() => { electronMock.firePtyData('sess-b'); });

    // Agent A times out at 1 minute
    act(() => { vi.advanceTimersByTime(61_000); });
    expect(useAgentStore.getState().agents[agentA.id].status).toBe('error');
    // Agent B (2 minute timeout) should still be active
    expect(useAgentStore.getState().agents[agentB.id].status).toBe('active');

    // Agent B times out at 2 minutes from its last data
    act(() => { vi.advanceTimersByTime(61_000); });
    expect(useAgentStore.getState().agents[agentB.id].status).toBe('error');
  });
});
