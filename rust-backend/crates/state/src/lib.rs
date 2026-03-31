//! Centralised, thread-safe state management for the CodeOrchester Rust backend.
//!
//! # Overview
//!
//! The [`manager::StateManager`] is the single source of truth for runtime state:
//! - **Agents** — AI agents with status, skills, and team membership.
//! - **Teams** — Groups of agents with a collaboration topology.
//! - **Sessions** — Active PTY sessions linked to agents.
//!
//! All mutations broadcast a typed [`events::StateEvent`] via a `tokio::sync::broadcast`
//! channel so that any subscriber (e.g. the IPC WebSocket layer) can propagate changes
//! to the Electron renderer.
//!
//! # Example
//!
//! ```rust,no_run
//! use std::sync::Arc;
//! use state::{
//!     manager::StateManager,
//!     entities::{Agent, AgentStatus},
//!     events::StateEvent,
//! };
//!
//! #[tokio::main]
//! async fn main() {
//!     let mgr = StateManager::new();
//!     let mut rx = mgr.subscribe();
//!
//!     let agent = Agent {
//!         id: "agent-1".into(),
//!         name: "Worker".into(),
//!         status: AgentStatus::Idle,
//!         team_id: None,
//!         skills: vec![],
//!         current_task: None,
//!     };
//!     mgr.create_agent(agent).unwrap();
//!
//!     if let Ok(StateEvent::AgentCreated { agent }) = rx.recv().await {
//!         println!("Agent created: {}", agent.name);
//!     }
//! }
//! ```

pub mod entities;
pub mod events;
pub mod manager;
pub mod persistence;

// Convenience re-exports at crate root.
pub use entities::{Agent, AgentStatus, Session, Team, Topology};
pub use events::StateEvent;
pub use manager::{StateError, StateManager};
pub use persistence::PersistenceError;
