import { Sidebar } from './components/Layout/Sidebar';
import { MainStage } from './components/Layout/MainStage';
import { PanelArea } from './components/Layout/PanelArea';
import { ToastNotification } from './components/Shared/ToastNotification';
import { useUIStore } from './stores/uiStore';

function App() {
  const { rightPanelOpen } = useUIStore();

  return (
    <div className="h-screen w-screen flex bg-background overflow-hidden">
      <Sidebar />
      <MainStage />
      {rightPanelOpen && <PanelArea />}
      <ToastNotification />
    </div>
  );
}

export default App;
