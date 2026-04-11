//! End-to-end smoke tests for the IPC WebSocket server.
//!
//! These tests spin up a real `IpcServer` on an ephemeral port (19999) and
//! connect real WebSocket clients to validate the complete request/response flow.

use futures_util::{SinkExt, StreamExt};
use ipc::IpcServer;
use tokio::time::{timeout, Duration};
use tokio_tungstenite::{connect_async, tungstenite::Message};

/// Helper: bind to port 0 to find a free port, then release it immediately.
/// We use a fixed port 19999 for the main smoke tests per spec, but keep
/// this helper for concurrent-client tests that need their own port.
async fn free_port() -> u16 {
    use tokio::net::TcpListener;
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    listener.local_addr().unwrap().port()
}

/// Spawn the server on `port` and wait 100 ms for it to bind.
async fn spawn_server(port: u16) {
    let server = IpcServer::new(port);
    tokio::spawn(async move {
        server.run().await.unwrap();
    });
    tokio::time::sleep(Duration::from_millis(100)).await;
}

// ---------------------------------------------------------------------------
// 1. StartPty → CommandResult { success: true }
// ---------------------------------------------------------------------------

#[tokio::test]
async fn smoke_start_pty_returns_success() {
    let port = free_port().await;
    spawn_server(port).await;

    let url = format!("ws://127.0.0.1:{}", port);
    let (mut ws, _) = connect_async(&url).await.expect("WebSocket connect failed");

    let cmd = r#"{"type":"startPty","payload":{"sessionId":"smoke-session","cwd":null}}"#;
    ws.send(Message::Text(cmd.into())).await.unwrap();

    let reply = timeout(Duration::from_secs(2), ws.next())
        .await
        .expect("timed out waiting for StartPty reply")
        .unwrap()
        .unwrap();

    if let Message::Text(text) = reply {
        let ev: serde_json::Value = serde_json::from_str(&text).unwrap();
        assert_eq!(ev["type"], "commandResult", "unexpected event type: {ev}");
        assert_eq!(
            ev["payload"]["success"], true,
            "StartPty should succeed: {ev}"
        );
    } else {
        panic!("expected Text message, got: {:?}", reply);
    }
}

// ---------------------------------------------------------------------------
// 2. WritePty → CommandResult { success: true }
// ---------------------------------------------------------------------------

#[tokio::test]
async fn smoke_write_pty_returns_success() {
    let port = free_port().await;
    spawn_server(port).await;

    let url = format!("ws://127.0.0.1:{}", port);
    let (mut ws, _) = connect_async(&url).await.expect("WebSocket connect failed");

    let cmd = r#"{"type":"writePty","payload":{"sessionId":"smoke-session","data":"echo hello\n"}}"#;
    ws.send(Message::Text(cmd.into())).await.unwrap();

    let reply = timeout(Duration::from_secs(2), ws.next())
        .await
        .expect("timed out waiting for WritePty reply")
        .unwrap()
        .unwrap();

    if let Message::Text(text) = reply {
        let ev: serde_json::Value = serde_json::from_str(&text).unwrap();
        assert_eq!(ev["type"], "commandResult", "unexpected event type: {ev}");
        assert_eq!(
            ev["payload"]["success"], true,
            "WritePty should succeed: {ev}"
        );
    } else {
        panic!("expected Text message, got: {:?}", reply);
    }
}

// ---------------------------------------------------------------------------
// 3. Two simultaneous clients can each send/receive independently
// ---------------------------------------------------------------------------

#[tokio::test]
async fn smoke_two_clients_simultaneous() {
    let port = free_port().await;
    spawn_server(port).await;

    let url = format!("ws://127.0.0.1:{}", port);

    let (mut ws_a, _) = connect_async(&url).await.expect("client A connect failed");
    let (mut ws_b, _) = connect_async(&url).await.expect("client B connect failed");

    // Both clients send StartPty concurrently
    let cmd_a = r#"{"type":"startPty","payload":{"sessionId":"client-a-session","cwd":null}}"#;
    let cmd_b = r#"{"type":"startPty","payload":{"sessionId":"client-b-session","cwd":null}}"#;

    ws_a.send(Message::Text(cmd_a.into())).await.unwrap();
    ws_b.send(Message::Text(cmd_b.into())).await.unwrap();

    // Wait for replies from both (order may vary but each gets exactly one reply)
    let reply_a = timeout(Duration::from_secs(2), ws_a.next())
        .await
        .expect("client A timed out")
        .unwrap()
        .unwrap();

    let reply_b = timeout(Duration::from_secs(2), ws_b.next())
        .await
        .expect("client B timed out")
        .unwrap()
        .unwrap();

    for (label, reply) in [("A", reply_a), ("B", reply_b)] {
        if let Message::Text(text) = reply {
            let ev: serde_json::Value = serde_json::from_str(&text).unwrap();
            assert_eq!(
                ev["type"], "commandResult",
                "client {label}: unexpected type: {ev}"
            );
            assert_eq!(
                ev["payload"]["success"], true,
                "client {label}: expected success: {ev}"
            );
        } else {
            panic!("client {}: expected Text message, got: {:?}", label, reply);
        }
    }
}

// ---------------------------------------------------------------------------
// 4. Malformed JSON → CommandResult { success: false, error: Some(...) }
// ---------------------------------------------------------------------------

#[tokio::test]
async fn smoke_malformed_json_returns_error() {
    let port = free_port().await;
    spawn_server(port).await;

    let url = format!("ws://127.0.0.1:{}", port);
    let (mut ws, _) = connect_async(&url).await.expect("WebSocket connect failed");

    // Send garbage JSON
    ws.send(Message::Text("not valid json at all {{{".into()))
        .await
        .unwrap();

    let reply = timeout(Duration::from_secs(2), ws.next())
        .await
        .expect("timed out waiting for error reply")
        .unwrap()
        .unwrap();

    if let Message::Text(text) = reply {
        let ev: serde_json::Value = serde_json::from_str(&text).unwrap();
        assert_eq!(
            ev["type"], "commandResult",
            "malformed JSON should produce commandResult: {ev}"
        );
        assert_eq!(
            ev["payload"]["success"], false,
            "malformed JSON should produce success=false: {ev}"
        );
        assert!(
            ev["payload"]["error"].is_string(),
            "malformed JSON should include an error string: {ev}"
        );
        let error_msg = ev["payload"]["error"].as_str().unwrap();
        assert!(
            !error_msg.is_empty(),
            "error message should not be empty: {ev}"
        );
    } else {
        panic!("expected Text message, got: {:?}", reply);
    }
}
