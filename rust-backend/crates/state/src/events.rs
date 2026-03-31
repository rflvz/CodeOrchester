use serde::{Deserialize, Serialize};

use crate::entities::{Agent, Session, Team};

/// Events emitted whenever state changes. These are broadcast over a tokio channel
/// so that any subscriber (e.g. the IPC layer) can forward them to the renderer.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum StateEvent {
    AgentCreated { agent: Agent },
    AgentUpdated { agent: Agent },
    AgentDeleted { agent_id: String },
    TeamCreated { team: Team },
    TeamUpdated { team: Team },
    TeamDeleted { team_id: String },
    SessionAdded { session: Session },
    SessionRemoved { session_id: String },
}
