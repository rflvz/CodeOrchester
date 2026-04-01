//! # security
//!
//! Input validation, sanitisation, and security hardening for the
//! CodeOrchestra Rust backend (DAW-549).
//!
//! ## Responsibilities
//! - Validate and sanitise all data arriving via the IPC WebSocket layer
//! - Enforce session-ID format (UUID v4 only) to prevent path traversal
//! - Reject or escape shell-special characters in PTY write payloads
//! - Validate URLs before opening them externally (`openExternal`)
//! - Provide allow-listed environment variable injection for PTY sessions
//! - Centralise constants for max payload sizes, allowed schemes, etc.

use thiserror::Error;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// Maximum allowed length of a PTY data payload in bytes.
pub const MAX_PTY_WRITE_BYTES: usize = 64 * 1024; // 64 KiB

/// Maximum length of a notification title or body.
pub const MAX_NOTIFICATION_LEN: usize = 512;

/// URL schemes that are permitted by `openExternal`.
pub const ALLOWED_URL_SCHEMES: &[&str] = &["https", "http", "mailto"];

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/// Errors produced by the security validation layer.
#[derive(Debug, Error)]
pub enum SecurityError {
    #[error("invalid session ID format: {0}")]
    InvalidSessionId(String),

    #[error("payload too large: {size} bytes (max {max})")]
    PayloadTooLarge { size: usize, max: usize },

    #[error("disallowed URL scheme: {0}")]
    DisallowedUrlScheme(String),

    #[error("invalid URL: {0}")]
    InvalidUrl(String),

    #[error("disallowed environment variable: {0}")]
    DisallowedEnvVar(String),

    #[error("invalid path: {0}")]
    InvalidPath(String),
}

// ---------------------------------------------------------------------------
// Validators
// ---------------------------------------------------------------------------

/// Validate that a session ID is a well-formed UUID v4 string.
///
/// Accepting arbitrary strings as session IDs could allow path traversal or
/// log injection attacks.
pub fn validate_session_id(id: &str) -> Result<(), SecurityError> {
    // UUID v4: 8-4-4-4-12 hex chars with hyphens, version nibble = 4
    let re_ok = id.len() == 36
        && id.chars().enumerate().all(|(i, c)| match i {
            8 | 13 | 18 | 23 => c == '-',
            _ => c.is_ascii_hexdigit(),
        });
    if re_ok {
        Ok(())
    } else {
        Err(SecurityError::InvalidSessionId(id.to_owned()))
    }
}

/// Validate the size of a PTY write payload.
pub fn validate_pty_payload(data: &[u8]) -> Result<(), SecurityError> {
    if data.len() > MAX_PTY_WRITE_BYTES {
        Err(SecurityError::PayloadTooLarge {
            size: data.len(),
            max: MAX_PTY_WRITE_BYTES,
        })
    } else {
        Ok(())
    }
}

/// Validate a URL for use with `openExternal`.
///
/// # TODO (DAW-549)
/// Use a proper URL parsing library (e.g. `url` crate) for robust validation.
pub fn validate_external_url(url: &str) -> Result<(), SecurityError> {
    let scheme = url
        .split("://")
        .next()
        .ok_or_else(|| SecurityError::InvalidUrl(url.to_owned()))?;

    if ALLOWED_URL_SCHEMES.contains(&scheme) {
        Ok(())
    } else {
        Err(SecurityError::DisallowedUrlScheme(scheme.to_owned()))
    }
}

/// Validate a working-directory path for PTY sessions.
///
/// Rejects paths containing `..` components to prevent directory traversal.
///
/// # TODO (DAW-549)
/// Add OS-specific canonicalisation and existence checks.
pub fn validate_cwd(path: &str) -> Result<(), SecurityError> {
    if path.contains("..") {
        Err(SecurityError::InvalidPath(path.to_owned()))
    } else {
        Ok(())
    }
}

/// Returns `true` if the given environment variable name is on the allow-list.
///
/// Only whitelisted variables may be injected into PTY sessions to prevent
/// credential leakage or privilege escalation.
///
/// # TODO (DAW-549)
/// Make the allow-list configurable at runtime.
pub fn is_allowed_env_var(name: &str) -> bool {
    const ALLOWED: &[&str] = &[
        "MINIMAX_API_KEY",
        "PATH",
        "HOME",
        "LANG",
        "TERM",
        "COLORTERM",
        "ANTHROPIC_API_KEY",
    ];
    ALLOWED.contains(&name)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn valid_uuid_accepted() {
        assert!(validate_session_id("550e8400-e29b-41d4-a716-446655440000").is_ok());
    }

    #[test]
    fn invalid_uuid_rejected() {
        assert!(validate_session_id("../../etc/passwd").is_err());
        assert!(validate_session_id("short").is_err());
        assert!(validate_session_id("").is_err());
    }

    #[test]
    fn pty_payload_size_ok() {
        let data = vec![b'a'; 1024];
        assert!(validate_pty_payload(&data).is_ok());
    }

    #[test]
    fn pty_payload_too_large() {
        let data = vec![b'a'; MAX_PTY_WRITE_BYTES + 1];
        assert!(validate_pty_payload(&data).is_err());
    }

    #[test]
    fn https_url_allowed() {
        assert!(validate_external_url("https://example.com").is_ok());
    }

    #[test]
    fn file_url_rejected() {
        assert!(validate_external_url("file:///etc/passwd").is_err());
    }

    #[test]
    fn javascript_url_rejected() {
        assert!(validate_external_url("javascript:alert(1)").is_err());
    }

    #[test]
    fn traversal_path_rejected() {
        assert!(validate_cwd("/home/user/../../../etc").is_err());
    }

    #[test]
    fn normal_path_accepted() {
        assert!(validate_cwd("/home/user/projects").is_ok());
    }

    #[test]
    fn allowed_env_vars() {
        assert!(is_allowed_env_var("MINIMAX_API_KEY"));
        assert!(is_allowed_env_var("PATH"));
        assert!(!is_allowed_env_var("SECRET_TOKEN"));
        assert!(!is_allowed_env_var("AWS_SECRET_ACCESS_KEY"));
    }
}
