import { useState, useEffect, useRef, useCallback } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import 'xterm/css/xterm.css';
import {
  Plus, Trash2, Terminal as TerminalIcon, FolderOpen, File, FileText,
  ChevronRight, ChevronDown, Search, GitBranch, Clock, Columns, Minimize2
} from 'lucide-react';
import { useAgentStore } from '../../../stores/agentStore';

interface FileNode {
  id: string;
  name: string;
  type: 'file' | 'folder';
  children?: FileNode[];
  content?: string;
  language?: string;
  lastModified?: Date;
}

interface EditorTab {
  id: string;
  fileId: string;
  name: string;
  content: string;
  language: string;
  unsaved: boolean;
}

interface TerminalTab {
  id: string;
  name: string;
  sessionId: string;
}


const fileIcons: Record<string, React.ReactNode> = {
  ts: <FileText className="w-4 h-4 text-blue-400" />,
  tsx: <FileText className="w-4 h-4 text-blue-400" />,
  js: <FileText className="w-4 h-4 text-yellow-400" />,
  jsx: <FileText className="w-4 h-4 text-yellow-400" />,
  json: <FileText className="w-4 h-4 text-orange-400" />,
  md: <FileText className="w-4 h-4 text-gray-400" />,
  css: <FileText className="w-4 h-4 text-purple-400" />,
  default: <File className="w-4 h-4 text-on-surface-variant" />,
};

const getFileIcon = (filename: string) => {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  return fileIcons[ext] || fileIcons.default;
};

const getLanguage = (filename: string): string => {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', js: 'javascript',
    jsx: 'javascript', json: 'json', md: 'markdown', css: 'css',
  };
  return map[ext] || 'plaintext';
};

// Demo file structure
const initialFiles: FileNode[] = [
  {
    id: '1', name: 'src', type: 'folder', lastModified: new Date(),
    children: [
      { id: '2', name: 'components', type: 'folder', lastModified: new Date(),
        children: [
          { id: '3', name: 'App.tsx', type: 'file', language: 'typescript', lastModified: new Date(Date.now() - 300000), content: '// App.tsx\nimport { AgentDashboard } from "./Agents/AgentDashboard";\n\nexport default function App() {\n  return <AgentDashboard />;\n}' },
          { id: '4', name: 'index.tsx', type: 'file', language: 'typescript', lastModified: new Date(Date.now() - 600000), content: '// index.tsx\nimport React from "react";\nimport ReactDOM from "react-dom";' },
        ],
      },
      { id: '5', name: 'stores', type: 'folder', lastModified: new Date(),
        children: [
          { id: '6', name: 'agentStore.ts', type: 'file', language: 'typescript', lastModified: new Date(Date.now() - 120000), content: '// agentStore.ts\nimport { create } from "zustand";\n\nexport const useAgentStore = create((set) => ({\n  agents: {},\n  // ...\n}));' },
        ],
      },
    ],
  },
  { id: '7', name: 'package.json', type: 'file', language: 'json', lastModified: new Date(Date.now() - 3600000), content: '{\n  "name": "codeorchester",\n  "version": "1.0.0"\n}' },
  { id: '8', name: 'README.md', type: 'file', language: 'markdown', lastModified: new Date(Date.now() - 86400000), content: '# CodeOrchester\nDesktop app for AI agent orchestration.' },
];

export function CodeMonitor() {
  const terminalRef = useRef<HTMLDivElement>(null);
  const [terminals, setTerminals] = useState<Map<string, Terminal>>(new Map());
  const [tabs, setTabs] = useState<TerminalTab[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);

  const fitAddonsRef = useRef<Map<string, FitAddon>>(new Map());
  const mountedTerminalsRef = useRef<Set<string>>(new Set());
  const tabsRef = useRef<TerminalTab[]>([]);
  const terminalsMapRef = useRef<Map<string, Terminal>>(new Map());
  const activeTabRef = useRef<string | null>(null);

  useEffect(() => { tabsRef.current = tabs; }, [tabs]);
  useEffect(() => { terminalsMapRef.current = terminals; }, [terminals]);
  useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);

  // File explorer state
  const [files, setFiles] = useState<FileNode[]>(initialFiles);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['1', '2', '5']));
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);

  // Editor state
  const [editorTabs, setEditorTabs] = useState<EditorTab[]>([]);
  const [activeEditorTab, setActiveEditorTab] = useState<string | null>(null);
  const [splitView, setSplitView] = useState(false);

  // Search
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);

  const { agents } = useAgentStore();
  const agentsList = Object.values(agents);

  // Register PTY listeners — cleanup on unmount prevents listener leaks when navigating away
  useEffect(() => {
    if (!window.electron) return;

    const removePtyData = window.electron.onPtyData(({ sessionId, data }) => {
      const tab = tabsRef.current.find((t) => t.sessionId === sessionId);
      if (tab) terminalsMapRef.current.get(tab.id)?.write(data);
    });
    const removePtyExit = window.electron.onPtyExit(({ sessionId, exitCode }) => {
      const tab = tabsRef.current.find((t) => t.sessionId === sessionId);
      if (tab) terminalsMapRef.current.get(tab.id)?.writeln(`\r\n\x1b[33m[Process exited: ${exitCode}]\x1b[0m`);
    });
    const removeTrabajoTerminado = window.electron.onTrabajoTerminado(({ sessionId, value }) => {
      const tab = tabsRef.current.find((t) => t.sessionId === sessionId);
      if (tab) terminalsMapRef.current.get(tab.id)?.writeln(
        value ? '\r\n\x1b[32m[trabajo_terminado=true]\x1b[0m' : '\r\n\x1b[31m[trabajo_terminado=false]\x1b[0m'
      );
    });

    return () => {
      removePtyData();
      removePtyExit();
      removeTrabajoTerminado();
    };
  }, []);

  // Mount terminal into the active tab's DOM container on first activation
  useEffect(() => {
    if (!activeTab || !terminalRef.current) return;
    if (mountedTerminalsRef.current.has(activeTab)) {
      fitAddonsRef.current.get(activeTab)?.fit();
      return;
    }
    const terminal = terminals.get(activeTab);
    const tab = tabs.find((t) => t.id === activeTab);
    if (!terminal || !tab) return;

    terminal.open(terminalRef.current);
    fitAddonsRef.current.get(activeTab)?.fit();
    mountedTerminalsRef.current.add(activeTab);

    if (window.electron) {
      window.electron.startPty(tab.sessionId).then((result) => {
        if (!result.success) {
          terminal.writeln(`\x1b[31m[ERROR]\x1b[0m PTY start failed: ${result.error ?? 'Unknown error'}`);
        }
      });
      terminal.onData((data) => window.electron?.writePty(tab.sessionId, data));
    } else {
      terminal.writeln('\x1b[36m╔════════════════════════════════════════╗\x1b[0m');
      terminal.writeln('\x1b[36m║  CODEORCHESTRATOR TERMINAL v1.0     ║\x1b[0m');
      terminal.writeln('\x1b[36m╚════════════════════════════════════════╝\x1b[0m');
      terminal.writeln('');
      terminal.writeln('\x1b[33m[SYSTEM]\x1b[0m PTY unavailable - Demo mode');
      terminal.writeln('');
      terminal.writeln('Test \x1b[32mtrabajo_terminado=true\x1b[0m or \x1b[31mtrabajo_terminado=false\x1b[0m');
    }
  }, [activeTab, terminals, tabs]);

  // Resize observer: refit active terminal when container resizes
  useEffect(() => {
    if (!activeTab || !terminalRef.current) return;
    const resizeObserver = new ResizeObserver(() => {
      const fitAddon = fitAddonsRef.current.get(activeTabRef.current ?? '');
      fitAddon?.fit();
      const term = terminalsMapRef.current.get(activeTabRef.current ?? '');
      const t = tabsRef.current.find((t) => t.id === activeTabRef.current);
      if (window.electron && term && t) {
        window.electron.resizePty(t.sessionId, term.cols, term.rows);
      }
    });
    resizeObserver.observe(terminalRef.current);
    return () => resizeObserver.disconnect();
  }, [activeTab]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { createTerminal(); }, []);

  const findFileById = useCallback((nodes: FileNode[], id: string): FileNode | null => {
    for (const node of nodes) {
      if (node.id === id) return node;
      if (node.children) {
        const found = findFileById(node.children, id);
        if (found) return found;
      }
    }
    return null;
  }, []);

  const toggleFolder = (folderId: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  };

  const openFile = (file: FileNode) => {
    if (file.type !== 'file') return;

    const existingTab = editorTabs.find((t) => t.fileId === file.id);
    if (existingTab) {
      setActiveEditorTab(existingTab.id);
      return;
    }

    const newTab: EditorTab = {
      id: crypto.randomUUID(),
      fileId: file.id,
      name: file.name,
      content: file.content || '',
      language: file.language || 'plaintext',
      unsaved: false,
    };
    setEditorTabs([...editorTabs, newTab]);
    setActiveEditorTab(newTab.id);
    setSelectedFileId(file.id);
  };

  const closeEditorTab = (tabId: string) => {
    const tab = editorTabs.find((t) => t.id === tabId);
    if (tab?.unsaved) {
      if (!confirm('¿Cerrar sin guardar?')) return;
    }
    const newTabs = editorTabs.filter((t) => t.id !== tabId);
    setEditorTabs(newTabs);
    if (activeEditorTab === tabId) {
      setActiveEditorTab(newTabs.length > 0 ? newTabs[newTabs.length - 1].id : null);
    }
  };

  const updateEditorContent = (tabId: string, content: string) => {
    setEditorTabs(editorTabs.map((t) =>
      t.id === tabId ? { ...t, content, unsaved: true } : t
    ));
  };

  const saveCurrentFile = () => {
    const tab = editorTabs.find((t) => t.id === activeEditorTab);
    if (!tab) return;

    const updateNode = (nodes: FileNode[]): FileNode[] =>
      nodes.map((n) => {
        if (n.id === tab.fileId) return { ...n, content: tab.content, lastModified: new Date() };
        if (n.children) return { ...n, children: updateNode(n.children) };
        return n;
      });
    setFiles((prev) => updateNode(prev));

    setEditorTabs(editorTabs.map((t) =>
      t.id === activeEditorTab ? { ...t, unsaved: false } : t
    ));
  };

  const formatLastModified = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'ahora';
    if (minutes < 60) return `hace ${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `hace ${hours}h`;
    return date.toLocaleDateString();
  };

  const renderFileTree = (nodes: FileNode[], depth = 0) => {
    return nodes.map((node) => (
      <div key={node.id}>
        <button
          onClick={() => node.type === 'folder' ? toggleFolder(node.id) : openFile(node)}
          className={`w-full flex items-center gap-2 px-2 py-1 hover:bg-surface-container rounded text-sm transition-colors ${
            selectedFileId === node.id ? 'bg-primary-container/20 text-primary' : 'text-on-surface-variant'
          }`}
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
        >
          {node.type === 'folder' ? (
            <>
              {expandedFolders.has(node.id) ? (
                <ChevronDown className="w-3 h-3" />
              ) : (
                <ChevronRight className="w-3 h-3" />
              )}
              <FolderOpen className="w-4 h-4 text-tertiary" />
            </>
          ) : (
            <>
              <span className="w-3" />
              {getFileIcon(node.name)}
            </>
          )}
          <span className="flex-1 text-left truncate">{node.name}</span>
          {node.lastModified && (
            <span className="text-[10px] text-on-surface-variant opacity-60">
              {formatLastModified(node.lastModified)}
            </span>
          )}
        </button>
        {node.type === 'folder' && expandedFolders.has(node.id) && node.children && (
          <div>{renderFileTree(node.children, depth + 1)}</div>
        )}
      </div>
    ));
  };

  const createTerminal = () => {
    const sessionId = crypto.randomUUID();
    const terminalId = crypto.randomUUID();

    const terminal = new Terminal({
      theme: {
        background: '#0e0e0e',
        foreground: '#e5e2e1',
        cursor: '#ff5637',
        cursorAccent: '#0e0e0e',
        selectionBackground: '#ff563740',
        black: '#0e0e0e',
        red: '#ff5637',
        green: '#7cd0ff',
        yellow: '#ffb4a5',
        blue: '#ffb4a5',
        magenta: '#c20144',
        cyan: '#7cd0ff',
        white: '#e5e2e1',
        brightBlack: '#5c403a',
        brightRed: '#ff5637',
        brightGreen: '#7cd0ff',
        brightYellow: '#ffb4a5',
        brightBlue: '#ffb4a5',
        brightMagenta: '#c20144',
        brightCyan: '#7cd0ff',
        brightWhite: '#ffffff',
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

    fitAddonsRef.current.set(terminalId, fitAddon);
    setTerminals((prev) => new Map(prev).set(terminalId, terminal));

    const newTab: TerminalTab = {
      id: terminalId,
      name: `TERM_${String(tabsRef.current.length + 1).padStart(3, '0')}`,
      sessionId,
    };
    setTabs((prev) => [...prev, newTab]);
    setActiveTab(terminalId);
    // Terminal is opened into the DOM in the useEffect above once activeTab updates
  };

  const closeTerminal = async (terminalId: string) => {
    const tab = tabs.find((t) => t.id === terminalId);
    if (tab && window.electron) {
      await window.electron.killPty(tab.sessionId);
    }
    terminals.get(terminalId)?.dispose();
    const newTerminals = new Map(terminals);
    newTerminals.delete(terminalId);
    setTerminals(newTerminals);
    const newTabs = tabs.filter((t) => t.id !== terminalId);
    setTabs(newTabs);
    if (activeTab === terminalId && newTabs.length > 0) {
      setActiveTab(newTabs[newTabs.length - 1].id);
    }
  };

  const activeEditor = editorTabs.find((t) => t.id === activeEditorTab);

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="p-3 border-b border-outline-variant/15 bg-surface-container-low">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded heat-gradient">
              <TerminalIcon className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-headline font-bold text-on-surface tracking-tight uppercase">
                CODE_MONITOR
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSearch(!showSearch)}
              className="p-2 hover:bg-surface-container rounded transition-colors"
            >
              <Search className="w-4 h-4 text-on-surface-variant" />
            </button>
            <button
              onClick={() => setSplitView(!splitView)}
              className="p-2 hover:bg-surface-container rounded transition-colors"
            >
              <Columns className="w-4 h-4 text-on-surface-variant" />
            </button>
            <button
              onClick={createTerminal}
              className="btn-primary flex items-center gap-2 text-sm"
            >
              <Plus className="w-4 h-4" />
              NEW_TERMINAL
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* File Explorer */}
        <div className="w-64 bg-surface-container-low border-r border-outline-variant/15 flex flex-col">
          <div className="p-3 border-b border-outline-variant/15">
            <h2 className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">
              EXPLORER
            </h2>
          </div>
          <div className="flex-1 overflow-auto p-2">
            {renderFileTree(files)}
          </div>

          {/* Agents Panel */}
          <div className="border-t border-outline-variant/15">
            <div className="p-3">
              <h2 className="text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">
                AGENTS ({agentsList.length})
              </h2>
            </div>
            <div className="px-2 pb-3 space-y-1 max-h-40 overflow-auto">
              {agentsList.length === 0 ? (
                <p className="text-xs text-on-surface-variant px-2">No agents</p>
              ) : (
                agentsList.map((agent) => (
                  <div
                    key={agent.id}
                    className="flex items-center gap-2 px-2 py-1.5 rounded bg-surface-container hover:bg-surface-container-high transition-colors"
                  >
                    <div className={`w-2 h-2 rounded-full ${
                      agent.status === 'active' ? 'bg-primary animate-pulse' :
                      agent.status === 'success' ? 'bg-secondary' :
                      agent.status === 'error' ? 'bg-error' : 'bg-on-surface-variant'
                    }`} />
                    <span className="text-xs font-mono text-on-surface truncate flex-1">
                      {agent.name}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Editor + Terminal Container */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Search Bar */}
          {showSearch && (
            <div className="p-2 bg-surface-container border-b border-outline-variant/15 flex items-center gap-2">
              <Search className="w-4 h-4 text-on-surface-variant" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search in files..."
                className="flex-1 bg-transparent text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none"
              />
              <span className="text-xs text-on-surface-variant">ESC para cerrar</span>
            </div>
          )}

          {/* Editor Tabs */}
          {editorTabs.length > 0 && (
            <div className="flex bg-surface-container-low border-b border-outline-variant/15 overflow-x-auto">
              {editorTabs.map((tab) => (
                <div
                  key={tab.id}
                  className={`flex items-center gap-2 px-4 py-2 border-r border-outline-variant/15 cursor-pointer ${
                    activeEditorTab === tab.id
                      ? 'bg-surface-container text-on-surface border-t-2 border-t-primary'
                      : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container'
                  }`}
                  onClick={() => setActiveEditorTab(tab.id)}
                >
                  {getFileIcon(tab.name)}
                  <span className="text-xs font-mono">
                    {tab.name}
                    {tab.unsaved && <span className="text-tertiary ml-1">●</span>}
                  </span>
                  <button
                    onClick={(e) => { e.stopPropagation(); closeEditorTab(tab.id); }}
                    className="p-0.5 rounded hover:bg-surface-container-high"
                  >
                    <Minimize2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Editor Area */}
          <div className={`flex-1 overflow-hidden ${splitView ? 'flex flex-row' : 'flex flex-col'}`}>
            {/* Main Editor */}
            <div className={`${splitView ? 'w-1/2 border-r border-outline-variant/15' : 'flex-1'} flex flex-col bg-surface-container-lowest`}>
              {activeEditor ? (
                <div className="flex-1 flex flex-col">
                  <div className="p-2 bg-surface-container text-xs text-on-surface-variant flex items-center justify-between">
                    <span>{activeEditor.language.toUpperCase()}</span>
                    <div className="flex items-center gap-4">
                      <span className="flex items-center gap-1">
                        <GitBranch className="w-3 h-3" />
                        main
                      </span>
                      <button onClick={saveCurrentFile} className="hover:text-primary">
                        Guardar (Ctrl+S)
                      </button>
                    </div>
                  </div>
                  <textarea
                    value={activeEditor.content}
                    onChange={(e) => updateEditorContent(activeEditor.id, e.target.value)}
                    className="flex-1 p-4 bg-transparent text-on-surface font-mono text-sm resize-none focus:outline-none leading-relaxed"
                    spellCheck={false}
                  />
                </div>
              ) : (
                <div className="h-full flex items-center justify-center">
                  <div className="text-center">
                    <File className="w-16 h-16 text-on-surface-variant mx-auto mb-4 opacity-20" />
                    <p className="text-on-surface-variant font-mono text-sm uppercase tracking-wider">
                      Selecciona un archivo para editar
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Split View - Secondary Editor/Terminal */}
            {splitView && (
              <div className="w-1/2 flex flex-col">
                {/* Terminal Tabs */}
                {tabs.length > 0 && (
                  <div className="flex bg-surface-container-low border-b border-outline-variant/15 overflow-x-auto">
                    {tabs.map((tab) => (
                      <div
                        key={tab.id}
                        className={`flex items-center gap-2 px-3 py-1.5 border-r border-outline-variant/15 cursor-pointer ${
                          activeTab === tab.id
                            ? 'bg-surface-container text-on-surface border-t-2 border-t-primary'
                            : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container'
                        }`}
                        onClick={() => setActiveTab(tab.id)}
                      >
                        <TerminalIcon className="w-3 h-3" />
                        <span className="text-xs font-mono">{tab.name}</span>
                        <button
                          onClick={(e) => { e.stopPropagation(); closeTerminal(tab.id); }}
                          className="p-0.5 rounded hover:bg-surface-container-high"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex-1 relative">
                  {tabs.map((tab) => (
                    <div
                      key={tab.id}
                      ref={activeTab === tab.id ? terminalRef : undefined}
                      id={`terminal-container-${tab.id}`}
                      className={`absolute inset-0 p-2 ${activeTab === tab.id ? 'block' : 'hidden'}`}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Terminal Section (when not in split view) */}
          {!splitView && (
            <div className="h-48 border-t border-outline-variant/15 flex flex-col">
              {/* Terminal Tabs */}
              {tabs.length > 0 && (
                <div className="flex bg-surface-container-low border-b border-outline-variant/15">
                  {tabs.map((tab) => (
                    <div
                      key={tab.id}
                      className={`flex items-center gap-2 px-4 py-2 border-r border-outline-variant/15 cursor-pointer ${
                        activeTab === tab.id
                          ? 'bg-surface-container text-on-surface border-t-2 border-t-primary'
                          : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container'
                      }`}
                      onClick={() => setActiveTab(tab.id)}
                    >
                      <span className="text-xs font-mono uppercase tracking-wider">{tab.name}</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); closeTerminal(tab.id); }}
                        className="p-1 rounded hover:bg-surface-container-high"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex-1 relative">
                {tabs.map((tab) => (
                  <div
                    key={tab.id}
                    ref={activeTab === tab.id ? terminalRef : undefined}
                    id={`terminal-container-${tab.id}`}
                    className={`absolute inset-0 p-2 ${activeTab === tab.id ? 'block' : 'hidden'}`}
                  />
                ))}
                {tabs.length === 0 && (
                  <div className="h-full flex items-center justify-center">
                    <p className="text-on-surface-variant font-mono text-sm uppercase tracking-wider">
                      No terminals open
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Status Bar */}
      <div className="px-4 py-1 bg-surface-container border-t border-outline-variant/15 flex items-center justify-between text-xs text-on-surface-variant">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1">
            <GitBranch className="w-3 h-3" />
            main
          </span>
          <span>{agentsList.filter(a => a.status === 'active').length} agents active</span>
        </div>
        <div className="flex items-center gap-4">
          {activeEditor && (
            <>
              <span>{activeEditor.language}</span>
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {formatLastModified(new Date())}
              </span>
            </>
          )}
          <span>UTF-8</span>
        </div>
      </div>
    </div>
  );
}
