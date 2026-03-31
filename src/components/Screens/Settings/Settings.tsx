import { useState } from 'react';
import { Settings as SettingsIcon, Bell, Palette, Info, Key, Shield, Terminal } from 'lucide-react';
export function Settings() {
  const [activeSection, setActiveSection] = useState('minimax');
  const [darkMode, setDarkMode] = useState(true);
  const [desktopNotifications, setDesktopNotifications] = useState(true);
  const [notificationSound, setNotificationSound] = useState(true);
  const [minimaxApiKey, setMinimaxApiKey] = useState('');
  const [minimaxAppId, setMinimaxAppId] = useState('');
  const [claudeCliPath, setClaudeCliPath] = useState('claude');
  const [claudeWorkDir, setClaudeWorkDir] = useState('');
  const [fontSize, setFontSize] = useState<'sm' | 'md' | 'lg'>('md');
  const [accentColor, setAccentColor] = useState<'indigo' | 'violet' | 'cyan' | 'emerald'>('indigo');
  const [density, setDensity] = useState<'compact' | 'normal' | 'relaxed'>('normal');
  const [animationsEnabled, setAnimationsEnabled] = useState(true);

  const sections = [
    { id: 'minimax', label: 'API MiniMax', icon: <Key className="w-4 h-4" /> },
    { id: 'claude', label: 'Claude CLI', icon: <Terminal className="w-4 h-4" /> },
    { id: 'general', label: 'General', icon: <SettingsIcon className="w-4 h-4" /> },
    { id: 'notifications', label: 'Notificaciones', icon: <Bell className="w-4 h-4" /> },
    { id: 'appearance', label: 'Apariencia', icon: <Palette className="w-4 h-4" /> },
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

        {activeSection === 'minimax' && (
          <div className="space-y-6">
            <div className="bg-surface-container p-6 rounded-md border border-outline-variant/15">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-primary-container/20 rounded">
                  <Key className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-headline font-semibold text-on-surface">Configuración API MiniMax</h3>
                  <p className="text-on-surface-variant text-sm">Gestiona tu API key para integración con MiniMax</p>
                </div>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-on-surface mb-2">API Key</label>
                  <input
                    type="password"
                    value={minimaxApiKey}
                    onChange={(e) => setMinimaxApiKey(e.target.value)}
                    placeholder="Ingresa tu API key de MiniMax"
                    className="w-full px-4 py-2 bg-surface-container-low rounded-md text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:ring-2 focus:ring-primary/50 font-mono"
                  />
                  <p className="text-on-surface-variant text-xs mt-2">
                    Tu API key se almacena de forma segura en el sistema
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-on-surface mb-2">Grupo de App ID</label>
                  <input
                    type="text"
                    value={minimaxAppId}
                    onChange={(e) => setMinimaxAppId(e.target.value)}
                    placeholder="1234567890"
                    className="w-full px-4 py-2 bg-surface-container-low rounded-md text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:ring-2 focus:ring-primary/50 font-mono"
                  />
                </div>
                <div className="flex items-center justify-between p-4 bg-surface-container-low rounded">
                  <div className="flex items-center gap-3">
                    <Shield className="w-4 h-4 text-secondary" />
                    <span className="text-sm text-on-surface">API Validada</span>
                  </div>
                  <span className="px-2 py-1 bg-secondary/20 text-secondary text-xs rounded">Conectado</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeSection === 'claude' && (
          <div className="space-y-6">
            <div className="bg-surface-container p-6 rounded-md border border-outline-variant/15">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-primary-container/20 rounded">
                  <Terminal className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-headline font-semibold text-on-surface">Configuración Claude CLI</h3>
                  <p className="text-on-surface-variant text-sm">Ruta y parámetros del ejecutable</p>
                </div>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-on-surface mb-2">Ruta de Claude CLI</label>
                  <input
                    type="text"
                    value={claudeCliPath}
                    onChange={(e) => setClaudeCliPath(e.target.value)}
                    placeholder="claude"
                    className="w-full px-4 py-2 bg-surface-container-low rounded-md text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:ring-2 focus:ring-primary/50 font-mono"
                  />
                  <p className="text-on-surface-variant text-xs mt-2">
                    Ruta al ejecutable de Claude CLI
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-on-surface mb-2">Directorio de Trabajo</label>
                  <input
                    type="text"
                    value={claudeWorkDir}
                    onChange={(e) => setClaudeWorkDir(e.target.value)}
                    placeholder="C:\Users\..."
                    className="w-full px-4 py-2 bg-surface-container-low rounded-md text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:ring-2 focus:ring-primary/50 font-mono"
                  />
                  <p className="text-on-surface-variant text-xs mt-2">
                    Directorio predeterminado para nuevas sesiones
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeSection === 'general' && (
          <div className="space-y-6">
            <div className="bg-surface-container p-6 rounded-md border border-outline-variant/15">
              <h3 className="font-headline font-semibold text-on-surface mb-4">General</h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-surface-container-low rounded">
                  <div>
                    <p className="text-on-surface font-medium">Tema oscuro</p>
                    <p className="text-on-surface-variant text-sm">Usar tema oscuro para la interfaz</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={darkMode}
                      onChange={(e) => setDarkMode(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-surface-container-high rounded-full peer peer-checked:bg-primary peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-on-surface after:rounded-full after:h-5 after:w-5 after:transition-all" />
                  </label>
                </div>
              </div>
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
                <input
                  type="checkbox"
                  checked={desktopNotifications}
                  onChange={(e) => setDesktopNotifications(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-surface-container-high rounded-full peer peer-checked:bg-primary peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-on-surface after:rounded-full after:h-5 after:w-5 after:transition-all" />
              </label>
            </div>

            <div className="surface-card p-4 flex items-center justify-between">
              <div>
                <h3 className="font-medium text-on-surface">Sonido de notificaciones</h3>
                <p className="text-on-surface-variant text-sm">Reproducir sonido al completar tareas</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={notificationSound}
                  onChange={(e) => setNotificationSound(e.target.checked)}
                  className="sr-only peer"
                />
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

        {activeSection === 'appearance' && (
          <div className="space-y-6">
            <div className="bg-surface-container p-6 rounded-md border border-outline-variant/15">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-primary-container/20 rounded">
                  <Palette className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-headline font-semibold text-on-surface">Tamaño de fuente</h3>
                  <p className="text-on-surface-variant text-sm">Ajusta el tamaño del texto en la interfaz</p>
                </div>
              </div>
              <div className="flex gap-3">
                {(['sm', 'md', 'lg'] as const).map((size) => (
                  <button
                    key={size}
                    onClick={() => setFontSize(size)}
                    className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors border ${
                      fontSize === size
                        ? 'bg-primary-container/20 text-primary border-primary/30'
                        : 'text-on-surface-variant border-outline-variant/30 hover:bg-surface-container-high'
                    }`}
                  >
                    {size === 'sm' ? 'Pequeño' : size === 'md' ? 'Mediano' : 'Grande'}
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-surface-container p-6 rounded-md border border-outline-variant/15">
              <h3 className="font-headline font-semibold text-on-surface mb-4">Color de acento</h3>
              <div className="flex gap-6">
                {([
                  { id: 'indigo' as const, label: 'Índigo', bg: 'bg-indigo-500' },
                  { id: 'violet' as const, label: 'Violeta', bg: 'bg-violet-500' },
                  { id: 'cyan' as const, label: 'Cian', bg: 'bg-cyan-500' },
                  { id: 'emerald' as const, label: 'Esmeralda', bg: 'bg-emerald-500' },
                ]).map((color) => (
                  <button
                    key={color.id}
                    onClick={() => setAccentColor(color.id)}
                    className="flex flex-col items-center gap-2"
                    title={color.label}
                  >
                    <div className={`w-10 h-10 rounded-full ${color.bg} transition-all ${
                      accentColor === color.id ? 'ring-2 ring-offset-2 ring-offset-surface ring-white scale-110' : 'opacity-60 hover:opacity-90'
                    }`} />
                    <span className="text-xs text-on-surface-variant">{color.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-surface-container p-6 rounded-md border border-outline-variant/15">
              <h3 className="font-headline font-semibold text-on-surface mb-4">Densidad de interfaz</h3>
              <div className="flex gap-3">
                {(['compact', 'normal', 'relaxed'] as const).map((d) => (
                  <button
                    key={d}
                    onClick={() => setDensity(d)}
                    className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors border ${
                      density === d
                        ? 'bg-primary-container/20 text-primary border-primary/30'
                        : 'text-on-surface-variant border-outline-variant/30 hover:bg-surface-container-high'
                    }`}
                  >
                    {d === 'compact' ? 'Compacto' : d === 'normal' ? 'Normal' : 'Relajado'}
                  </button>
                ))}
              </div>
            </div>

            <div className="surface-card p-4 flex items-center justify-between">
              <div>
                <h3 className="font-medium text-on-surface">Animaciones</h3>
                <p className="text-on-surface-variant text-sm">Activar transiciones y animaciones de interfaz</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={animationsEnabled}
                  onChange={(e) => setAnimationsEnabled(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-surface-container-high rounded-full peer peer-checked:bg-primary peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-on-surface after:rounded-full after:h-5 after:w-5 after:transition-all" />
              </label>
            </div>
          </div>
        )}

        {activeSection !== 'general' && activeSection !== 'notifications' && activeSection !== 'about' && activeSection !== 'minimax' && activeSection !== 'claude' && activeSection !== 'appearance' && (
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
