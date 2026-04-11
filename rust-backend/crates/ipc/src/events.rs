use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// Payload structs (all fields camelCase in JSON)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PtyOutputPayload {
    pub session_id: String,
    pub data: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PtyExitPayload {
    pub session_id: String,
    pub exit_code: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrabajoTerminadoPayload {
    pub session_id: String,
    pub value: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentStatusChangedPayload {
    pub agent_id: String,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandResultPayload {
    pub request_id: String,
    pub success: bool,
    pub error: Option<String>,
}

// ---------------------------------------------------------------------------
// Event enum
// ---------------------------------------------------------------------------

/// Events emitted by the Rust IPC server to connected Electron clients.
///
/// Wire format (JSON):
/// ```json
/// { "type": "ptyOutput", "payload": { "sessionId": "…", "data": "…" } }
/// ```
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "payload", rename_all = "camelCase")]
pub enum IpcEvent {
    PtyOutput(PtyOutputPayload),
    PtyExit(PtyExitPayload),
    TrabajoTerminado(TrabajoTerminadoPayload),
    AgentStatusChanged(AgentStatusChangedPayload),
    CommandResult(CommandResultPayload),
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn roundtrip(ev: &IpcEvent) -> IpcEvent {
        let json = serde_json::to_string(ev).unwrap();
        serde_json::from_str(&json).unwrap()
    }

    #[test]
    fn serialise_pty_output_camel_case() {
        let ev = IpcEvent::PtyOutput(PtyOutputPayload {
            session_id: "s1".into(),
            data: "hello\r\n".into(),
        });
        let json = serde_json::to_string(&ev).unwrap();
        assert!(json.contains("\"type\":\"ptyOutput\""), "variant name: {json}");
        assert!(json.contains("\"sessionId\""), "field name: {json}");
        assert!(json.contains("hello"));
    }

    #[test]
    fn roundtrip_pty_exit() {
        let ev = IpcEvent::PtyExit(PtyExitPayload { session_id: "s2".into(), exit_code: 0 });
        match roundtrip(&ev) {
            IpcEvent::PtyExit(p) => {
                assert_eq!(p.session_id, "s2");
                assert_eq!(p.exit_code, 0);
            }
            other => panic!("unexpected: {:?}", other),
        }
    }

    #[test]
    fn roundtrip_trabajo_terminado() {
        let ev = IpcEvent::TrabajoTerminado(TrabajoTerminadoPayload {
            session_id: "s3".into(),
            value: true,
        });
        match roundtrip(&ev) {
            IpcEvent::TrabajoTerminado(p) => {
                assert_eq!(p.session_id, "s3");
                assert!(p.value);
            }
            other => panic!("unexpected: {:?}", other),
        }
    }

    #[test]
    fn roundtrip_agent_status_changed() {
        let ev = IpcEvent::AgentStatusChanged(AgentStatusChangedPayload {
            agent_id: "a1".into(),
            status: "running".into(),
        });
        match roundtrip(&ev) {
            IpcEvent::AgentStatusChanged(p) => {
                assert_eq!(p.agent_id, "a1");
                assert_eq!(p.status, "running");
            }
            other => panic!("unexpected: {:?}", other),
        }
    }

    #[test]
    fn roundtrip_command_result_error() {
        let ev = IpcEvent::CommandResult(CommandResultPayload {
            request_id: "req-99".into(),
            success: false,
            error: Some("session not found".into()),
        });
        match roundtrip(&ev) {
            IpcEvent::CommandResult(p) => {
                assert_eq!(p.request_id, "req-99");
                assert!(!p.success);
                assert_eq!(p.error.unwrap(), "session not found");
            }
            other => panic!("unexpected: {:?}", other),
        }
    }

    #[test]
    fn deserialise_command_result_from_json() {
        let json = r#"{"type":"commandResult","payload":{"requestId":"r1","success":true,"error":null}}"#;
        let ev: IpcEvent = serde_json::from_str(json).unwrap();
        match ev {
            IpcEvent::CommandResult(p) => {
                assert_eq!(p.request_id, "r1");
                assert!(p.success);
                assert!(p.error.is_none());
            }
            other => panic!("unexpected: {:?}", other),
        }
    }
}
