//! # pty-manager
//!
//! Cross-platform PTY session management using `portable-pty`.
//! This crate replaces the `node-pty` dependency in the original Electron
//! main process (see `electron/main.ts`).
//!
//! ## Responsibilities (DAW-546)
//! - Spawn PTY sessions with configurable shell, working-directory, and env
//! - Stream output (`PtyOutput`) to async consumers via tokio channels
//! - Detect `trabajo_terminado=true/false` sentinel in PTY output
//! - Resize, write to, and kill individual sessions
//! - Manage a pool of named sessions (`Map<session_id, PtySession>`)

use std::collections::HashMap;
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use thiserror::Error;
use tokio::sync::{broadcast, Mutex};
use uuid::Uuid;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/// Unique identifier for a PTY session (mirrors the JS `sessionId` string).
pub type SessionId = String;

/// Size of a PTY in columns × rows.
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct PtySize {
    pub cols: u16,
    pub rows: u16,
}

impl Default for PtySize {
    fn default() -> Self {
        Self { cols: 80, rows: 24 }
    }
}

/// Configuration used to spawn a new PTY session.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpawnConfig {
    /// Working directory for the spawned process.
    pub cwd: Option<String>,
    /// Additional environment variables.
    pub env: HashMap<String, String>,
    /// Initial terminal size.
    pub size: PtySize,
    /// Shell / command to run (defaults to the system shell).
    pub command: Option<String>,
}

impl Default for SpawnConfig {
    fn default() -> Self {
        Self {
            cwd: None,
            env: HashMap::new(),
            size: PtySize::default(),
            command: None,
        }
    }
}

/// Data emitted by an active PTY session.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PtyOutput {
    pub session_id: SessionId,
    /// Raw bytes decoded as UTF-8 (lossy).
    pub data: String,
}

/// Signals that a Claude CLI session finished its task.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrabajoTerminado {
    pub session_id: SessionId,
    /// `true` → success, `false` → failure.
    pub value: bool,
}

/// Errors produced by [`PtyManager`].
#[derive(Debug, Error)]
pub enum PtyError {
    #[error("session not found: {0}")]
    SessionNotFound(SessionId),

    #[error("spawn failed: {0}")]
    SpawnFailed(String),

    #[error("write failed: {0}")]
    WriteFailed(String),

    #[error("resize failed: {0}")]
    ResizeFailed(String),
}

// ---------------------------------------------------------------------------
// PtyManager
// ---------------------------------------------------------------------------

/// Thread-safe pool of PTY sessions.
///
/// Wrap in [`Arc`] to share across async tasks.
///
/// # Example (future)
/// ```rust,ignore
/// let mgr = PtyManager::new();
/// let id = mgr.spawn("my-session", SpawnConfig::default()).await?;
/// mgr.write(&id, b"echo hello\n").await?;
/// mgr.kill(&id).await?;
/// ```
pub struct PtyManager {
    /// Active sessions keyed by [`SessionId`].
    sessions: Mutex<HashMap<SessionId, PtySessionHandle>>,
    /// Broadcast channel for raw PTY output.
    output_tx: broadcast::Sender<PtyOutput>,
    /// Broadcast channel for `trabajo_terminado` events.
    trabajo_tx: broadcast::Sender<TrabajoTerminado>,
}

/// Internal handle for a single PTY session.
#[allow(dead_code)]
struct PtySessionHandle {
    /// OS process ID of the child process.
    pub pid: Option<u32>,
    /// Resolved working directory.
    pub cwd: Option<String>,
}

impl PtyManager {
    const BROADCAST_CAPACITY: usize = 512;

    /// Create a new, empty PTY manager.
    pub fn new() -> Arc<Self> {
        let (output_tx, _) = broadcast::channel(Self::BROADCAST_CAPACITY);
        let (trabajo_tx, _) = broadcast::channel(Self::BROADCAST_CAPACITY);
        Arc::new(Self {
            sessions: Mutex::new(HashMap::new()),
            output_tx,
            trabajo_tx,
        })
    }

    /// Spawn a new PTY session with the given ID and configuration.
    ///
    /// # TODO (DAW-546)
    /// Replace the placeholder implementation with a real `portable-pty` spawn.
    pub async fn spawn(
        &self,
        session_id: impl Into<SessionId>,
        config: SpawnConfig,
    ) -> Result<u32, PtyError> {
        let id = session_id.into();
        // TODO(DAW-546): replace with real portable-pty spawn
        todo!("DAW-546: spawn portable-pty child for session {id} with config {config:?}")
    }

    /// Write raw bytes to an active PTY session.
    ///
    /// # TODO (DAW-546)
    pub async fn write(&self, session_id: &str, data: &[u8]) -> Result<(), PtyError> {
        let sessions = self.sessions.lock().await;
        if !sessions.contains_key(session_id) {
            return Err(PtyError::SessionNotFound(session_id.to_owned()));
        }
        todo!("DAW-546: write {data:?} to PTY session {session_id}")
    }

    /// Resize an active PTY session.
    ///
    /// # TODO (DAW-546)
    pub async fn resize(&self, session_id: &str, size: PtySize) -> Result<(), PtyError> {
        let sessions = self.sessions.lock().await;
        if !sessions.contains_key(session_id) {
            return Err(PtyError::SessionNotFound(session_id.to_owned()));
        }
        todo!("DAW-546: resize PTY session {session_id} to {size:?}")
    }

    /// Kill and remove a PTY session.
    ///
    /// # TODO (DAW-546)
    pub async fn kill(&self, session_id: &str) -> Result<(), PtyError> {
        let mut sessions = self.sessions.lock().await;
        sessions
            .remove(session_id)
            .ok_or_else(|| PtyError::SessionNotFound(session_id.to_owned()))?;
        todo!("DAW-546: terminate the OS process for session {session_id}")
    }

    /// Subscribe to raw PTY output from all sessions.
    pub fn subscribe_output(&self) -> broadcast::Receiver<PtyOutput> {
        self.output_tx.subscribe()
    }

    /// Subscribe to `trabajo_terminado` events from all sessions.
    pub fn subscribe_trabajo(&self) -> broadcast::Receiver<TrabajoTerminado> {
        self.trabajo_tx.subscribe()
    }

    /// Generate a new random session ID (UUID v4).
    pub fn new_session_id() -> SessionId {
        Uuid::new_v4().to_string()
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn new_session_id_is_valid_uuid_v4_shape() {
        let id = PtyManager::new_session_id();
        // UUID v4 format: 8-4-4-4-12 hex chars separated by hyphens (36 total)
        assert_eq!(id.len(), 36);
        let parts: Vec<&str> = id.split('-').collect();
        assert_eq!(parts.len(), 5);
        assert_eq!(parts[0].len(), 8);
        assert_eq!(parts[1].len(), 4);
        assert_eq!(parts[2].len(), 4);
        assert_eq!(parts[3].len(), 4);
        assert_eq!(parts[4].len(), 12);
        for part in &parts {
            assert!(part.chars().all(|c| c.is_ascii_hexdigit()));
        }
    }

    #[test]
    fn new_session_ids_are_unique() {
        let id1 = PtyManager::new_session_id();
        let id2 = PtyManager::new_session_id();
        assert_ne!(id1, id2, "two generated session IDs must be distinct");
    }

    #[test]
    fn pty_manager_new_returns_arc() {
        // Verify we get a valid, non-null Arc back
        let mgr = PtyManager::new();
        // We can subscribe without panicking
        let _rx = mgr.subscribe_output();
        let _rx2 = mgr.subscribe_trabajo();
    }

    #[test]
    fn subscribe_output_returns_receiver() {
        let mgr = PtyManager::new();
        let _rx = mgr.subscribe_output();
        // A second subscriber must also succeed
        let _rx2 = mgr.subscribe_output();
    }

    #[test]
    fn subscribe_trabajo_returns_receiver() {
        let mgr = PtyManager::new();
        let _rx = mgr.subscribe_trabajo();
        let _rx2 = mgr.subscribe_trabajo();
    }

    #[test]
    fn pty_size_default_is_80x24() {
        let size = PtySize::default();
        assert_eq!(size.cols, 80);
        assert_eq!(size.rows, 24);
    }

    #[test]
    fn spawn_config_default_has_empty_env() {
        let cfg = SpawnConfig::default();
        assert!(cfg.env.is_empty());
        assert!(cfg.cwd.is_none());
        assert!(cfg.command.is_none());
    }

    #[tokio::test]
    async fn write_on_unknown_session_returns_not_found() {
        let mgr = PtyManager::new();
        // sessions map is empty, so write must return SessionNotFound before
        // reaching the todo!() branch.
        let result = mgr.write("no-such-session", b"data").await;
        assert!(matches!(result, Err(PtyError::SessionNotFound(_))));
    }

    #[tokio::test]
    async fn resize_on_unknown_session_returns_not_found() {
        let mgr = PtyManager::new();
        let result = mgr.resize("no-such-session", PtySize::default()).await;
        assert!(matches!(result, Err(PtyError::SessionNotFound(_))));
    }

    #[tokio::test]
    async fn kill_on_unknown_session_returns_not_found() {
        let mgr = PtyManager::new();
        let result = mgr.kill("no-such-session").await;
        assert!(matches!(result, Err(PtyError::SessionNotFound(_))));
    }
}
