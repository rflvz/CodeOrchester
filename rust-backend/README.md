# CodeOrchestra – Rust Backend

This workspace replaces the Node.js/Electron main-process backend with a high-performance Rust binary that communicates with the Electron renderer over a local WebSocket connection.

## Architecture

```
Electron Renderer (React)
       │
       │ WebSocket (localhost)
       ▼
┌──────────────────────────────────────────┐
│         codeorchestra-backend            │  ← src/main.rs
│                                          │
│  ├── crates/ipc          (DAW-544)       │  WebSocket server
│  ├── crates/state        (DAW-545)       │  Centralised agent/team store
│  ├── crates/pty-manager  (DAW-546)       │  portable-pty sessions
│  ├── crates/claude-cli   (DAW-547)       │  Claude CLI integration
│  ├── crates/minimax      (DAW-548)       │  MiniMax API client
│  └── crates/security     (DAW-549)       │  Input validation & hardening
└──────────────────────────────────────────┘
```

## Crate Overview

| Crate | Linear | Purpose |
|-------|--------|---------|
| `ipc` | DAW-544 | `tokio-tungstenite` WebSocket server; mirrors the `electron/preload.ts` API surface |
| `state` | DAW-545 | Thread-safe `DashMap` store for agents, teams, and PTY sessions; broadcast events |
| `pty-manager` | DAW-546 | Cross-platform PTY pool using `portable-pty`; detects `trabajo_terminado` sentinel |
| `claude-cli` | DAW-547 | Locates, spawns, and parses output from the `claude` CLI binary |
| `minimax` | DAW-548 | `reqwest`-based MiniMax REST client with rate-limiting and retry |
| `security` | DAW-549 | Validates session IDs, payload sizes, URLs, env vars, and working-directory paths |

## Development

### Prerequisites

- Rust 1.78+ (`rustup update stable`)
- The `claude` CLI binary on `PATH` (for `claude-cli` integration tests)
- `MINIMAX_API_KEY` environment variable (for `minimax` integration tests)

### Build

```bash
cd rust-backend
cargo build
```

### Test

```bash
cargo test
```

### Run

```bash
cargo run --bin codeorchestra-backend
```

Set `RUST_LOG=debug` for verbose logging.

## Implementation Status

All crates are scaffolded and compile.  Functions marked `todo!("DAW-NNN: …")` are
pending implementation in their respective Linear issues.

| Crate | Status |
|-------|--------|
| `state` | Fully implemented (entities, manager, persistence, events) |
| `ipc` | Scaffold: message protocol + encode/decode; WebSocket server pending (DAW-544) |
| `pty-manager` | Scaffold: types + pool structure; PTY spawn/write/kill pending (DAW-546) |
| `claude-cli` | Scaffold: types + sentinel parser; CLI spawn pending (DAW-547) |
| `minimax` | Scaffold: types + key validation; HTTP calls pending (DAW-548) |
| `security` | Fully implemented: validators for session IDs, payloads, URLs, paths, env vars |
