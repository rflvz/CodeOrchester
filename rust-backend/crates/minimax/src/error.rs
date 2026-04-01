use thiserror::Error;

/// Errors that can occur when interacting with the MiniMax API.
#[derive(Debug, Error)]
pub enum MiniMaxError {
    /// An HTTP-level error from reqwest.
    #[error("HTTP error: {0}")]
    Http(#[from] reqwest::Error),

    /// The API returned HTTP 429 (Too Many Requests).
    #[error("Rate limited by MiniMax API")]
    RateLimited,

    /// The API returned HTTP 401 or 403 (authentication failure).
    #[error("Authentication error: invalid or missing API key")]
    AuthError,

    /// All retry attempts were exhausted without a successful response.
    #[error("Max retries exceeded after {attempts} attempts")]
    MaxRetriesExceeded { attempts: u32 },

    /// Failed to parse the API response body.
    #[error("Failed to parse API response: {0}")]
    ParseError(String),

    /// The API returned an unexpected HTTP status code.
    #[error("Unexpected API error: status={status}, body={body}")]
    ApiError { status: u16, body: String },
}

pub type Result<T> = std::result::Result<T, MiniMaxError>;
