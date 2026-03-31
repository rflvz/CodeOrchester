use tracing::info;
use uuid::Uuid;

use crate::commands::IpcCommand;
use crate::events::{CommandResultPayload, IpcEvent};

/// Process an incoming [`IpcCommand`] and return the [`IpcEvent`] to send back.
///
/// The real PTY / CLI / MiniMax logic will be wired in DAW-546/547/548.
/// For now every command returns a successful [`IpcEvent::CommandResult`].
pub async fn handle_command(command: IpcCommand) -> IpcEvent {
    let request_id = Uuid::new_v4().to_string();

    match &command {
        IpcCommand::StartPty(p) => {
            info!(
                session_id = %p.session_id,
                cwd = ?p.cwd,
                "Received StartPty"
            );
        }
        IpcCommand::WritePty(p) => {
            info!(
                session_id = %p.session_id,
                data_len = p.data.len(),
                "Received WritePty"
            );
        }
        IpcCommand::ResizePty(p) => {
            info!(
                session_id = %p.session_id,
                cols = p.cols,
                rows = p.rows,
                "Received ResizePty"
            );
        }
        IpcCommand::KillPty(p) => {
            info!(session_id = %p.session_id, "Received KillPty");
        }
        IpcCommand::ClaudeCli(p) => {
            info!(
                session_id = %p.session_id,
                args = ?p.args,
                "Received ClaudeCli"
            );
        }
        IpcCommand::MiniMaxComplete(p) => {
            info!(
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::{
        ClaudeCliPayload, MiniMaxCompletePayload, StartPtyPayload, WritePtyPayload,
    };

    #[tokio::test]
    async fn handle_start_pty_returns_success() {
        let cmd = IpcCommand::StartPty(StartPtyPayload {
            session_id: "test-sess".into(),
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
            session_id: "s1".into(),
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
            session_id: "s2".into(),
            args: vec!["--help".into()],
        });
        let ev = handle_command(cmd).await;
        match ev {
            IpcEvent::CommandResult(p) => assert!(p.success),
            other => panic!("unexpected event: {:?}", other),
        }
    }
}
