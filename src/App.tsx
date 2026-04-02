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

    el.onPtyData(({ sessionId, data }) => {
      pushLogs(sessionId, data);
    });

    el.onTrabajoTerminado(({ sessionId, value }) => {
      const { agentSessionMap } = useTerminalStore.getState();
      const agentId = agentSessionMap[sessionId] ?? sessionId;
      setTrabajoTerminado(agentId, value);
    });
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
