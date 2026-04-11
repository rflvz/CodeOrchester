use std::{
    collections::HashMap,
    path::Path,
};

use serde::{Deserialize, Serialize};

use crate::entities::{Agent, Team};

/// Errors that can occur during state persistence.
#[derive(Debug, thiserror::Error)]
pub enum PersistenceError {
    #[error("IO error while persisting state: {0}")]
    Io(#[from] std::io::Error),

    #[error("JSON serialisation error: {0}")]
    Json(#[from] serde_json::Error),
}

/// On-disk snapshot format.
#[derive(Serialize, Deserialize)]
struct StateSnapshot {
    agents: HashMap<String, Agent>,
    teams: HashMap<String, Team>,
}

/// Persist the current `agents` and `teams` maps to `path` as pretty-printed JSON.
///
/// The file is written atomically (write to a temporary sibling, then rename).
pub fn save_state(
    path: &Path,
    agents: &HashMap<String, Agent>,
    teams: &HashMap<String, Team>,
) -> Result<(), PersistenceError> {
    let snapshot = StateSnapshot {
        agents: agents.clone(),
        teams: teams.clone(),
    };

    let json = serde_json::to_string_pretty(&snapshot)?;

    // Write to a temporary file next to the target, then rename for atomicity.
    let tmp_path = path.with_extension("tmp");
    std::fs::write(&tmp_path, &json)?;
    std::fs::rename(&tmp_path, path)?;

    Ok(())
}

/// Load agents and teams from a JSON snapshot at `path`.
///
/// Returns an empty state when the file does not exist so that first-run
/// behaviour is seamless.
pub fn load_state(
    path: &Path,
) -> Result<(HashMap<String, Agent>, HashMap<String, Team>), PersistenceError> {
    if !path.exists() {
        return Ok((HashMap::new(), HashMap::new()));
    }

    let json = std::fs::read_to_string(path)?;
    let snapshot: StateSnapshot = serde_json::from_str(&json)?;
    Ok((snapshot.agents, snapshot.teams))
}

// =============================================================================
// Tests
// =============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use crate::entities::{AgentStatus, Topology};

    fn sample_agent(id: &str) -> Agent {
        Agent {
            id: id.to_owned(),
            name: format!("Agent {id}"),
            status: AgentStatus::Idle,
            team_id: None,
            skills: vec![],
            current_task: None,
        }
    }

    fn sample_team(id: &str) -> Team {
        Team {
            id: id.to_owned(),
            name: format!("Team {id}"),
            agents: vec![],
            topology: Topology::Star,
        }
    }

    #[test]
    fn test_round_trip() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("state.json");

        let mut agents = HashMap::new();
        agents.insert("a1".to_owned(), sample_agent("a1"));

        let mut teams = HashMap::new();
        teams.insert("t1".to_owned(), sample_team("t1"));

        save_state(&path, &agents, &teams).unwrap();

        let (loaded_agents, loaded_teams) = load_state(&path).unwrap();
        assert_eq!(loaded_agents.len(), 1);
        assert_eq!(loaded_teams.len(), 1);
        assert_eq!(loaded_agents["a1"].name, "Agent a1");
        assert_eq!(loaded_teams["t1"].topology, Topology::Star);
    }

    #[test]
    fn test_load_missing_file_returns_empty() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("nonexistent.json");

        let (agents, teams) = load_state(&path).unwrap();
        assert!(agents.is_empty());
        assert!(teams.is_empty());
    }
}
