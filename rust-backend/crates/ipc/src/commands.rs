use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// Payload structs (all fields camelCase in JSON)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartPtyPayload {
    pub session_id: String,
    pub cwd: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WritePtyPayload {
    pub session_id: String,
    pub data: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResizePtyPayload {
    pub session_id: String,
    pub cols: u16,
    pub rows: u16,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KillPtyPayload {
    pub session_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeCliPayload {
    pub session_id: String,
    pub args: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MiniMaxCompletePayload {
    pub request_id: String,
    pub prompt: String,
}

// ---------------------------------------------------------------------------
// Command enum
// ---------------------------------------------------------------------------

/// Commands sent from the Electron renderer (via preload) to the Rust IPC server.
///
/// Wire format (JSON):
/// ```json
/// { "type": "startPty", "payload": { "sessionId": "…", "cwd": null } }
/// ```
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "payload", rename_all = "camelCase")]
pub enum IpcCommand {
    StartPty(StartPtyPayload),
    WritePty(WritePtyPayload),
    ResizePty(ResizePtyPayload),
    KillPty(KillPtyPayload),
    ClaudeCli(ClaudeCliPayload),
    MiniMaxComplete(MiniMaxCompletePayload),
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn roundtrip(cmd: &IpcCommand) -> IpcCommand {
        let json = serde_json::to_string(cmd).unwrap();
        serde_json::from_str(&json).unwrap()
    }

    #[test]
    fn serialise_start_pty_variant_name() {
        let cmd = IpcCommand::StartPty(StartPtyPayload {
            session_id: "sess-1".into(),
            cwd: Some("/home/user".into()),
        });
        let json = serde_json::to_string(&cmd).unwrap();
        assert!(json.contains("\"type\":\"startPty\""), "variant name should be camelCase: {json}");
        assert!(json.contains("\"sessionId\""), "field name should be camelCase: {json}");
        assert!(json.contains("sess-1"));
    }

    #[test]
    fn deserialise_write_pty() {
        let json = r#"{"type":"writePty","payload":{"sessionId":"s1","data":"ls\n"}}"#;
        let cmd: IpcCommand = serde_json::from_str(json).unwrap();
        match cmd {
            IpcCommand::WritePty(p) => {
                assert_eq!(p.session_id, "s1");
                assert_eq!(p.data, "ls\n");
            }
            other => panic!("unexpected variant: {:?}", other),
        }
    }

    #[test]
    fn deserialise_resize_pty() {
        let json = r#"{"type":"resizePty","payload":{"sessionId":"s2","cols":120,"rows":40}}"#;
        let cmd: IpcCommand = serde_json::from_str(json).unwrap();
        match cmd {
            IpcCommand::ResizePty(p) => {
                assert_eq!(p.session_id, "s2");
                assert_eq!(p.cols, 120);
                assert_eq!(p.rows, 40);
            }
            other => panic!("unexpected variant: {:?}", other),
        }
    }

    #[test]
    fn deserialise_kill_pty() {
        let json = r#"{"type":"killPty","payload":{"sessionId":"s3"}}"#;
        let cmd: IpcCommand = serde_json::from_str(json).unwrap();
        match cmd {
            IpcCommand::KillPty(p) => assert_eq!(p.session_id, "s3"),
            other => panic!("unexpected variant: {:?}", other),
        }
    }

    #[test]
    fn deserialise_claude_cli() {
        let json = r#"{"type":"claudeCli","payload":{"sessionId":"s4","args":["--help"]}}"#;
        let cmd: IpcCommand = serde_json::from_str(json).unwrap();
        match cmd {
            IpcCommand::ClaudeCli(p) => {
                assert_eq!(p.session_id, "s4");
                assert_eq!(p.args, vec!["--help"]);
            }
            other => panic!("unexpected variant: {:?}", other),
        }
    }

    #[test]
    fn deserialise_minimax_complete() {
        let json = r#"{"type":"miniMaxComplete","payload":{"requestId":"req-1","prompt":"hello"}}"#;
        let cmd: IpcCommand = serde_json::from_str(json).unwrap();
        match cmd {
            IpcCommand::MiniMaxComplete(p) => {
                assert_eq!(p.request_id, "req-1");
                assert_eq!(p.prompt, "hello");
            }
            other => panic!("unexpected variant: {:?}", other),
        }
    }

    #[test]
    fn roundtrip_start_pty_with_cwd() {
        let cmd = IpcCommand::StartPty(StartPtyPayload {
            session_id: "abc".into(),
            cwd: Some("/tmp".into()),
        });
        match roundtrip(&cmd) {
            IpcCommand::StartPty(p) => {
                assert_eq!(p.session_id, "abc");
                assert_eq!(p.cwd.unwrap(), "/tmp");
            }
            other => panic!("unexpected: {:?}", other),
        }
    }
}
