import { useState, useEffect, useRef, useCallback } from 'react';
import { GitBranch, Users, Network, Plus, Settings, Activity, Zap, Trash2, X, ZoomIn, ZoomOut, Maximize2, Move, Link2, Unlink, LayoutGrid, ArrowRight, MousePointer, Wifi, WifiOff } from 'lucide-react';
import { useAgentStore } from '../../../stores/agentStore';
import { useTeamStore } from '../../../stores/teamStore';
import { Agent, Team } from '../../../types';
import { AgentAvatar } from '../../Shared/AgentAvatar';
import { StatusChip } from '../../Shared/StatusChip';

interface NodePosition {
  id: string;
  x: number;
  y: number;
}

interface DragState {
  isDragging: boolean;
  nodeId: string | null;
  startX: number;
  startY: number;
  offsetX: number;
  offsetY: number;
}

interface ConnectionDrag {
  isDrawing: boolean;
  fromAgentId: string | null;
  tempX: number;
  tempY: number;
}

const GRID_SIZE = 20;
const NODE_WIDTH = 120;
const NODE_HEIGHT = 100;

const getTopologyIcon = (topology: string) => {
  switch (topology) {
    case 'hierarchical':
      return <Network className="w-4 h-4" />;
    case 'mesh':
      return <GitBranch className="w-4 h-4" />;
    case 'star':
      return <Users className="w-4 h-4" />;
    default:
      return <GitBranch className="w-4 h-4" />;
  }
};

// Bezier curve path between two points
const getBezierPath = (x1: number, y1: number, x2: number, y2: number) => {
  const dx = Math.abs(x2 - x1);
  const controlOffset = Math.min(dx * 0.5, 100);
  return `M ${x1} ${y1} C ${x1 + controlOffset} ${y1}, ${x2 - controlOffset} ${y2}, ${x2} ${y2}`;
};

export function Topology() {
  const { agents, setActiveAgent, activeAgentId } = useAgentStore();
  const { teams, createTeam, addConnection, removeConnection } = useTeamStore();

  const agentsList = Object.values(agents);
  const teamsList = Object.values(teams);

  const [selectedNodes, setSelectedNodes] = useState<Set<string>>(new Set());
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [hoveredAgent, setHoveredAgent] = useState<string | null>(null);
  const [nodePositions, setNodePositions] = useState<Record<string, NodePosition>>({});
  const [showNewClusterModal, setShowNewClusterModal] = useState(false);
  const [newClusterName, setNewClusterName] = useState('');
  const [newClusterTopology, setNewClusterTopology] = useState<'hierarchical' | 'mesh' | 'star' | 'chain'>('mesh');
  const [showConnectionsPanel, setShowConnectionsPanel] = useState(false);

  // Connection mode - 'click' or 'drag'
  const [connectionMode, setConnectionMode] = useState<'click' | 'drag' | null>(null);
  const [connectionSource, setConnectionSource] = useState<string | null>(null);

  // Canvas state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  // Drag state
  const [dragState, setDragState] = useState<DragState>({
    isDragging: false,
    nodeId: null,
    startX: 0,
    startY: 0,
    offsetX: 0,
    offsetY: 0,
  });

  // Temporary connection while dragging
  const [tempConnection, setTempConnection] = useState<{ fromId: string; toX: number; toY: number } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const didDragRef = useRef(false);
  const dragStartPosRef = useRef({ x: 0, y: 0 });

  // Initialize positions for agents
  useEffect(() => {
    const newPositions: Record<string, NodePosition> = {};
    const centerX = 500;
    const centerY = 300;

    agentsList.forEach((agent, index) => {
      if (!nodePositions[agent.id]) {
        const angle = (index / Math.max(agentsList.length, 1)) * 2 * Math.PI - Math.PI / 2;
        const radius = 180 + Math.random() * 80;
        newPositions[agent.id] = {
          id: agent.id,
          x: centerX + radius * Math.cos(angle),
          y: centerY + radius * Math.sin(angle),
        };
      } else {
        newPositions[agent.id] = nodePositions[agent.id];
      }
    });

    if (Object.keys(newPositions).length > 0) {
      setNodePositions((prev) => ({ ...prev, ...newPositions }));
    }
  }, [agentsList.length]);

  // Initialize positions for teams
  useEffect(() => {
    const newPositions: Record<string, NodePosition> = {};
    const centerX = 500;
    const centerY = 300;
    const radius = 250;

    teamsList.forEach((team, index) => {
      if (!nodePositions[team.id]) {
        const angle = (index / Math.max(teamsList.length, 1)) * 2 * Math.PI - Math.PI / 2;
        newPositions[team.id] = {
          id: team.id,
          x: centerX + radius * Math.cos(angle),
          y: centerY + radius * Math.sin(angle),
        };
      } else {
        newPositions[team.id] = nodePositions[team.id];
      }
    });

    if (Object.keys(newPositions).length > 0) {
      setNodePositions((prev) => ({ ...prev, ...newPositions }));
    }
  }, [teamsList.length]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // C key - toggle click-to-connect mode
      if (e.key === 'c' && !e.ctrlKey && !e.metaKey && document.activeElement === document.body) {
        e.preventDefault();
        if (connectionMode === 'click') {
          setConnectionMode(null);
          setConnectionSource(null);
        } else {
          setConnectionMode('click');
          setConnectionSource(null);
        }
      }
      // Escape - cancel connection mode
      if (e.key === 'Escape') {
        setConnectionMode(null);
        setConnectionSource(null);
        setSelectedNodes(new Set());
        setTempConnection(null);
      }
      // Delete/Backspace - delete selected connection
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedNodes.size > 0 && selectedTeamId) {
        const nodeId = Array.from(selectedNodes)[0];
        // If it's a connection, delete it
        const conn = teamsList.find(t => t.id === selectedTeamId)?.connections.find(c => c.id === nodeId);
        if (conn) {
          removeConnection(selectedTeamId, conn.id);
          setSelectedNodes(new Set());
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [connectionMode, selectedNodes, selectedTeamId, teamsList, removeConnection]);

  const getAgentsByTeam = (teamId: string | null) => {
    return agentsList.filter((a) => a.teamId === teamId);
  };

  const getSelectedEntity = () => {
    if (selectedNodes.size !== 1) return null;
    const nodeId = Array.from(selectedNodes)[0];
    const team = teamsList.find((t) => t.id === nodeId);
    if (team) return { type: 'team' as const, data: team };
    const agent = agentsList.find((a) => a.id === nodeId);
    if (agent) return { type: 'agent' as const, data: agent };
    return null;
  };

  const selectedEntity = getSelectedEntity();

  const getAgentTeam = (agentId: string): Team | null => {
    const agent = agentsList.find((a) => a.id === agentId);
    if (!agent?.teamId) return null;
    return teamsList.find((t) => t.id === agent.teamId) || null;
  };

  const handleCreateCluster = () => {
    if (!newClusterName.trim()) return;
    const newTeam = createTeam({
      name: newClusterName.toUpperCase().replace(/\s+/g, '_'),
      description: `Cluster ${newClusterName}`,
      agents: [],
      topology: newClusterTopology,
      connections: [],
    });
    setNewClusterName('');
    setNewClusterTopology('mesh');
    setShowNewClusterModal(false);
    // Select the new cluster
    setSelectedNodes(new Set([newTeam.id]));
    setSelectedTeamId(newTeam.id);
  };

  const snapToGrid = (value: number) => Math.round(value / GRID_SIZE) * GRID_SIZE;

  const handleNodeMouseDown = (e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation();
    didDragRef.current = false;
    dragStartPosRef.current = { x: e.clientX, y: e.clientY };

    const pos = nodePositions[nodeId];
    if (!pos) return;

    setDragState({
      isDragging: true,
      nodeId,
      startX: e.clientX,
      startY: e.clientY,
      offsetX: pos.x,
      offsetY: pos.y,
    });

    if (!selectedNodes.has(nodeId)) {
      if (e.shiftKey) {
        setSelectedNodes((prev) => new Set([...prev, nodeId]));
      } else {
        setSelectedNodes(new Set([nodeId]));
      }
    }

    // Set selected team if clicking on agent
    const agent = agentsList.find(a => a.id === nodeId);
    if (agent?.teamId) {
      setSelectedTeamId(agent.teamId);
    } else {
      const team = teamsList.find(t => t.id === nodeId);
      if (team) setSelectedTeamId(team.id);
    }
  };

  const handleNodeClick = (e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation();

    // If in click-to-connect mode
    if (connectionMode === 'click' && connectionSource) {
      const sourceTeam = getAgentTeam(connectionSource);
      const targetTeam = getAgentTeam(nodeId);

      // Can only connect within same team
      if (sourceTeam?.id === targetTeam?.id || agentsList.find(a => a.id === nodeId)?.teamId === null) {
        // Don't connect to self
        if (connectionSource !== nodeId) {
          if (sourceTeam) {
            addConnection(sourceTeam.id, {
              fromAgentId: connectionSource,
              toAgentId: nodeId,
            });
          }
        }
      }
      setConnectionMode(null);
      setConnectionSource(null);
      return;
    }

    // Normal selection
    if (didDragRef.current) return;
    if (!selectedNodes.has(nodeId)) {
      setSelectedNodes(new Set([nodeId]));
      const agent = agentsList.find(a => a.id === nodeId);
      if (agent?.teamId) {
        setSelectedTeamId(agent.teamId);
      }
    }
  };

  const handleAgentPortClick = (e: React.MouseEvent, agentId: string, portType: 'input' | 'output') => {
    e.stopPropagation();
    const team = getAgentTeam(agentId);
    if (!team) return;

    if (!connectionSource) {
      // Start connection from output port
      if (portType === 'output') {
        setConnectionMode('click');
        setConnectionSource(agentId);
      }
    } else {
      // Complete connection to input port
      if (portType === 'input' && connectionSource !== agentId) {
        addConnection(team.id, {
          fromAgentId: connectionSource,
          toAgentId: agentId,
        });
      }
      setConnectionMode(null);
      setConnectionSource(null);
    }
  };

  const handlePortMouseEnter = (agentId: string) => {
    setHoveredAgent(agentId);
  };

  const handlePortMouseLeave = () => {
    setHoveredAgent(null);
  };

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (dragState.isDragging && dragState.nodeId) {
        const dx = e.clientX - dragStartPosRef.current.x;
        const dy = e.clientY - dragStartPosRef.current.y;

        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
          didDragRef.current = true;
        }

        let newX = dragState.offsetX + dx / zoom;
        let newY = dragState.offsetY + dy / zoom;

        if (!e.shiftKey) {
          newX = snapToGrid(newX);
          newY = snapToGrid(newY);
        }

        setNodePositions((prev) => ({
          ...prev,
          [dragState.nodeId!]: {
            ...prev[dragState.nodeId!],
            x: newX,
            y: newY,
          },
        }));

        // Update temp connection if drawing
        if (connectionMode === 'drag' && connectionSource) {
          const rect = containerRef.current?.getBoundingClientRect();
          if (rect) {
            const x = (e.clientX - rect.left - pan.x) / zoom;
            const y = (e.clientY - rect.top - pan.y) / zoom;
            setTempConnection({ fromId: connectionSource, toX: x, toY: y });
          }
        }
      }

      if (isPanning) {
        const dx = e.clientX - panStart.x;
        const dy = e.clientY - panStart.y;
        setPan((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
        setPanStart({ x: e.clientX, y: e.clientY });
      }
    },
    [dragState, isPanning, panStart, zoom, connectionMode, connectionSource]
  );

  const handleMouseUp = useCallback(() => {
    if (dragState.isDragging && connectionMode === 'drag' && connectionSource) {
      // Check if dropped on an agent
      const targetAgent = agentsList.find((agent) => {
        if (agent.id === connectionSource) return false;
        const pos = nodePositions[agent.id];
        if (!pos) return false;
        const dist = Math.sqrt(
          Math.pow(pos.x - nodePositions[connectionSource].x - NODE_WIDTH / 2, 2) +
          Math.pow(pos.y - nodePositions[connectionSource].y, 2)
        );
        return dist < 60;
      });

      if (targetAgent) {
        const team = getAgentTeam(connectionSource);
        if (team) {
          addConnection(team.id, {
            fromAgentId: connectionSource,
            toAgentId: targetAgent.id,
          });
        }
      }
    }

    setDragState({
      isDragging: false,
      nodeId: null,
      startX: 0,
      startY: 0,
      offsetX: 0,
      offsetY: 0,
    });
    setIsPanning(false);
    setTempConnection(null);
    didDragRef.current = false;
  }, [dragState, connectionMode, connectionSource, agentsList, nodePositions, addConnection]);

  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (e.target === containerRef.current || (e.target as HTMLElement).classList.contains('canvas-bg')) {
      setSelectedNodes(new Set());
      if (e.button === 0) {
        setIsPanning(true);
        setPanStart({ x: e.clientX, y: e.clientY });
      }
      // Cancel connection mode on canvas click
      if (connectionMode) {
        setConnectionMode(null);
        setConnectionSource(null);
      }
    }
  };

  const handlePortDragStart = (e: React.MouseEvent, agentId: string) => {
    e.stopPropagation();
    const team = getAgentTeam(agentId);
    if (!team) return;

    setConnectionMode('drag');
    setConnectionSource(agentId);
    const pos = nodePositions[agentId];
    if (pos) {
      setTempConnection({ fromId: agentId, toX: pos.x + NODE_WIDTH / 2, toY: pos.y });
    }
  };

  const handleZoomIn = () => setZoom((z) => Math.min(z + 0.25, 3));
  const handleZoomOut = () => setZoom((z) => Math.max(z - 0.25, 0.25));
  const handleResetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const handleAutoLayout = () => {
    const newPositions: Record<string, NodePosition> = {};
    const centerX = 500;
    const centerY = 300;
    const radius = 250;

    teamsList.forEach((team, index) => {
      const angle = (index / Math.max(teamsList.length, 1)) * 2 * Math.PI - Math.PI / 2;
      newPositions[team.id] = { id: team.id, x: centerX + radius * Math.cos(angle), y: centerY + radius * Math.sin(angle) };

      const teamAgents = getAgentsByTeam(team.id);
      const agentRadius = 120;
      teamAgents.forEach((agent, agentIndex) => {
        const aAngle = angle + ((agentIndex - (teamAgents.length - 1) / 2) / Math.max(teamAgents.length, 1)) * 1.2;
        newPositions[agent.id] = {
          id: agent.id,
          x: centerX + radius * Math.cos(angle) + agentRadius * Math.cos(aAngle),
          y: centerY + radius * Math.sin(angle) + agentRadius * Math.sin(aAngle),
        };
      });
    });

    getAgentsByTeam(null).forEach((agent, index) => {
      newPositions[agent.id] = {
        id: agent.id,
        x: centerX + (index - (getAgentsByTeam(null).length - 1) / 2) * 120,
        y: centerY + 320,
      };
    });

    setNodePositions(newPositions);
  };

  // Get connections for selected team
  const selectedTeamConnections = selectedTeamId
    ? teamsList.find((t) => t.id === selectedTeamId)?.connections || []
    : [];

  const getPos = (id: string) => nodePositions[id] || { x: 0, y: 0 };

  const getPortPosition = (agentId: string, port: 'input' | 'output') => {
    const pos = getPos(agentId);
    return {
      x: pos.x + (port === 'output' ? NODE_WIDTH / 2 : -NODE_WIDTH / 2),
      y: pos.y,
    };
  };

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="p-3 border-b border-outline-variant/15 bg-surface flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg heat-gradient">
            <GitBranch className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-headline font-bold text-on-surface uppercase tracking-tight">
              Node Topology
            </h1>
            <p className="text-on-surface-variant text-xs font-mono">
              {teamsList.length} clusters • {agentsList.length} agents
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Connection mode indicator */}
          {connectionMode && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-primary/20 border border-primary/40 rounded-lg mr-2">
              {connectionMode === 'click' ? (
                <>
                  <MousePointer className="w-4 h-4 text-primary" />
                  <span className="text-xs text-primary font-medium">CLICK MODE</span>
                  <button
                    onClick={() => { setConnectionMode(null); setConnectionSource(null); }}
                    className="ml-1 p-0.5 hover:bg-primary/20 rounded"
                  >
                    <X className="w-3 h-3 text-primary" />
                  </button>
                </>
              ) : (
                <>
                  <Link2 className="w-4 h-4 text-tertiary" />
                  <span className="text-xs text-tertiary font-medium">DRAG MODE</span>
                </>
              )}
            </div>
          )}

          {/* Zoom controls */}
          <div className="flex items-center gap-1 bg-surface-container rounded-lg p-1">
            <button onClick={handleZoomOut} className="p-1.5 hover:bg-surface-container-high rounded transition-colors" title="Zoom Out (-)">
              <ZoomOut className="w-3.5 h-3.5 text-on-surface-variant" />
            </button>
            <span className="text-xs font-mono text-on-surface-variant w-10 text-center">{Math.round(zoom * 100)}%</span>
            <button onClick={handleZoomIn} className="p-1.5 hover:bg-surface-container-high rounded transition-colors" title="Zoom In (+)">
              <ZoomIn className="w-3.5 h-3.5 text-on-surface-variant" />
            </button>
            <div className="w-px h-3 bg-outline-variant/30 mx-0.5" />
            <button onClick={handleResetView} className="p-1.5 hover:bg-surface-container-high rounded transition-colors" title="Reset View">
              <Maximize2 className="w-3.5 h-3.5 text-on-surface-variant" />
            </button>
            <div className="w-px h-3 bg-outline-variant/30 mx-0.5" />
            <button onClick={handleAutoLayout} className="p-1.5 hover:bg-surface-container-high rounded transition-colors" title="Auto Layout">
              <LayoutGrid className="w-3.5 h-3.5 text-on-surface-variant" />
            </button>
          </div>

          <button
            onClick={() => setShowConnectionsPanel(!showConnectionsPanel)}
            className={`btn-secondary flex items-center gap-1.5 text-xs ${showConnectionsPanel ? 'bg-primary-container/20 text-primary' : ''}`}
          >
            <Link2 className="w-3.5 h-3.5" />
            {showConnectionsPanel ? 'HIDE' : 'CONNECTIONS'}
          </button>
          <button onClick={() => setShowNewClusterModal(true)} className="btn-primary flex items-center gap-1.5 text-xs">
            <Plus className="w-3.5 h-3.5" />
            NEW CLUSTER
          </button>
        </div>
      </div>

      {/* Help bar */}
      <div className="px-4 py-1.5 bg-surface-container-low border-b border-outline-variant/10 flex items-center gap-4 text-[10px] text-on-surface-variant">
        <span><kbd className="px-1 py-0.5 bg-surface-container rounded font-mono">C</kbd> Click-to-connect</span>
        <span><kbd className="px-1 py-0.5 bg-surface-container rounded font-mono">Drag</kbd> port to connect</span>
        <span><kbd className="px-1 py-0.5 bg-surface-container rounded font-mono">Shift+Click</kbd> Multi-select</span>
        <span><kbd className="px-1 py-0.5 bg-surface-container rounded font-mono">Esc</kbd> Cancel</span>
        <span><kbd className="px-1 py-0.5 bg-surface-container rounded font-mono">Del</kbd> Delete</span>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Main Canvas */}
        <div
          ref={containerRef}
          className="flex-1 relative bg-surface overflow-hidden"
          onMouseDown={handleCanvasMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          style={{ cursor: isPanning ? 'grabbing' : 'default' }}
        >
          {/* Legend */}
          <div className="absolute top-3 left-3 z-20 bg-surface-container/90 backdrop-blur-sm rounded-lg p-2.5 border border-outline-variant/15">
            <h3 className="text-[9px] font-bold text-on-surface uppercase tracking-wider mb-1.5">Legend</h3>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full heat-gradient"></div>
                <span className="text-[10px] text-on-surface-variant">Orchestrator</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-secondary"></div>
                <span className="text-[10px] text-on-surface-variant">Team/Cluster</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-primary"></div>
                <span className="text-[10px] text-on-surface-variant">Agent</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-tertiary"></div>
                <span className="text-[10px] text-on-surface-variant">Input</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-secondary"></div>
                <span className="text-[10px] text-on-surface-variant">Output</span>
              </div>
            </div>
          </div>

          {/* Canvas with zoom and pan */}
          <div
            className="absolute inset-0"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: '0 0',
            }}
          >
            <svg className="absolute pointer-events-none" style={{ width: 4000, height: 4000, left: -1500, top: -1500 }}>
              <defs>
                <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                  <polygon points="0 0, 10 3.5, 0 7" fill="#69f6b8" />
                </marker>
                <marker id="arrowhead-temp" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                  <polygon points="0 0, 10 3.5, 0 7" fill="#97a9ff" opacity="0.6" />
                </marker>
              </defs>

              {/* Team to orchestrator connections */}
              {teamsList.map((team) => {
                const pos = getPos(team.id);
                return (
                  <path key={`orch-${team.id}`} d={getBezierPath(500, 300, pos.x, pos.y)} stroke="#ff5637" strokeWidth="2" strokeOpacity="0.3" strokeDasharray="8 4" fill="none" />
                );
              })}

              {/* Team to agent connections */}
              {teamsList.map((team) => {
                const teamPos = getPos(team.id);
                const teamAgents = getAgentsByTeam(team.id);
                return teamAgents.map((agent) => {
                  const agentPos = getPos(agent.id);
                  return (
                    <path key={`team-${team.id}-${agent.id}`} d={getBezierPath(teamPos.x, teamPos.y, agentPos.x - NODE_WIDTH / 2, agentPos.y)} stroke="#5c403a" strokeWidth="1.5" strokeOpacity="0.4" fill="none" />
                  );
                });
              })}

              {/* Agent-to-agent connections */}
              {selectedTeamConnections.map((conn) => {
                const fromPort = getPortPosition(conn.fromAgentId, 'output');
                const toPort = getPortPosition(conn.toAgentId, 'input');
                return (
                  <path key={conn.id} d={getBezierPath(fromPort.x, fromPort.y, toPort.x, toPort.y)} stroke="#69f6b8" strokeWidth="2.5" strokeOpacity="0.8" fill="none" markerEnd="url(#arrowhead)" />
                );
              })}

              {/* Temp connection while dragging */}
              {tempConnection && (
                <path d={getBezierPath(getPortPosition(tempConnection.fromId, 'output').x, getPortPosition(tempConnection.fromId, 'output').y, tempConnection.toX, tempConnection.toY)} stroke="#97a9ff" strokeWidth="2" strokeOpacity="0.7" strokeDasharray="5 5" fill="none" markerEnd="url(#arrowhead-temp)" />
              )}
            </svg>

            {/* Orchestrator */}
            <div className="absolute transform -translate-x-1/2 -translate-y-1/2 pointer-events-none" style={{ left: 500, top: 300 }}>
              <div className="relative w-16 h-16 rounded-full heat-gradient flex items-center justify-center shadow-[0_0_60px_-10px_rgba(255,86,55,0.5)]">
                <div className="absolute inset-0 rounded-full border-2 border-dashed border-white/20 animate-spin" style={{ animationDuration: '20s' }} />
                <Zap className="w-7 h-7 text-white" style={{ fill: 'currentColor' }} />
              </div>
              <p className="text-center mt-1.5 text-[9px] font-bold text-on-surface uppercase tracking-widest">ORCHESTRATOR</p>
            </div>

            {/* Team Nodes (Clusters) */}
            {teamsList.map((team) => {
              const pos = getPos(team.id);
              const isSelected = selectedNodes.has(team.id);
              const isHovered = hoveredAgent === team.id;
              return (
                <div
                  key={team.id}
                  className={`absolute transform -translate-x-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing transition-all duration-100 ${isSelected ? 'z-20' : 'z-10'}`}
                  style={{ left: pos.x, top: pos.y }}
                  onMouseDown={(e) => handleNodeMouseDown(e, team.id)}
                  onClick={(e) => handleNodeClick(e, team.id)}
                  onMouseEnter={() => setHoveredAgent(team.id)}
                  onMouseLeave={() => setHoveredAgent(null)}
                >
                  <div className={`flex flex-col items-center p-3 rounded-xl bg-secondary/20 border-2 transition-all ${isSelected ? 'border-secondary shadow-[0_0_30px_rgba(194,1,68,0.5)] scale-110' : 'border-secondary/30 hover:border-secondary/50'}`}>
                    <div className={`w-14 h-14 rounded-full flex items-center justify-center ${isSelected ? 'bg-secondary' : 'bg-secondary/80'}`}>
                      {getTopologyIcon(team.topology)}
                    </div>
                    <p className="text-center mt-2 text-[10px] font-bold text-on-surface uppercase tracking-wider truncate w-24">{team.name}</p>
                    <p className="text-[9px] text-on-surface-variant">{getAgentsByTeam(team.id).length} agents</p>
                  </div>
                </div>
              );
            })}

            {/* Agent Nodes */}
            {agentsList.map((agent) => {
              const pos = getPos(agent.id);
              const isSelected = selectedNodes.has(agent.id);
              const isHovered = hoveredAgent === agent.id;
              const isSource = connectionSource === agent.id;
              const agentTeam = getAgentTeam(agent.id);
              const hasTeam = !!agentTeam;

              // Show ports if: has team AND (team selected OR connection source OR connection mode)
              const showPorts = hasTeam && (selectedTeamId === agentTeam?.id || isSource || connectionMode);

              return (
                <div
                  key={agent.id}
                  className={`absolute transform -translate-x-1/2 -translate-y-1/2 transition-all duration-100 ${isSelected ? 'z-20' : 'z-10'}`}
                  style={{ left: pos.x, top: pos.y }}
                  onMouseDown={(e) => handleNodeMouseDown(e, agent.id)}
                  onClick={(e) => handleNodeClick(e, agent.id)}
                  onMouseEnter={() => { setHoveredAgent(agent.id); if (agentTeam?.id) setSelectedTeamId(agentTeam.id); }}
                  onMouseLeave={() => setHoveredAgent(null)}
                >
                  <div className={`relative flex flex-col items-center p-3 rounded-xl bg-surface-container border-2 transition-all ${isSelected ? 'border-primary shadow-[0_0_20px_rgba(151,169,255,0.4)]' : isHovered ? 'border-primary/50' : 'border-transparent'}`}>
                    {/* Input Port (left) - larger and easier to click */}
                    {showPorts && (
                      <div
                        className={`absolute w-6 h-6 rounded-full flex items-center justify-center cursor-crosshair transition-all -translate-x-full ${
                          isSource ? 'bg-secondary' : 'bg-tertiary/80 hover:bg-tertiary'
                        } border-2 border-white/30`}
                        style={{ left: -12, top: '50%', transform: 'translateY(-50%) translateX(-100%)' }}
                        onClick={(e) => handleAgentPortClick(e, agent.id, 'input')}
                        onMouseDown={(e) => e.stopPropagation()}
                        title="Input - click to connect"
                      >
                        <ArrowRight className="w-3 h-3 text-white" />
                      </div>
                    )}

                    {/* Output Port (right) - larger and easier to click */}
                    {showPorts && (
                      <div
                        className={`absolute w-6 h-6 rounded-full flex items-center justify-center cursor-crosshair transition-all translate-x-full ${
                          isSource ? 'bg-primary' : 'bg-secondary/80 hover:bg-secondary'
                        } border-2 border-white/30`}
                        style={{ right: -12, top: '50%', transform: 'translateY(-50%) translateX(100%)' }}
                        onClick={(e) => handleAgentPortClick(e, agent.id, 'output')}
                        onMouseDown={(e) => { e.stopPropagation(); handlePortDragStart(e, agent.id); }}
                        title="Output - click or drag to connect"
                      >
                        <ArrowRight className="w-3 h-3 text-white" />
                      </div>
                    )}

                    {/* Agent Avatar with status */}
                    <div className="relative">
                      <AgentAvatar name={agent.name} size="lg" />
                      <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-surface ${
                        agent.status === 'active' ? 'bg-primary animate-pulse' :
                        agent.status === 'processing' ? 'bg-tertiary animate-pulse' :
                        agent.status === 'success' ? 'bg-secondary' : 'bg-surface-container-high'
                      }`} />
                    </div>
                    <p className="text-center mt-2 text-[10px] font-mono text-on-surface uppercase tracking-wider truncate w-24">{agent.name.slice(0, 12)}</p>
                    {agentTeam && (
                      <p className="text-[8px] text-on-surface-variant mt-0.5">{agentTeam.name}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Zoom indicator */}
          <div className="absolute bottom-3 right-3 z-20 bg-surface-container/90 backdrop-blur-sm rounded-lg px-2.5 py-1 border border-outline-variant/15">
            <p className="text-[10px] font-mono text-on-surface-variant">{Math.round(zoom * 100)}%</p>
          </div>
        </div>

        {/* Connections Panel */}
        {showConnectionsPanel && (
          <div className="w-64 bg-surface-container-low border-l border-outline-variant/15 overflow-y-auto">
            <div className="p-3 border-b border-outline-variant/15 flex items-center justify-between">
              <h3 className="font-headline font-bold text-xs text-on-surface uppercase">Connections</h3>
              <button onClick={() => setShowConnectionsPanel(false)} className="p-1 hover:bg-surface-container rounded">
                <X className="w-4 h-4 text-on-surface-variant" />
              </button>
            </div>

            {selectedTeamId ? (
              <div className="p-3">
                <p className="text-[10px] text-on-surface-variant uppercase tracking-wider mb-2">
                  Team: {teamsList.find((t) => t.id === selectedTeamId)?.name}
                </p>

                {selectedTeamConnections.length > 0 ? (
                  <div className="space-y-1.5">
                    {selectedTeamConnections.map((conn) => {
                      const fromAgent = agentsList.find((a) => a.id === conn.fromAgentId);
                      const toAgent = agentsList.find((a) => a.id === conn.toAgentId);
                      return (
                        <div key={conn.id} className="flex items-center gap-2 p-2 bg-surface-container rounded group">
                          <ArrowRight className="w-3 h-3 text-secondary flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-mono text-on-surface truncate">{fromAgent?.name || '?'} → {toAgent?.name || '?'}</p>
                          </div>
                          <button onClick={() => removeConnection(selectedTeamId, conn.id)} className="p-1 opacity-0 group-hover:opacity-100 hover:bg-error/20 rounded">
                            <Trash2 className="w-3 h-3 text-error" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-6">
                    <Link2 className="w-6 h-6 text-on-surface-variant mx-auto mb-1.5 opacity-50" />
                    <p className="text-xs text-on-surface-variant">No connections</p>
                    <p className="text-[10px] text-on-surface-variant mt-1">Press C, then click output → input ports</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center p-4 text-center">
                <Unlink className="w-6 h-6 text-on-surface-variant mb-1.5 opacity-50" />
                <p className="text-xs text-on-surface-variant uppercase tracking-wider">Select a team</p>
                <p className="text-[10px] text-on-surface-variant mt-1">Click on a cluster to manage connections</p>
              </div>
            )}
          </div>
        )}

        {/* Details Panel */}
        <div className="w-72 bg-surface-container-low border-l border-outline-variant/15 overflow-y-auto">
          {selectedEntity ? (
            <div className="p-4">
              {selectedEntity.type === 'team' ? (
                <>
                  <div className="flex items-center gap-2.5 mb-4">
                    <div className="w-8 h-8 rounded-full bg-secondary/20 flex items-center justify-center">
                      {getTopologyIcon((selectedEntity.data as Team).topology)}
                    </div>
                    <div>
                      <h2 className="font-headline font-bold text-sm text-on-surface uppercase">{(selectedEntity.data as Team).name}</h2>
                      <span className="text-[9px] text-on-surface-variant uppercase">{(selectedEntity.data as Team).topology}</span>
                    </div>
                  </div>
                  <p className="text-xs text-on-surface-variant mb-3">{(selectedEntity.data as Team).description}</p>
                  <div className="mb-3">
                    <p className="text-[9px] text-on-surface-variant uppercase tracking-wider mb-1.5">Members ({getAgentsByTeam((selectedEntity.data as Team).id).length})</p>
                    <div className="space-y-1">
                      {getAgentsByTeam((selectedEntity.data as Team).id).map((agent) => (
                        <div key={agent.id} className="flex items-center gap-2 p-1.5 bg-surface-container rounded cursor-pointer hover:bg-surface-container-high" onClick={() => { setSelectedNodes(new Set([agent.id])); }}>
                          <AgentAvatar name={agent.name} size="sm" />
                          <span className="text-xs font-mono text-on-surface flex-1 truncate">{agent.name}</span>
                          <StatusChip status={agent.status} trabajoTerminado={agent.trabajoTerminado} size="sm" showLabel={false} />
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2.5 mb-3">
                    <AgentAvatar name={(selectedEntity.data as Agent).name} size="lg" />
                    <div>
                      <h2 className="font-headline font-bold text-sm text-on-surface uppercase">{(selectedEntity.data as Agent).name}</h2>
                      <StatusChip status={(selectedEntity.data as Agent).status} trabajoTerminado={(selectedEntity.data as Agent).trabajoTerminado} size="sm" />
                    </div>
                  </div>
                  <p className="text-xs text-on-surface-variant mb-3">{(selectedEntity.data as Agent).description || 'No description'}</p>
                  <div className="mb-3">
                    <p className="text-[9px] text-on-surface-variant uppercase tracking-wider mb-1">Skills</p>
                    <div className="flex flex-wrap gap-1">
                      {(selectedEntity.data as Agent).skills.map((skill) => (
                        <span key={skill} className="px-1.5 py-0.5 bg-surface-container text-[10px] font-mono text-primary border border-primary/20 rounded">{skill}</span>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mb-3 text-[9px]">
                    <div className="p-2 bg-surface-container rounded">
                      <span className="text-on-surface-variant">Team</span>
                      <p className="font-mono text-on-surface uppercase">{(selectedEntity.data as Agent).teamId ? teamsList.find((t) => t.id === (selectedEntity.data as Agent).teamId)?.name : 'None'}</p>
                    </div>
                    <div className="p-2 bg-surface-container rounded">
                      <span className="text-on-surface-variant">ID</span>
                      <p className="font-mono text-on-surface">{(selectedEntity.data as Agent).id.slice(0, 6).toUpperCase()}</p>
                    </div>
                  </div>
                  <div className="p-2 bg-surface-container-low rounded border-l-2 border-tertiary text-[9px]">
                    <span className="text-on-surface-variant">trabajo_terminado: </span>
                    <span className={(selectedEntity.data as Agent).trabajoTerminado ? 'text-secondary' : 'text-primary'}>{(selectedEntity.data as Agent).trabajoTerminado ? 'TRUE' : 'FALSE'}</span>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center p-4 text-center">
              <GitBranch className="w-8 h-8 text-on-surface-variant mb-2 opacity-30" />
              <p className="text-xs text-on-surface-variant uppercase tracking-wider">Select a node</p>
            </div>
          )}
        </div>
      </div>

      {/* New Cluster Modal */}
      {showNewClusterModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowNewClusterModal(false)} />
          <div className="relative bg-surface-container rounded-lg p-5 w-full max-w-md shadow-2xl border border-outline-variant/15">
            <h3 className="text-base font-headline font-bold text-on-surface uppercase mb-4">New Cluster</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-on-surface-variant mb-1.5">Cluster Name</label>
                <input type="text" value={newClusterName} onChange={(e) => setNewClusterName(e.target.value)} placeholder="e.g. DATA_PROCESSING" className="w-full px-3 py-2 bg-surface-container-low text-on-surface placeholder:text-on-surface-variant rounded font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-on-surface-variant mb-1.5">Topology Type</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['hierarchical', 'mesh', 'star', 'chain'] as const).map((type) => (
                    <button key={type} onClick={() => setNewClusterTopology(type)} className={`p-2 rounded text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 ${newClusterTopology === type ? 'bg-primary-container/20 text-primary border border-primary' : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container'}`}>
                      {getTopologyIcon(type)}{type}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setShowNewClusterModal(false)} className="btn-secondary text-xs">CANCEL</button>
              <button onClick={handleCreateCluster} className="btn-primary text-xs">CREATE</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}