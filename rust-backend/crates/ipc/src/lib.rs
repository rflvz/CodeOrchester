//! # ipc
//!
//! WebSocket IPC layer between the Rust backend and the Electron renderer
//! (DAW-544).
//!
//! ## Responsibilities
//! - Start a `tokio-tungstenite` WebSocket server on a configurable port
//! - Authenticate connections (shared secret / localhost-only by default)
//! - Deserialise incoming [`IpcMessage`] frames and dispatch to subsystems
//! - Serialise outgoing [`IpcMessage`] frames and broadcast to connected clients
//! - Mirror the `electron/preload.ts` API surface:
//!   - `start-pty`, `write-pty`, `resize-pty`, `kill-pty`
//!   - `show-notification`, `open-external`
//!   - `pty-data`, `pty-exit`, `trabajo-terminado` (server → renderer events)

use serde::{Deserialize, Serialize};
use thiserror::Error;

// ---------------------------------------------------------------------------
// Message protocol
// ---------------------------------------------------------------------------

/// Discriminated-union message type used over the WebSocket connection.
///
/// Both client→server and server→client frames share this envelope so that
/// the Electron renderer can use a single `onmessage` handler.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "kebab-case")]
pub enum IpcMessage {
    // ---- renderer → backend ------------------------------------------------
    /// Start a new PTY session.
    StartPty {
        session_id: String,
        cwd: Option<String>,
    },
    /// Write data to an active PTY session.
    WritePty { session_id: String, data: String },
    /// Resize an active PTY session.
    ResizePty {
        session_id: String,
        cols: u16,
        rows: u16,
    },
    /// Kill and remove a PTY session.
    KillPty { session_id: String },
    /// Show a native OS notification.
    ShowNotification { title: String, body: String },
    /// Open a URL in the default browser.
    OpenExternal { url: String },

    // ---- backend → renderer ------------------------------------------------
    /// PTY data event (streamed output).
    PtyData { session_id: String, data: String },
    /// PTY process exited.
    PtyExit {
        session_id: String,
        exit_code: i32,
    },
    /// `trabajo_terminado` sentinel detected in PTY output.
    TrabajoTerminado { session_id: String, value: bool },

    // ---- generic acknowledgement -------------------------------------------
    /// Generic success/error acknowledgement.
    Ack {
        request_id: String,
        success: bool,
        #[serde(skip_serializing_if = "Option::is_none")]
        error: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        pid: Option<u32>,
    },
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/// Configuration for the WebSocket server.
#[derive(Debug, Clone)]
pub struct IpcConfig {
    /// Address to bind the WebSocket server (default: `127.0.0.1:9876`).
    pub bind_addr: String,
    /// Optional shared secret for lightweight authentication.
    pub secret: Option<String>,
}

impl Default for IpcConfig {
    fn default() -> Self {
        Self {
            bind_addr: "127.0.0.1:9876".to_owned(),
            secret: None,
        }
    }
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/// Errors produced by the IPC layer.
#[derive(Debug, Error)]
pub enum IpcError {
    #[error("bind failed on {addr}: {source}")]
    BindFailed {
        addr: String,
        source: std::io::Error,
    },

    #[error("serialisation error: {0}")]
    Serialise(#[from] serde_json::Error),

    #[error("websocket error: {0}")]
    WebSocket(String),

    #[error("authentication failed")]
    AuthFailed,
}

// ---------------------------------------------------------------------------
// IpcServer
// ---------------------------------------------------------------------------

/// WebSocket server that bridges the Electron renderer and Rust subsystems.
///
/// # TODO (DAW-544)
/// - Implement `bind()` using `tokio::net::TcpListener` + `tokio-tungstenite`
/// - Implement `broadcast()` to all connected clients
/// - Dispatch incoming frames to the correct subsystem handler
/// - Implement optional shared-secret handshake
pub struct IpcServer {
    config: IpcConfig,
}

impl IpcServer {
    /// Create a new (unstarted) IPC server.
    pub fn new(config: IpcConfig) -> Self {
        Self { config }
    }

    /// Bind the TCP listener and start accepting WebSocket connections.
    ///
    /// Runs until the returned [`tokio::task::JoinHandle`] is aborted or the
    /// process exits.
    ///
    /// # TODO (DAW-544)
    pub async fn serve(self) -> Result<tokio::task::JoinHandle<()>, IpcError> {
        todo!(
            "DAW-544: bind tokio TcpListener on {} and accept WS connections",
            self.config.bind_addr
        )
    }

    /// Serialise a message to JSON.
    pub fn encode(msg: &IpcMessage) -> Result<String, IpcError> {
        serde_json::to_string(msg).map_err(IpcError::Serialise)
    }

    /// Deserialise a JSON string into an [`IpcMessage`].
    pub fn decode(raw: &str) -> Result<IpcMessage, IpcError> {
        serde_json::from_str(raw).map_err(IpcError::Serialise)
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip_pty_data() {
        let msg = IpcMessage::PtyData {
            session_id: "s1".to_owned(),
            data: "hello\r\n".to_owned(),
        };
        let encoded = IpcServer::encode(&msg).unwrap();
        let decoded = IpcServer::decode(&encoded).unwrap();
        assert!(matches!(decoded, IpcMessage::PtyData { .. }));
    }

    #[test]
    fn roundtrip_start_pty() {
        let msg = IpcMessage::StartPty {
            session_id: "s2".to_owned(),
            cwd: Some("/tmp".to_owned()),
        };
        let json = IpcServer::encode(&msg).unwrap();
        let back = IpcServer::decode(&json).unwrap();
        assert!(matches!(back, IpcMessage::StartPty { .. }));
    }

    #[test]
    fn roundtrip_trabajo_terminado() {
        let msg = IpcMessage::TrabajoTerminado {
            session_id: "s3".to_owned(),
            value: true,
        };
        let json = IpcServer::encode(&msg).unwrap();
        let back = IpcServer::decode(&json).unwrap();
        assert!(matches!(
            back,
            IpcMessage::TrabajoTerminado { value: true, .. }
        ));
    }

    #[test]
    fn roundtrip_write_pty() {
        let msg = IpcMessage::WritePty {
            session_id: "s4".to_owned(),
            data: "echo hello\n".to_owned(),
        };
        let json = IpcServer::encode(&msg).unwrap();
        let back = IpcServer::decode(&json).unwrap();
        assert!(matches!(back, IpcMessage::WritePty { .. }));
    }

    #[test]
    fn roundtrip_resize_pty() {
        let msg = IpcMessage::ResizePty {
            session_id: "s5".to_owned(),
            cols: 120,
            rows: 40,
        };
        let json = IpcServer::encode(&msg).unwrap();
        let back = IpcServer::decode(&json).unwrap();
        assert!(matches!(back, IpcMessage::ResizePty { cols: 120, rows: 40, .. }));
    }

    #[test]
    fn roundtrip_kill_pty() {
        let msg = IpcMessage::KillPty {
            session_id: "s6".to_owned(),
        };
        let json = IpcServer::encode(&msg).unwrap();
        let back = IpcServer::decode(&json).unwrap();
        assert!(matches!(back, IpcMessage::KillPty { .. }));
    }

    #[test]
    fn roundtrip_show_notification() {
        let msg = IpcMessage::ShowNotification {
            title: "Alert".to_owned(),
            body: "Agent finished".to_owned(),
        };
        let json = IpcServer::encode(&msg).unwrap();
        let back = IpcServer::decode(&json).unwrap();
        assert!(matches!(back, IpcMessage::ShowNotification { .. }));
    }

    #[test]
    fn roundtrip_open_external() {
        let msg = IpcMessage::OpenExternal {
            url: "https://example.com".to_owned(),
        };
        let json = IpcServer::encode(&msg).unwrap();
        let back = IpcServer::decode(&json).unwrap();
        assert!(matches!(back, IpcMessage::OpenExternal { .. }));
    }

    #[test]
    fn roundtrip_pty_exit() {
        let msg = IpcMessage::PtyExit {
            session_id: "s7".to_owned(),
            exit_code: 0,
        };
        let json = IpcServer::encode(&msg).unwrap();
        let back = IpcServer::decode(&json).unwrap();
        assert!(matches!(back, IpcMessage::PtyExit { exit_code: 0, .. }));
    }

    #[test]
    fn roundtrip_ack_success() {
        let msg = IpcMessage::Ack {
            request_id: "req-1".to_owned(),
            success: true,
            error: None,
            pid: Some(9999),
        };
        let json = IpcServer::encode(&msg).unwrap();
        let back = IpcServer::decode(&json).unwrap();
        assert!(matches!(back, IpcMessage::Ack { success: true, .. }));
    }

    #[test]
    fn roundtrip_ack_failure() {
        let msg = IpcMessage::Ack {
            request_id: "req-2".to_owned(),
            success: false,
            error: Some("spawn failed".to_owned()),
            pid: None,
        };
        let json = IpcServer::encode(&msg).unwrap();
        let back = IpcServer::decode(&json).unwrap();
        match back {
            IpcMessage::Ack { success, error, pid, .. } => {
                assert!(!success);
                assert_eq!(error.as_deref(), Some("spawn failed"));
                assert!(pid.is_none());
            }
            other => panic!("unexpected variant: {other:?}"),
        }
    }

    #[test]
    fn invalid_json_returns_error() {
        let result = IpcServer::decode("{not valid json}");
        assert!(result.is_err());
    }

    #[test]
    fn unknown_type_returns_error() {
        let result = IpcServer::decode(r#"{"type":"unknown-variant","data":{}}"#);
        assert!(result.is_err());
    }

    #[test]
    fn encode_produces_type_tag() {
        let msg = IpcMessage::KillPty {
            session_id: "s-tag".to_owned(),
        };
        let json = IpcServer::encode(&msg).unwrap();
        assert!(json.contains("\"type\""));
        assert!(json.contains("kill-pty"));
    }

    #[test]
    fn start_pty_with_no_cwd_roundtrips() {
        let msg = IpcMessage::StartPty {
            session_id: "s-nocwd".to_owned(),
            cwd: None,
        };
        let json = IpcServer::encode(&msg).unwrap();
        let back = IpcServer::decode(&json).unwrap();
        match back {
            IpcMessage::StartPty { cwd, .. } => assert!(cwd.is_none()),
            other => panic!("unexpected variant: {other:?}"),
        }
    }
}
