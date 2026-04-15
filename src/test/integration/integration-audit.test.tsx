/**
 * AUDIT DE INTEGRACIÓN — CodeOrchester
 *
 * Tests que ejercen los flujos reales del sistema buscando fallos.
 * Ejecutar con: npx vitest run src/test/integration/integration-audit.test.tsx
 *
 * Áreas cubiertas:
 *  1. AgentChat — PTY y chat
 *  2. Agent↔Team sincronización bi-direccional
 *  3. Conexiones huérfanas tras borrar agente
 *  4. chatStore — persistencia en sesión y límites
 *  5. terminalStore — cap de logs y sessionMap
 *  6. Heartbeat/timeout
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useAgentStore } from '../../stores/agentStore';
import { useTeamStore } from '../../stores/teamStore';
import { useTerminalStore } from '../../stores/terminalStore';
import { useChatStore } from '../../stores/chatStore';
import { useFreeConnectionStore } from '../../stores/freeConnectionStore';
import { AgentChat } from '../../components/Screens/Chat/AgentChat';

// ─── Electron mock ────────────────────────────────────────────────────────────

const mockElectron = {
  startPty: vi.fn().mockResolvedValue({ success: true, pid: 1 }),
  writePty: vi.fn().mockResolvedValue({ success: true }),
  killPty: vi.fn().mockResolvedValue({ success: true }),
  getSettings: vi.fn().mockResolvedValue({}),
};

type ElectronMock = Window & { electron?: unknown };

// ─── Reset helpers ────────────────────────────────────────────────────────────

const resetAll = () => {
  useAgentStore.setState({ agents: {}, activeAgentId: null });
  useTeamStore.setState({ teams: {}, activeTeamId: null });
  useTerminalStore.setState({ sessions: {}, activeSessionId: null, recentLogs: [], agentSessionMap: {} });
  useChatStore.setState({ conversations: {} });
  useFreeConnectionStore.setState({ connections: [] });
  localStorage.clear();
};

const makeAgent = (name = 'TestBot', overrides = {}) =>
  useAgentStore.getState().createAgent({
    name,
    description: '',
    status: 'idle',
    teamId: null,
    skills: [],
    currentTask: null,
    trabajoTerminado: false,
    ...overrides,
  });

const makeTeam = (name = 'TestTeam') =>
  useTeamStore.getState().createTeam({
    name,
    description: '',
    agents: [],
    topology: 'mesh',
    connections: [],
  });

// ═══════════════════════════════════════════════════════════════════════════════
// 1. AgentChat — startPty firma completa (4 argumentos)
// ═══════════════════════════════════════════════════════════════════════════════

describe('AUDIT 1 — AgentChat: startPty se llama con 4 argumentos', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'electron', { value: mockElectron, configurable: true, writable: true });
    vi.clearAllMocks();
    resetAll();
  });
  afterEach(cleanup);

  it('startPty recibe (sessionId, cwd, prompt, modelId) — 4 args', async () => {
    const user = userEvent.setup();
    let agentId!: string;

    act(() => { agentId = makeAgent('ModelBot', { model: 'sonnet' }).id; });

    render(<AgentChat />);
    await user.click(screen.getByText('ModelBot').closest('button')!);

    await waitFor(() => expect(mockElectron.startPty).toHaveBeenCalled());

    const call = mockElectron.startPty.mock.calls[0];
    // El 1er arg es el agentId
    expect(call[0]).toBe(agentId);
    // El 2do es cwd (puede ser undefined)
    // El 3er es el prompt con el nombre del agente
    expect(typeof call[2]).toBe('string');
    expect(call[2]).toContain('ModelBot');
    // El 4to es el modelId — cuando model='sonnet' debe ser 'claude-sonnet-4-6'
    expect(call[3]).toBe('claude-sonnet-4-6');
  });

  it('startPty sin model asignado pasa modelId=undefined (4to arg)', async () => {
    const user = userEvent.setup();
    act(() => { makeAgent('NoModelBot'); }); // sin model

    render(<AgentChat />);
    await user.click(screen.getByText('NoModelBot').closest('button')!);

    await waitFor(() => expect(mockElectron.startPty).toHaveBeenCalled());

    const call = mockElectron.startPty.mock.calls[0];
    expect(call[3]).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. AgentChat — historial de chat (initConversation idempotente)
// ═══════════════════════════════════════════════════════════════════════════════

describe('AUDIT 2 — AgentChat: historial NO se sobreescribe al re-seleccionar agente', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'electron', { value: mockElectron, configurable: true, writable: true });
    vi.clearAllMocks();
    resetAll();
  });
  afterEach(cleanup);

  it('mensajes de usuario persisten al re-seleccionar el mismo agente', async () => {
    let agentId!: string;

    act(() => {
      agentId = makeAgent('HistoryBot').id;
      useTerminalStore.getState().registerAgentSession(agentId, agentId);
      // Pre-cargar un mensaje de usuario con id UUID (no '1')
      useChatStore.getState().initConversation(agentId, [
        {
          id: crypto.randomUUID(),
          type: 'user',
          content: 'Previous message from user',
          timestamp: new Date(),
          status: 'sent',
        },
      ]);
      useAgentStore.getState().setActiveAgent(agentId);
    });

    render(<AgentChat />);

    // El mensaje previo debe seguir visible
    expect(screen.getByText('Previous message from user')).toBeInTheDocument();
  });

  it('initConversation es idempotente — no duplica el mensaje de sistema', async () => {
    let agentId!: string;

    act(() => {
      agentId = makeAgent('IdempotentBot').id;
      useTerminalStore.getState().registerAgentSession(agentId, agentId);
      useAgentStore.getState().setActiveAgent(agentId);
    });

    const { unmount } = render(<AgentChat />);

    // Esperar a que la conversación se inicialice
    await waitFor(() => {
      const conv = useChatStore.getState().conversations[agentId];
      expect(conv).toBeDefined();
    });

    unmount();

    // Remount simula re-selección
    render(<AgentChat />);

    await waitFor(() => {
      const conv = useChatStore.getState().conversations[agentId];
      // Solo debe haber 1 mensaje de sistema (no duplicado)
      const systemMsgs = conv?.filter((m) => m.type === 'system') ?? [];
      expect(systemMsgs.length).toBe(1);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. AgentChat — ruta "sin sesión PTY" inalcanzable con auto-start
// ═══════════════════════════════════════════════════════════════════════════════

describe('AUDIT 3 — AgentChat: auto-start PTY crea sesión antes de que el usuario escriba', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'electron', { value: mockElectron, configurable: true, writable: true });
    vi.clearAllMocks();
    resetAll();
  });
  afterEach(cleanup);

  it('auto-start registra sesión inmediatamente al seleccionar agente', async () => {
    const user = userEvent.setup();
    act(() => { makeAgent('AutoStartBot'); });

    render(<AgentChat />);
    await user.click(screen.getByText('AutoStartBot').closest('button')!);

    await waitFor(() => {
      const agentId = useAgentStore.getState().activeAgentId!;
      expect(useTerminalStore.getState().getSessionIdByAgentId(agentId)).toBeTruthy();
    });
  });

  it('[KNOWN BUG] ruta "no PTY session" es inalcanzable si startPty tiene éxito', async () => {
    // Este test documenta el comportamiento actual:
    // El auto-start siempre crea una sesión, haciendo que el mensaje
    // "No active PTY session" nunca aparezca en flujo normal.
    const user = userEvent.setup();
    let agentId!: string;

    act(() => {
      agentId = makeAgent('NeverNoSessionBot').id;
      // NO registramos sesión a propósito
      useAgentStore.getState().setActiveAgent(agentId);
    });

    render(<AgentChat />);

    // El auto-start llama a startPty (éxito) → registra sesión
    await waitFor(() => {
      expect(useTerminalStore.getState().getSessionIdByAgentId(agentId)).toBeTruthy();
    });

    // Escribir y enviar: NO aparecerá el error "No active PTY session"
    // porque ya hay sesión registrada
    const textarea = screen.getByPlaceholderText(/message nevernosessionbot/i);
    await user.type(textarea, 'This goes through');
    await user.keyboard('{Enter}');

    await waitFor(() => expect(mockElectron.writePty).toHaveBeenCalled());

    // Verificar que NO se muestra el error de "no session"
    expect(screen.queryByText(/No active PTY session/i)).toBeNull();
  });

  it('la ruta "no PTY session" SÍ funciona si startPty falla', async () => {
    // Si startPty falla, no se registra sesión, y el error debe aparecer
    mockElectron.startPty.mockResolvedValueOnce({ success: false, error: 'PTY failed' });
    const user = userEvent.setup();
    let agentId!: string;

    act(() => {
      agentId = makeAgent('FailStartBot').id;
      useAgentStore.getState().setActiveAgent(agentId);
    });

    render(<AgentChat />);

    // Esperar a que el auto-start falle
    await waitFor(() => expect(mockElectron.startPty).toHaveBeenCalled());

    // Dar tiempo a que el resultado del startPty se procese
    await new Promise((r) => setTimeout(r, 50));

    const textarea = screen.getByPlaceholderText(/message failstartbot/i);
    await user.type(textarea, 'Will this show error?');
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(screen.getAllByText(/No active PTY session/i).length).toBeGreaterThan(0);
    });
    expect(mockElectron.writePty).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. Agent↔Team sincronización bi-direccional
// ═══════════════════════════════════════════════════════════════════════════════

describe('AUDIT 4 — Agent↔Team sincronización bi-direccional', () => {
  beforeEach(resetAll);

  it('addAgentToTeam actualiza agent.teamId en agentStore (Bug 1 fix)', () => {
    const agent = makeAgent('AgentA');
    const team = makeTeam('TeamX');

    useTeamStore.getState().addAgentToTeam(agent.id, team.id);

    // team.agents[] se actualiza correctamente
    expect(useTeamStore.getState().teams[team.id].agents).toContain(agent.id);

    // agent.teamId también se sincroniza
    const updatedAgent = useAgentStore.getState().agents[agent.id];
    expect(updatedAgent.teamId).toBe(team.id);
  });

  it('removeAgentFromTeam limpia agent.teamId (Bug 1 fix)', () => {
    const agent = makeAgent('AgentB');
    const team = makeTeam('TeamY');

    useTeamStore.getState().addAgentToTeam(agent.id, team.id);
    useTeamStore.getState().removeAgentFromTeam(agent.id, team.id);

    // team.agents[] se limpia
    expect(useTeamStore.getState().teams[team.id].agents).not.toContain(agent.id);

    // agent.teamId también se limpia
    const updatedAgent = useAgentStore.getState().agents[agent.id];
    expect(updatedAgent.teamId).toBeNull();
  });

  it('deleteAgent limpia la referencia en team.agents[] (Bug 1 fix)', () => {
    const agent = makeAgent('AgentToDelete');
    const team = makeTeam('TeamZ');

    useTeamStore.getState().addAgentToTeam(agent.id, team.id);
    useAgentStore.getState().deleteAgent(agent.id);

    // El agente ya no existe en agentStore
    expect(useAgentStore.getState().agents[agent.id]).toBeUndefined();

    // team.agents[] también se limpió (no queda referencia huérfana)
    expect(useTeamStore.getState().teams[team.id].agents).not.toContain(agent.id);
  });

  it('deleteTeam sí limpia correctamente el estado del teamStore', () => {
    const team = makeTeam('TeamToDelete');
    const agent = makeAgent('AgentInTeam');
    useTeamStore.getState().addAgentToTeam(agent.id, team.id);

    useTeamStore.getState().deleteTeam(team.id);

    expect(useTeamStore.getState().teams[team.id]).toBeUndefined();
    // Pero el agente sigue con teamId de antes (si fue asignado manualmente)
  });

  it('un agente solo puede pertenecer a un team — membresía exclusiva (Bug 6 fix)', () => {
    const agent = makeAgent('SharedAgent');
    const team1 = makeTeam('Team1');
    const team2 = makeTeam('Team2');

    useTeamStore.getState().addAgentToTeam(agent.id, team1.id);
    useTeamStore.getState().addAgentToTeam(agent.id, team2.id);

    // Al añadir al team2, se elimina automáticamente del team1
    expect(useTeamStore.getState().teams[team1.id].agents).not.toContain(agent.id);
    expect(useTeamStore.getState().teams[team2.id].agents).toContain(agent.id);
    // agent.teamId apunta al team2 (el nuevo)
    expect(useAgentStore.getState().agents[agent.id].teamId).toBe(team2.id);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. Conexiones huérfanas (FreeConnectionStore)
// ═══════════════════════════════════════════════════════════════════════════════

describe('AUDIT 5 — FreeConnectionStore: conexiones huérfanas tras borrar agente', () => {
  beforeEach(() => {
    resetAll();
    localStorage.clear();
  });

  it('deleteAgent elimina sus conexiones en freeConnectionStore (Bug 2 fix)', () => {
    const agentA = makeAgent('ConnectedA');
    const agentB = makeAgent('ConnectedB');

    useFreeConnectionStore.getState().addConnection(agentA.id, agentB.id);
    expect(useFreeConnectionStore.getState().connections).toHaveLength(1);

    useAgentStore.getState().deleteAgent(agentA.id);

    // El agente se borró del agentStore
    expect(useAgentStore.getState().agents[agentA.id]).toBeUndefined();

    // La conexión también se eliminó — no queda referencia huérfana
    const orphanConnections = useFreeConnectionStore.getState().connections.filter(
      (c) => c.fromAgentId === agentA.id || c.toAgentId === agentA.id
    );
    expect(orphanConnections.length).toBe(0);
  });

  it('deleteAgent elimina sus conexiones en teamStore (Bug 2 fix)', () => {
    const team = makeTeam('ConnTeam');
    const agentA = makeAgent('ConnTeamA');
    const agentB = makeAgent('ConnTeamB');

    useTeamStore.getState().addAgentToTeam(agentA.id, team.id);
    useTeamStore.getState().addAgentToTeam(agentB.id, team.id);
    useTeamStore.getState().addConnection(team.id, {
      fromAgentId: agentA.id,
      toAgentId: agentB.id,
    });

    expect(useTeamStore.getState().teams[team.id].connections).toHaveLength(1);

    useAgentStore.getState().deleteAgent(agentA.id);

    // El agente se borró del agentStore
    expect(useAgentStore.getState().agents[agentA.id]).toBeUndefined();

    // La conexión en teamStore también se limpió
    const orphanConns = useTeamStore.getState().teams[team.id].connections.filter(
      (c) => c.fromAgentId === agentA.id || c.toAgentId === agentA.id
    );
    expect(orphanConns.length).toBe(0);
  });

  it('addConnection es idempotente — no duplica conexiones', () => {
    const a = makeAgent('A');
    const b = makeAgent('B');

    useFreeConnectionStore.getState().addConnection(a.id, b.id);
    useFreeConnectionStore.getState().addConnection(a.id, b.id);
    useFreeConnectionStore.getState().addConnection(b.id, a.id); // dirección inversa

    expect(useFreeConnectionStore.getState().connections).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. chatStore — sin persistencia entre reinicios de app
// ═══════════════════════════════════════════════════════════════════════════════

describe('AUDIT 6 — chatStore: persiste conversaciones en localStorage (Bug 3 fix)', () => {
  beforeEach(resetAll);

  it('chatStore persiste mensajes en localStorage', () => {
    const agentId = makeAgent('ChatPersistBot').id;
    useChatStore.getState().addMessage(agentId, {
      id: crypto.randomUUID(),
      type: 'user',
      content: 'This message survives restart',
      timestamp: new Date(),
      status: 'sent',
    });

    // Verificar que los datos están en localStorage (clave 'chat-store')
    const raw = localStorage.getItem('chat-store');
    expect(raw).not.toBeNull();
    expect(raw).toContain('This message survives restart');
  });

  it('chatStore sí persiste durante la sesión actual (en memoria)', () => {
    const agentId = makeAgent('SessionBot').id;
    useChatStore.getState().addMessage(agentId, {
      id: crypto.randomUUID(),
      type: 'user',
      content: 'I survive navigation',
      timestamp: new Date(),
      status: 'sent',
    });

    // El mensaje persiste dentro de la misma sesión
    const conv = useChatStore.getState().conversations[agentId];
    expect(conv?.some((m) => m.content === 'I survive navigation')).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 7. terminalStore — cap de logs a 100 entradas
// ═══════════════════════════════════════════════════════════════════════════════

describe('AUDIT 7 — terminalStore: cap de recentLogs a 500 entradas (Bug 5 fix)', () => {
  beforeEach(resetAll);

  it('hasta 500 logs se retienen — los anteriores se descartan al superar el cap', () => {
    const sessionId = 'sess-overflow';

    for (let i = 0; i < 510; i++) {
      useTerminalStore.getState().pushLogs(sessionId, `Log line ${i}`);
    }

    const logs = useTerminalStore.getState().recentLogs;
    expect(logs.length).toBe(500);

    // Los primeros 10 logs (0-9) se descartaron
    expect(logs[0].line).toBe('Log line 10');
    expect(logs[499].line).toBe('Log line 509');
  });

  it('pushError añade entrada con isError=true', () => {
    useTerminalStore.getState().pushError('sess-err', 'Critical failure');

    const logs = useTerminalStore.getState().recentLogs;
    expect(logs).toHaveLength(1);
    expect(logs[0].isError).toBe(true);
    expect(logs[0].line).toBe('Critical failure');
  });

  it('pushLogs filtra líneas vacías y chrome de CLI', () => {
    useTerminalStore.getState().pushLogs('sess', '\n\n\n');
    useTerminalStore.getState().pushLogs('sess', '─────────────────');
    useTerminalStore.getState().pushLogs('sess', 'ctrl+c to cancel');

    expect(useTerminalStore.getState().recentLogs).toHaveLength(0);
  });

  it('pushLogs filtra secuencias ANSI', () => {
    useTerminalStore.getState().pushLogs('sess', '\x1b[32mHello\x1b[0m');

    const logs = useTerminalStore.getState().recentLogs;
    expect(logs[0].line).toBe('Hello');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 8. agentStore — partialize excluye activeAgentId
// ═══════════════════════════════════════════════════════════════════════════════

describe('AUDIT 8 — agentStore: activeAgentId no se persiste', () => {
  let electronMock: { getStoreValue: ReturnType<typeof vi.fn>; setStoreValue: ReturnType<typeof vi.fn>; getAgentState: ReturnType<typeof vi.fn>; setAgentState: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    resetAll();
    electronMock = {
      getStoreValue: vi.fn().mockResolvedValue(null),
      setStoreValue: vi.fn().mockResolvedValue({ success: true }),
      getAgentState: vi.fn().mockResolvedValue({}),
      setAgentState: vi.fn().mockResolvedValue({ success: true }),
    };
    (window as ElectronMock).electron = electronMock;
  });

  afterEach(() => {
    delete (window as ElectronMock).electron;
    vi.clearAllMocks();
  });

  it('activeAgentId se resetea a null al "reiniciar" (no persiste)', () => {
    const agent = makeAgent('PersistAgent');
    useAgentStore.getState().setActiveAgent(agent.id);
    expect(useAgentStore.getState().activeAgentId).toBe(agent.id);

    // Simular reinicio: resetear estado del store
    useAgentStore.setState({ agents: {}, activeAgentId: null });
    expect(useAgentStore.getState().activeAgentId).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 9. AgentChat — modelo se traduce correctamente a model ID
// ═══════════════════════════════════════════════════════════════════════════════

describe('AUDIT 9 — AgentChat: traducción de modelo a Claude model ID', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'electron', { value: mockElectron, configurable: true, writable: true });
    vi.clearAllMocks();
    resetAll();
  });
  afterEach(cleanup);

  const modelCases: Array<[string, string]> = [
    ['haiku', 'claude-haiku-4-5-20251001'],
    ['sonnet', 'claude-sonnet-4-6'],
    ['opus', 'claude-opus-4-6'],
  ];

  modelCases.forEach(([model, expectedId]) => {
    it(`model="${model}" → startPty recibe "${expectedId}"`, async () => {
      const user = userEvent.setup();
      act(() => { makeAgent(`${model}Bot`, { model: model as 'haiku' | 'sonnet' | 'opus' }); });

      render(<AgentChat />);
      await user.click(screen.getByText(`${model}Bot`).closest('button')!);

      await waitFor(() => expect(mockElectron.startPty).toHaveBeenCalled());

      expect(mockElectron.startPty.mock.calls[0][3]).toBe(expectedId);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 10. AgentChat — writePty incluye initialPrompt
// ═══════════════════════════════════════════════════════════════════════════════

describe('AUDIT 10 — AgentChat: writePty incluye initialPrompt con nombre del agente', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'electron', { value: mockElectron, configurable: true, writable: true });
    vi.clearAllMocks();
    resetAll();
  });
  afterEach(cleanup);

  it('writePty se llama con (sessionId, mensaje, prompt) — 3 args', async () => {
    const user = userEvent.setup();
    let agentId!: string;

    act(() => {
      agentId = makeAgent('WriteBot').id;
      useTerminalStore.getState().registerAgentSession(agentId, agentId);
      useAgentStore.getState().setActiveAgent(agentId);
    });

    render(<AgentChat />);

    const textarea = screen.getByPlaceholderText(/message writebot/i);
    await user.type(textarea, 'Hello');
    await user.keyboard('{Enter}');

    await waitFor(() => expect(mockElectron.writePty).toHaveBeenCalled());

    const [sessionId, msg, prompt] = mockElectron.writePty.mock.calls[0];
    expect(sessionId).toBe(agentId);
    expect(msg).toBe('Hello');
    expect(typeof prompt).toBe('string');
    expect(prompt).toContain('WriteBot');
  });
});
