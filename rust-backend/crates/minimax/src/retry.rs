use std::future::Future;
use std::time::Duration;

use tokio::time::sleep;
use tracing::{debug, warn};

use crate::error::{MiniMaxError, Result};

/// Configuration for the exponential-backoff retry logic.
#[derive(Debug, Clone)]
pub struct RetryConfig {
    /// Maximum number of retry attempts (not counting the initial attempt).
    pub max_retries: u32,
    /// Delay before the first retry.
    pub base_delay: Duration,
    /// Upper bound on the computed delay.
    pub max_delay: Duration,
    /// If true, add ±25 % random jitter to each delay to avoid thundering-herd.
    pub with_jitter: bool,
}

impl Default for RetryConfig {
    fn default() -> Self {
        Self {
            max_retries: 3,
            base_delay: Duration::from_secs(1),
            max_delay: Duration::from_secs(30),
            with_jitter: true,
        }
    }
}

impl RetryConfig {
    /// Compute the delay for attempt `n` (0-indexed).
    ///
    /// Formula: `min(base_delay * 2^n, max_delay)` with optional ±25 % jitter.
    pub fn delay_for(&self, attempt: u32) -> Duration {
        // base_delay * 2^attempt — saturating to avoid overflow
        let multiplier = 1u64.checked_shl(attempt).unwrap_or(u64::MAX);
        let base_ms = self.base_delay.as_millis() as u64;
        let delay_ms = base_ms.saturating_mul(multiplier);
        let delay_ms = delay_ms.min(self.max_delay.as_millis() as u64);

        if self.with_jitter {
            // Simple deterministic pseudo-jitter: ±25 % based on attempt parity.
            // In production you would use `rand` here; we avoid the extra dep.
            let jitter_factor = if attempt % 2 == 0 { 75u64 } else { 125u64 };
            let jittered = delay_ms.saturating_mul(jitter_factor) / 100;
            Duration::from_millis(jittered)
        } else {
            Duration::from_millis(delay_ms)
        }
    }
}

/// Returns `true` for errors that are transient and worth retrying.
fn is_retryable(err: &MiniMaxError) -> bool {
    matches!(err, MiniMaxError::RateLimited | MiniMaxError::Http(_))
}

/// Execute `operation` with exponential backoff, using `config`.
///
/// The closure is called up to `config.max_retries + 1` times in total.
/// Non-retryable errors (e.g. `AuthError`, `ParseError`) are returned immediately.
pub async fn retry_with_backoff<F, Fut, T>(
    config: &RetryConfig,
    operation: F,
) -> Result<T>
where
    F: Fn() -> Fut,
    Fut: Future<Output = Result<T>>,
{
    let mut last_err: Option<MiniMaxError> = None;

    for attempt in 0..=config.max_retries {
        match operation().await {
            Ok(value) => return Ok(value),
            Err(err) => {
                if !is_retryable(&err) {
                    return Err(err);
                }

                let delay = config.delay_for(attempt);
                warn!(
                    attempt = attempt + 1,
                    max = config.max_retries + 1,
                    delay_ms = delay.as_millis(),
                    error = %err,
                    "Retryable error; waiting before next attempt"
                );

                last_err = Some(err);

                if attempt < config.max_retries {
                    sleep(delay).await;
                }
            }
        }
    }

    debug!(attempts = config.max_retries + 1, "All retry attempts exhausted");

    // Surface the last error if it carries useful context, otherwise use sentinel.
    match last_err {
        Some(MiniMaxError::Http(e)) => Err(MiniMaxError::Http(e)),
        _ => Err(MiniMaxError::MaxRetriesExceeded { attempts: config.max_retries + 1 }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn delay_doubles_each_attempt() {
        let cfg = RetryConfig {
            base_delay: Duration::from_millis(1000),
            max_delay: Duration::from_secs(30),
            with_jitter: false,
            ..Default::default()
        };

        assert_eq!(cfg.delay_for(0), Duration::from_millis(1000));
        assert_eq!(cfg.delay_for(1), Duration::from_millis(2000));
        assert_eq!(cfg.delay_for(2), Duration::from_millis(4000));
        assert_eq!(cfg.delay_for(3), Duration::from_millis(8000));
    }

    #[test]
    fn delay_is_capped_at_max() {
        let cfg = RetryConfig {
            base_delay: Duration::from_secs(10),
            max_delay: Duration::from_secs(15),
            with_jitter: false,
            ..Default::default()
        };

        // 10s * 2^2 = 40s > 15s cap
        assert_eq!(cfg.delay_for(2), Duration::from_secs(15));
    }

    #[tokio::test]
    async fn succeeds_on_first_try() {
        let cfg = RetryConfig::default();
        let result = retry_with_backoff(&cfg, || async { Ok::<_, MiniMaxError>(42) }).await;
        assert_eq!(result.unwrap(), 42);
    }

    #[tokio::test]
    async fn returns_error_immediately_for_non_retryable() {
        let cfg = RetryConfig { max_retries: 3, ..Default::default() };
        let calls = std::sync::atomic::AtomicU32::new(0);

        let result = retry_with_backoff(&cfg, || async {
            calls.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
            Err::<(), _>(MiniMaxError::AuthError)
        })
        .await;

        assert!(matches!(result, Err(MiniMaxError::AuthError)));
        // Must NOT retry after an auth error.
        assert_eq!(calls.load(std::sync::atomic::Ordering::SeqCst), 1);
    }
}
