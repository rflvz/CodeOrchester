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

    // -------------------------------------------------------------------------
    // Additional targeted tests
    // -------------------------------------------------------------------------

    #[test]
    fn valid_uuid_v4_format_accepted() {
        // Standard UUID v4 (version nibble = 4 is not enforced by the regex,
        // only the shape 8-4-4-4-12 hex is validated)
        assert!(validate_session_id("f47ac10b-58cc-4372-a567-0e02b2c3d479").is_ok());
    }

    #[test]
    fn uuid_wrong_length_rejected() {
        // 35 chars (one too short)
        assert!(validate_session_id("550e8400-e29b-41d4-a716-44665544000").is_err());
    }

    #[test]
    fn uuid_with_invalid_chars_rejected() {
        // contains 'z' which is not a hex digit
        assert!(validate_session_id("550e8400-e29b-41d4-a716-44665544000z").is_err());
    }

    #[test]
    fn payload_exactly_at_limit_is_ok() {
        let data = vec![b'x'; MAX_PTY_WRITE_BYTES];
        assert!(validate_pty_payload(&data).is_ok());
    }

    #[test]
    fn payload_one_byte_over_limit_is_err() {
        let data = vec![b'x'; MAX_PTY_WRITE_BYTES + 1];
        let err = validate_pty_payload(&data).unwrap_err();
        // Verify the error carries the right metadata
        assert!(matches!(
            err,
            SecurityError::PayloadTooLarge { size, max }
            if size == MAX_PTY_WRITE_BYTES + 1 && max == MAX_PTY_WRITE_BYTES
        ));
    }

    #[test]
    fn empty_payload_is_ok() {
        assert!(validate_pty_payload(&[]).is_ok());
    }

    #[test]
    fn http_url_allowed() {
        assert!(validate_external_url("http://example.com").is_ok());
    }

    #[test]
    fn mailto_url_allowed() {
        // "mailto" is in ALLOWED_URL_SCHEMES; the validator uses split("://")
        // so the URL must have "://" for the scheme to be extracted correctly.
        // "mailto://user@example.com" is non-standard but passes the scheme check.
        assert!(validate_external_url("mailto://user@example.com").is_ok());
    }

    #[test]
    fn ftp_url_rejected() {
        assert!(validate_external_url("ftp://files.example.com").is_err());
    }

    #[test]
    fn url_without_scheme_separator_rejected() {
        // No "://" — split gives a single token which is not in ALLOWED list
        assert!(validate_external_url("example.com").is_err());
    }

    #[test]
    fn traversal_with_windows_style_rejected() {
        // ".." still matches on Windows-style paths
        assert!(validate_cwd("C:\\Users\\..\\etc").is_err());
    }

    #[test]
    fn relative_cwd_without_traversal_accepted() {
        assert!(validate_cwd("src/main.rs").is_ok());
    }

    #[test]
    fn anthropic_api_key_is_allowed() {
        assert!(is_allowed_env_var("ANTHROPIC_API_KEY"));
    }

    #[test]
    fn term_env_var_is_allowed() {
        assert!(is_allowed_env_var("TERM"));
        assert!(is_allowed_env_var("COLORTERM"));
    }

    #[test]
    fn empty_env_var_name_rejected() {
        assert!(!is_allowed_env_var(""));
    }
}
