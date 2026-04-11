//! [`PtyManager`] — thread-safe registry of active PTY sessions.

use std::{
    collections::HashMap,
    path::PathBuf,
    sync::Arc,
};

use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use tokio::sync::{broadcast, Mutex};
use tokio_stream::wrappers::errors::BroadcastStreamRecvError;
use tokio_stream::{wrappers::BroadcastStream, Stream};
use tracing::{debug, error, info, warn};

use crate::{
    error::PtyError,
    session::{PtyOutput, PtySession, TerminalSize},
};

/// Capacity of the per-session broadcast channel.
///
/// Old messages are dropped for slow consumers (lag tolerance).
const BROADCAST_CAPACITY: usize = 256;

/// Default shell command used when creating a PTY session.
#[cfg(target_os = "windows")]
fn default_shell() -> &'static str {
    "cmd.exe"
}

#[cfg(not(target_os = "windows"))]
fn default_shell() -> &'static str {
    "/bin/bash"
}

/// Thread-safe manager for PTY sessions.
///
/// All public methods are `async` and safe to call from multiple Tokio tasks
/// simultaneously.  The internal `HashMap` is protected by a
/// `tokio::sync::Mutex` wrapped in an `Arc` so clones share the same state.
///
/// Output is broadcast over a `tokio::sync::broadcast` channel, allowing
/// multiple independent consumers per session via [`stream_output`](Self::stream_output).
///
/// # Example
///
/// ```rust,no_run
/// use pty_manager::PtyManager;
/// use tokio_stream::StreamExt;
///
/// #[tokio::main]
/// async fn main() {
///     let manager = PtyManager::new();
///
///     let (_id, mut stream) = manager
///         .create_pty("session-1".into(), None)
///         .await
///         .unwrap();
///
///     manager.write_pty("session-1".into(), "echo hello\n".into()).await.unwrap();
///
///     while let Some(Ok(chunk)) = stream.next().await {
///         print!("{}", String::from_utf8_lossy(&chunk.data));
///     }
/// }
/// ```
#[derive(Clone)]
pub struct PtyManager {
    sessions: Arc<Mutex<HashMap<String, PtySession>>>,
}

impl Default for PtyManager {
    fn default() -> Self {
        Self::new()
    }
}

impl PtyManager {
    /// Create a new, empty `PtyManager`.
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Spawn a new PTY session.
    ///
    /// # Parameters
    /// - `session_id` — Caller-chosen identifier (must be unique).
    /// - `cwd` — Working directory for the shell. Falls back to the current
    ///   process directory when `None` or when the path does not exist.
    ///
    /// # Returns
    /// A tuple of `(session_id, output_stream)` where `output_stream` yields
    /// every [`PtyOutput`] produced by the spawned shell.  Additional
    /// independent streams can be obtained via [`stream_output`](Self::stream_output).
    ///
    /// # Errors
    /// - [`PtyError::SessionAlreadyExists`] if `session_id` is already in use.
    /// - [`PtyError::Backend`] if the PTY system cannot be initialised.
    /// - [`PtyError::SpawnFailed`] if the shell process cannot be started.
    pub async fn create_pty(
        &self,
        session_id: String,
        cwd: Option<String>,
    ) -> Result<(String, impl Stream<Item = Result<PtyOutput, BroadcastStreamRecvError>>), PtyError>
    {
        let mut sessions = self.sessions.lock().await;

        if sessions.contains_key(&session_id) {
            return Err(PtyError::SessionAlreadyExists(session_id));
        }

        // Resolve the working directory.
        let resolved_cwd: PathBuf = match cwd {
            Some(ref path) => {
                let p = PathBuf::from(path);
                if p.is_dir() {
                    p
                } else {
                    warn!(
                        session_id = %session_id,
                        cwd = %path,
                        "provided cwd does not exist — falling back to current dir"
                    );
                    std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
                }
            }
            None => std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")),
        };

        let default_size = TerminalSize::default();
        let pty_size = PtySize::from(default_size);

        // Allocate the PTY pair.
        let pty_system = native_pty_system();
        let pair = pty_system
            .openpty(pty_size)
            .map_err(|e| PtyError::Backend(e.to_string()))?;

        // Build the child command.
        let mut cmd = CommandBuilder::new(default_shell());
        cmd.cwd(&resolved_cwd);

        // Spawn the shell into the PTY slave.
        let child = pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| PtyError::SpawnFailed(e.to_string()))?;

        let pid = child.process_id();

        // Take the writer before cloning the reader (order important on some backends).
        let writer = pair
            .master
            .take_writer()
            .map_err(|e| PtyError::Backend(e.to_string()))?;

        // Clone the reader for the drain task.
        let mut reader = pair
            .master
            .try_clone_reader()
            .map_err(|e| PtyError::Backend(e.to_string()))?;

        // Broadcast channel — supports multiple independent consumers.
        let (output_tx, output_rx) = broadcast::channel::<PtyOutput>(BROADCAST_CAPACITY);

        // Spawn a blocking task to drain the PTY reader into the broadcast channel.
        let tx_clone = output_tx.clone();
        let id_clone = session_id.clone();
        tokio::task::spawn_blocking(move || {
            let mut buf = [0u8; 4096];
            loop {
                match std::io::Read::read(&mut reader, &mut buf) {
                    Ok(0) => {
                        debug!(session_id = %id_clone, "PTY reader reached EOF");
                        break;
                    }
                    Ok(n) => {
                        let chunk = PtyOutput {
                            session_id: id_clone.clone(),
                            data: buf[..n].to_vec(),
                        };
                        // Lagged receivers are automatically evicted by broadcast.
                        if tx_clone.send(chunk).is_err() {
                            debug!(
                                session_id = %id_clone,
                                "no active broadcast subscribers — stopping reader task"
                            );
                            break;
                        }
                    }
                    Err(e) => {
                        error!(session_id = %id_clone, error = %e, "PTY read error");
                        break;
                    }
                }
            }
        });

        let session = PtySession {
            id: session_id.clone(),
            pid,
            size: default_size,
            output_tx,
            writer: Some(writer),
            master: pair.master,
            child,
        };

        sessions.insert(session_id.clone(), session);
        info!(
            session_id = %session_id,
            pid = ?pid,
            cwd = %resolved_cwd.display(),
            "PTY session created"
        );

        let stream = BroadcastStream::new(output_rx);
        Ok((session_id, stream))
    }

    /// Write raw bytes to an existing PTY session.
    ///
    /// The call blocks the async runtime minimally — the actual I/O is
    /// offloaded to a `spawn_blocking` task.
    ///
    /// # Errors
    /// - [`PtyError::SessionNotFound`] if `session_id` does not exist.
    /// - [`PtyError::Backend`] if the session writer is unavailable.
    /// - [`PtyError::Io`] on write failure.
    pub async fn write_pty(&self, session_id: String, data: String) -> Result<(), PtyError> {
        let mut sessions = self.sessions.lock().await;
        let session = sessions
            .get_mut(&session_id)
            .ok_or_else(|| PtyError::SessionNotFound(session_id.clone()))?;

        // Take the writer out of the Option so it can cross into spawn_blocking.
        let mut writer = session
            .writer
            .take()
            .ok_or_else(|| PtyError::Backend("PTY writer already consumed".into()))?;

        let data_bytes = data.into_bytes();

        // Run the synchronous write in a dedicated blocking thread.
        let (result, writer_back) = tokio::task::spawn_blocking(move || {
            use std::io::Write;
            let r = writer.write_all(&data_bytes).and_then(|_| writer.flush());
            (r, writer)
        })
        .await
        .map_err(|e| PtyError::Backend(e.to_string()))?;

        // Restore the writer for the next call.
        session.writer = Some(writer_back);

        result?;
        debug!(session_id = %session_id, "wrote data to PTY");
        Ok(())
    }

    /// Resize the terminal window of an existing PTY session.
    ///
    /// # Errors
    /// - [`PtyError::SessionNotFound`] if `session_id` does not exist.
    /// - [`PtyError::InvalidSize`] if `cols` or `rows` is zero.
    /// - [`PtyError::Backend`] if the resize syscall fails.
    pub async fn resize_pty(
        &self,
        session_id: String,
        cols: u16,
        rows: u16,
    ) -> Result<(), PtyError> {
        if cols == 0 || rows == 0 {
            return Err(PtyError::InvalidSize);
        }

        let mut sessions = self.sessions.lock().await;
        let session = sessions
            .get_mut(&session_id)
            .ok_or_else(|| PtyError::SessionNotFound(session_id.clone()))?;

        let new_size = PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        };

        session
            .master
            .resize(new_size)
            .map_err(|e| PtyError::Backend(e.to_string()))?;

        session.size = TerminalSize { cols, rows };
        debug!(session_id = %session_id, cols, rows, "PTY resized");
        Ok(())
    }

    /// Kill an existing PTY session and remove it from the registry.
    ///
    /// Dropping the session closes the broadcast sender, signalling EOF to all
    /// active [`stream_output`](Self::stream_output) consumers.
    ///
    /// # Errors
    /// - [`PtyError::SessionNotFound`] if `session_id` does not exist.
    /// - [`PtyError::Backend`] if the kill syscall fails.
    pub async fn kill_pty(&self, session_id: String) -> Result<(), PtyError> {
        let mut sessions = self.sessions.lock().await;
        let mut session = sessions
            .remove(&session_id)
            .ok_or_else(|| PtyError::SessionNotFound(session_id.clone()))?;

        session
            .child
            .kill()
            .map_err(|e| PtyError::Backend(e.to_string()))?;

        info!(session_id = %session_id, "PTY session killed");
        // Dropping `session` closes `output_tx` (broadcast sender), terminating all streams.
        drop(session);
        Ok(())
    }

    /// Subscribe to the output stream of an existing PTY session.
    ///
    /// Each call returns an independent stream backed by the same broadcast
    /// channel, so multiple concurrent consumers are fully supported.
    /// Slow consumers may experience [`broadcast::error::RecvError::Lagged`] gaps.
    ///
    /// # Errors
    /// - [`PtyError::SessionNotFound`] if `session_id` does not exist.
    pub async fn stream_output(
        &self,
        session_id: String,
    ) -> Result<impl Stream<Item = Result<PtyOutput, BroadcastStreamRecvError>>, PtyError> {
        let sessions = self.sessions.lock().await;
        let session = sessions
            .get(&session_id)
            .ok_or_else(|| PtyError::SessionNotFound(session_id.clone()))?;

        let rx = session.output_tx.subscribe();
        Ok(BroadcastStream::new(rx))
    }

    /// Return a snapshot of all active session IDs.
    pub async fn session_ids(&self) -> Vec<String> {
        self.sessions.lock().await.keys().cloned().collect()
    }

    /// Check whether a session with the given ID is currently active.
    pub async fn contains(&self, session_id: &str) -> bool {
        self.sessions.lock().await.contains_key(session_id)
    }
}
