import { Play, Pause, Plus, Trash2, GripVertical } from 'lucide-react';

export function AutomationEditor() {
  return (
    <div className="h-full p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-headline font-bold text-on-surface">Editor de Automatizaciones</h1>
        <p className="text-on-surface-variant text-sm mt-1">
          Crea flujos de trabajo automatizados para tus agentes
        </p>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-6">
        <button className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" />
          Nuevo Flujo
        </button>
        <div className="flex-1" />
        <button className="btn-secondary flex items-center gap-2">
          <Play className="w-4 h-4 text-secondary" />
          Ejecutar
        </button>
      </div>

      {/* Canvas Placeholder */}
      <div className="surface-card h-[calc(100%-120px)] flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 rounded-full bg-surface-container-high mx-auto mb-4 flex items-center justify-center">
            <GripVertical className="w-8 h-8 text-on-surface-variant" />
          </div>
          <p className="text-on-surface-variant">Editor visual de automatizaciones</p>
          <p className="text-on-surface-variant text-sm mt-1">
            Arrastra nodos para crear flujos de trabajo
          </p>
          <p className="text-on-surface-variant text-xs mt-4 opacity-60">
            Próximamente: integración con node-pty y Claude CLI
          </p>
        </div>
      </div>
    </div>
  );
}
