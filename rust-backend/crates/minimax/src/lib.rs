//! # minimax
//!
//! Async Rust client for the [MiniMax](https://api.minimaxi.chat) chat-completion API.
//!
//! ## Features
//! - Typed request / response models
//! - Automatic retry with exponential backoff (configurable)
//! - SSE streaming support
//! - Basic API key format validation
//!
//! ## Quick start
//! ```no_run
//! use minimax::{MiniMaxClient, MiniMaxError};
//!
//! #[tokio::main]
//! async fn main() -> Result<(), MiniMaxError> {
//!     let client = MiniMaxClient::new("my-api-key");
//!     let completion = client.complete("Hello, world!", "abab6.5-chat", "").await?;
//!     println!("{}", completion.text().unwrap_or_default());
//!     Ok(())
//! }
//! ```

pub mod client;
pub mod error;
pub mod models;
pub mod retry;

// Re-exports for a clean public surface.
pub use client::MiniMaxClient;
pub use error::{MiniMaxError, Result};
pub use models::{Choice, Completion, CompletionRequest, Message, Usage};
pub use retry::RetryConfig;
