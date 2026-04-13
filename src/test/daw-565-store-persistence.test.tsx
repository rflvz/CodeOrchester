/**
 * DAW-565: Bug — Stores sin persistencia adecuada: skills, notificaciones y sesiones PTY
 *
 * Fix 1: skillStore uses persist middleware (localStorage) — skills survive reloads.
 * Fix 2: notificationStore uses createElectronStorage instead of localStorage.
 * Fix 3: unregisterAgentSession() called in onPtyExit so agentSessionMap never accumulates stale entries.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useSkillStore } from '../stores/skillStore';
import { useNotificationStore } from '../stores/notificationStore';
import { useTerminalStore } from '../stores/terminalStore';
import { createElectronStorage } from '../stores/electronStorage';
import { render, act } from '@testing-library/react';
import App from '../App';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const resetSkillStore = () =>
  useSkillStore.setState({ skills: {}, categories: useSkillStore.getState().categories });

const resetTerminalStore = () =>
  useTerminalStore.setState({ sessions: {}, activeSessionId: null, recentLogs: [], agentSessionMap: {} });

type ElectronMock = Window & { electron?: unknown };

/** Mínimo electron necesario para que App.tsx monte sin errores */
const makeElectronMock = (overrides: Partial<{
  onPtyExit: (cb: (d: { sessionId: string; exitCode: number }) => void) => () => void;
}> = {}) => ({
  onPtyData: () => () => {},
  onTrabajoTerminado: () => () => {},
  onClaudeStream: () => () => {},
  onPtyError: () => () => {},
  onPtyExit: () => () => {},
  ...overrides,
});

// ═══════════════════════════════════════════════════════════════════════════════
// 1. skillStore — persist middleware
// ═══════════════════════════════════════════════════════════════════════════════

describe('DAW-565 – skillStore: persist middleware escribe en localStorage', () => {
  beforeEach(() => {
    localStorage.clear();
    resetSkillStore();
  });

  it('createSkill escribe en la clave "skill-store" de localStorage', () => {
    useSkillStore.getState().createSkill({
      name: 'Code Review',
      description: 'Reviews code quality',
      category: 'code_review',
      prompt: 'Review this code',
    });

    expect(localStorage.getItem('skill-store')).not.toBeNull();
  });

  it('el skill creado está en el JSON de localStorage con todos sus campos', () => {
    const created = useSkillStore.getState().createSkill({
      name: 'Debugger',
      description: 'Debugs issues',
      category: 'debugging',
      prompt: 'Debug this',
    });

    const stored = JSON.parse(localStorage.getItem('skill-store')!) as {
      state: { skills: Record<string, { name: string; category: string }> };
    };

    expect(stored.state.skills[created.id]).toBeDefined();
    expect(stored.state.skills[created.id].name).toBe('Debugger');
    expect(stored.state.skills[created.id].category).toBe('debugging');
  });

  it('varios skills creados aparecen todos en localStorage', () => {
    const a = useSkillStore.getState().createSkill({ name: 'A', description: '', category: 'custom', prompt: '' });
    const b = useSkillStore.getState().createSkill({ name: 'B', description: '', category: 'testing', prompt: '' });
    const c = useSkillStore.getState().createSkill({ name: 'C', description: '', category: 'analysis', prompt: '' });

    const stored = JSON.parse(localStorage.getItem('skill-store')!) as {
      state: { skills: Record<string, unknown> };
    };

    expect(stored.state.skills[a.id]).toBeDefined();
    expect(stored.state.skills[b.id]).toBeDefined();
    expect(stored.state.skills[c.id]).toBeDefined();
  });

  it('deleteSkill elimina la entrada de localStorage', () => {
    const skill = useSkillStore.getState().createSkill({ name: 'ToDelete', description: '', category: 'custom', prompt: '' });
    useSkillStore.getState().deleteSkill(skill.id);

    const stored = JSON.parse(localStorage.getItem('skill-store')!) as {
      state: { skills: Record<string, unknown> };
    };
    expect(stored.state.skills[skill.id]).toBeUndefined();
  });

  it('updateSkill actualiza el nombre en localStorage', () => {
    const skill = useSkillStore.getState().createSkill({ name: 'Original', description: '', category: 'custom', prompt: '' });
    useSkillStore.getState().updateSkill(skill.id, { name: 'Updated' });

    const stored = JSON.parse(localStorage.getItem('skill-store')!) as {
      state: { skills: Record<string, { name: string }> };
    };
    expect(stored.state.skills[skill.id].name).toBe('Updated');
  });

  it('no guarda "categories" en localStorage (solo "skills" via partialize)', () => {
    useSkillStore.getState().createSkill({ name: 'X', description: '', category: 'custom', prompt: '' });

    const stored = JSON.parse(localStorage.getItem('skill-store')!) as { state: Record<string, unknown> };
    // partialize solo incluye skills
    expect(stored.state.categories).toBeUndefined();
    expect(stored.state.skills).toBeDefined();
  });

  it('localStorage no contiene datos de notification-store (no hubo contaminación)', () => {
    useSkillStore.getState().createSkill({ name: 'X', description: '', category: 'custom', prompt: '' });
    // La clave de notifications no debe estar en localStorage (usa electronStorage)
    expect(localStorage.getItem('notification-store')).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. notificationStore — usa electronStorage (NO localStorage)
// ═══════════════════════════════════════════════════════════════════════════════

describe('DAW-565 – notificationStore: usa electronStorage en vez de localStorage', () => {
  beforeEach(() => {
    localStorage.clear();
    useNotificationStore.setState({ notifications: [], unreadCount: 0 });
  });

  it('addNotification NO escribe en localStorage (usa electronStorage)', () => {
    useNotificationStore.getState().addNotification({ title: 'Test', message: 'Hello', type: 'info' });

    // La key 'notification-store' NO debe aparecer en localStorage
    expect(localStorage.getItem('notification-store')).toBeNull();
  });

  it('el estado en memoria es correcto tras addNotification', () => {
    useNotificationStore.getState().addNotification({ title: 'Alert', message: 'Msg', type: 'warning' });

    const { notifications, unreadCount } = useNotificationStore.getState();
    expect(notifications).toHaveLength(1);
    expect(notifications[0].title).toBe('Alert');
    expect(unreadCount).toBe(1);
  });

  it('markAsRead decrementa unreadCount', () => {
    useNotificationStore.getState().addNotification({ title: 'N1', message: '', type: 'info' });
    useNotificationStore.getState().addNotification({ title: 'N2', message: '', type: 'info' });
    const id = useNotificationStore.getState().notifications[0].id;

    useNotificationStore.getState().markAsRead(id);

    expect(useNotificationStore.getState().unreadCount).toBe(1);
  });

  it('markAllAsRead pone unreadCount a 0', () => {
    useNotificationStore.getState().addNotification({ title: 'N1', message: '', type: 'info' });
    useNotificationStore.getState().addNotification({ title: 'N2', message: '', type: 'info' });

    useNotificationStore.getState().markAllAsRead();

    expect(useNotificationStore.getState().unreadCount).toBe(0);
    expect(useNotificationStore.getState().notifications.every((n) => n.read)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. createElectronStorage factory
// ═══════════════════════════════════════════════════════════════════════════════

describe('DAW-565 – createElectronStorage: IPC getStoreValue/setStoreValue', () => {
  afterEach(() => {
    delete (window as ElectronMock).electron;
  });

  it('getItem retorna null si window.electron no existe', async () => {
    const storage = createElectronStorage('test-key');
    const result = await storage.getItem('_');
    expect(result).toBeNull();
  });

  it('setItem no lanza si window.electron no existe', async () => {
    const storage = createElectronStorage('test-key');
    await expect(storage.setItem('_', '{"state":{}}')).resolves.not.toThrow();
  });

  it('getItem llama a electron.getStoreValue con la storeKey correcta', async () => {
    const getStoreValue = vi.fn().mockResolvedValue({ state: { foo: 'bar' }, version: 0 });
    const setStoreValue = vi.fn().mockResolvedValue({ success: true });
    (window as ElectronMock).electron = { getStoreValue, setStoreValue } as unknown;

    const storage = createElectronStorage('my-store');
    await storage.getItem('_');

    expect(getStoreValue).toHaveBeenCalledWith('my-store');
  });

  it('getItem serializa a string el objeto devuelto por electron', async () => {
    const payload = { state: { notifications: [] }, version: 0 };
    (window as ElectronMock).electron = {
      getStoreValue: vi.fn().mockResolvedValue(payload),
      setStoreValue: vi.fn(),
    } as unknown;

    const storage = createElectronStorage('notif-key');
    const result = await storage.getItem('_');

    expect(typeof result).toBe('string');
    expect(JSON.parse(result!)).toEqual(payload);
  });

  it('setItem llama a electron.setStoreValue con la storeKey y el objeto parseado', async () => {
    const setStoreValue = vi.fn().mockResolvedValue({ success: true });
    (window as ElectronMock).electron = {
      getStoreValue: vi.fn(),
      setStoreValue,
    } as unknown;

    const storage = createElectronStorage('skill-store');
    const value = JSON.stringify({ state: { skills: { 'id-1': { name: 'X' } } }, version: 0 });
    await storage.setItem('_', value);

    expect(setStoreValue).toHaveBeenCalledWith('skill-store', {
      state: { skills: { 'id-1': { name: 'X' } } },
      version: 0,
    });
  });

  it('removeItem llama a electron.setStoreValue con null', async () => {
    const setStoreValue = vi.fn().mockResolvedValue({ success: true });
    (window as ElectronMock).electron = {
      getStoreValue: vi.fn(),
      setStoreValue,
    } as unknown;

    const storage = createElectronStorage('test-store');
    await storage.removeItem('_');

    expect(setStoreValue).toHaveBeenCalledWith('test-store', null);
  });

  it('getItem retorna null si electron devuelve null', async () => {
    (window as ElectronMock).electron = {
      getStoreValue: vi.fn().mockResolvedValue(null),
      setStoreValue: vi.fn(),
    } as unknown;

    const storage = createElectronStorage('empty-store');
    const result = await storage.getItem('_');
    expect(result).toBeNull();
  });

  it('dos instancias con distinta storeKey usan claves independientes', async () => {
    const getStoreValue = vi.fn().mockResolvedValue(null);
    const setStoreValue = vi.fn().mockResolvedValue({ success: true });
    (window as ElectronMock).electron = { getStoreValue, setStoreValue } as unknown;

    const storageA = createElectronStorage('store-A');
    const storageB = createElectronStorage('store-B');

    await storageA.getItem('_');
    await storageB.getItem('_');

    expect(getStoreValue).toHaveBeenNthCalledWith(1, 'store-A');
    expect(getStoreValue).toHaveBeenNthCalledWith(2, 'store-B');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. agentSessionMap — cleanup en onPtyExit
// ═══════════════════════════════════════════════════════════════════════════════

describe('DAW-565 – agentSessionMap: cleanup al morir sesión PTY', () => {
  beforeEach(resetTerminalStore);

  it('unregisterAgentSession elimina la entrada del agente', () => {
    useTerminalStore.getState().registerAgentSession('agent-1', 'sess-abc');
    useTerminalStore.getState().unregisterAgentSession('agent-1');
    expect(useTerminalStore.getState().agentSessionMap['agent-1']).toBeUndefined();
  });

  it('unregisterAgentSession no afecta a otros agentes', () => {
    useTerminalStore.getState().registerAgentSession('agent-1', 'sess-abc');
    useTerminalStore.getState().registerAgentSession('agent-2', 'sess-xyz');
    useTerminalStore.getState().unregisterAgentSession('agent-1');
    expect(useTerminalStore.getState().agentSessionMap['agent-2']).toBe('sess-xyz');
  });

  it('registrar el mismo agente dos veces sobreescribe la sesión', () => {
    useTerminalStore.getState().registerAgentSession('agent-1', 'sess-old');
    useTerminalStore.getState().registerAgentSession('agent-1', 'sess-new');
    expect(useTerminalStore.getState().agentSessionMap['agent-1']).toBe('sess-new');
  });

  it('unregisterAgentSession sobre un agente inexistente no lanza', () => {
    expect(() => useTerminalStore.getState().unregisterAgentSession('no-existe')).not.toThrow();
  });

  it('App.tsx: onPtyExit elimina la entrada del agente cuya sesión murió', () => {
    const exitListeners: Array<(d: { sessionId: string; exitCode: number }) => void> = [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as ElectronMock).electron = makeElectronMock({
      onPtyExit: (cb) => { exitListeners.push(cb); return () => {}; },
    }) as any;

    useTerminalStore.getState().registerAgentSession('agentX', 'sess-001');
    useTerminalStore.getState().registerAgentSession('agentY', 'sess-002');

    render(<App />);

    act(() => { exitListeners.forEach((cb) => cb({ sessionId: 'sess-001', exitCode: 0 })); });

    expect(useTerminalStore.getState().agentSessionMap['agentX']).toBeUndefined();
    expect(useTerminalStore.getState().agentSessionMap['agentY']).toBe('sess-002');
  });

  it('App.tsx: sesión sin agente asociado no lanza ni corrompe el mapa', () => {
    const exitListeners: Array<(d: { sessionId: string; exitCode: number }) => void> = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as ElectronMock).electron = makeElectronMock({
      onPtyExit: (cb) => { exitListeners.push(cb); return () => {}; },
    }) as any;

    useTerminalStore.getState().registerAgentSession('agentZ', 'sess-known');

    render(<App />);

    // Sesión desconocida muere — no debe tocar el mapa
    act(() => { exitListeners.forEach((cb) => cb({ sessionId: 'sess-UNKNOWN', exitCode: 1 })); });

    expect(useTerminalStore.getState().agentSessionMap['agentZ']).toBe('sess-known');
  });

  it('App.tsx: múltiples sesiones mueren en secuencia, cada una limpia solo su entrada', () => {
    const exitListeners: Array<(d: { sessionId: string; exitCode: number }) => void> = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as ElectronMock).electron = makeElectronMock({
      onPtyExit: (cb) => { exitListeners.push(cb); return () => {}; },
    }) as any;

    useTerminalStore.getState().registerAgentSession('a1', 's1');
    useTerminalStore.getState().registerAgentSession('a2', 's2');
    useTerminalStore.getState().registerAgentSession('a3', 's3');

    render(<App />);

    act(() => { exitListeners.forEach((cb) => cb({ sessionId: 's1', exitCode: 0 })); });
    expect(useTerminalStore.getState().agentSessionMap['a1']).toBeUndefined();
    expect(useTerminalStore.getState().agentSessionMap['a2']).toBe('s2');
    expect(useTerminalStore.getState().agentSessionMap['a3']).toBe('s3');

    act(() => { exitListeners.forEach((cb) => cb({ sessionId: 's3', exitCode: 0 })); });
    expect(useTerminalStore.getState().agentSessionMap['a2']).toBe('s2');
    expect(useTerminalStore.getState().agentSessionMap['a3']).toBeUndefined();
  });

  afterEach(() => {
    delete (window as ElectronMock).electron;
  });
});
