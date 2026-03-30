import { useState } from 'react';
import { Settings as SettingsIcon, User, Bell, Palette, Keyboard, Info } from 'lucide-react';
import { GlassModal } from '../../Shared/GlassModal';

export function Settings() {
  const [activeSection, setActiveSection] = useState('general');

  const sections = [
    { id: 'general', label: 'General', icon: <SettingsIcon className="w-4 h-4" /> },
    { id: 'profile', label: 'Perfil', icon: <User className="w-4 h-4" /> },
    { id: 'notifications', label: 'Notificaciones', icon: <Bell className="w-4 h-4" /> },
    { id: 'appearance', label: 'Apariencia', icon: <Palette className="w-4 h-4" /> },
    { id: 'shortcuts', label: 'Atajos', icon: <Keyboard className="w-4 h-4" /> },
    { id: 'about', label: 'Acerca de', icon: <Info className="w-4 h-4" /> },
  ];

  return (
    <div className="h-full flex">
      {/* Sidebar */}
      <div className="w-64 bg-surface-container-low border-r border-outline-variant/15 p-4">
        <h2 className="font-headline font-semibold text-on-surface mb-4">Configuración</h2>
        <div className="space-y-1">
          {sections.map((section) => (
            <button
              key={section.id}
              onClick={() => setActiveSection(section.id)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${
                activeSection === section.id
                  ? 'bg-primary-container/20 text-primary'
                  : 'text-on-surface-variant hover:bg-surface-container'
              }`}
            >
              {section.icon}
              <span className="text-sm">{section.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 p-6 overflow-auto">
        <h1 className="text-xl font-headline font-bold text-on-surface mb-6">
          {sections.find((s) => s.id === activeSection)?.label}
        </h1>

        {activeSection === 'general' && (
          <div className="space-y-6">
            <div className="surface-card p-4">
              <h3 className="font-medium text-on-surface mb-4">Ruta de Claude CLI</h3>
              <input
                type="text"
                placeholder="claude"
                className="w-full px-4 py-2 bg-surface-container-low rounded-md text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
              <p className="text-on-surface-variant text-xs mt-2">
                Ruta al ejecutable de Claude CLI
              </p>
            </div>

            <div className="surface-card p-4">
              <h3 className="font-medium text-on-surface mb-4">Directorio de Trabajo</h3>
              <input
                type="text"
                placeholder="C:\Users\..."
                className="w-full px-4 py-2 bg-surface-container-low rounded-md text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
              <p className="text-on-surface-variant text-xs mt-2">
                Directorio predeterminado para nuevas sesiones
              </p>
            </div>

            <div className="surface-card p-4">
              <h3 className="font-medium text-on-surface mb-4">API MiniMax</h3>
              <input
                type="password"
                placeholder="API Key"
                className="w-full px-4 py-2 bg-surface-container-low rounded-md text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
              <p className="text-on-surface-variant text-xs mt-2">
                Tu API key de MiniMax (ya configurada según indicaste)
              </p>
            </div>
          </div>
        )}

        {activeSection === 'notifications' && (
          <div className="space-y-4">
            <div className="surface-card p-4 flex items-center justify-between">
              <div>
                <h3 className="font-medium text-on-surface">Notificaciones de escritorio</h3>
                <p className="text-on-surface-variant text-sm">Mostrar notificaciones del sistema</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" defaultChecked />
                <div className="w-11 h-6 bg-surface-container-high rounded-full peer peer-checked:bg-primary peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-on-surface after:rounded-full after:h-5 after:w-5 after:transition-all" />
              </label>
            </div>

            <div className="surface-card p-4 flex items-center justify-between">
              <div>
                <h3 className="font-medium text-on-surface">Sonido de notificaciones</h3>
                <p className="text-on-surface-variant text-sm">Reproducir sonido al completar tareas</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" defaultChecked />
                <div className="w-11 h-6 bg-surface-container-high rounded-full peer peer-checked:bg-primary peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-on-surface after:rounded-full after:h-5 after:w-5 after:transition-all" />
              </label>
            </div>
          </div>
        )}

        {activeSection === 'about' && (
          <div className="space-y-6">
            <div className="surface-card p-6 text-center">
              <h2 className="text-2xl font-headline font-bold text-on-surface">CodeOrchester</h2>
              <p className="text-on-surface-variant mt-2">Versión 1.0.0</p>
              <p className="text-on-surface-variant text-sm mt-4 max-w-md mx-auto">
                Desktop app para orquestar agentes IA usando Claude CLI interactiva con API MiniMax.
                Diseñado con el sistema "The Neural Command".
              </p>
            </div>

            <div className="surface-card p-4">
              <h3 className="font-medium text-on-surface mb-3">Enlaces</h3>
              <div className="space-y-2">
                <a
                  href="https://github.com/rflvz/CodeOrchester"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-primary hover:underline"
                >
                  GitHub Repository
                </a>
                <a
                  href="https://linear.app/clasificadoria/project/codeorchester-41e4bbc47c45"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-primary hover:underline"
                >
                  Linear Project
                </a>
              </div>
            </div>
          </div>
        )}

        {activeSection !== 'general' && activeSection !== 'notifications' && activeSection !== 'about' && (
          <div className="surface-card p-8 text-center">
            <p className="text-on-surface-variant">
              Sección "{sections.find((s) => s.id === activeSection)?.label}" en desarrollo
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
