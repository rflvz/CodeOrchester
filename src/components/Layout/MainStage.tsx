import { useUIStore } from '../../stores/uiStore';
import { Dashboard } from '../Screens/Dashboard/Dashboard';
import { Topology } from '../Screens/Topology/Topology';
import { OrchestrationChat } from '../Screens/Chat/OrchestrationChat';
import { AgentChat } from '../Screens/Chat/AgentChat';
import { AgentDashboard } from '../Screens/Agents/AgentDashboard';
import { SkillsLibrary } from '../Screens/Skills/SkillsLibrary';
import { SkillConfig } from '../Screens/Skills/SkillConfig';
import { AutomationEditor } from '../Screens/Automations/AutomationEditor';
import { CodeMonitor } from '../Screens/CodeMonitor/CodeMonitor';
import { Settings } from '../Screens/Settings/Settings';

export function MainStage() {
  const { currentScreen } = useUIStore();

  const renderScreen = () => {
    switch (currentScreen) {
      case 'dashboard':
        return <Dashboard />;
      case 'topology':
        return <Topology />;
      case 'chat':
        return <AgentChat />;
      case 'orchestration':
        return <OrchestrationChat />;
      case 'agents':
        return <AgentDashboard />;
      case 'skills':
        return <SkillsLibrary />;
      case 'skillconfig':
        return <SkillConfig onBack={() => useUIStore.getState().setScreen('skills')} />;
      case 'automations':
        return <AutomationEditor />;
      case 'codemonitor':
        return <CodeMonitor />;
      case 'settings':
        return <Settings />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <main className="flex-1 bg-background h-full overflow-auto">
      {renderScreen()}
    </main>
  );
}
