use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::Arc;

use futures_util::{SinkExt, StreamExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::{broadcast, Mutex};
use tokio_tungstenite::{accept_async, tungstenite::Message};
use tracing::{error, info, warn};

use crate::commands::IpcCommand;
use crate::events::{CommandResultPayload, IpcEvent};
use crate::handler::handle_command;

/// Default WebSocket port for the Rust IPC server.
pub const DEFAULT_PORT: u16 = 9999;

/// Capacity of the broadcast channel used to push events to all connected clients.
const BROADCAST_CAPACITY: usize = 256;

/// A handle to the running IPC server.
///
/// Call [`IpcServer::run`] to start accepting connections.
/// Use [`IpcServer::broadcast`] to push events to all connected clients from
/// outside the server loop (e.g., from PTY output callbacks).
pub struct IpcServer {
    port: u16,
    /// Sender half of the broadcast channel.  Clone this to push events.
    event_tx: broadcast::Sender<IpcEvent>,
    /// Number of currently connected clients (informational).
    client_count: Arc<Mutex<HashMap<SocketAddr, ()>>>,
}

impl IpcServer {
    /// Create a new [`IpcServer`] bound to `port`.
    pub fn new(port: u16) -> Self {
        let (event_tx, _) = broadcast::channel(BROADCAST_CAPACITY);
        Self {
            port,
            event_tx,
            client_count: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Returns a clone of the broadcast sender so callers can push [`IpcEvent`]s
    /// to all connected clients at any time.
    pub fn event_sender(&self) -> broadcast::Sender<IpcEvent> {
        self.event_tx.clone()
    }

    /// Start the WebSocket server.  Runs until the process exits.
    pub async fn run(self) -> std::io::Result<()> {
        let addr = format!("127.0.0.1:{}", self.port);
        let listener = TcpListener::bind(&addr).await?;
        info!(addr = %addr, "IPC WebSocket server listening");

        let event_tx = self.event_tx.clone();
        let client_count = self.client_count.clone();

        loop {
            match listener.accept().await {
                Ok((stream, peer_addr)) => {
                    info!(peer = %peer_addr, "New WebSocket client connecting");
                    let tx = event_tx.clone();
                    let clients = client_count.clone();
                    tokio::spawn(async move {
                        clients.lock().await.insert(peer_addr, ());
                        if let Err(e) = handle_connection(stream, peer_addr, tx).await {
                            warn!(peer = %peer_addr, err = %e, "Client connection error");
                        }
                        clients.lock().await.remove(&peer_addr);
                        info!(peer = %peer_addr, "Client disconnected");
                    });
                }
                Err(e) => {
                    error!(err = %e, "Failed to accept connection");
                }
            }
        }
    }

    /// Broadcast an event to every connected client.
    ///
    /// Returns the number of clients that received the message
    /// (zero if no clients are connected — this is not an error).
    pub fn broadcast(&self, event: IpcEvent) -> usize {
        match self.event_tx.send(event) {
            Ok(n) => n,
            Err(_) => 0, // no receivers
        }
    }
}

/// Handle a single WebSocket connection.
async fn handle_connection(
    stream: TcpStream,
    peer: SocketAddr,
    event_tx: broadcast::Sender<IpcEvent>,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let ws_stream = accept_async(stream).await?;
    info!(peer = %peer, "WebSocket handshake complete");

    let (mut ws_sender, mut ws_receiver) = ws_stream.split();
    let mut event_rx = event_tx.subscribe();

    loop {
        tokio::select! {
            // Incoming message from this client
            msg = ws_receiver.next() => {
                match msg {
                    Some(Ok(Message::Text(text))) => {
                        match serde_json::from_str::<IpcCommand>(&text) {
                            Ok(command) => {
                                let response = handle_command(command).await;
                                let json = serde_json::to_string(&response)?;
                                ws_sender.send(Message::Text(json.into())).await?;
                            }
                            Err(e) => {
                                warn!(peer = %peer, err = %e, raw = %text, "Failed to parse IpcCommand");
                                let err_event = IpcEvent::CommandResult(CommandResultPayload {
                                    request_id: "unknown".into(),
                                    success: false,
                                    error: Some(format!("parse error: {e}")),
                                });
                                let json = serde_json::to_string(&err_event)?;
                                ws_sender.send(Message::Text(json.into())).await?;
                            }
                        }
                    }
                    Some(Ok(Message::Binary(bytes))) => {
                        // Try to parse binary frames as UTF-8 JSON too
                        if let Ok(text) = std::str::from_utf8(&bytes) {
                            if let Ok(command) = serde_json::from_str::<IpcCommand>(text) {
                                let response = handle_command(command).await;
                                let json = serde_json::to_string(&response)?;
                                ws_sender.send(Message::Text(json.into())).await?;
                            }
                        }
                    }
                    Some(Ok(Message::Ping(data))) => {
                        ws_sender.send(Message::Pong(data)).await?;
                    }
                    Some(Ok(Message::Close(_))) | None => {
                        break;
                    }
                    Some(Ok(_)) => {} // ignore other frame types
                    Some(Err(e)) => {
                        warn!(peer = %peer, err = %e, "WebSocket receive error");
                        break;
                    }
                }
            }
            // Outgoing broadcast event
            event = event_rx.recv() => {
                match event {
                    Ok(ev) => {
                        let json = serde_json::to_string(&ev)?;
                        if ws_sender.send(Message::Text(json.into())).await.is_err() {
                            break;
                        }
                    }
                    Err(broadcast::error::RecvError::Lagged(n)) => {
                        warn!(peer = %peer, skipped = n, "Broadcast receiver lagged, events dropped");
                    }
                    Err(broadcast::error::RecvError::Closed) => {
                        break;
                    }
                }
            }
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::time::{timeout, Duration};
    use tokio_tungstenite::connect_async;

    /// Find a free TCP port by binding to :0 and reading the assigned port.
    async fn free_port() -> u16 {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        listener.local_addr().unwrap().port()
    }

    #[tokio::test]
    async fn server_starts_and_accepts_connection() {
        let port = free_port().await;
        let server = IpcServer::new(port);

        // Spawn the server in the background
        tokio::spawn(async move {
            server.run().await.unwrap();
        });

        // Give the server a moment to bind
        tokio::time::sleep(Duration::from_millis(50)).await;

        // Connect a client
        let url = format!("ws://127.0.0.1:{}", port);
        let result = timeout(Duration::from_secs(2), connect_async(&url)).await;
        assert!(result.is_ok(), "connect_async timed out");
        assert!(result.unwrap().is_ok(), "WebSocket connection failed");
    }

    #[tokio::test]
    async fn server_handles_start_pty_command() {
        let port = free_port().await;
        let server = IpcServer::new(port);

        tokio::spawn(async move {
            server.run().await.unwrap();
        });

        tokio::time::sleep(Duration::from_millis(50)).await;

        let url = format!("ws://127.0.0.1:{}", port);
        let (mut ws, _) = connect_async(&url).await.unwrap();

        let cmd = serde_json::json!({
            "type": "startPty",
            "payload": { "sessionId": "test-1", "cwd": null }
        });
        ws.send(Message::Text(cmd.to_string().into())).await.unwrap();

        let reply = timeout(Duration::from_secs(2), ws.next()).await
            .expect("timed out waiting for reply")
            .unwrap()
            .unwrap();

        if let Message::Text(text) = reply {
            let ev: serde_json::Value = serde_json::from_str(&text).unwrap();
            assert_eq!(ev["type"], "commandResult");
            assert_eq!(ev["payload"]["success"], true);
        } else {
            panic!("expected text message");
        }
    }

    #[tokio::test]
    async fn multiple_clients_can_connect_simultaneously() {
        let port = free_port().await;
        let server = IpcServer::new(port);

        tokio::spawn(async move {
            server.run().await.unwrap();
        });

        tokio::time::sleep(Duration::from_millis(50)).await;

        let url = format!("ws://127.0.0.1:{}", port);

        let client_a = connect_async(&url).await;
        let client_b = connect_async(&url).await;
        let client_c = connect_async(&url).await;

        assert!(client_a.is_ok(), "client A failed to connect");
        assert!(client_b.is_ok(), "client B failed to connect");
        assert!(client_c.is_ok(), "client C failed to connect");
    }
}
