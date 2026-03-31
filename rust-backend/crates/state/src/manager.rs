use std::sync::Arc;

use dashmap::DashMap;
use tokio::sync::broadcast;
use tracing::{debug, warn};

use crate::{
    entities::{Agent, AgentStatus, Session, Team},
    events::StateEvent,
};

/// Capacity of the broadcast channel. Slow receivers that fall behind will receive
/// a `RecvError::Lagged` rather than blocking producers.
const BROADCAST_CAPACITY: usize = 256;

/// Errors that can be returned by [`StateManager`] operations.
#[derive(Debug, thiserror::Error)]
pub enum StateError {
    #[error("agent not found: {0}")]
    AgentNotFound(String),

    #[error("team not found: {0}")]
    TeamNotFound(String),

    #[error("session not found: {0}")]
    SessionNotFound(String),

    #[error("persistence error: {0}")]
    Persistence(#[from] PersistenceError),
}

/// Re-export so callers can use a single error type.
pub use crate::persistence::PersistenceError;

/// Thread-safe, in-memory state store for agents, teams, and PTY sessions.
///
/// Wrap in [`Arc`] to share across async tasks:
/// ```rust,ignore
/// let state = StateManager::new();
/// let state2 = Arc::clone(&state);
/// ```
pub struct StateManager {
    agents: DashMap<String, Agent>,
    teams: DashMap<String, Team>,
    sessions: DashMap<String, Session>,
    event_tx: broadcast::Sender<StateEvent>,
}

impl StateManager {
    /// Create a new, empty state manager.
    pub fn new() -> Arc<Self> {
        let (event_tx, _) = broadcast::channel(BROADCAST_CAPACITY);
        Arc::new(Self {
            agents: DashMap::new(),
            teams: DashMap::new(),
            sessions: DashMap::new(),
            event_tx,
        })
    }

    /// Create a state manager pre-loaded from a JSON file on disk.
    ///
    /// If the file does not exist, an empty manager is returned (first-run behaviour).
    pub fn with_persistence(path: std::path::PathBuf) -> Arc<Self> {
        let (event_tx, _) = broadcast::channel(BROADCAST_CAPACITY);
        let manager = Arc::new(Self {
            agents: DashMap::new(),
            teams: DashMap::new(),
            sessions: DashMap::new(),
            event_tx,
        });

        match crate::persistence::load_state(&path) {
            Ok((agents, teams)) => {
                for (id, agent) in agents {
                    manager.agents.insert(id, agent);
                }
                for (id, team) in teams {
                    manager.teams.insert(id, team);
                }
                debug!(path = %path.display(), "State loaded from disk");
            }
            Err(e) => {
                warn!(error = %e, "Could not load persisted state, starting fresh");
            }
        }

        manager
    }

    // -------------------------------------------------------------------------
    // Agent CRUD
    // -------------------------------------------------------------------------

    /// Insert a new agent and broadcast [`StateEvent::AgentCreated`].
    pub fn create_agent(&self, agent: Agent) -> Result<Agent, StateError> {
        self.agents.insert(agent.id.clone(), agent.clone());
        self.broadcast_state_change(StateEvent::AgentCreated { agent: agent.clone() });
        Ok(agent)
    }

    /// Retrieve a clone of an agent by ID.
    pub fn get_agent(&self, id: &str) -> Option<Agent> {
        self.agents.get(id).map(|r| r.clone())
    }

    /// Apply a mutation closure to an existing agent and broadcast [`StateEvent::AgentUpdated`].
    pub fn update_agent(
        &self,
        id: &str,
        update: impl FnOnce(&mut Agent),
    ) -> Result<Agent, StateError> {
        let mut entry = self
            .agents
            .get_mut(id)
            .ok_or_else(|| StateError::AgentNotFound(id.to_owned()))?;
        update(&mut *entry);
        let updated = entry.clone();
        drop(entry);
        self.broadcast_state_change(StateEvent::AgentUpdated { agent: updated.clone() });
        Ok(updated)
    }

    /// Convenience wrapper around [`update_agent`] for status-only changes.
    pub fn update_agent_status(&self, id: &str, status: AgentStatus) -> Result<(), StateError> {
        self.update_agent(id, |a| a.status = status)?;
        Ok(())
    }

    /// Remove an agent by ID and broadcast [`StateEvent::AgentDeleted`].
    pub fn delete_agent(&self, id: &str) -> Result<(), StateError> {
        self.agents
            .remove(id)
            .ok_or_else(|| StateError::AgentNotFound(id.to_owned()))?;
        self.broadcast_state_change(StateEvent::AgentDeleted {
            agent_id: id.to_owned(),
        });
        Ok(())
    }

    // -------------------------------------------------------------------------
    // Team CRUD
    // -------------------------------------------------------------------------

    /// Insert a new team and broadcast [`StateEvent::TeamCreated`].
    pub fn create_team(&self, team: Team) -> Result<Team, StateError> {
        self.teams.insert(team.id.clone(), team.clone());
        self.broadcast_state_change(StateEvent::TeamCreated { team: team.clone() });
        Ok(team)
    }

    /// Retrieve a clone of a team by ID.
    pub fn get_team(&self, id: &str) -> Option<Team> {
        self.teams.get(id).map(|r| r.clone())
    }

    /// Apply a mutation closure to an existing team and broadcast [`StateEvent::TeamUpdated`].
    pub fn update_team(
        &self,
        id: &str,
        update: impl FnOnce(&mut Team),
    ) -> Result<Team, StateError> {
        let mut entry = self
            .teams
            .get_mut(id)
            .ok_or_else(|| StateError::TeamNotFound(id.to_owned()))?;
        update(&mut *entry);
        let updated = entry.clone();
        drop(entry);
        self.broadcast_state_change(StateEvent::TeamUpdated { team: updated.clone() });
        Ok(updated)
    }

    /// Remove a team by ID and broadcast [`StateEvent::TeamDeleted`].
    pub fn delete_team(&self, id: &str) -> Result<(), StateError> {
        self.teams
            .remove(id)
            .ok_or_else(|| StateError::TeamNotFound(id.to_owned()))?;
        self.broadcast_state_change(StateEvent::TeamDeleted {
            team_id: id.to_owned(),
        });
        Ok(())
    }

    // -------------------------------------------------------------------------
    // Session management
    // -------------------------------------------------------------------------

    /// Register an active PTY session and broadcast [`StateEvent::SessionAdded`].
    pub fn add_session(&self, session: Session) -> Result<(), StateError> {
        self.sessions.insert(session.id.clone(), session.clone());
        self.broadcast_state_change(StateEvent::SessionAdded { session });
        Ok(())
    }

    /// Deregister a PTY session and broadcast [`StateEvent::SessionRemoved`].
    pub fn remove_session(&self, session_id: &str) -> Result<(), StateError> {
        self.sessions
            .remove(session_id)
            .ok_or_else(|| StateError::SessionNotFound(session_id.to_owned()))?;
        self.broadcast_state_change(StateEvent::SessionRemoved {
            session_id: session_id.to_owned(),
        });
        Ok(())
    }

    // -------------------------------------------------------------------------
    // Event broadcast
    // -------------------------------------------------------------------------

    /// Send an event to all active subscribers. Silently drops the event when
    /// there are no subscribers (broadcast::SendError is informational only).
    pub fn broadcast_state_change(&self, event: StateEvent) {
        // Ignore the error: it simply means there are no active receivers.
        let _ = self.event_tx.send(event);
    }

    /// Subscribe to state-change events. The returned receiver will buffer up
    /// to `BROADCAST_CAPACITY` events before lagging.
    pub fn subscribe(&self) -> broadcast::Receiver<StateEvent> {
        self.event_tx.subscribe()
    }

    // -------------------------------------------------------------------------
    // Persistence helpers
    // -------------------------------------------------------------------------

    /// Snapshot current agents and teams to `path` as JSON.
    pub fn save(&self, path: &std::path::Path) -> Result<(), StateError> {
        let agents: std::collections::HashMap<String, Agent> = self
            .agents
            .iter()
            .map(|e| (e.key().clone(), e.value().clone()))
            .collect();
        let teams: std::collections::HashMap<String, Team> = self
            .teams
            .iter()
            .map(|e| (e.key().clone(), e.value().clone()))
            .collect();
        crate::persistence::save_state(path, &agents, &teams)?;
        Ok(())
    }
}

impl Default for StateManager {
    fn default() -> Self {
        let (event_tx, _) = broadcast::channel(BROADCAST_CAPACITY);
        Self {
            agents: DashMap::new(),
            teams: DashMap::new(),
            sessions: DashMap::new(),
            event_tx,
        }
    }
}

// =============================================================================
// Tests
// =============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use crate::entities::{AgentStatus, Topology};

    fn make_agent(id: &str) -> Agent {
        Agent {
            id: id.to_owned(),
            name: format!("Agent {id}"),
            status: AgentStatus::Idle,
            team_id: None,
            skills: vec![],
            current_task: None,
        }
    }

    fn make_team(id: &str) -> Team {
        Team {
            id: id.to_owned(),
            name: format!("Team {id}"),
            agents: vec![],
            topology: Topology::Mesh,
        }
    }

    fn make_session(id: &str, agent_id: &str) -> Session {
        Session {
            id: id.to_owned(),
            agent_id: agent_id.to_owned(),
            pid: Some(1234),
            cwd: Some("/tmp".to_owned()),
            created_at: 0,
        }
    }

    // -------------------------------------------------------------------------
    // Agent tests
    // -------------------------------------------------------------------------

    #[test]
    fn test_create_and_get_agent() {
        let mgr = StateManager::new();
        let agent = make_agent("a1");

        let created = mgr.create_agent(agent.clone()).unwrap();
        assert_eq!(created.id, "a1");

        let fetched = mgr.get_agent("a1").expect("agent should exist");
        assert_eq!(fetched.name, "Agent a1");
    }

    #[test]
    fn test_get_agent_missing_returns_none() {
        let mgr = StateManager::new();
        assert!(mgr.get_agent("nope").is_none());
    }

    #[test]
    fn test_update_agent_status() {
        let mgr = StateManager::new();
        mgr.create_agent(make_agent("a2")).unwrap();

        mgr.update_agent_status("a2", AgentStatus::Running).unwrap();
        let agent = mgr.get_agent("a2").unwrap();
        assert_eq!(agent.status, AgentStatus::Running);
    }

    #[test]
    fn test_update_agent_status_not_found() {
        let mgr = StateManager::new();
        let result = mgr.update_agent_status("ghost", AgentStatus::Error);
        assert!(matches!(result, Err(StateError::AgentNotFound(_))));
    }

    #[test]
    fn test_update_agent_closure() {
        let mgr = StateManager::new();
        mgr.create_agent(make_agent("a3")).unwrap();

        let updated = mgr
            .update_agent("a3", |a| {
                a.current_task = Some("task-1".to_owned());
                a.status = AgentStatus::Running;
            })
            .unwrap();

        assert_eq!(updated.current_task.as_deref(), Some("task-1"));
        assert_eq!(updated.status, AgentStatus::Running);
    }

    #[test]
    fn test_delete_agent() {
        let mgr = StateManager::new();
        mgr.create_agent(make_agent("a4")).unwrap();

        mgr.delete_agent("a4").unwrap();
        assert!(mgr.get_agent("a4").is_none());
    }

    #[test]
    fn test_delete_agent_not_found() {
        let mgr = StateManager::new();
        let result = mgr.delete_agent("ghost");
        assert!(matches!(result, Err(StateError::AgentNotFound(_))));
    }

    // -------------------------------------------------------------------------
    // Team tests
    // -------------------------------------------------------------------------

    #[test]
    fn test_team_crud() {
        let mgr = StateManager::new();
        let mut team = make_team("t1");
        team.topology = Topology::Hierarchical;

        // Create
        let created = mgr.create_team(team.clone()).unwrap();
        assert_eq!(created.id, "t1");

        // Read
        let fetched = mgr.get_team("t1").unwrap();
        assert_eq!(fetched.topology, Topology::Hierarchical);

        // Add agent to team
        let updated = mgr
            .update_team("t1", |t| t.agents.push("a1".to_owned()))
            .unwrap();
        assert!(updated.agents.contains(&"a1".to_owned()));

        // Delete
        mgr.delete_team("t1").unwrap();
        assert!(mgr.get_team("t1").is_none());
    }

    #[test]
    fn test_team_not_found() {
        let mgr = StateManager::new();
        let result = mgr.delete_team("ghost");
        assert!(matches!(result, Err(StateError::TeamNotFound(_))));
    }

    // -------------------------------------------------------------------------
    // Session tests
    // -------------------------------------------------------------------------

    #[test]
    fn test_add_remove_session() {
        let mgr = StateManager::new();
        let session = make_session("s1", "a1");

        mgr.add_session(session).unwrap();

        // Verify session is tracked
        assert!(mgr.sessions.contains_key("s1"));

        mgr.remove_session("s1").unwrap();
        assert!(!mgr.sessions.contains_key("s1"));
    }

    #[test]
    fn test_remove_session_not_found() {
        let mgr = StateManager::new();
        let result = mgr.remove_session("ghost");
        assert!(matches!(result, Err(StateError::SessionNotFound(_))));
    }

    // -------------------------------------------------------------------------
    // Broadcast / event tests
    // -------------------------------------------------------------------------

    #[tokio::test]
    async fn test_broadcast_event() {
        let mgr = StateManager::new();
        let mut rx = mgr.subscribe();

        let agent = make_agent("a-broadcast");
        mgr.broadcast_state_change(StateEvent::AgentCreated {
            agent: agent.clone(),
        });

        let event = rx.recv().await.expect("should receive event");
        match event {
            StateEvent::AgentCreated { agent: received } => {
                assert_eq!(received.id, "a-broadcast");
            }
            other => panic!("unexpected event: {other:?}"),
        }
    }

    #[tokio::test]
    async fn test_create_agent_broadcasts_event() {
        let mgr = StateManager::new();
        let mut rx = mgr.subscribe();

        mgr.create_agent(make_agent("a-evt")).unwrap();

        let event = rx.recv().await.unwrap();
        assert!(matches!(event, StateEvent::AgentCreated { .. }));
    }

    #[tokio::test]
    async fn test_update_agent_status_broadcasts_event() {
        let mgr = StateManager::new();
        mgr.create_agent(make_agent("a-status-evt")).unwrap();

        let mut rx = mgr.subscribe();
        mgr.update_agent_status("a-status-evt", AgentStatus::Success)
            .unwrap();

        let event = rx.recv().await.unwrap();
        assert!(matches!(event, StateEvent::AgentUpdated { .. }));
    }

    #[tokio::test]
    async fn test_delete_agent_broadcasts_event() {
        let mgr = StateManager::new();
        mgr.create_agent(make_agent("a-del-evt")).unwrap();

        let mut rx = mgr.subscribe();
        mgr.delete_agent("a-del-evt").unwrap();

        let event = rx.recv().await.unwrap();
        assert!(matches!(event, StateEvent::AgentDeleted { .. }));
    }

    #[tokio::test]
    async fn test_add_session_broadcasts_event() {
        let mgr = StateManager::new();
        let mut rx = mgr.subscribe();

        mgr.add_session(make_session("s-evt", "a1")).unwrap();

        let event = rx.recv().await.unwrap();
        assert!(matches!(event, StateEvent::SessionAdded { .. }));
    }

    #[tokio::test]
    async fn test_remove_session_broadcasts_event() {
        let mgr = StateManager::new();
        mgr.add_session(make_session("s-rm-evt", "a1")).unwrap();

        let mut rx = mgr.subscribe();
        mgr.remove_session("s-rm-evt").unwrap();

        let event = rx.recv().await.unwrap();
        assert!(matches!(event, StateEvent::SessionRemoved { .. }));
    }

    // -------------------------------------------------------------------------
    // Persistence test
    // -------------------------------------------------------------------------

    #[test]
    fn test_save_and_load_state() {
        use std::path::PathBuf;
        use tempfile::NamedTempFile;

        // Use a temp file so the test is hermetic.
        let tmp = NamedTempFile::new().unwrap();
        let path = PathBuf::from(tmp.path());

        let mgr = StateManager::new();
        mgr.create_agent(make_agent("persist-1")).unwrap();
        mgr.create_team(make_team("team-persist-1")).unwrap();
        mgr.save(&path).unwrap();

        // Load into a fresh manager
        let mgr2 = StateManager::with_persistence(path);
        assert!(mgr2.get_agent("persist-1").is_some());
        assert!(mgr2.get_team("team-persist-1").is_some());
    }
}
