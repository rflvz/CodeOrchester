import { Sidebar } from './components/Layout/Sidebar';
import { MainStage } from './components/Layout/MainStage';
import { PanelArea } from './components/Layout/PanelArea';
import { TitleBar } from './components/Layout/TitleBar';
import { ToastNotification } from './components/Shared/ToastNotification';
import { useUIStore } from './stores/uiStore';

function App() {
  const { rightPanelOpen } = useUIStore();

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
