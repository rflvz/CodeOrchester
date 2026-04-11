//! # claude-cli
//!
//! Robust integration with the `claude` CLI binary (DAW-547).
//!
//! ## Responsibilities
//! - Locate the `claude` binary on `PATH`
//! - Launch Claude CLI sessions inside a PTY (delegates to `pty-manager`)
//! - Parse structured output and `trabajo_terminado` sentinel values
//! - Implement retry / back-off for transient failures
//! - Expose an async API for the IPC layer to send prompts and receive results

use serde::{Deserialize, Serialize};
use thiserror::Error;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/// Configuration for a Claude CLI invocation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClaudeConfig {
    /// Path to the `claude` binary (defaults to `claude` on `PATH`).
    pub binary_path: Option<String>,
    /// Working directory for the subprocess.
    pub cwd: Option<String>,
    /// Maximum number of retry attempts on transient errors.
    pub max_retries: u32,
    /// Timeout in seconds for a single invocation.
    pub timeout_secs: u64,
}

impl Default for ClaudeConfig {
    fn default() -> Self {
        Self {
            binary_path: None,
            cwd: None,
            max_retries: 3,
            timeout_secs: 300,
        }
    }
}

/// A prompt sent to the Claude CLI.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClaudePrompt {
    /// Session/agent identifier for routing responses back.
    pub session_id: String,
    /// The prompt text to pass to the CLI.
    pub text: String,
    /// Optional skill name to activate (maps to `--skill` flag or equivalent).
    pub skill: Option<String>,
}

/// A response chunk streamed back from the Claude CLI.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClaudeResponse {
    pub session_id: String,
    /// Partial or final output text.
    pub text: String,
    /// Whether this is the final chunk for this invocation.
    pub is_final: bool,
    /// Parsed `trabajo_terminado` value, if present in the output.
    pub trabajo_terminado: Option<bool>,
}

/// Errors produced by the Claude CLI integrator.
#[derive(Debug, Error)]
pub enum ClaudeError {
    #[error("claude binary not found: {0}")]
    BinaryNotFound(String),

    #[error("spawn failed: {0}")]
    SpawnFailed(String),

    #[error("timeout after {secs}s")]
    Timeout { secs: u64 },

    #[error("max retries ({attempts}) exceeded: {last_error}")]
    MaxRetriesExceeded { attempts: u32, last_error: String },

    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
}

// ---------------------------------------------------------------------------
// ClaudeCliIntegrator
// ---------------------------------------------------------------------------

/// Manages Claude CLI sessions for one or more agents.
///
/// # TODO (DAW-547)
/// - Implement binary discovery (`which claude` / config override)
/// - Integrate with `pty-manager` to spawn CLI sessions
/// - Parse streaming output and `trabajo_terminado` sentinel
/// - Add exponential back-off retry logic
#[allow(dead_code)]
pub struct ClaudeCliIntegrator {
    config: ClaudeConfig,
}

impl ClaudeCliIntegrator {
    /// Create a new integrator with the given configuration.
    pub fn new(config: ClaudeConfig) -> Self {
        Self { config }
    }

    /// Discover the path to the `claude` binary.
    ///
    /// # TODO (DAW-547)
    pub fn locate_binary(&self) -> Result<std::path::PathBuf, ClaudeError> {
        todo!("DAW-547: locate claude binary (check config override, then PATH)")
    }

    /// Send a prompt to Claude CLI and stream back responses.
    ///
    /// # TODO (DAW-547)
    pub async fn send_prompt(
        &self,
        _prompt: ClaudePrompt,
    ) -> Result<tokio::sync::mpsc::Receiver<ClaudeResponse>, ClaudeError> {
        todo!("DAW-547: spawn claude CLI process, pipe prompt, stream ClaudeResponse chunks")
    }

    /// Parse a line of raw PTY output for the `trabajo_terminado` sentinel.
    ///
    /// Returns `Some(bool)` when the sentinel is present, `None` otherwise.
    pub fn parse_trabajo_terminado(line: &str) -> Option<bool> {
        // TODO (DAW-547): handle edge-cases (whitespace, ANSI escapes)
        if line.contains("trabajo_terminado=true") {
            Some(true)
        } else if line.contains("trabajo_terminado=false") {
            Some(false)
        } else {
            None
        }
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_trabajo_terminado_true() {
        assert_eq!(
            ClaudeCliIntegrator::parse_trabajo_terminado("trabajo_terminado=true"),
            Some(true)
        );
    }

    #[test]
    fn parse_trabajo_terminado_false() {
        assert_eq!(
            ClaudeCliIntegrator::parse_trabajo_terminado("trabajo_terminado=false"),
            Some(false)
        );
    }

    #[test]
    fn parse_trabajo_terminado_none() {
        assert_eq!(
            ClaudeCliIntegrator::parse_trabajo_terminado("some random output"),
            None
        );
    }

    #[test]
    fn parse_trabajo_terminado_embedded_in_line() {
        // sentinel can appear mid-line (e.g. prefixed by a timestamp)
        assert_eq!(
            ClaudeCliIntegrator::parse_trabajo_terminado(
                "[INFO] agent output trabajo_terminado=true done"
            ),
            Some(true)
        );
    }

    #[test]
    fn parse_trabajo_terminado_false_embedded() {
        assert_eq!(
            ClaudeCliIntegrator::parse_trabajo_terminado(
                "prefix trabajo_terminado=false suffix"
            ),
            Some(false)
        );
    }

    #[test]
    fn parse_trabajo_terminado_empty_line() {
        assert_eq!(ClaudeCliIntegrator::parse_trabajo_terminado(""), None);
    }

    #[test]
    fn parse_trabajo_terminado_similar_but_wrong_key() {
        // "trabajo_terminado" without "=" should not match
        assert_eq!(
            ClaudeCliIntegrator::parse_trabajo_terminado("trabajo_terminado true"),
            None
        );
    }

    #[test]
    fn parse_trabajo_terminado_multiline_finds_true_line() {
        // Simulate checking each line of multi-line PTY output
        let output = "Agent starting...\nRunning task\ntrabajo_terminado=true\nDone";
        let result = output
            .lines()
            .find_map(ClaudeCliIntegrator::parse_trabajo_terminado);
        assert_eq!(result, Some(true));
    }

    #[test]
    fn parse_trabajo_terminado_multiline_finds_false_line() {
        let output = "Agent starting...\ntrabajo_terminado=false\nError occurred";
        let result = output
            .lines()
            .find_map(ClaudeCliIntegrator::parse_trabajo_terminado);
        assert_eq!(result, Some(false));
    }

    #[test]
    fn parse_trabajo_terminado_multiline_no_sentinel() {
        let output = "Agent starting...\nRunning...\nCompleted without sentinel";
        let result = output
            .lines()
            .find_map(ClaudeCliIntegrator::parse_trabajo_terminado);
        assert_eq!(result, None);
    }
}
