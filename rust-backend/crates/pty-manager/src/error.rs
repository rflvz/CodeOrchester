//! Error types for the PTY Manager crate.

use thiserror::Error;

/// All errors that can be produced by the PTY Manager.
#[derive(Debug, Error)]
pub enum PtyError {
    /// A session with the given ID does not exist.
    #[error("session not found: {0}")]
    SessionNotFound(String),

    /// A session with the given ID already exists.
    #[error("session already exists: {0}")]
    SessionAlreadyExists(String),

    /// The underlying portable-pty library returned an error.
    #[error("pty backend error: {0}")]
    Backend(String),

    /// Failed to spawn the shell process inside the PTY.
    #[error("failed to spawn shell: {0}")]
    SpawnFailed(String),

    /// An I/O error occurred while reading from or writing to the PTY.
    #[error("pty I/O error: {0}")]
    Io(#[from] std::io::Error),

    /// Sending data to the PTY output channel failed (receiver dropped).
    #[error("output channel closed for session: {0}")]
    ChannelClosed(String),

    /// The working directory provided does not exist or is not a directory.
    #[error("invalid working directory: {0}")]
    InvalidCwd(String),

    /// Resize parameters are invalid (e.g. zero dimensions).
    #[error("invalid size — cols and rows must be greater than zero")]
    InvalidSize,
}
