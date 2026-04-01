//! Integration tests for `PtyManager`.
//!
//! Tests are split into two groups:
//!   - **Error handling** — pure logic, no real shell required.
//!   - **Lifecycle** — spawn a real shell; guarded by `tokio::time::timeout`.

use std::time::Duration;

use pty_manager::{PtyError, PtyManager};
use tokio::time::timeout;
use tokio_stream::StreamExt;

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

/// Unique-ish ID generator for tests (avoids cross-test collisions).
fn uid(prefix: &str) -> String {
    use std::sync::atomic::{AtomicU64, Ordering};
    static CTR: AtomicU64 = AtomicU64::new(0);
    format!("{}-{}", prefix, CTR.fetch_add(1, Ordering::Relaxed))
}

// ──────────────────────────────────────────────────────────────────────────────
// Error-handling tests (no real shell)
// ──────────────────────────────────────────────────────────────────────────────

#[tokio::test]
async fn test_duplicate_session_returns_error() {
    let mgr = PtyManager::new();
    let id = uid("dup");

    // First creation must succeed.
    let (_sid, _stream) = mgr.create_pty(id.clone(), None).await.expect("first create");

    // Second creation with the same ID must fail.
    let err = mgr
        .create_pty(id.clone(), None)
        .await
        .err()
        .expect("expected an error for duplicate session ID");
    assert!(
        matches!(err, PtyError::SessionAlreadyExists(ref s) if s == &id),
        "expected SessionAlreadyExists, got {err:?}"
    );

    mgr.kill_pty(id).await.ok();
}

#[tokio::test]
async fn test_write_to_nonexistent_session() {
    let mgr = PtyManager::new();
    let id = uid("write-missing");

    let err = mgr.write_pty(id.clone(), "hello\n".into()).await.unwrap_err();
    assert!(
        matches!(err, PtyError::SessionNotFound(ref s) if s == &id),
        "expected SessionNotFound, got {err:?}"
    );
}

#[tokio::test]
async fn test_resize_nonexistent_session() {
    let mgr = PtyManager::new();
    let id = uid("resize-missing");

    let err = mgr.resize_pty(id.clone(), 80, 24).await.unwrap_err();
    assert!(
        matches!(err, PtyError::SessionNotFound(ref s) if s == &id),
        "expected SessionNotFound, got {err:?}"
    );
}

#[tokio::test]
async fn test_kill_nonexistent_session() {
    let mgr = PtyManager::new();
    let id = uid("kill-missing");

    let err = mgr.kill_pty(id.clone()).await.unwrap_err();
    assert!(
        matches!(err, PtyError::SessionNotFound(ref s) if s == &id),
        "expected SessionNotFound, got {err:?}"
    );
}

#[tokio::test]
async fn test_stream_output_nonexistent_session() {
    let mgr = PtyManager::new();
    let id = uid("stream-missing");

    let err = mgr
        .stream_output(id.clone())
        .await
        .err()
        .expect("expected an error for nonexistent session");
    assert!(
        matches!(err, PtyError::SessionNotFound(ref s) if s == &id),
        "expected SessionNotFound, got {err:?}"
    );
}

#[tokio::test]
async fn test_resize_zero_cols_rejected() {
    let mgr = PtyManager::new();
    let id = uid("zero-cols");

    // We don't actually need a real session: the size check happens before
    // the session lookup.
    let err = mgr.resize_pty(id, 0, 24).await.unwrap_err();
    assert!(
        matches!(err, PtyError::InvalidSize),
        "expected InvalidSize, got {err:?}"
    );
}

#[tokio::test]
async fn test_resize_zero_rows_rejected() {
    let mgr = PtyManager::new();
    let id = uid("zero-rows");

    let err = mgr.resize_pty(id, 80, 0).await.unwrap_err();
    assert!(
        matches!(err, PtyError::InvalidSize),
        "expected InvalidSize, got {err:?}"
    );
}

#[tokio::test]
async fn test_contains_returns_false_for_unknown() {
    let mgr = PtyManager::new();
    assert!(!mgr.contains("totally-unknown-session-xyz").await);
}

#[tokio::test]
async fn test_session_ids_empty_on_new_manager() {
    let mgr = PtyManager::new();
    let ids = mgr.session_ids().await;
    assert!(ids.is_empty(), "expected empty session list, got {ids:?}");
}

// ──────────────────────────────────────────────────────────────────────────────
// Lifecycle tests (spawn a real shell)
// ──────────────────────────────────────────────────────────────────────────────

#[tokio::test]
async fn test_create_pty_registers_session() {
    let mgr = PtyManager::new();
    let id = uid("reg");

    let (_sid, _stream) = mgr.create_pty(id.clone(), None).await.expect("create");
    assert!(mgr.contains(&id).await, "session should be registered");

    mgr.kill_pty(id).await.ok();
}

#[tokio::test]
async fn test_kill_removes_session_from_registry() {
    let mgr = PtyManager::new();
    let id = uid("kill-rm");

    let (_sid, _stream) = mgr.create_pty(id.clone(), None).await.expect("create");
    assert!(mgr.contains(&id).await);

    mgr.kill_pty(id.clone()).await.expect("kill");
    assert!(!mgr.contains(&id).await, "session should be removed after kill");
}

#[tokio::test]
async fn test_create_multiple_sessions() {
    let mgr = PtyManager::new();
    let ids: Vec<String> = (0..3).map(|i| uid(&format!("multi-{i}"))).collect();

    for id in &ids {
        mgr.create_pty(id.clone(), None).await.expect("create");
    }

    let registered = mgr.session_ids().await;
    assert_eq!(
        registered.len(),
        3,
        "expected 3 sessions, got {registered:?}"
    );

    for id in &ids {
        mgr.kill_pty(id.clone()).await.ok();
    }
}

#[tokio::test]
async fn test_kill_closes_stream() {
    let mgr = PtyManager::new();
    let id = uid("kill-stream");

    let (_sid, mut stream) = mgr.create_pty(id.clone(), None).await.expect("create");

    mgr.kill_pty(id).await.expect("kill");

    // After kill the broadcast sender is dropped; the stream must eventually
    // return None. We allow a short timeout to avoid blocking forever.
    let result = timeout(Duration::from_secs(3), async {
        loop {
            match stream.next().await {
                // Consume remaining buffered items.
                Some(Ok(_)) => continue,
                // Lagged errors are fine; keep draining.
                Some(Err(_)) => continue,
                // Stream exhausted — this is what we expect.
                None => return true,
            }
        }
    })
    .await;

    assert!(
        matches!(result, Ok(true)),
        "stream should close after kill (timeout or wrong result)"
    );
}

#[tokio::test]
async fn test_write_then_receive_output() {
    let mgr = PtyManager::new();
    let id = uid("write-recv");

    let (_sid, mut stream) = mgr.create_pty(id.clone(), None).await.expect("create");

    // Give the shell a moment to initialise before writing.
    tokio::time::sleep(Duration::from_millis(200)).await;

    // Send a newline — even cmd.exe will echo something back.
    mgr.write_pty(id.clone(), "\n".into())
        .await
        .expect("write");

    // We only care that *some* data arrives; we don't match specific text
    // because prompts differ between cmd.exe and bash.
    let got_output = timeout(Duration::from_secs(3), async {
        while let Some(item) = stream.next().await {
            if let Ok(chunk) = item {
                if !chunk.data.is_empty() {
                    return true;
                }
            }
        }
        false
    })
    .await;

    mgr.kill_pty(id).await.ok();

    assert!(
        matches!(got_output, Ok(true)),
        "expected to receive at least one non-empty chunk within 3 s"
    );
}

#[tokio::test]
async fn test_resize_changes_terminal_size() {
    let mgr = PtyManager::new();
    let id = uid("resize-ok");

    mgr.create_pty(id.clone(), None).await.expect("create");

    mgr.resize_pty(id.clone(), 120, 40)
        .await
        .expect("resize should succeed");

    mgr.kill_pty(id).await.ok();
}

#[tokio::test]
async fn test_multiple_subscribers_same_session() {
    let mgr = PtyManager::new();
    let id = uid("multi-sub");

    // Create the session and grab the initial stream.
    let (_sid, mut stream1) = mgr.create_pty(id.clone(), None).await.expect("create");

    // Subscribe a second independent stream.
    let mut stream2 = mgr.stream_output(id.clone()).await.expect("stream_output");

    // Give the shell a moment to emit its initial prompt.
    tokio::time::sleep(Duration::from_millis(200)).await;

    mgr.write_pty(id.clone(), "\n".into())
        .await
        .expect("write");

    // Both streams should receive data within the timeout.
    let (r1, r2) = tokio::join!(
        timeout(Duration::from_secs(3), async {
            while let Some(item) = stream1.next().await {
                if let Ok(chunk) = item {
                    if !chunk.data.is_empty() {
                        return true;
                    }
                }
            }
            false
        }),
        timeout(Duration::from_secs(3), async {
            while let Some(item) = stream2.next().await {
                if let Ok(chunk) = item {
                    if !chunk.data.is_empty() {
                        return true;
                    }
                }
            }
            false
        }),
    );

    mgr.kill_pty(id).await.ok();

    assert!(
        matches!(r1, Ok(true)),
        "stream1 should receive output from session"
    );
    assert!(
        matches!(r2, Ok(true)),
        "stream2 should receive output from session"
    );
}
