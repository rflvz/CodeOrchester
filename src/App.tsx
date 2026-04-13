import { useEffect, Component, ReactNode } from 'react';
import { Sidebar } from './components/Layout/Sidebar';
import { MainStage } from './components/Layout/MainStage';
import { PanelArea } from './components/Layout/PanelArea';
import { TitleBar } from './components/Layout/TitleBar';
import { ToastNotification } from './components/Shared/ToastNotification';
import { useUIStore } from './stores/uiStore';
import { useTerminalStore } from './stores/terminalStore';
import { useAgentStore } from './stores/agentStore';

interface ErrorBoundaryState { hasError: boolean; message: string }

class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }
  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    const message = error instanceof Error ? error.message : String(error);
    return { hasError: true, message };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen w-screen flex flex-col items-center justify-center bg-background text-foreground gap-4">
          <p className="text-lg font-semibold text-red-400">Something went wrong</p>
          <p className="text-sm text-muted font-mono max-w-lg text-center">{this.state.message}</p>
          <button
            className="px-4 py-2 rounded bg-surface border border-border text-sm hover:bg-surface/80"
            onClick={() => this.setState({ hasError: false, message: '' })}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function App() {
  const { rightPanelOpen } = useUIStore();
  const { pushLogs } = useTerminalStore();
  const { setTrabajoTerminado } = useAgentStore();

  useEffect(() => {
    const el = window.electron;
    if (!el) return;

    const removePtyData = el.onPtyData(({ sessionId, data }) => {
      pushLogs(sessionId, data);
    });

    const removeTrabajoTerminado = el.onTrabajoTerminado(({ sessionId, value }) => {
      const { agentSessionMap } = useTerminalStore.getState();
      const agentId = agentSessionMap[sessionId] ?? sessionId;
      setTrabajoTerminado(agentId, value);
    });

    // Register claude-stream channel (raw JSON events from claude -p --output-format stream-json)
    const removeClaudeStream = el.onClaudeStream(() => {
      // Raw JSON events are parsed in main.ts; clean text sent via pty-data.
      // This listener exists to prevent orphaned listeners on the channel.
    });

    // Register pty-error channel — propagate Claude CLI errors to the store
    const removePtyError = el.onPtyError(({ sessionId, message }) => {
      useTerminalStore.getState().pushError(sessionId, message);
    });

    // Clean up agentSessionMap entries when a PTY session dies to prevent stale IDs.
    const removePtyExit = el.onPtyExit(({ sessionId }) => {
      const { agentSessionMap } = useTerminalStore.getState();
      const agentId = Object.keys(agentSessionMap).find(
        (aid) => agentSessionMap[aid] === sessionId
      );
      if (agentId) {
        useTerminalStore.getState().unregisterAgentSession(agentId);
      }
    });

    return () => {
      removePtyData();
      removeTrabajoTerminado();
      removeClaudeStream();
      removePtyError();
      removePtyExit();
    };
  }, [pushLogs, setTrabajoTerminado]);

  return (
    <ErrorBoundary>
      <div className="h-screen w-screen flex flex-col bg-background overflow-hidden">
        <TitleBar />
        <div className="flex flex-1 overflow-hidden min-h-0">
          <Sidebar />
          <MainStage />
          {rightPanelOpen && <PanelArea />}
        </div>
        <ToastNotification />
      </div>
    </ErrorBoundary>
  );
}

export default App;
