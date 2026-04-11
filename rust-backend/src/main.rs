//! # CodeOrchestra Rust Backend
//!
//! Entry point for the Rust backend that replaces the Node.js/Electron main
//! process. It spins up all subsystems and listens for WebSocket connections
//! from the Electron renderer.
//!
//! ## Subsystems
//! - **pty-manager** – portable-pty based terminal sessions
//! - **claude-cli**  – robust integration with the Claude CLI binary
//! - **minimax**     – MiniMax API client with rate-limiting and retry
//! - **ipc**         – WebSocket server (Electron renderer ↔ Rust)
//! - **state**       – centralised, thread-safe agent/team/session store
//! - **security**    – input validation and sandboxing helpers

use tracing::info;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Initialise structured logging (respects RUST_LOG env var).
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info".into()),
        )
        .init();

    info!("CodeOrchestra Rust backend starting…");

    // TODO(DAW-545): Initialise StateManager and load persisted state.
    let _state = state::StateManager::new();

    // TODO(DAW-544): Start IPC WebSocket server and connect subsystems.
    // TODO(DAW-546): Initialise PTY manager.
    // TODO(DAW-547): Initialise Claude CLI integrator.
    // TODO(DAW-548): Initialise MiniMax client.
    // TODO(DAW-549): Apply security hardening / input validation.

    info!("All subsystems initialised – waiting for connections");

    // Park the main task until a shutdown signal is received.
    tokio::signal::ctrl_c().await?;
    info!("Shutdown signal received, exiting");

    Ok(())
}
