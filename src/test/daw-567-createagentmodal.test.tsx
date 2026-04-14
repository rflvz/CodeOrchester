/**
 * DAW-567: CreateAgentModal — pasos 2 y 3 + modo edición
 *
 * Verifies:
 * - Navegación Next/Back entre pasos
 * - Validación de nombre en paso 1 (vacío, duplicado)
 * - Creación completa de agente con los 3 pasos (todos los campos)
 * - Modo edición: pre-carga datos del agente existente
 * - Guardar en modo edición llama updateAgent, no createAgent
 * - Cancelar no persiste cambios
 * - Skills vacíos en skillStore → empty state en paso 2
 */

import { render, screen, act, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CreateAgentModal } from '../components/Shared/CreateAgentModal';
import { useAgentStore } from '../stores/agentStore';
import { useSkillStore } from '../stores/skillStore';

// ── Electron mock ─────────────────────────────────────────────────────────────

const mockElectron = {
  showDirectoryDialog: vi.fn().mockResolvedValue('/home/user/project'),
  setAgentState: vi.fn().mockResolvedValue({ success: true }),
  getAgentState: vi.fn().mockResolvedValue({}),
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const resetAll = () => {
  useAgentStore.setState({ agents: {}, activeAgentId: null });
  useSkillStore.setState({ skills: {} } as Parameters<typeof useSkillStore.setState>[0]);
};

type AgentData = {
  name?: string;
  description?: string;
  model?: 'haiku' | 'sonnet' | 'opus';
  temperature?: number;
  maxTokens?: number;
  cwd?: string;
  envVars?: Record<string, string>;
  autoStart?: boolean;
  inactivityTimeout?: number;
  icon?: string;
  instructions?: string;
  skills?: string[];
};

const makeAgent = (overrides: AgentData = {}) =>
  useAgentStore.getState().createAgent({
    name: 'EXISTING_AGENT',
    description: 'An existing agent',
    status: 'idle',
    teamId: null,
    skills: [],
    currentTask: null,
    trabajoTerminado: true,
    icon: 'memory',
    instructions: 'Do things carefully.',
    inactivityTimeout: 10,
    model: 'opus',
    temperature: 0.3,
    maxTokens: 8192,
    cwd: '/home/agent',
    envVars: { MY_KEY: 'my_value' },
    autoStart: true,
    ...overrides,
  });

const makeSkill = (name = 'Code Review') =>
  useSkillStore.getState().createSkill({
    name,
    description: 'Reviews code',
    category: 'code_review',
    prompt: 'Review the code carefully',
  });

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DAW-567 – CreateAgentModal pasos 2 y 3 + modo edición', () => {
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

  // ── Navegación entre pasos ────────────────────────────────────────────────

  it('muestra paso 1 al abrir; Next avanza a paso 2', async () => {
    const user = userEvent.setup();
    render(<CreateAgentModal isOpen onClose={() => {}} />);

    expect(screen.getByPlaceholderText(/VECTOR_SIGMA/i)).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText(/VECTOR_SIGMA/i), 'NEW_AGENT');
    await user.click(screen.getByRole('button', { name: /next/i }));

    await waitFor(() => {
      expect(screen.getByText(/Claude Model/i)).toBeInTheDocument();
    });
  });

  it('Back en paso 2 vuelve al paso 1', async () => {
    const user = userEvent.setup();
    render(<CreateAgentModal isOpen onClose={() => {}} />);

    await user.type(screen.getByPlaceholderText(/VECTOR_SIGMA/i), 'BACK_AGENT');
    await user.click(screen.getByRole('button', { name: /next/i }));
    await waitFor(() => expect(screen.getByText(/Claude Model/i)).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /back/i }));
    expect(screen.getByPlaceholderText(/VECTOR_SIGMA/i)).toBeInTheDocument();
  });

  it('Next en paso 2 avanza a paso 3', async () => {
    const user = userEvent.setup();
    render(<CreateAgentModal isOpen onClose={() => {}} />);

    await user.type(screen.getByPlaceholderText(/VECTOR_SIGMA/i), 'STEP3_AGENT');
    await user.click(screen.getByRole('button', { name: /next/i }));
    await waitFor(() => expect(screen.getByText(/Claude Model/i)).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /next/i }));
    await waitFor(() => {
      expect(screen.getByText(/Working Directory/i)).toBeInTheDocument();
    });
  });

  // ── Validación paso 1 ─────────────────────────────────────────────────────

  it('Next con nombre vacío muestra error y no avanza', async () => {
    const user = userEvent.setup();
    render(<CreateAgentModal isOpen onClose={() => {}} />);

    await user.click(screen.getByRole('button', { name: /next/i }));

    expect(screen.getByText(/El nombre del agente es requerido/i)).toBeInTheDocument();
    expect(screen.queryByText(/Claude Model/i)).not.toBeInTheDocument();
  });

  it('Next con nombre duplicado muestra error de duplicado', async () => {
    act(() => { makeAgent({ name: 'DUPLICATE' }); });
    const user = userEvent.setup();
    render(<CreateAgentModal isOpen onClose={() => {}} />);

    await user.type(screen.getByPlaceholderText(/VECTOR_SIGMA/i), 'duplicate');
    await user.click(screen.getByRole('button', { name: /next/i }));

    expect(screen.getByText(/Ya existe un agente con ese nombre/i)).toBeInTheDocument();
  });

  // ── Creación completa 3 pasos ─────────────────────────────────────────────

  it('crea agente con todos los campos al completar 3 pasos', async () => {
    const skill = makeSkill('MySkill');
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<CreateAgentModal isOpen onClose={onClose} />);

    // Paso 1
    await user.type(screen.getByPlaceholderText(/VECTOR_SIGMA/i), 'FULL_AGENT');
    await user.type(screen.getByPlaceholderText(/primary operational objective/i), 'Does everything');
    await user.click(screen.getByRole('button', { name: /next/i }));

    // Paso 2
    await waitFor(() => expect(screen.getByText(/Claude Model/i)).toBeInTheDocument());
    // Select Opus model
    await user.click(screen.getByRole('button', { name: /POWERFUL/i }));
    // Select the skill
    await user.click(screen.getByRole('checkbox', { name: new RegExp(skill.name, 'i') }));
    await user.click(screen.getByRole('button', { name: /next/i }));

    // Paso 3
    await waitFor(() => expect(screen.getByText(/Working Directory/i)).toBeInTheDocument());
    await user.type(screen.getByPlaceholderText(/home\/user\/project/i), '/my/cwd');
    await user.click(screen.getByRole('button', { name: /create agent/i }));

    const agents = Object.values(useAgentStore.getState().agents);
    expect(agents).toHaveLength(1);
    const created = agents[0];
    expect(created.name).toBe('FULL_AGENT');
    expect(created.description).toBe('Does everything');
    expect(created.model).toBe('opus');
    expect(created.skills).toContain(skill.id);
    expect(created.cwd).toBe('/my/cwd');
    expect(onClose).toHaveBeenCalled();
  });

  // ── Modo edición pre-carga datos ──────────────────────────────────────────

  it('en modo edición pre-carga todos los campos del agente', async () => {
    let agent: ReturnType<typeof makeAgent>;
    act(() => { agent = makeAgent(); });

    render(<CreateAgentModal isOpen onClose={() => {}} agentId={agent!.id} />);

    // El modal de edición muestra todos los pasos a la vez
    expect((screen.getByPlaceholderText(/VECTOR_SIGMA/i) as HTMLInputElement).value).toBe('EXISTING_AGENT');
    expect((screen.getByPlaceholderText(/primary operational objective/i) as HTMLTextAreaElement).value).toBe('An existing agent');

    // Intellect
    await waitFor(() => {
      expect(screen.getByText(/Inactivity Timeout/i)).toBeInTheDocument();
    });

    // Temperature
    const tempSlider = screen.getByRole('slider');
    expect(Number((tempSlider as HTMLInputElement).value)).toBeCloseTo(0.3);

    // Max tokens
    const maxTokensInput = screen.getByDisplayValue('8192');
    expect(maxTokensInput).toBeInTheDocument();

    // cwd
    expect((screen.getByPlaceholderText(/home\/user\/project/i) as HTMLInputElement).value).toBe('/home/agent');

    // envVars
    expect((screen.getByDisplayValue('MY_KEY')) as HTMLInputElement).toBeInTheDocument();
    expect((screen.getByDisplayValue('my_value')) as HTMLInputElement).toBeInTheDocument();

    // inactivityTimeout
    expect((screen.getByDisplayValue('10')) as HTMLInputElement).toBeInTheDocument();
  });

  it('en modo edición el título es "Edit Agent"', () => {
    let agent: ReturnType<typeof makeAgent>;
    act(() => { agent = makeAgent(); });

    render(<CreateAgentModal isOpen onClose={() => {}} agentId={agent!.id} />);

    expect(screen.getByText('Edit Agent')).toBeInTheDocument();
  });

  // ── Guardar en modo edición ───────────────────────────────────────────────

  it('guardar en modo edición llama updateAgent con los nuevos valores', async () => {
    let agent: ReturnType<typeof makeAgent>;
    act(() => { agent = makeAgent(); });

    const updateAgentSpy = vi.spyOn(useAgentStore.getState(), 'updateAgent');
    const createAgentSpy = vi.spyOn(useAgentStore.getState(), 'createAgent');
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(<CreateAgentModal isOpen onClose={onClose} agentId={agent!.id} />);

    // Cambiar el nombre
    const nameInput = screen.getByPlaceholderText(/VECTOR_SIGMA/i) as HTMLInputElement;
    await user.clear(nameInput);
    await user.type(nameInput, 'UPDATED_AGENT');

    await user.click(screen.getByRole('button', { name: /save changes/i }));

    expect(createAgentSpy).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(updateAgentSpy).toHaveBeenCalledWith(
        agent!.id,
        expect.objectContaining({ name: 'UPDATED_AGENT' })
      );
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('guardar en modo edición NO crea un nuevo agente', async () => {
    let agent: ReturnType<typeof makeAgent>;
    act(() => { agent = makeAgent(); });

    const user = userEvent.setup();
    render(<CreateAgentModal isOpen onClose={() => {}} agentId={agent!.id} />);

    await user.click(screen.getByRole('button', { name: /save changes/i }));

    // Sigue habiendo exactamente 1 agente
    expect(Object.keys(useAgentStore.getState().agents)).toHaveLength(1);
  });

  // ── Cancelar no persiste ──────────────────────────────────────────────────

  it('cerrar el modal sin guardar no crea ningún agente', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<CreateAgentModal isOpen onClose={onClose} />);

    await user.type(screen.getByPlaceholderText(/VECTOR_SIGMA/i), 'CANCELLED_AGENT');
    // Click en el overlay para cerrar
    await user.click(document.querySelector('.bg-black\\/60')!);

    expect(onClose).toHaveBeenCalled();
    expect(Object.keys(useAgentStore.getState().agents)).toHaveLength(0);
  });

  // ── Skills vacíos ──────────────────────────────────────────────────────────

  it('sin skills en el store muestra el empty state en paso 2', async () => {
    const user = userEvent.setup();
    render(<CreateAgentModal isOpen onClose={() => {}} />);

    await user.type(screen.getByPlaceholderText(/VECTOR_SIGMA/i), 'NO_SKILLS_AGENT');
    await user.click(screen.getByRole('button', { name: /next/i }));

    await waitFor(() => {
      expect(screen.getByText(/No hay skills disponibles/i)).toBeInTheDocument();
    });
  });

  it('con skills en el store los muestra como checkboxes en paso 2', async () => {
    const skill = makeSkill('Debugging');
    const user = userEvent.setup();
    render(<CreateAgentModal isOpen onClose={() => {}} />);

    await user.type(screen.getByPlaceholderText(/VECTOR_SIGMA/i), 'WITH_SKILLS_AGENT');
    await user.click(screen.getByRole('button', { name: /next/i }));

    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: new RegExp(skill.name, 'i') })).toBeInTheDocument();
    });
  });

  // ── Browse directory ───────────────────────────────────────────────────────

  it('Browse en paso 3 llama showDirectoryDialog y rellena el input de cwd', async () => {
    const user = userEvent.setup();
    render(<CreateAgentModal isOpen onClose={() => {}} />);

    await user.type(screen.getByPlaceholderText(/VECTOR_SIGMA/i), 'BROWSE_AGENT');
    await user.click(screen.getByRole('button', { name: /next/i }));
    await waitFor(() => expect(screen.getByText(/Claude Model/i)).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /next/i }));
    await waitFor(() => expect(screen.getByText(/Working Directory/i)).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /browse/i }));

    await waitFor(() => {
      expect(mockElectron.showDirectoryDialog).toHaveBeenCalled();
      expect((screen.getByPlaceholderText(/home\/user\/project/i) as HTMLInputElement).value).toBe('/home/user/project');
    });
  });

  // ── Environment variables ─────────────────────────────────────────────────

  it('Add variable añade una fila de key-value en paso 3', async () => {
    const user = userEvent.setup();
    render(<CreateAgentModal isOpen onClose={() => {}} />);

    await user.type(screen.getByPlaceholderText(/VECTOR_SIGMA/i), 'ENV_AGENT');
    await user.click(screen.getByRole('button', { name: /next/i }));
    await waitFor(() => expect(screen.getByText(/Claude Model/i)).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /next/i }));
    await waitFor(() => expect(screen.getByText(/Environment Variables/i)).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /add variable/i }));

    expect(screen.getAllByPlaceholderText('KEY')).toHaveLength(1);
  });

  it('env vars son guardadas en el agente creado', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<CreateAgentModal isOpen onClose={onClose} />);

    // Paso 1
    await user.type(screen.getByPlaceholderText(/VECTOR_SIGMA/i), 'ENV_SAVE_AGENT');
    await user.click(screen.getByRole('button', { name: /next/i }));
    // Paso 2
    await waitFor(() => expect(screen.getByText(/Claude Model/i)).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /next/i }));
    // Paso 3
    await waitFor(() => expect(screen.getByText(/Environment Variables/i)).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /add variable/i }));
    const keyInput = screen.getByPlaceholderText('KEY');
    const valueInput = screen.getByPlaceholderText('value');
    await user.type(keyInput, 'API_TOKEN');
    await user.type(valueInput, 'secret123');

    await user.click(screen.getByRole('button', { name: /create agent/i }));

    const agents = Object.values(useAgentStore.getState().agents);
    expect(agents[0].envVars).toEqual({ API_TOKEN: 'secret123' });
  });
});
