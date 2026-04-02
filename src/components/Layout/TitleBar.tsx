import { useEffect, useState } from 'react';

const isElectron = typeof window !== 'undefined' && Boolean((window as any).electron);

export function TitleBar() {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    if (!isElectron) return;
    const electron = (window as any).electron;

    electron.windowIsMaximized().then(setIsMaximized);
    const removeWindowMaximized = electron.onWindowMaximized(setIsMaximized);
    return () => removeWindowMaximized();
  }, []);

  const handleMinimize = () => {
    if (isElectron) (window as any).electron.windowMinimize();
  };

  const handleMaximize = () => {
    if (isElectron) (window as any).electron.windowMaximize();
  };

  const handleClose = () => {
    if (isElectron) (window as any).electron.windowClose();
  };

  return (
    <div
      className="flex items-center justify-between h-8 bg-surface-container-low border-b border-outline-variant/15 shrink-0 select-none"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      {/* Left: app identity */}
      <div className="flex items-center gap-2 px-4">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="opacity-70">
          <circle cx="12" cy="12" r="3" fill="#ff5637" />
          <circle cx="4" cy="8" r="2" fill="#7cd0ff" />
          <circle cx="20" cy="8" r="2" fill="#c20144" />
          <circle cx="4" cy="16" r="2" fill="#7cd0ff" />
          <circle cx="20" cy="16" r="2" fill="#c20144" />
          <line x1="12" y1="12" x2="4" y2="8" stroke="#ff5637" strokeWidth="1" opacity="0.5" />
          <line x1="12" y1="12" x2="20" y2="8" stroke="#ff5637" strokeWidth="1" opacity="0.5" />
          <line x1="12" y1="12" x2="4" y2="16" stroke="#ff5637" strokeWidth="1" opacity="0.5" />
          <line x1="12" y1="12" x2="20" y2="16" stroke="#ff5637" strokeWidth="1" opacity="0.5" />
        </svg>
        <span className="text-[11px] font-medium text-white/40 tracking-widest uppercase font-mono">
          CodeOrchester
        </span>
      </div>

      {/* Right: window controls */}
      <div
        className="flex items-center h-full"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        {/* Minimize */}
        <button
          onClick={handleMinimize}
          className="group flex items-center justify-center w-11 h-full hover:bg-white/5 transition-colors"
          title="Minimizar"
        >
          <span className="block w-[10px] h-[1px] bg-white/30 group-hover:bg-[#7cd0ff] transition-colors" />
        </button>

        {/* Maximize / Restore */}
        <button
          onClick={handleMaximize}
          className="group flex items-center justify-center w-11 h-full hover:bg-white/5 transition-colors"
          title={isMaximized ? 'Restaurar' : 'Maximizar'}
        >
          {isMaximized ? (
            /* Restore icon: two overlapping squares */
            <svg width="10" height="10" viewBox="0 0 10 10" className="text-white/30 group-hover:text-[#ff5637] transition-colors" fill="none" stroke="currentColor" strokeWidth="1.2">
              <rect x="0" y="2" width="7" height="7" rx="0.5" />
              <path d="M3 2V1.5A0.5 0.5 0 0 1 3.5 1H9A0.5 0.5 0 0 1 9.5 1.5V7A0.5 0.5 0 0 1 9 7.5H8.5" />
            </svg>
          ) : (
            /* Maximize icon: single square */
            <svg width="10" height="10" viewBox="0 0 10 10" className="text-white/30 group-hover:text-[#ff5637] transition-colors" fill="none" stroke="currentColor" strokeWidth="1.2">
              <rect x="0.5" y="0.5" width="9" height="9" rx="0.5" />
            </svg>
          )}
        </button>

        {/* Close */}
        <button
          onClick={handleClose}
          className="group flex items-center justify-center w-11 h-full hover:bg-[#e74c3c]/80 transition-colors"
          title="Cerrar"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" className="text-white/30 group-hover:text-white transition-colors" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <line x1="1" y1="1" x2="9" y2="9" />
            <line x1="9" y1="1" x2="1" y2="9" />
          </svg>
        </button>
      </div>
    </div>
  );
}
