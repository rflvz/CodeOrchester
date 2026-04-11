use serde::{Deserialize, Serialize};

/// Individual AI agent managed by the state system.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Agent {
    pub id: String,
    pub name: String,
    pub status: AgentStatus,
    pub team_id: Option<String>,
    pub skills: Vec<String>,
    pub current_task: Option<String>,
}

/// Lifecycle status of an agent.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum AgentStatus {
    Idle,
    Running,
    Success,
    Error,
    Paused,
}

/// A team grouping one or more agents under a given topology.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Team {
    pub id: String,
    pub name: String,
    /// IDs of agents that belong to this team.
    pub agents: Vec<String>,
    pub topology: Topology,
}

/// How agents in a team collaborate.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum Topology {
    Hierarchical,
    Mesh,
    Star,
    Chain,
}

/// An active PTY session linked to an agent.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Session {
    pub id: String,
    pub agent_id: String,
    pub pid: Option<u32>,
    pub cwd: Option<String>,
    /// Unix timestamp (seconds since epoch) when the session was created.
    pub created_at: u64,
}
