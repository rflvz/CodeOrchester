//! PTY Manager for CodeOrchester — cross-platform PTY session management.
//!
//! This crate wraps [`portable_pty`] to provide an async, thread-safe manager
//! for multiple concurrent PTY sessions.  It is designed to replace the
//! `node-pty` usage in the Electron main process (DAW-546).
//!
//! # Quick Start
//!
//! ```rust,no_run
//! use pty_manager::PtyManager;
//! use tokio_stream::StreamExt;
//!
//! #[tokio::main]
//! async fn main() {
//!     let manager = PtyManager::new();
//!
//!     // Open a new terminal session.
//!     let (_id, mut output) = manager
//!         .create_pty("session-1".into(), Some("/tmp".into()))
//!         .await
//!         .expect("failed to create PTY");
//!
//!     // Send a command.
//!     manager
//!         .write_pty("session-1".into(), "echo hello\n".into())
//!         .await
//!         .expect("write failed");
//!
//!     // Resize the terminal.
//!     manager
//!         .resize_pty("session-1".into(), 120, 40)
//!         .await
//!         .expect("resize failed");
//!
//!     // Stream output (BroadcastStream items are Result<PtyOutput, _>).
//!     while let Some(Ok(chunk)) = output.next().await {
//!         print!("{}", String::from_utf8_lossy(&chunk.data));
//!     }
//!
//!     // Clean up.
//!     manager
//!         .kill_pty("session-1".into())
//!         .await
//!         .expect("kill failed");
//! }
//! ```

pub mod error;
pub mod manager;
pub mod session;

// Convenience re-exports at crate root.
pub use error::PtyError;
pub use manager::PtyManager;
pub use session::{PtyOutput, PtySession, TerminalSize};
pub use tokio_stream::wrappers::errors::BroadcastStreamRecvError;
