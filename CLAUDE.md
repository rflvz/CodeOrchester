# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CodeOrchester is an Electron desktop application for orchestrating multiple AI agents using Claude CLI and MiniMax API. It provides a visual interface to manage agent teams, terminal sessions, skills, and automation workflows.

## Linear Project

**Project**: CodeOrchester
**Team**: DAW (publico/grupal)
**URL**: https://linear.app/clasificadoria/project/codeorchester-41e4bbc47c45

### Linear Issues (Backend Rust Migration)

| ID | Title | Labels |
|----|-------|--------|
| [DAW-543](https://linear.app/clasificadoria/issue/DAW-543) | [Epic] Migración Backend Electron a Rust | epic, backend, rust |
| [DAW-544](https://linear.app/clasificadoria/issue/DAW-544) | [IPC] Capa WebSocket entre Rust y Electron | backend, rust, electron |
| [DAW-545](https://linear.app/clasificadoria/issue/DAW-545) | [State] State Manager centralizado en Rust | backend, rust |
| [DAW-546](https://linear.app/clasificadoria/issue/DAW-546) | [PTY Manager] Implementar PTY Manager en Rust | backend, rust |
| [DAW-547](https://linear.app/clasificadoria/issue/DAW-547) | [Claude CLI] Integración robusta con Claude CLI | backend, rust, api-integration |
| [DAW-548](https://linear.app/clasificadoria/issue/DAW-548) | [MiniMax] Cliente Rust para MiniMax API | backend, rust, api-integration |
| [DAW-549](https://linear.app/clasificadoria/issue/DAW-549) | [Security] Hardening y validación de input | backend, rust, security |

## Development Commands

```bash
npm run dev          # Run in development mode (Vite + Electron concurrently)
npm run electron:dev # Run Electron with TypeScript compilation
npm run build        # Production build (Electron TS + Vite + electron-builder)
npm run electron:build  # Compile TypeScript for Electron main/preload
npm run build:vite   # Build Vite/React frontend only
```

## Planned Architecture (Rust Backend)

```
Electron Renderer (React)
       │
       │ WebSocket
       ▼
┌─────────────────────────────────────────┐
│           Rust Backend                   │
│                                         │
│ ├── pty-manager    (portable-pty)       │
│ ├── claude-cli     (CLI integration)    │
│ ├── minimax-client (API client)         │
│ ├── ipc            (WebSocket server)  │
│ ├── state          (Agent/Team state)   │
│ └── security       (validation)          │
└─────────────────────────────────────────┘
```

## Architecture

### Electron Main Process (`electron/main.ts`)
- Manages `node-pty` terminal sessions (PTY pool via `Map<string, IPty>`)
- Handles IPC for PTY operations: `start-pty`, `write-pty`, `resize-pty`, `kill-pty`
- Exposes `MINIMAX_API_KEY` env var to PTY sessions
- Parses `trabajo_terminado=true/false` from PTY output to signal agent completion
- Native notifications via Electron Notification API
- External link opening via shell

### Preload API (`electron/preload.ts`)
Typed API exposed via `contextBridge.exposeInMainWorld('electron', api)`:
```typescript
interface ElectronAPI {
  startPty: (sessionId: string, cwd?: string) => Promise<{ success: boolean; pid?: number }>;
  writePty: (sessionId: string, data: string) => Promise<{ success: boolean }>;
  resizePty: (sessionId: string, cols: number, rows: number) => Promise<{ success: boolean }>;
  killPty: (sessionId: string) => Promise<{ success: boolean }>;
  showNotification: (title: string, body: string) => Promise<{ success: boolean }>;
  openExternal: (url: string) => Promise<{ success: boolean }>;
  onPtyData: (callback: (data: { sessionId: string; data: string }) => void) => void;
  onPtyExit: (callback: (data: { sessionId: string; exitCode: number }) => void) => void;
  onTrabajoTerminado: (callback: (data: { sessionId: string; value: boolean }) => void) => void;
}
```

### State Management (Zustand)

All stores use normalized entity patterns (`Record<string, Entity>`):

| Store | Key Entities | Purpose |
|-------|-------------|---------|
| `agentStore` | Agent | Individual AI agents with status, skills, currentTask |
| `teamStore` | Team | Agent teams with topology (hierarchical/mesh/star/chain) |
| `skillStore` | Skill | Agent capabilities by category |
| `terminalStore` | TerminalSession | PTY sessions linked to agents |
| `notificationStore` | Notification | System notifications |
| `uiStore` | - | Navigation (Screen type), sidebar, right panel state |

### Navigation (`uiStore.ts`)
Single-page app with screen-based routing:
```typescript
type Screen = 'dashboard' | 'topology' | 'chat' | 'agents' | 'skills' | 'automations' | 'codemonitor' | 'settings';
```

### Key Files
- `src/components/Layout/MainStage.tsx` - Renders current screen based on `currentScreen`
- `src/components/Layout/Sidebar.tsx` - Navigation with collapsible sidebar
- `src/types/index.ts` - Core TypeScript interfaces (Agent, Team, Skill, Task, TerminalSession, Message)

### Theme
Dark theme using Tailwind custom colors (defined in `tailwind.config.js`):
- Background: `#0c0e11`, Surface: `#171a1d`
- Primary: `#97a9ff` (purple-blue), Secondary: `#69f6b8` (green), Tertiary: `#ffb148` (orange)
- Fonts: Space Grotesk (headlines), Inter (body), JetBrains Mono (code)

## Installed Skills

### Spec-Driven Development
| Skill | Purpose |
|-------|---------|
| `create-specification` | Create specs from requirements |
| `update-specification` | Update existing specs |
| `create-github-issue-feature-from-specification` | Create GitHub issues from specs |
| `test-driven-development` | TDD workflow (Red-Green-Refactor) |

### Rust
| Skill | Purpose |
|-------|---------|
| `rust-engineer` | Rust development best practices |
| `rust-best-practices` | Apollo GraphQL Rust guidelines |

### Frontend (React/TypeScript/Electron)
| Skill | Purpose |
|-------|---------|
| `vercel-react-best-practices` | React patterns and best practices |
| `electron` | Electron app development |
| `javascript-typescript-jest` | JS/TS testing with Jest |
| `typescript-advanced-types` | Advanced TypeScript patterns |
| `tailwind-design-system` | Tailwind CSS design system |

### Anthropic/Claude
| Skill | Purpose |
|-------|---------|
| `claude-api` | Claude API integration patterns |
| `git-guardrails-claude-code` | Git safety guardrails for Claude Code |

### Agent Management
| Skill | Purpose |
|-------|---------|
| `create-agentsmd` | Create agents.md documentation |
| `agent-governance` | Agent governance patterns |

### Stitch (UI/Design)
| Skill | Purpose |
|-------|---------|
| `stitch-loop` | Stitch loop patterns |
| `stitch-design` | Stitch design system |

## Important Patterns

1. **PTY Session Lifecycle**: Sessions created via `terminalStore.createSession()` → `electron.startPty()` → PTY runs → `electron.onPtyData()` streams output → `electron.onTrabajoTerminado()` signals completion
2. **Agent-Team Association**: Agents belong to teams via `agent.teamId`; teams maintain `agents: string[]` array
3. **trabajo_terminado Flag**: When Claude CLI outputs `trabajo_terminado=true`, the main process sends event to renderer which updates agent status to 'success'
