/**
 * DAW-571: Bug — Teams/clusters no persisten entre reinicios de la app
 *
 * Fix: teamStore ahora usa createElectronStorage('team-store') en vez del
 * legacy electronStorage (que era específico de agentes). Esto garantiza que
 * los teams se guardan en electron-store bajo la clave 'team-store' y
 * sobreviven al cierre/reapertura de la app.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useTeamStore } from '../stores/teamStore';
import { createElectronStorage } from '../stores/electronStorage';

// ─── Helpers ──────────────────────────────────────────────────────────────────

type ElectronMock = Window & { electron?: unknown };

const makeElectronStorageMock = () => {
  const store: Record<string, unknown> = {};
  return {
    getStoreValue: vi.fn((key: string) => Promise.resolve(store[key] ?? null)),
    setStoreValue: vi.fn((key: string, value: unknown) => {
      store[key] = value;
      return Promise.resolve({ success: true });
    }),
    _store: store,
  };
};

const resetTeamStore = () =>
  useTeamStore.setState({ teams: {}, activeTeamId: null });

// ═══════════════════════════════════════════════════════════════════════════════
// 1. teamStore — NO escribe en localStorage (usa electronStorage)
// ═══════════════════════════════════════════════════════════════════════════════

describe('DAW-571 – teamStore: NO usa localStorage (usa electronStorage)', () => {
  beforeEach(() => {
    localStorage.clear();
    resetTeamStore();
  });

  it('createTeam NO escribe en localStorage', () => {
    useTeamStore.getState().createTeam({
      name: 'Team Alpha',
      description: 'Test team',
      agents: [],
      topology: 'mesh',
      connections: [],
    });

    expect(localStorage.getItem('team-store')).toBeNull();
  });

  it('addAgentToTeam NO escribe en localStorage', () => {
    const team = useTeamStore.getState().createTeam({
      name: 'Team Beta',
      description: '',
      agents: [],
      topology: 'star',
      connections: [],
    });
    useTeamStore.getState().addAgentToTeam('agent-1', team.id);

    expect(localStorage.getItem('team-store')).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. teamStore — partialize excluye activeTeamId
// ═══════════════════════════════════════════════════════════════════════════════

describe('DAW-571 – teamStore: partialize excluye activeTeamId', () => {
  let electronMock: ReturnType<typeof makeElectronStorageMock>;

  beforeEach(() => {
    localStorage.clear();
    resetTeamStore();
    electronMock = makeElectronStorageMock();
    (window as ElectronMock).electron = electronMock;
  });

  afterEach(() => {
    delete (window as ElectronMock).electron;
    vi.clearAllMocks();
  });

  it('setActiveTeam no escribe activeTeamId en el store persistido', async () => {
    const team = useTeamStore.getState().createTeam({
      name: 'Team C',
      description: '',
      agents: [],
      topology: 'hierarchical',
      connections: [],
    });
    useTeamStore.getState().setActiveTeam(team.id);

    // Esperar a que la escritura asíncrona de persist ocurra
    await vi.waitFor(() => electronMock.setStoreValue.mock.calls.length > 0);

    const lastCall = electronMock.setStoreValue.mock.calls.at(-1);
    const persisted = lastCall?.[1] as { state?: { activeTeamId?: unknown } };
    expect(persisted?.state?.activeTeamId).toBeUndefined();
  });

  it('solo persiste "teams" (no activeTeamId)', async () => {
    useTeamStore.getState().createTeam({
      name: 'Team D',
      description: '',
      agents: [],
      topology: 'chain',
      connections: [],
    });

    await vi.waitFor(() => electronMock.setStoreValue.mock.calls.length > 0);

    const lastCall = electronMock.setStoreValue.mock.calls.at(-1);
    const persisted = lastCall?.[1] as { state?: Record<string, unknown> };
    expect(persisted?.state?.teams).toBeDefined();
    expect(persisted?.state?.activeTeamId).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. createElectronStorage — usa la clave 'team-store' correctamente
// ═══════════════════════════════════════════════════════════════════════════════

describe('DAW-571 – createElectronStorage con clave team-store', () => {
  afterEach(() => {
    delete (window as ElectronMock).electron;
  });

  it('getItem llama a electron.getStoreValue con "team-store"', async () => {
    const getStoreValue = vi.fn().mockResolvedValue(null);
    const setStoreValue = vi.fn().mockResolvedValue({ success: true });
    (window as ElectronMock).electron = { getStoreValue, setStoreValue } as unknown;

    const storage = createElectronStorage('team-store');
    await storage.getItem('_');

    expect(getStoreValue).toHaveBeenCalledWith('team-store');
  });

  it('setItem llama a electron.setStoreValue con "team-store" y el payload parseado', async () => {
    const setStoreValue = vi.fn().mockResolvedValue({ success: true });
    (window as ElectronMock).electron = {
      getStoreValue: vi.fn(),
      setStoreValue,
    } as unknown;

    const storage = createElectronStorage('team-store');
    const payload = { state: { teams: { 'team-1': { name: 'Alpha' } } }, version: 0 };
    await storage.setItem('_', JSON.stringify(payload));

    expect(setStoreValue).toHaveBeenCalledWith('team-store', payload);
  });

  it('removeItem llama a electron.setStoreValue con "team-store" y null', async () => {
    const setStoreValue = vi.fn().mockResolvedValue({ success: true });
    (window as ElectronMock).electron = {
      getStoreValue: vi.fn(),
      setStoreValue,
    } as unknown;

    const storage = createElectronStorage('team-store');
    await storage.removeItem('_');

    expect(setStoreValue).toHaveBeenCalledWith('team-store', null);
  });

  it('getItem retorna null si no hay electron (sin crash)', async () => {
    const storage = createElectronStorage('team-store');
    const result = await storage.getItem('_');
    expect(result).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. teamStore — estado en memoria (lógica del store)
// ═══════════════════════════════════════════════════════════════════════════════

describe('DAW-571 – teamStore: operaciones en memoria', () => {
  beforeEach(resetTeamStore);

  it('createTeam crea un team con id y createdAt generados', () => {
    const team = useTeamStore.getState().createTeam({
      name: 'Alpha',
      description: 'Desc',
      agents: [],
      topology: 'mesh',
      connections: [],
    });

    expect(team.id).toBeTruthy();
    expect(team.createdAt).toBeInstanceOf(Date);
    expect(useTeamStore.getState().teams[team.id]).toEqual(team);
  });

  it('addAgentToTeam añade el agentId al team y no duplica', () => {
    const team = useTeamStore.getState().createTeam({
      name: 'T1', description: '', agents: [], topology: 'star', connections: [],
    });

    useTeamStore.getState().addAgentToTeam('agent-1', team.id);
    useTeamStore.getState().addAgentToTeam('agent-1', team.id); // duplicado

    expect(useTeamStore.getState().teams[team.id].agents).toEqual(['agent-1']);
  });

  it('removeAgentFromTeam elimina el agentId del team', () => {
    const team = useTeamStore.getState().createTeam({
      name: 'T2', description: '', agents: ['agent-1', 'agent-2'], topology: 'chain', connections: [],
    });

    useTeamStore.getState().removeAgentFromTeam('agent-1', team.id);

    expect(useTeamStore.getState().teams[team.id].agents).toEqual(['agent-2']);
  });

  it('addConnection añade una conexión con id generado', () => {
    const team = useTeamStore.getState().createTeam({
      name: 'T3', description: '', agents: ['a1', 'a2'], topology: 'hierarchical', connections: [],
    });

    useTeamStore.getState().addConnection(team.id, { fromAgentId: 'a1', toAgentId: 'a2' });

    const connections = useTeamStore.getState().teams[team.id].connections;
    expect(connections).toHaveLength(1);
    expect(connections[0].id).toBeTruthy();
    expect(connections[0].fromAgentId).toBe('a1');
    expect(connections[0].toAgentId).toBe('a2');
  });

  it('addConnection no duplica conexiones idénticas', () => {
    const team = useTeamStore.getState().createTeam({
      name: 'T4', description: '', agents: ['a1', 'a2'], topology: 'mesh', connections: [],
    });

    useTeamStore.getState().addConnection(team.id, { fromAgentId: 'a1', toAgentId: 'a2' });
    useTeamStore.getState().addConnection(team.id, { fromAgentId: 'a1', toAgentId: 'a2' });

    expect(useTeamStore.getState().teams[team.id].connections).toHaveLength(1);
  });

  it('removeConnection elimina solo la conexión indicada', () => {
    const team = useTeamStore.getState().createTeam({
      name: 'T5', description: '', agents: ['a1', 'a2', 'a3'], topology: 'mesh', connections: [],
    });

    useTeamStore.getState().addConnection(team.id, { fromAgentId: 'a1', toAgentId: 'a2' });
    useTeamStore.getState().addConnection(team.id, { fromAgentId: 'a2', toAgentId: 'a3' });

    const connId = useTeamStore.getState().teams[team.id].connections[0].id;
    useTeamStore.getState().removeConnection(team.id, connId);

    const connections = useTeamStore.getState().teams[team.id].connections;
    expect(connections).toHaveLength(1);
    expect(connections[0].fromAgentId).toBe('a2');
  });

  it('deleteTeam elimina el team y resetea activeTeamId si era el activo', () => {
    const team = useTeamStore.getState().createTeam({
      name: 'ToDelete', description: '', agents: [], topology: 'star', connections: [],
    });
    useTeamStore.getState().setActiveTeam(team.id);

    useTeamStore.getState().deleteTeam(team.id);

    expect(useTeamStore.getState().teams[team.id]).toBeUndefined();
    expect(useTeamStore.getState().activeTeamId).toBeNull();
  });

  it('team vacío (sin agentes) persiste en el store', () => {
    const team = useTeamStore.getState().createTeam({
      name: 'Empty', description: '', agents: [], topology: 'mesh', connections: [],
    });

    expect(useTeamStore.getState().teams[team.id].agents).toEqual([]);
    expect(useTeamStore.getState().teams[team.id].connections).toEqual([]);
  });

  it('múltiples teams con conexiones cruzadas coexisten sin interferencia', () => {
    const t1 = useTeamStore.getState().createTeam({
      name: 'T-A', description: '', agents: ['a1', 'a2'], topology: 'mesh', connections: [],
    });
    const t2 = useTeamStore.getState().createTeam({
      name: 'T-B', description: '', agents: ['b1', 'b2'], topology: 'star', connections: [],
    });

    useTeamStore.getState().addConnection(t1.id, { fromAgentId: 'a1', toAgentId: 'a2' });
    useTeamStore.getState().addConnection(t2.id, { fromAgentId: 'b1', toAgentId: 'b2' });

    expect(useTeamStore.getState().teams[t1.id].connections).toHaveLength(1);
    expect(useTeamStore.getState().teams[t2.id].connections).toHaveLength(1);
    expect(useTeamStore.getState().teams[t1.id].connections[0].fromAgentId).toBe('a1');
    expect(useTeamStore.getState().teams[t2.id].connections[0].fromAgentId).toBe('b1');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. Edge cases — robustez
// ═══════════════════════════════════════════════════════════════════════════════

describe('DAW-571 – teamStore: edge cases', () => {
  beforeEach(resetTeamStore);

  it('addAgentToTeam sobre team inexistente no lanza', () => {
    expect(() => useTeamStore.getState().addAgentToTeam('agent-x', 'no-existe')).not.toThrow();
  });

  it('removeAgentFromTeam sobre team inexistente no lanza', () => {
    expect(() => useTeamStore.getState().removeAgentFromTeam('agent-x', 'no-existe')).not.toThrow();
  });

  it('removeConnection sobre team inexistente no lanza', () => {
    expect(() => useTeamStore.getState().removeConnection('no-existe', 'conn-id')).not.toThrow();
  });

  it('addConnection sobre team inexistente no lanza', () => {
    expect(() =>
      useTeamStore.getState().addConnection('no-existe', { fromAgentId: 'a', toAgentId: 'b' })
    ).not.toThrow();
  });

  it('deleteTeam sobre id inexistente no lanza y no afecta otros teams', () => {
    const team = useTeamStore.getState().createTeam({
      name: 'Survivor', description: '', agents: [], topology: 'mesh', connections: [],
    });

    expect(() => useTeamStore.getState().deleteTeam('ghost-id')).not.toThrow();
    expect(useTeamStore.getState().teams[team.id]).toBeDefined();
  });

  it('updateTeam sobre id inexistente no lanza', () => {
    expect(() =>
      useTeamStore.getState().updateTeam('no-existe', { name: 'Updated' })
    ).not.toThrow();
  });
});
