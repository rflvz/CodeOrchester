use std::time::Duration;

use minimax::{
    models::{Completion, CompletionRequest, Message},
    retry::RetryConfig,
    MiniMaxClient,
};
use wiremock::{
    matchers::{method, path},
    Mock, MockServer, ResponseTemplate,
};

// ── validate_api_key (no network) ─────────────────────────────────────────────

#[test]
fn test_valid_api_key_accepted() {
    // 16+ chars, all ASCII graphic (no whitespace)
    assert!(MiniMaxClient::validate_api_key("abcdef1234567890"));
    assert!(MiniMaxClient::validate_api_key("eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9"));
}

#[test]
fn test_short_api_key_rejected() {
    assert!(!MiniMaxClient::validate_api_key("short-key"));
    assert!(!MiniMaxClient::validate_api_key("only15chars!!!!"));
}

#[test]
fn test_empty_api_key_rejected() {
    assert!(!MiniMaxClient::validate_api_key(""));
}

#[test]
fn test_api_key_with_spaces_rejected() {
    assert!(!MiniMaxClient::validate_api_key("my key here longgg"));
}

// ── Model tests ───────────────────────────────────────────────────────────────

#[test]
fn test_completion_text_accessor() {
    let completion: Completion = serde_json::from_value(serde_json::json!({
        "id": "test-id",
        "choices": [{
            "message": {"role": "assistant", "content": "Hello world!"},
            "finish_reason": "stop",
            "index": 0
        }],
        "model": "test-model",
        "usage": null
    }))
    .unwrap();

    assert_eq!(completion.text(), Some("Hello world!"));
}

#[test]
fn test_completion_text_empty_choices() {
    let completion: Completion = serde_json::from_value(serde_json::json!({
        "id": "test-id",
        "choices": [],
        "model": "test-model",
        "usage": null
    }))
    .unwrap();

    assert_eq!(completion.text(), None);
}

#[test]
fn test_message_user_constructor() {
    let msg = Message::user("hello");
    assert_eq!(msg.role, "user");
    assert_eq!(msg.content, "hello");
}

#[test]
fn test_message_assistant_constructor() {
    let msg = Message::assistant("hi there");
    assert_eq!(msg.role, "assistant");
    assert_eq!(msg.content, "hi there");
}

#[test]
fn test_completion_request_serialization() {
    let req = CompletionRequest::new("abab6.5-chat", "Say hello", false);
    let json = serde_json::to_string(&req).unwrap();

    assert!(json.contains("\"model\""));
    assert!(json.contains("\"messages\""));
    assert!(json.contains("\"stream\""));
    assert!(json.contains("abab6.5-chat"));
    assert!(json.contains("\"stream\":false"));
    // max_tokens and temperature are skipped when None
    assert!(!json.contains("max_tokens"));
    assert!(!json.contains("temperature"));
}

// ── Retry config tests ────────────────────────────────────────────────────────

#[test]
fn test_retry_config_default_values() {
    let cfg = RetryConfig::default();
    assert_eq!(cfg.max_retries, 3);
    assert_eq!(cfg.base_delay, Duration::from_secs(1));
    assert_eq!(cfg.max_delay, Duration::from_secs(30));
}

#[test]
fn test_retry_delay_no_jitter_doubles() {
    let cfg = RetryConfig {
        base_delay: Duration::from_secs(1),
        max_delay: Duration::from_secs(30),
        with_jitter: false,
        ..Default::default()
    };

    assert_eq!(cfg.delay_for(0), Duration::from_millis(1000));
    assert_eq!(cfg.delay_for(1), Duration::from_millis(2000));
    assert_eq!(cfg.delay_for(2), Duration::from_millis(4000));
}

#[test]
fn test_retry_delay_capped_at_max() {
    let cfg = RetryConfig {
        base_delay: Duration::from_secs(1),
        max_delay: Duration::from_secs(30),
        with_jitter: false,
        ..Default::default()
    };

    // attempt 10 → 1s * 2^10 = 1024s >> 30s cap
    assert_eq!(cfg.delay_for(10), Duration::from_secs(30));
}

// ── Mock HTTP tests ───────────────────────────────────────────────────────────

fn fast_retry_config() -> RetryConfig {
    RetryConfig {
        max_retries: 3,
        base_delay: Duration::from_millis(1),
        max_delay: Duration::from_millis(10),
        with_jitter: false,
    }
}

fn valid_completion_body() -> serde_json::Value {
    serde_json::json!({
        "id": "test-id",
        "choices": [{
            "message": {"role": "assistant", "content": "Hello!"},
            "finish_reason": "stop",
            "index": 0
        }],
        "model": "test-model",
        "usage": null
    })
}

#[tokio::test]
async fn test_complete_success() {
    let mock_server = MockServer::start().await;

    Mock::given(method("POST"))
        .respond_with(ResponseTemplate::new(200).set_body_json(&valid_completion_body()))
        .mount(&mock_server)
        .await;

    let client = MiniMaxClient::new("test-key-long-enough-here").with_base_url(mock_server.uri());

    let result = client.complete("hello", "test-model", "").await;
    assert!(result.is_ok(), "Expected Ok, got: {:?}", result.err());

    let completion = result.unwrap();
    assert_eq!(completion.text(), Some("Hello!"));
}

#[tokio::test]
async fn test_complete_401_returns_auth_error() {
    let mock_server = MockServer::start().await;

    Mock::given(method("POST"))
        .respond_with(ResponseTemplate::new(401))
        .mount(&mock_server)
        .await;

    let client = MiniMaxClient::with_retry_config("test-key-long-enough-here", fast_retry_config())
        .with_base_url(mock_server.uri());

    let result = client.complete("hello", "test-model", "").await;
    assert!(
        matches!(result, Err(minimax::MiniMaxError::AuthError)),
        "Expected AuthError, got: {:?}",
        result
    );

    // Auth errors must not be retried — only 1 request should have been made.
    let received = mock_server.received_requests().await.unwrap();
    assert_eq!(received.len(), 1, "AuthError must not trigger retries");
}

#[tokio::test]
async fn test_complete_403_returns_auth_error() {
    let mock_server = MockServer::start().await;

    Mock::given(method("POST"))
        .respond_with(ResponseTemplate::new(403))
        .mount(&mock_server)
        .await;

    let client = MiniMaxClient::with_retry_config("test-key-long-enough-here", fast_retry_config())
        .with_base_url(mock_server.uri());

    let result = client.complete("hello", "test-model", "").await;
    assert!(
        matches!(result, Err(minimax::MiniMaxError::AuthError)),
        "Expected AuthError, got: {:?}",
        result
    );

    let received = mock_server.received_requests().await.unwrap();
    assert_eq!(received.len(), 1, "AuthError must not trigger retries");
}

#[tokio::test]
async fn test_complete_429_exhausts_retries() {
    let mock_server = MockServer::start().await;

    // Always respond with 429
    Mock::given(method("POST"))
        .respond_with(ResponseTemplate::new(429))
        .mount(&mock_server)
        .await;

    let client = MiniMaxClient::with_retry_config("test-key-long-enough-here", fast_retry_config())
        .with_base_url(mock_server.uri());

    let result = client.complete("hello", "test-model", "").await;
    assert!(
        matches!(result, Err(minimax::MiniMaxError::MaxRetriesExceeded { .. })),
        "Expected MaxRetriesExceeded, got: {:?}",
        result
    );

    // max_retries=3 means 4 total attempts (initial + 3 retries)
    let received = mock_server.received_requests().await.unwrap();
    assert_eq!(received.len(), 4, "Should have retried 3 times (4 total requests)");
}

#[tokio::test]
async fn test_complete_retries_on_429_then_succeeds() {
    let mock_server = MockServer::start().await;

    // First request responds with 429, second and beyond respond with 200
    Mock::given(method("POST"))
        .respond_with(ResponseTemplate::new(429))
        .up_to_n_times(1)
        .mount(&mock_server)
        .await;

    Mock::given(method("POST"))
        .respond_with(ResponseTemplate::new(200).set_body_json(&valid_completion_body()))
        .mount(&mock_server)
        .await;

    let client = MiniMaxClient::with_retry_config("test-key-long-enough-here", fast_retry_config())
        .with_base_url(mock_server.uri());

    let result = client.complete("hello", "test-model", "").await;
    assert!(result.is_ok(), "Expected Ok after retry, got: {:?}", result.err());

    let completion = result.unwrap();
    assert_eq!(completion.text(), Some("Hello!"));

    // 1 failed + 1 successful = 2 requests total
    let received = mock_server.received_requests().await.unwrap();
    assert_eq!(received.len(), 2, "Should have made exactly 2 requests");
}
