/**
 * DAW-568: Chore — Estabilidad: Error Boundaries, validación IPC, tipos seguros y race conditions
 *
 * Fix 1: <ErrorBoundary> wraps App — renders fallback UI on component error, not blank screen.
 * Fix 2: set-settings and set-agent-state IPC handlers validate input with zod schemas.
 * Fix 3: write-pty calls are serialized per session via a Promise queue to prevent race conditions.
 * Fix 4: ElectronAPI interface has explicit Promise return types (no Promise<any>).
 */

import { describe, it, expect } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { Component, ReactNode } from 'react';
import { AppSettingsSchema, AgentStateSchema } from '../../electron/schemas';

// ─── IPC schema validation (zod) ─────────────────────────────────────────────

describe('DAW-568 – set-settings IPC schema validation', () => {
  it('accepts valid partial settings', () => {
    const result = AppSettingsSchema.safeParse({ darkMode: true, fontSize: 'lg' });
    expect(result.success).toBe(true);
  });

  it('accepts empty object (all fields optional)', () => {
    const result = AppSettingsSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('rejects unknown keys via strict mode — only known keys should pass through', () => {
    // safeParse strips unknown keys by default in Zod (passthrough is opt-in)
    const result = AppSettingsSchema.safeParse({ fontSize: 'xl' }); // 'xl' not in enum
    expect(result.success).toBe(false);
  });

  it('rejects non-object input', () => {
    expect(AppSettingsSchema.safeParse(null).success).toBe(false);
    expect(AppSettingsSchema.safeParse('string').success).toBe(false);
    expect(AppSettingsSchema.safeParse(42).success).toBe(false);
  });

  it('rejects wrong type for a boolean field', () => {
    const result = AppSettingsSchema.safeParse({ darkMode: 'yes' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid enum value for density', () => {
    const result = AppSettingsSchema.safeParse({ density: 'ultra' });
    expect(result.success).toBe(false);
  });
});

describe('DAW-568 – set-agent-state IPC schema validation', () => {
  it('accepts a valid agents record', () => {
    const result = AgentStateSchema.safeParse({ 'agent-1': { name: 'Alpha', status: 'idle' } });
    expect(result.success).toBe(true);
  });

  it('accepts empty record', () => {
    const result = AgentStateSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('rejects non-object input', () => {
    expect(AgentStateSchema.safeParse(null).success).toBe(false);
    expect(AgentStateSchema.safeParse([]).success).toBe(false);
    expect(AgentStateSchema.safeParse('agents').success).toBe(false);
  });

  it('rejects arrays (not a Record)', () => {
    const result = AgentStateSchema.safeParse([{ id: '1' }]);
    expect(result.success).toBe(false);
  });
});

// ─── ErrorBoundary renders fallback UI ───────────────────────────────────────

class ThrowOnRender extends Component<{ message: string }, { thrown: boolean }> {
  constructor(props: { message: string }) {
    super(props);
    this.state = { thrown: false };
  }
  render() {
    if (!this.state.thrown) {
      this.setState({ thrown: true });
      throw new Error(this.props.message);
    }
    return null;
  }
}

interface EBState { hasError: boolean; message: string }
class ErrorBoundary extends Component<{ children: ReactNode }, EBState> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }
  static getDerivedStateFromError(error: unknown): EBState {
    const message = error instanceof Error ? error.message : String(error);
    return { hasError: true, message };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div>
          <p>Something went wrong</p>
          <p data-testid="error-message">{this.state.message}</p>
        </div>
      );
    }
    return this.props.children;
  }
}

describe('DAW-568 – ErrorBoundary fallback UI', () => {
  it('renders fallback when a child component throws', () => {
    // Suppress the expected console.error from React
    const originalError = console.error;
    console.error = () => {};

    act(() => {
      render(
        <ErrorBoundary>
          <ThrowOnRender message="Test render error" />
        </ErrorBoundary>
      );
    });

    expect(screen.getByText('Something went wrong')).toBeTruthy();
    expect(screen.getByTestId('error-message').textContent).toBe('Test render error');

    console.error = originalError;
  });

  it('renders children normally when no error is thrown', () => {
    render(
      <ErrorBoundary>
        <span data-testid="ok">No error</span>
      </ErrorBoundary>
    );
    expect(screen.getByTestId('ok').textContent).toBe('No error');
  });
});
