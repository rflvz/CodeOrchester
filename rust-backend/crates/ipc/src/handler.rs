use tracing::warn;
use uuid::Uuid;

use security::{
    audit_log, validate_cli_arg, validate_cwd, validate_external_url, validate_pty_payload,
    validate_session_id, AuditSeverity,
};

use crate::commands::IpcCommand;
use crate::events::{CommandResultPayload, IpcEvent};

/// Process an incoming [`IpcCommand`], validate all inputs via the security
/// layer, and return the [`IpcEvent`] to send back.
///
/// Validation errors are returned as `CommandResult { success: false }` so
/// the renderer always gets a typed response.
pub async fn handle_command(command: IpcCommand) -> IpcEvent {
    let request_id = Uuid::new_v4().to_string();

    if let Err(e) = validate_command(&command) {
        warn!(error = %e, "Security validation failed");
        audit_log(
            AuditSeverity::Critical,
            "validation_failed",
            &format!("{e}"),
        );
        return IpcEvent::CommandResult(CommandResultPayload {
            request_id,
            success: false,
            error: Some(e.to_string()),
        });
    }

    match &command {
        IpcCommand::StartPty(p) => {
            tracing::info!(
                session_id = %p.session_id,
                cwd = ?p.cwd,
                "Received StartPty"
            );
        }
        IpcCommand::WritePty(p) => {
            tracing::info!(
                session_id = %p.session_id,
                data_len = p.data.len(),
                "Received WritePty"
            );
        }
        IpcCommand::ResizePty(p) => {
            tracing::info!(
                session_id = %p.session_id,
                cols = p.cols,
                rows = p.rows,
                "Received ResizePty"
            );
        }
        IpcCommand::KillPty(p) => {
            tracing::info!(session_id = %p.session_id, "Received KillPty");
        }
        IpcCommand::ClaudeCli(p) => {
            tracing::info!(
                session_id = %p.session_id,
                args = ?p.args,
                "Received ClaudeCli"
            );
        }
        IpcCommand::MiniMaxComplete(p) => {
            tracing::info!(
                request_id = %p.request_id,
                prompt_len = p.prompt.len(),
                "Received MiniMaxComplete"
            );
        }
    }

    IpcEvent::CommandResult(CommandResultPayload {
        request_id,
        success: true,
        error: None,
    })
}

/// Run all security checks applicable to the given command.
fn validate_command(command: &IpcCommand) -> Result<(), security::SecurityError> {
    match command {
        IpcCommand::StartPty(p) => {
            validate_session_id(&p.session_id)?;
            if let Some(cwd) = &p.cwd {
                validate_cwd(cwd)?;
            }
        }
        IpcCommand::WritePty(p) => {
            validate_session_id(&p.session_id)?;
            validate_pty_payload(p.data.as_bytes())?;
        }
        IpcCommand::ResizePty(p) => {
            validate_session_id(&p.session_id)?;
        }
        IpcCommand::KillPty(p) => {
            validate_session_id(&p.session_id)?;
        }
        IpcCommand::ClaudeCli(p) => {
            validate_session_id(&p.session_id)?;
            for arg in &p.args {
                validate_cli_arg(arg)?;
            }
        }
        IpcCommand::MiniMaxComplete(p) => {
            // Validate prompt size using the PTY payload limit as the ceiling.
            validate_pty_payload(p.prompt.as_bytes())?;
        }
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::{
        ClaudeCliPayload, KillPtyPayload, MiniMaxCompletePayload, ResizePtyPayload,
        StartPtyPayload, WritePtyPayload,
    };

    // --- Happy path -----------------------------------------------------------

    #[tokio::test]
    async fn handle_start_pty_returns_success() {
        let cmd = IpcCommand::StartPty(StartPtyPayload {
            session_id: "550e8400-e29b-41d4-a716-446655440000".into(),
            cwd: None,
        });
        let ev = handle_command(cmd).await;
        match ev {
            IpcEvent::CommandResult(p) => {
                assert!(p.success);
                assert!(p.error.is_none());
            }
            other => panic!("unexpected event: {:?}", other),
        }
    }

    #[tokio::test]
    async fn handle_write_pty_returns_success() {
        let cmd = IpcCommand::WritePty(WritePtyPayload {
            session_id: "550e8400-e29b-41d4-a716-446655440000".into(),
            data: "echo hi\n".into(),
        });
        let ev = handle_command(cmd).await;
        match ev {
            IpcEvent::CommandResult(p) => assert!(p.success),
            other => panic!("unexpected event: {:?}", other),
        }
    }

    #[tokio::test]
    async fn handle_minimax_complete_returns_success() {
        let cmd = IpcCommand::MiniMaxComplete(MiniMaxCompletePayload {
            request_id: "r1".into(),
            prompt: "translate this".into(),
        });
        let ev = handle_command(cmd).await;
        match ev {
            IpcEvent::CommandResult(p) => assert!(p.success),
            other => panic!("unexpected event: {:?}", other),
        }
    }

    #[tokio::test]
    async fn handle_claude_cli_returns_success() {
        let cmd = IpcCommand::ClaudeCli(ClaudeCliPayload {
            session_id: "550e8400-e29b-41d4-a716-446655440000".into(),
            args: vec!["--help".into()],
        });
        let ev = handle_command(cmd).await;
        match ev {
            IpcEvent::CommandResult(p) => assert!(p.success),
            other => panic!("unexpected event: {:?}", other),
        }
    }

    // --- Security rejections --------------------------------------------------

    #[tokio::test]
    async fn invalid_session_id_rejected() {
        let cmd = IpcCommand::StartPty(StartPtyPayload {
            session_id: "../../etc/passwd".into(),
            cwd: None,
        });
        let ev = handle_command(cmd).await;
        match ev {
            IpcEvent::CommandResult(p) => {
                assert!(!p.success);
                assert!(p.error.is_some());
            }
            other => panic!("unexpected event: {:?}", other),
        }
    }

    #[tokio::test]
    async fn traversal_cwd_rejected() {
        let cmd = IpcCommand::StartPty(StartPtyPayload {
            session_id: "550e8400-e29b-41d4-a716-446655440000".into(),
            cwd: Some("/home/user/../../etc".into()),
        });
        let ev = handle_command(cmd).await;
        match ev {
            IpcEvent::CommandResult(p) => {
                assert!(!p.success);
                assert!(p.error.is_some());
            }
            other => panic!("unexpected event: {:?}", other),
        }
    }

    #[tokio::test]
    async fn shell_injection_in_cli_arg_rejected() {
        let cmd = IpcCommand::ClaudeCli(ClaudeCliPayload {
            session_id: "550e8400-e29b-41d4-a716-446655440000".into(),
            args: vec!["--prompt".into(), "hello; rm -rf /".into()],
        });
        let ev = handle_command(cmd).await;
        match ev {
            IpcEvent::CommandResult(p) => {
                assert!(!p.success);
                assert!(p.error.is_some());
            }
            other => panic!("unexpected event: {:?}", other),
        }
    }

    #[tokio::test]
    async fn oversized_write_pty_rejected() {
        let cmd = IpcCommand::WritePty(WritePtyPayload {
            session_id: "550e8400-e29b-41d4-a716-446655440000".into(),
            data: "x".repeat(security::MAX_PTY_WRITE_BYTES + 1),
        });
        let ev = handle_command(cmd).await;
        match ev {
            IpcEvent::CommandResult(p) => {
                assert!(!p.success);
                assert!(p.error.is_some());
            }
            other => panic!("unexpected event: {:?}", other),
        }
    }

    #[tokio::test]
    async fn valid_resize_returns_success() {
        let cmd = IpcCommand::ResizePty(ResizePtyPayload {
            session_id: "550e8400-e29b-41d4-a716-446655440000".into(),
            cols: 120,
            rows: 40,
        });
        let ev = handle_command(cmd).await;
        match ev {
            IpcEvent::CommandResult(p) => assert!(p.success),
            other => panic!("unexpected event: {:?}", other),
        }
    }

    #[tokio::test]
    async fn valid_kill_pty_returns_success() {
        let cmd = IpcCommand::KillPty(KillPtyPayload {
            session_id: "550e8400-e29b-41d4-a716-446655440000".into(),
        });
        let ev = handle_command(cmd).await;
        match ev {
            IpcEvent::CommandResult(p) => assert!(p.success),
            other => panic!("unexpected event: {:?}", other),
        }
    }
}
