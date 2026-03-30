import { X, Terminal, Info } from 'lucide-react';
import { useUIStore } from '../../stores/uiStore';

interface PanelAreaProps {
  children?: React.ReactNode;
}

export function PanelArea({ children }: PanelAreaProps) {
  const { rightPanelOpen, rightPanelContent, setRightPanel } = useUIStore();

  if (!rightPanelOpen) return null;

  return (
    <aside className="w-80 bg-surface-container-low h-full flex flex-col border-l border-outline-variant/15">
      {/* Header */}
      <div className="h-12 flex items-center justify-between px-4 border-b border-outline-variant/15">
        <div className="flex items-center gap-2">
          {rightPanelContent === 'terminal' ? (
            <Terminal className="w-4 h-4 text-on-surface-variant" />
          ) : (
            <Info className="w-4 h-4 text-on-surface-variant" />
          )}
          <span className="font-medium text-sm text-on-surface">
            {rightPanelContent === 'terminal' ? 'Terminal' : 'Detalles'}
          </span>
        </div>
        <button
          onClick={() => setRightPanel(false)}
          className="p-1 rounded hover:bg-surface-container-high transition-colors"
        >
          <X className="w-4 h-4 text-on-surface-variant" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {children}
      </div>
    </aside>
  );
}
