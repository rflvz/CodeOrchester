import { useEffect, useRef, useState } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import 'xterm/css/xterm.css';
import { Plus, Trash2, Maximize2 } from 'lucide-react';

declare global {
  interface Window {
    electron?: {
      startPty: (sessionId: string, cwd?: string) => Promise<{ success: boolean; pid?: number; error?: string }>;
      writePty: (sessionId: string, data: string) => Promise<{ success: boolean; error?: string }>;
      resizePty: (sessionId: string, cols: number, rows: number) => Promise<{ success: boolean; error?: string }>;
      killPty: (sessionId: string) => Promise<{ success: boolean; error?: string }>;
      showNotification: (title: string, body: string) => Promise<{ success: boolean; error?: string }>;
      onPtyData: (callback: (data: { sessionId: string; data: string }) => void) => void;
      onPtyExit: (callback: (data: { sessionId: string; exitCode: number }) => void) => void;
      onTrabajoTerminado: (callback: (data: { sessionId: string; value: boolean }) => void) => void;
    };
  }
}

interface TerminalTab {
  id: string;
  name: string;
  sessionId: string;
}

export function CodeMonitor() {
  const terminalRef = useRef<HTMLDivElement>(null);
  const [terminals, setTerminals] = useState<Map<string, Terminal>>(new Map());
  const [tabs, setTabs] = useState<TerminalTab[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);

  useEffect(() => {
    // Create initial terminal
    createTerminal();
  }, []);

  const createTerminal = async () => {
    if (!terminalRef.current) return;

    const sessionId = crypto.randomUUID();
    const terminalId = crypto.randomUUID();

    const terminal = new Terminal({
      theme: {
        background: '#000000',
        foreground: '#f9f9fd',
        cursor: '#97a9ff',
        cursorAccent: '#000000',
        selectionBackground: '#97a9ff40',
        black: '#000000',
        red: '#ff6e84',
        green: '#69f6b8',
        yellow: '#ffb148',
        blue: '#97a9ff',
        magenta: '#ff6e84',
        cyan: '#69f6b8',
        white: '#f9f9fd',
        brightBlack: '#aaabaf',
        brightRed: '#ff6e84',
        brightGreen: '#69f6b8',
        brightYellow: '#ffb148',
        brightBlue: '#97a9ff',
        brightMagenta: '#ff6e84',
        brightCyan: '#69f6b8',
        brightWhite: '#f9f9fd',
      },
      fontFamily: '"JetBrains Mono", "Fira Code", monospace',
      fontSize: 13,
      lineHeight: 1.2,
      cursorBlink: true,
      cursorStyle: 'bar',
      scrollback: 10000,
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.loadAddon(new WebLinksAddon());

    const container = document.createElement('div');
    container.id = `terminal-${terminalId}`;
    container.className = 'h-full w-full';
    terminal.open(container);
    fitAddon.fit();

    // Store terminal
    const newTerminals = new Map(terminals);
    newTerminals.set(terminalId, terminal);
    setTerminals(newTerminals);

    // Create tab
    const newTab: TerminalTab = {
      id: terminalId,
      name: `Terminal ${tabs.length + 1}`,
      sessionId,
    };
    setTabs([...tabs, newTab]);
    setActiveTab(terminalId);

    // Start PTY session
    if (window.electron) {
      await window.electron.startPty(sessionId);

      // Handle data from PTY
      window.electron.onPtyData(({ data }) => {
        terminal.write(data);
      });

      // Handle PTY exit
      window.electron.onPtyExit(({ exitCode }) => {
        terminal.writeln(`\r\n\x1b[33m[Process exited with code ${exitCode}]\x1b[0m`);
      });

      // Handle trabajo_terminado
      window.electron.onTrabajoTerminado(({ value }) => {
        if (value) {
          terminal.writeln('\r\n\x1b[32m[trabajo_terminado=true]\x1b[0m');
        } else {
          terminal.writeln('\r\n\x1b[31m[trabajo_terminado=false]\x1b[0m');
        }
      });

      // Handle terminal input
      terminal.onData((data) => {
        window.electron?.writePty(sessionId, data);
      });
    } else {
      // Demo mode without electron
      terminal.writeln('\x1b[33mCodeOrchester Terminal\x1b[0m');
      terminal.writeln('PTY no disponible - modo demostración');
      terminal.writeln('');
      terminal.writeln('Escribe trabajo_terminado=true o trabajo_terminado=false para probar el flag');
    }

    // Resize handling
    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
      if (window.electron) {
        window.electron.resizePty(sessionId, terminal.cols, terminal.rows);
      }
    });
    resizeObserver.observe(terminalRef.current);
  };

  const closeTerminal = async (terminalId: string) => {
    const tab = tabs.find((t) => t.id === terminalId);
    if (tab && window.electron) {
      await window.electron.killPty(tab.sessionId);
    }

    const terminal = terminals.get(terminalId);
    terminal?.dispose();

    const newTerminals = new Map(terminals);
    newTerminals.delete(terminalId);
    setTerminals(newTerminals);

    const newTabs = tabs.filter((t) => t.id !== terminalId);
    setTabs(newTabs);

    if (activeTab === terminalId && newTabs.length > 0) {
      setActiveTab(newTabs[newTabs.length - 1].id);
    }
  };

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="p-4 border-b border-outline-variant/15">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-headline font-bold text-on-surface">Monitor de Código</h1>
            <p className="text-on-surface-variant text-sm">Terminal interactivo con Claude CLI</p>
          </div>
          <button
            onClick={createTerminal}
            className="btn-primary flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Nuevo Terminal
          </button>
        </div>
      </div>

      {/* Tabs */}
      {tabs.length > 0 && (
        <div className="flex bg-surface-container-low border-b border-outline-variant/15">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              className={`flex items-center gap-2 px-4 py-2 border-r border-outline-variant/15 cursor-pointer ${
                activeTab === tab.id
                  ? 'bg-surface-container text-on-surface'
                  : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container'
              }`}
              onClick={() => setActiveTab(tab.id)}
            >
              <span className="text-sm">{tab.name}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  closeTerminal(tab.id);
                }}
                className="p-0.5 rounded hover:bg-surface-container-high"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Terminal Container */}
      <div className="flex-1 relative">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            ref={terminalRef}
            id={`terminal-container-${tab.id}`}
            className={`absolute inset-0 ${
              activeTab === tab.id ? 'block' : 'hidden'
            }`}
          />
        ))}
        {tabs.length === 0 && (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <Terminal className="w-16 h-16 text-on-surface-variant mx-auto mb-4" />
              <p className="text-on-surface-variant">No hay terminales abiertos</p>
              <button
                onClick={createTerminal}
                className="btn-primary mt-4"
              >
                Crear Terminal
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
