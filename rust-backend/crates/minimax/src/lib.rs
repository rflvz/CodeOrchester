//! # minimax
//!
//! Async Rust client for the MiniMax API (DAW-548).
//!
//! ## Responsibilities
//! - Authenticate requests with `MINIMAX_API_KEY` from the environment
//! - Implement token-bucket rate limiting (respect API quotas)
//! - Exponential back-off retry on 429 / 5xx responses
//! - Typed request/response structs for the text-generation endpoint
//! - Expose a simple `MiniMaxClient::complete()` async method

use serde::{Deserialize, Serialize};
use thiserror::Error;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/// Client configuration.
#[derive(Debug, Clone)]
pub struct MiniMaxConfig {
    /// API key — defaults to `MINIMAX_API_KEY` env var.
    pub api_key: Option<String>,
    /// Base URL of the MiniMax API.
    pub base_url: String,
    /// Maximum requests per second (token-bucket capacity).
    pub max_rps: u32,
    /// Maximum number of retries on transient errors.
    pub max_retries: u32,
}

impl Default for MiniMaxConfig {
    fn default() -> Self {
        Self {
            api_key: None,
            base_url: "https://api.minimax.chat/v1".to_owned(),
            max_rps: 10,
            max_retries: 3,
        }
    }
}

/// A text-generation request sent to the MiniMax API.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompletionRequest {
    pub model: String,
    pub prompt: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub temperature: Option<f32>,
}

impl Default for CompletionRequest {
    fn default() -> Self {
        Self {
            model: "abab6.5s-chat".to_owned(),
            prompt: String::new(),
            max_tokens: Some(2048),
            temperature: Some(0.7),
        }
    }
}

/// A response from the MiniMax text-generation endpoint.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompletionResponse {
    pub id: String,
    pub text: String,
    pub finish_reason: String,
    pub usage: TokenUsage,
}

/// Token consumption reported by the API.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenUsage {
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
    pub total_tokens: u32,
}

/// Errors produced by [`MiniMaxClient`].
#[derive(Debug, Error)]
pub enum MiniMaxError {
    #[error("missing API key — set MINIMAX_API_KEY or provide via config")]
    MissingApiKey,

    #[error("rate limit exceeded (429)")]
    RateLimited,

    #[error("server error {status}: {body}")]
    ServerError { status: u16, body: String },

    #[error("max retries ({attempts}) exceeded: {last_error}")]
    MaxRetriesExceeded { attempts: u32, last_error: String },

    #[error("http error: {0}")]
    Http(#[from] reqwest::Error),

    #[error("json error: {0}")]
    Json(#[from] serde_json::Error),
}

// ---------------------------------------------------------------------------
// MiniMaxClient
// ---------------------------------------------------------------------------

/// Async client for the MiniMax text-generation API.
///
/// # TODO (DAW-548)
/// - Implement token-bucket rate limiter
/// - Add exponential back-off retry
/// - Wire up `reqwest` HTTP calls
/// - Parse streaming (SSE) responses
#[allow(dead_code)]
pub struct MiniMaxClient {
    config: MiniMaxConfig,
    http: reqwest::Client,
}

impl MiniMaxClient {
    /// Create a new client.  The API key is resolved from config → env var.
    pub fn new(config: MiniMaxConfig) -> Result<Self, MiniMaxError> {
        // Validate that we have an API key source.
        if config.api_key.is_none() && std::env::var("MINIMAX_API_KEY").is_err() {
            return Err(MiniMaxError::MissingApiKey);
        }
        let http = reqwest::Client::new();
        Ok(Self { config, http })
    }

    /// Resolve the API key from config or environment.
    #[allow(dead_code)]
    fn api_key(&self) -> Result<String, MiniMaxError> {
        self.config
            .api_key
            .clone()
            .or_else(|| std::env::var("MINIMAX_API_KEY").ok())
            .ok_or(MiniMaxError::MissingApiKey)
    }

    /// Send a completion request to the MiniMax API.
    ///
    /// Retries up to `config.max_retries` times on transient errors.
    ///
    /// # TODO (DAW-548)
    pub async fn complete(
        &self,
        request: CompletionRequest,
    ) -> Result<CompletionResponse, MiniMaxError> {
        todo!(
            "DAW-548: implement MiniMax HTTP call with retry/rate-limit for prompt: {:?}",
            request.prompt
        )
    }

    /// Check remaining rate-limit capacity (token-bucket state).
    ///
    /// # TODO (DAW-548)
    pub fn remaining_capacity(&self) -> u32 {
        todo!("DAW-548: implement token-bucket rate limiter state query")
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_api_key_returns_error() {
        // Ensure no env var leaks in during tests.
        std::env::remove_var("MINIMAX_API_KEY");
        let config = MiniMaxConfig::default();
        assert!(matches!(
            MiniMaxClient::new(config),
            Err(MiniMaxError::MissingApiKey)
        ));
    }

    #[test]
    fn explicit_api_key_accepted() {
        let config = MiniMaxConfig {
            api_key: Some("test-key".to_owned()),
            ..Default::default()
        };
        assert!(MiniMaxClient::new(config).is_ok());
    }

    #[test]
    fn env_var_api_key_accepted() {
        // Set env var so MiniMaxClient::new finds it even when config.api_key is None.
        std::env::set_var("MINIMAX_API_KEY", "env-key-value");
        let config = MiniMaxConfig::default(); // api_key: None
        let result = MiniMaxClient::new(config);
        // Clean up immediately before asserting so parallel tests aren't affected.
        std::env::remove_var("MINIMAX_API_KEY");
        assert!(result.is_ok());
    }

    #[test]
    fn completion_request_default_model() {
        let req = CompletionRequest::default();
        assert_eq!(req.model, "abab6.5s-chat");
        assert!(req.max_tokens.is_some());
        assert!(req.temperature.is_some());
    }

    #[test]
    fn completion_request_serialises_without_none_fields() {
        let req = CompletionRequest {
            model: "abab6".to_owned(),
            prompt: "Hello".to_owned(),
            max_tokens: None,
            temperature: None,
        };
        let json = serde_json::to_string(&req).unwrap();
        // skip_serializing_if = "Option::is_none" → these keys must be absent
        assert!(!json.contains("max_tokens"));
        assert!(!json.contains("temperature"));
    }

    #[test]
    fn minimax_config_default_base_url() {
        let cfg = MiniMaxConfig::default();
        assert!(cfg.base_url.starts_with("https://"));
        assert_eq!(cfg.max_retries, 3);
        assert!(cfg.max_rps > 0);
    }

    #[test]
    fn api_key_resolved_from_config_field() {
        let config = MiniMaxConfig {
            api_key: Some("direct-key".to_owned()),
            ..Default::default()
        };
        // Ensure env var is absent to test config-path exclusively
        std::env::remove_var("MINIMAX_API_KEY");
        let client = MiniMaxClient::new(config).unwrap();
        // api_key() is private but we can verify new() succeeded (it validates the key)
        drop(client);
    }
}
