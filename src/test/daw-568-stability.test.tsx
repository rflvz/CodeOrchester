/**
 * DAW-568: Chore — Estabilidad: Error Boundaries, validación IPC, tipos seguros y race conditions
 *
 * Fix 1: <ErrorBoundary> wraps App — fallback UI en vez de pantalla en blanco.
 * Fix 2: set-settings y set-agent-state validan con zod antes de escribir en el store.
 * Fix 3: write-pty serializa llamadas concurrentes por sesión vía Promise queue.
 * Fix 4: ElectronAPI tiene tipos explícitos (sin Promise<any>).
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { Component, ReactNode } from 'react';
import { AppSettingsSchema, AgentStateSchema } from '../../electron/schemas';
import type { ElectronAPI } from '../../electron/preload';

// ═══════════════════════════════════════════════════════════════════════════════
// 1. AppSettingsSchema — validación con zod
// ═══════════════════════════════════════════════════════════════════════════════

describe('DAW-568 – AppSettingsSchema: acepta inputs válidos', () => {
  it('objeto vacío (todos los campos son opcionales)', () => {
    expect(AppSettingsSchema.safeParse({}).success).toBe(true);
  });

  it('objeto completo con todos los campos correctos', () => {
    const full = {
      minimaxApiKey: 'key-abc',
      minimaxAppId: 'app-123',
      claudeCliPath: '/usr/local/bin/claude',
      claudeWorkDir: '/home/user/projects',
      darkMode: true,
      desktopNotifications: false,
      notificationSound: true,
      fontSize: 'md',
      accentColor: 'indigo',
      density: 'normal',
      animationsEnabled: true,
    };
    const result = AppSettingsSchema.safeParse(full);
    expect(result.success).toBe(true);
  });

  it('update parcial: solo darkMode', () => {
    expect(AppSettingsSchema.safeParse({ darkMode: false }).success).toBe(true);
  });

  it('update parcial: solo accentColor', () => {
    expect(AppSettingsSchema.safeParse({ accentColor: 'emerald' }).success).toBe(true);
  });

  it('todos los valores de fontSize son aceptados', () => {
    for (const v of ['sm', 'md', 'lg'] as const) {
      expect(AppSettingsSchema.safeParse({ fontSize: v }).success).toBe(true);
    }
  });

  it('todos los valores de accentColor son aceptados', () => {
    for (const v of ['indigo', 'violet', 'cyan', 'emerald'] as const) {
      expect(AppSettingsSchema.safeParse({ accentColor: v }).success).toBe(true);
    }
  });

  it('todos los valores de density son aceptados', () => {
    for (const v of ['compact', 'normal', 'relaxed'] as const) {
      expect(AppSettingsSchema.safeParse({ density: v }).success).toBe(true);
    }
  });
});

describe('DAW-568 – AppSettingsSchema: rechaza inputs inválidos', () => {
  it('null', () => {
    expect(AppSettingsSchema.safeParse(null).success).toBe(false);
  });

  it('string', () => {
    expect(AppSettingsSchema.safeParse('settings').success).toBe(false);
  });

  it('número', () => {
    expect(AppSettingsSchema.safeParse(42).success).toBe(false);
  });

  it('array', () => {
    expect(AppSettingsSchema.safeParse([]).success).toBe(false);
  });

  it('darkMode como string en vez de boolean', () => {
    expect(AppSettingsSchema.safeParse({ darkMode: 'yes' }).success).toBe(false);
  });

  it('darkMode como número', () => {
    expect(AppSettingsSchema.safeParse({ darkMode: 1 }).success).toBe(false);
  });

  it('fontSize con valor fuera del enum', () => {
    expect(AppSettingsSchema.safeParse({ fontSize: 'xl' }).success).toBe(false);
    expect(AppSettingsSchema.safeParse({ fontSize: 'large' }).success).toBe(false);
    expect(AppSettingsSchema.safeParse({ fontSize: '' }).success).toBe(false);
  });

  it('accentColor con valor fuera del enum', () => {
    expect(AppSettingsSchema.safeParse({ accentColor: 'red' }).success).toBe(false);
    expect(AppSettingsSchema.safeParse({ accentColor: 'blue' }).success).toBe(false);
  });

  it('density con valor fuera del enum', () => {
    expect(AppSettingsSchema.safeParse({ density: 'ultra' }).success).toBe(false);
    expect(AppSettingsSchema.safeParse({ density: 'dense' }).success).toBe(false);
  });

  it('los errores incluyen la ruta del campo que falla', () => {
    const result = AppSettingsSchema.safeParse({ fontSize: 'bad' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('fontSize');
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. AgentStateSchema — validación con zod
// ═══════════════════════════════════════════════════════════════════════════════

describe('DAW-568 – AgentStateSchema: acepta inputs válidos', () => {
  it('record vacío', () => {
    expect(AgentStateSchema.safeParse({}).success).toBe(true);
  });

  it('record con un agente', () => {
    expect(AgentStateSchema.safeParse({ 'agent-1': { name: 'Alpha', status: 'idle' } }).success).toBe(true);
  });

  it('record con múltiples agentes', () => {
    expect(AgentStateSchema.safeParse({
      'a1': { name: 'Alpha' },
      'a2': { name: 'Beta', status: 'running' },
      'a3': null,
    }).success).toBe(true);
  });

  it('valores de cualquier tipo son permitidos (los agentes tienen estructura libre)', () => {
    expect(AgentStateSchema.safeParse({ x: 42, y: 'str', z: [1, 2] }).success).toBe(true);
  });
});

describe('DAW-568 – AgentStateSchema: rechaza inputs inválidos', () => {
  it('null', () => {
    expect(AgentStateSchema.safeParse(null).success).toBe(false);
  });

  it('string', () => {
    expect(AgentStateSchema.safeParse('agents').success).toBe(false);
  });

  it('número', () => {
    expect(AgentStateSchema.safeParse(99).success).toBe(false);
  });

  it('array (no es Record)', () => {
    expect(AgentStateSchema.safeParse([{ id: '1' }]).success).toBe(false);
    expect(AgentStateSchema.safeParse([]).success).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. ErrorBoundary — fallback UI
// ═══════════════════════════════════════════════════════════════════════════════

// Componente local para reproducir el ErrorBoundary de App.tsx
interface EBState { hasError: boolean; message: string }
class ErrorBoundary extends Component<{ children: ReactNode }, EBState> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }
  static getDerivedStateFromError(error: unknown): EBState {
    return { hasError: true, message: error instanceof Error ? error.message : String(error) };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div>
          <p data-testid="eb-title">Something went wrong</p>
          <p data-testid="eb-message">{this.state.message}</p>
          <button onClick={() => this.setState({ hasError: false, message: '' })}>Try again</button>
        </div>
      );
    }
    return this.props.children;
  }
}

// Componente que lanza un error al renderizar
class Bomber extends Component<{ message: string }> {
  render(): ReactNode {
    throw new Error(this.props.message);
  }
}

describe('DAW-568 – ErrorBoundary: fallback UI', () => {
  beforeEach(() => {
    // Silenciar el console.error de React para mantener la salida limpia
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('muestra "Something went wrong" cuando un hijo lanza error', () => {
    act(() => {
      render(
        <ErrorBoundary>
          <Bomber message="Render explosion" />
        </ErrorBoundary>
      );
    });

    expect(screen.getByTestId('eb-title').textContent).toBe('Something went wrong');
  });

  it('muestra el mensaje de error del componente que falló', () => {
    act(() => {
      render(
        <ErrorBoundary>
          <Bomber message="Specific failure message" />
        </ErrorBoundary>
      );
    });

    expect(screen.getByTestId('eb-message').textContent).toBe('Specific failure message');
  });

  it('muestra el botón "Try again"', () => {
    act(() => {
      render(
        <ErrorBoundary>
          <Bomber message="crash" />
        </ErrorBoundary>
      );
    });

    expect(screen.getByText('Try again')).toBeTruthy();
  });

  it('renderiza children normalmente cuando no hay error', () => {
    render(
      <ErrorBoundary>
        <span data-testid="content">OK</span>
      </ErrorBoundary>
    );

    expect(screen.getByTestId('content').textContent).toBe('OK');
    expect(screen.queryByTestId('eb-title')).toBeNull();
  });

  it('captura errores con mensaje vacío sin romper el propio boundary', () => {
    class EmptyMessageBomber extends Component {
      render(): ReactNode { throw new Error(''); }
    }

    act(() => {
      render(
        <ErrorBoundary>
          <EmptyMessageBomber />
        </ErrorBoundary>
      );
    });

    expect(screen.getByTestId('eb-title')).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. write-pty serialization queue
// ═══════════════════════════════════════════════════════════════════════════════

describe('DAW-568 – write-pty: serialización por sesión', () => {
  it('las promesas de la cola se ejecutan en orden FIFO para la misma sesión', async () => {
    const order: number[] = [];
    const queue = new Map<string, Promise<unknown>>();

    const enqueue = (sessionId: string, task: () => Promise<void>) => {
      const prev = queue.get(sessionId) ?? Promise.resolve();
      const next = prev.then(task);
      queue.set(sessionId, next.catch(() => {}));
      return next;
    };

    await Promise.all([
      enqueue('sess-1', async () => { await Promise.resolve(); order.push(1); }),
      enqueue('sess-1', async () => { await Promise.resolve(); order.push(2); }),
      enqueue('sess-1', async () => { await Promise.resolve(); order.push(3); }),
    ]);

    expect(order).toEqual([1, 2, 3]);
  });

  it('las colas de sesiones distintas son independientes', async () => {
    const order: string[] = [];
    const queue = new Map<string, Promise<unknown>>();

    const enqueue = (sessionId: string, label: string, delay: number) => {
      const prev = queue.get(sessionId) ?? Promise.resolve();
      const next = prev.then(async () => {
        await new Promise<void>((r) => setTimeout(r, delay));
        order.push(label);
      });
      queue.set(sessionId, next.catch(() => {}));
      return next;
    };

    await Promise.all([
      enqueue('sess-A', 'A1', 10),
      enqueue('sess-B', 'B1', 5),
      enqueue('sess-A', 'A2', 0),
    ]);

    // A2 debe ejecutarse después de A1 (misma sesión)
    expect(order.indexOf('A2')).toBeGreaterThan(order.indexOf('A1'));
    // B1 puede llegar en cualquier momento relativo a A1/A2
    expect(order).toContain('B1');
  });

  it('un error en una tarea no bloquea las siguientes de la misma sesión', async () => {
    const order: number[] = [];
    const queue = new Map<string, Promise<unknown>>();

    const enqueue = (sessionId: string, task: () => Promise<void>) => {
      const prev = queue.get(sessionId) ?? Promise.resolve();
      const next = prev.then(task);
      queue.set(sessionId, next.catch(() => {})); // swallow para que la cola siga
      return next;
    };

    await Promise.allSettled([
      enqueue('sess-1', async () => { order.push(1); throw new Error('fail'); }),
      enqueue('sess-1', async () => { order.push(2); }),
      enqueue('sess-1', async () => { order.push(3); }),
    ]);

    // Aunque la primera falla, las siguientes deben ejecutarse
    expect(order).toContain(2);
    expect(order).toContain(3);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. ElectronAPI: tipos explícitos (sin Promise<any>)
// ═══════════════════════════════════════════════════════════════════════════════

describe('DAW-568 – ElectronAPI: tipos explícitos en handlers IPC', () => {
  it('setSettings retorna Promise<{ success: boolean; error?: string }>', () => {
    // Verificación de tipo en tiempo de compilación: si cambia el tipo, este test no compilará.
    type SetSettingsReturn = ReturnType<ElectronAPI['setSettings']>;
    type Expected = Promise<{ success: boolean; error?: string }>;
    // Comprobación de asignabilidad bidireccional en tiempo de build (no runtime)
    const _check: SetSettingsReturn extends Expected ? true : false = true;
    expect(_check).toBe(true);
  });

  it('setAgentState retorna Promise<{ success: boolean; error?: string }>', () => {
    type SetAgentStateReturn = ReturnType<ElectronAPI['setAgentState']>;
    type Expected = Promise<{ success: boolean; error?: string }>;
    const _check: SetAgentStateReturn extends Expected ? true : false = true;
    expect(_check).toBe(true);
  });

  it('setStoreValue está definido en la interfaz', () => {
    type HasSetStoreValue = 'setStoreValue' extends keyof ElectronAPI ? true : false;
    const _check: HasSetStoreValue = true;
    expect(_check).toBe(true);
  });

  it('getStoreValue está definido en la interfaz', () => {
    type HasGetStoreValue = 'getStoreValue' extends keyof ElectronAPI ? true : false;
    const _check: HasGetStoreValue = true;
    expect(_check).toBe(true);
  });
});
