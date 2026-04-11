//! PTY session state held inside [`PtyManager`](crate::manager::PtyManager).

use portable_pty::PtySize;
use serde::{Deserialize, Serialize};
use tokio::sync::broadcast;

/// The current size of a PTY window.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub struct TerminalSize {
    pub cols: u16,
    pub rows: u16,
}

impl Default for TerminalSize {
    fn default() -> Self {
        Self { cols: 80, rows: 24 }
    }
}

impl From<TerminalSize> for PtySize {
    fn from(s: TerminalSize) -> Self {
        PtySize {
            rows: s.rows,
            cols: s.cols,
            pixel_width: 0,
            pixel_height: 0,
        }
    }
}

/// A single chunk of output produced by a PTY session.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PtyOutput {
    /// The session this output belongs to.
    pub session_id: String,
    /// Raw bytes from the PTY (typically UTF-8, but not guaranteed).
    pub data: Vec<u8>,
}

/// Internal state for a live PTY session.
///
/// This struct is intentionally non-`Clone` because it owns OS resources
/// (the PTY pair and the child process handle).
pub struct PtySession {
    /// Unique identifier for this session.
    pub id: String,

    /// Process ID of the shell spawned inside the PTY.
    pub pid: Option<u32>,

    /// Current terminal window size.
    pub size: TerminalSize,

    /// Broadcast sender for PTY output.
    ///
    /// Kept alive here so that the channel is not closed while the session
    /// exists.  Dropping this field terminates all active [`stream_output`]
    /// consumers.
    ///
    /// [`stream_output`]: crate::manager::PtyManager::stream_output
    pub(crate) output_tx: broadcast::Sender<PtyOutput>,

    /// Writer to the PTY master — taken once via `take_writer()` and stored
    /// here for re-use across multiple [`write_pty`] calls.
    ///
    /// Wrapped in `Option` so it can be moved into `spawn_blocking` and
    /// returned afterwards.
    ///
    /// [`write_pty`]: crate::manager::PtyManager::write_pty
    pub(crate) writer: Option<Box<dyn std::io::Write + Send>>,

    /// The portable-pty master side — used for resizing.
    pub(crate) master: Box<dyn portable_pty::MasterPty + Send>,

    /// The child process — used for sending signals (kill).
    pub(crate) child: Box<dyn portable_pty::Child + Send>,
}

impl std::fmt::Debug for PtySession {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("PtySession")
            .field("id", &self.id)
            .field("pid", &self.pid)
            .field("size", &self.size)
            .field("writer", &self.writer.as_ref().map(|_| "<writer>"))
            .finish_non_exhaustive()
    }
}
