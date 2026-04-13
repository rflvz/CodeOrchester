/**
 * DAW-565: Bug — Stores sin persistencia adecuada: skills, notificaciones y sesiones PTY
 *
 * Fix 1: skillStore now uses persist middleware (localStorage) so skills survive reloads.
 * Fix 2: notificationStore now uses electronStorage (electron-store) instead of localStorage.
 * Fix 3: unregisterAgentSession() called in onPtyExit handler in App.tsx so agentSessionMap
 *         never accumulates stale entries.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { useSkillStore } from '../stores/skillStore';
import { useTerminalStore } from '../stores/terminalStore';
import { render, act } from '@testing-library/react';
import App from '../App';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const resetSkillStore = () =>
  useSkillStore.setState({ skills: {}, categories: useSkillStore.getState().categories });

const resetTerminalStore = () =>
  useTerminalStore.setState({
    sessions: {},
    activeSessionId: null,
    recentLogs: [],
    agentSessionMap: {},
  });

// ─── skillStore persistence ───────────────────────────────────────────────────

describe('DAW-565 – skillStore persist', () => {
  beforeEach(() => {
    localStorage.clear();
    resetSkillStore();
  });

  it('persists a created skill to localStorage', () => {
    useSkillStore.getState().createSkill({
      name: 'Code Review',
      description: 'Reviews code quality',
      category: 'code_review',
      prompt: 'Review this code',
    });

    const raw = localStorage.getItem('skill-store');
    expect(raw).not.toBeNull();
    const stored = JSON.parse(raw!);
    const skills = Object.values(stored.state.skills as Record<string, { name: string }>);
    expect(skills.some((s) => s.name === 'Code Review')).toBe(true);
  });

  it('created skill is written to localStorage (survives reload)', () => {
    const created = useSkillStore.getState().createSkill({
      name: 'Debugger',
      description: 'Debugs issues',
      category: 'debugging',
      prompt: 'Debug this',
    });

    // Verify the skill was flushed to localStorage by the persist middleware.
    // On a real reload, persist rehydrates from this entry.
    const raw = localStorage.getItem('skill-store');
    expect(raw).not.toBeNull();
    const stored = JSON.parse(raw!) as { state: { skills: Record<string, { name: string }> } };
    expect(stored.state.skills[created.id]).toBeDefined();
    expect(stored.state.skills[created.id].name).toBe('Debugger');
  });

  it('delete removes skill from localStorage', () => {
    const skill = useSkillStore.getState().createSkill({
      name: 'ToDelete',
      description: '',
      category: 'custom',
      prompt: '',
    });

    useSkillStore.getState().deleteSkill(skill.id);

    const raw = localStorage.getItem('skill-store');
    const stored = JSON.parse(raw!);
    expect(stored.state.skills[skill.id]).toBeUndefined();
  });
});

// ─── agentSessionMap cleanup on pty-exit ─────────────────────────────────────

describe('DAW-565 – agentSessionMap cleanup on pty-exit', () => {
  beforeEach(() => {
    resetTerminalStore();
  });

  it('unregisterAgentSession removes the entry', () => {
    useTerminalStore.getState().registerAgentSession('agent-1', 'session-abc');
    expect(useTerminalStore.getState().agentSessionMap['agent-1']).toBe('session-abc');

    useTerminalStore.getState().unregisterAgentSession('agent-1');
    expect(useTerminalStore.getState().agentSessionMap['agent-1']).toBeUndefined();
  });

  it('unregisterAgentSession leaves other entries intact', () => {
    useTerminalStore.getState().registerAgentSession('agent-1', 'session-abc');
    useTerminalStore.getState().registerAgentSession('agent-2', 'session-xyz');

    useTerminalStore.getState().unregisterAgentSession('agent-1');

    expect(useTerminalStore.getState().agentSessionMap['agent-1']).toBeUndefined();
    expect(useTerminalStore.getState().agentSessionMap['agent-2']).toBe('session-xyz');
  });

  it('App.tsx onPtyExit handler unregisters the agent whose session died', async () => {
    // Mock the electron API used by App.tsx
    const onPtyExitListeners: Array<(data: { sessionId: string; exitCode: number }) => void> = [];
    const mockElectron = {
      onPtyData: () => () => {},
      onTrabajoTerminado: () => () => {},
      onClaudeStream: () => () => {},
      onPtyError: () => () => {},
      onPtyExit: (cb: (data: { sessionId: string; exitCode: number }) => void) => {
        onPtyExitListeners.push(cb);
        return () => { onPtyExitListeners.splice(onPtyExitListeners.indexOf(cb), 1); };
      },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as Window & { electron?: unknown }).electron = mockElectron as any;

    useTerminalStore.getState().registerAgentSession('agent-A', 'sess-001');
    useTerminalStore.getState().registerAgentSession('agent-B', 'sess-002');

    render(<App />);

    // Simulate pty-exit for sess-001
    act(() => {
      onPtyExitListeners.forEach((cb) => cb({ sessionId: 'sess-001', exitCode: 0 }));
    });

    expect(useTerminalStore.getState().agentSessionMap['agent-A']).toBeUndefined();
    expect(useTerminalStore.getState().agentSessionMap['agent-B']).toBe('sess-002');

    delete (window as Window & { electron?: unknown }).electron;
  });

  afterEach(() => {
    delete (window as Window & { electron?: unknown }).electron;
  });
});
