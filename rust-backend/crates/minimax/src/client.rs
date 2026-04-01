use std::time::Duration;

use futures::StreamExt;
use reqwest::{header, Client, StatusCode};
use tokio::time::sleep;
use tokio_stream::Stream;
use tracing::debug;

use crate::{
    error::{MiniMaxError, Result},
    models::{Completion, CompletionRequest},
    retry::{retry_with_backoff, RetryConfig},
};

/// Base URL for the MiniMax chat-completion endpoint.
const MINIMAX_API_BASE: &str = "https://api.minimaxi.chat/v1/text/chatcompletion_v2";

/// Minimum length an API key must be to be considered structurally valid.
const MIN_API_KEY_LEN: usize = 16;

/// Minimum interval between consecutive requests (simple rate-limiting floor).
const MIN_REQUEST_INTERVAL: Duration = Duration::from_millis(100);

/// Async client for the MiniMax API.
///
/// # Example
/// ```no_run
/// # use minimax::MiniMaxClient;
/// # #[tokio::main] async fn main() {
/// let client = MiniMaxClient::new("my-api-key");
/// let completion = client.complete("Hello!", "abab6.5-chat", "").await.unwrap();
/// println!("{}", completion.text().unwrap_or_default());
/// # }
/// ```
#[derive(Clone)]
pub struct MiniMaxClient {
    http: Client,
    api_key: String,
    retry_config: RetryConfig,
    base_url: String,
}

impl MiniMaxClient {
    /// Create a new client with the given API key and default retry settings.
    pub fn new(api_key: impl Into<String>) -> Self {
        Self::with_retry_config(api_key, RetryConfig::default())
    }

    /// Create a new client with a custom retry configuration.
    pub fn with_retry_config(api_key: impl Into<String>, retry_config: RetryConfig) -> Self {
        let http = Client::builder()
            .timeout(Duration::from_secs(60))
            .build()
            .expect("Failed to build HTTP client");

        Self {
            http,
            api_key: api_key.into(),
            retry_config,
            base_url: MINIMAX_API_BASE.to_owned(),
        }
    }

    /// Override the API base URL (useful for tests / staging environments).
    pub fn with_base_url(mut self, url: impl Into<String>) -> Self {
        self.base_url = url.into();
        self
    }

    // ── Public API ─────────────────────────────────────────────────────────────

    /// Send a prompt to the MiniMax API and return a complete `Completion`.
    ///
    /// Automatically retries transient errors according to the `RetryConfig`.
    pub async fn complete(
        &self,
        prompt: impl Into<String> + Clone,
        model: impl Into<String> + Clone,
        api_key: &str,
    ) -> Result<Completion> {
        let prompt = prompt.into();
        let model = model.into();
        debug!(model = %model, "Starting completion request");
        let key = if api_key.is_empty() { self.api_key.as_str() } else { api_key };

        retry_with_backoff(&self.retry_config, || {
            let prompt = prompt.clone();
            let model = model.clone();
            async move {
                // Honour the minimum request interval.
                sleep(MIN_REQUEST_INTERVAL).await;
                self.do_complete(prompt, model, key).await
            }
        })
        .await
    }

    /// Send a prompt to the MiniMax API and return a stream of `Completion` chunks.
    ///
    /// Each item in the returned stream corresponds to a single SSE `data:` frame.
    pub async fn stream_complete(
        &self,
        prompt: impl Into<String>,
        model: impl Into<String>,
        api_key: &str,
    ) -> Result<impl Stream<Item = Result<Completion>>> {
        let prompt = prompt.into();
        let model = model.into();
        let key = if api_key.is_empty() { self.api_key.as_str() } else { api_key };

        sleep(MIN_REQUEST_INTERVAL).await;

        let body = CompletionRequest::new(&model, &prompt, true);
        let response = self
            .http
            .post(&self.base_url)
            .header(header::AUTHORIZATION, format!("Bearer {key}"))
            .header(header::CONTENT_TYPE, "application/json")
            .json(&body)
            .send()
            .await
            .map_err(MiniMaxError::Http)?;

        let status = response.status();
        Self::check_status_error(status, &response).await?;

        let byte_stream = response.bytes_stream();

        // Parse the SSE stream: each line is either `data: {...}` or `data: [DONE]`.
        let completion_stream = byte_stream.filter_map(|chunk| async move {
            let bytes = chunk.map_err(MiniMaxError::Http).ok()?;
            let text = String::from_utf8_lossy(&bytes);

            // A single chunk may contain multiple `data:` lines.
            for line in text.lines() {
                let line = line.trim();
                if let Some(json) = line.strip_prefix("data:") {
                    let json = json.trim();
                    if json == "[DONE]" {
                        return None; // End-of-stream sentinel.
                    }
                    let parsed: std::result::Result<Completion, _> = serde_json::from_str(json);
                    return Some(parsed.map_err(|e| MiniMaxError::ParseError(e.to_string())));
                }
            }
            None
        });

        Ok(completion_stream)
    }

    /// Return `true` if `api_key` is structurally plausible (non-empty, minimum length,
    /// printable ASCII, no whitespace).
    ///
    /// This is a **format** check only — it does **not** make a network request.
    pub fn validate_api_key(api_key: &str) -> bool {
        if api_key.len() < MIN_API_KEY_LEN {
            return false;
        }
        // Must be non-whitespace printable ASCII.
        api_key.chars().all(|c| c.is_ascii_graphic())
    }

    // ── Private helpers ────────────────────────────────────────────────────────

    /// Execute a single (non-streaming) completion request, without retries.
    async fn do_complete(
        &self,
        prompt: String,
        model: String,
        api_key: &str,
    ) -> Result<Completion> {
        let body = CompletionRequest::new(&model, &prompt, false);

        debug!(model = %model, "Sending completion request");

        let response = self
            .http
            .post(&self.base_url)
            .header(header::AUTHORIZATION, format!("Bearer {api_key}"))
            .header(header::CONTENT_TYPE, "application/json")
            .json(&body)
            .send()
            .await
            .map_err(MiniMaxError::Http)?;

        let status = response.status();
        Self::check_status_error(status, &response).await?;

        response
            .json::<Completion>()
            .await
            .map_err(|e| MiniMaxError::ParseError(e.to_string()))
    }

    /// Map non-2xx HTTP status codes to typed errors.
    async fn check_status_error(status: StatusCode, _response: &reqwest::Response) -> Result<()> {
        match status {
            s if s.is_success() => Ok(()),
            StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN => Err(MiniMaxError::AuthError),
            StatusCode::TOO_MANY_REQUESTS => Err(MiniMaxError::RateLimited),
            other => {
                // We can't consume the body here (we only have a shared ref), so we
                // surface the status code as context.
                Err(MiniMaxError::ApiError {
                    status: other.as_u16(),
                    body: format!("HTTP {other}"),
                })
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validate_api_key_accepts_valid_keys() {
        assert!(MiniMaxClient::validate_api_key("eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9"));
        assert!(MiniMaxClient::validate_api_key("abcdef1234567890"));
    }

    #[test]
    fn validate_api_key_rejects_short_keys() {
        assert!(!MiniMaxClient::validate_api_key("short"));
        assert!(!MiniMaxClient::validate_api_key(""));
    }

    #[test]
    fn validate_api_key_rejects_whitespace() {
        assert!(!MiniMaxClient::validate_api_key("valid key with spaces here!!"));
    }

    #[test]
    fn client_creation_does_not_panic() {
        let _ = MiniMaxClient::new("test-key-that-is-long-enough");
    }
}
