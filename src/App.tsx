import { useEffect } from 'react';
import { Sidebar } from './components/Layout/Sidebar';
import { MainStage } from './components/Layout/MainStage';
import { PanelArea } from './components/Layout/PanelArea';
import { TitleBar } from './components/Layout/TitleBar';
import { ToastNotification } from './components/Shared/ToastNotification';
import { useUIStore } from './stores/uiStore';
import { useTerminalStore } from './stores/terminalStore';
import { useAgentStore } from './stores/agentStore';

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

    return () => {
      removePtyData();
      removeTrabajoTerminado();
      removeClaudeStream();
    };
  }, [pushLogs, setTrabajoTerminado]);

  return (
    <div className="h-screen w-screen flex flex-col bg-background overflow-hidden">
      <TitleBar />
      <div className="flex flex-1 overflow-hidden min-h-0">
        <Sidebar />
        <MainStage />
        {rightPanelOpen && <PanelArea />}
      </div>
      <ToastNotification />
    </div>
  );
}

export default App;
