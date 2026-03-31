// smoke_test.rs — Verifica que el StateManager funciona de extremo a extremo
// en un escenario realista similar al uso en producción

use state::{
    entities::{Agent, AgentStatus, Session, Team, Topology},
    events::StateEvent,
    manager::StateManager,
};

fn make_agent(id: &str, team_id: Option<&str>) -> Agent {
    Agent {
        id: id.to_owned(),
        name: format!("Agent {id}"),
        status: AgentStatus::Idle,
        team_id: team_id.map(|s| s.to_owned()),
        skills: vec![],
        current_task: None,
    }
}

fn make_team(id: &str, agent_ids: Vec<&str>) -> Team {
    Team {
        id: id.to_owned(),
        name: format!("Team {id}"),
        agents: agent_ids.into_iter().map(|s| s.to_owned()).collect(),
        topology: Topology::Star,
    }
}

fn make_session(id: &str, agent_id: &str) -> Session {
    Session {
        id: id.to_owned(),
        agent_id: agent_id.to_owned(),
        pid: Some(4242),
        cwd: Some("/workspace".to_owned()),
        created_at: 1_700_000_000,
    }
}

/// End-to-end smoke test: exercises the full StateManager lifecycle in a realistic
/// production-like scenario.
#[tokio::test]
async fn smoke_end_to_end() {
    // -------------------------------------------------------------------------
    // 1. Create a StateManager
    // -------------------------------------------------------------------------
    let manager = StateManager::new();

    // -------------------------------------------------------------------------
    // 2. Subscribe to events BEFORE creating entities so we capture everything
    // -------------------------------------------------------------------------
    let mut rx = manager.subscribe();

    // -------------------------------------------------------------------------
    // 3. Create 2 agents (status: Idle)
    // -------------------------------------------------------------------------
    let agent_a = make_agent("smoke-agent-a", Some("smoke-team-1"));
    let agent_b = make_agent("smoke-agent-b", Some("smoke-team-1"));

    manager.create_agent(agent_a).unwrap();
    manager.create_agent(agent_b).unwrap();

    // Consume the two AgentCreated events
    let evt1 = rx.recv().await.unwrap();
    let evt2 = rx.recv().await.unwrap();
    assert!(
        matches!(evt1, StateEvent::AgentCreated { .. }),
        "expected AgentCreated, got {evt1:?}"
    );
    assert!(
        matches!(evt2, StateEvent::AgentCreated { .. }),
        "expected AgentCreated, got {evt2:?}"
    );
    println!("  [ok] 2 AgentCreated events received");

    // -------------------------------------------------------------------------
    // 4. Create 1 team and associate the agents
    // -------------------------------------------------------------------------
    let team = make_team("smoke-team-1", vec!["smoke-agent-a", "smoke-agent-b"]);
    manager.create_team(team).unwrap();

    let team_evt = rx.recv().await.unwrap();
    assert!(
        matches!(team_evt, StateEvent::TeamCreated { .. }),
        "expected TeamCreated, got {team_evt:?}"
    );
    let created_team = manager.get_team("smoke-team-1").unwrap();
    assert_eq!(created_team.agents.len(), 2);
    println!("  [ok] Team created with 2 agents");

    // -------------------------------------------------------------------------
    // 5. Update both agents to Running and verify AgentUpdated events
    // -------------------------------------------------------------------------
    manager
        .update_agent_status("smoke-agent-a", AgentStatus::Running)
        .unwrap();
    manager
        .update_agent_status("smoke-agent-b", AgentStatus::Running)
        .unwrap();

    let upd1 = rx.recv().await.unwrap();
    let upd2 = rx.recv().await.unwrap();

    // Verify correct event type and that status is Running
    match &upd1 {
        StateEvent::AgentUpdated { agent } => {
            assert_eq!(agent.status, AgentStatus::Running, "agent-a should be Running");
            println!("  [ok] AgentUpdated for {} — status Running", agent.id);
        }
        other => panic!("expected AgentUpdated, got {other:?}"),
    }
    match &upd2 {
        StateEvent::AgentUpdated { agent } => {
            assert_eq!(agent.status, AgentStatus::Running, "agent-b should be Running");
            println!("  [ok] AgentUpdated for {} — status Running", agent.id);
        }
        other => panic!("expected AgentUpdated, got {other:?}"),
    }

    // Double-check in-memory state
    assert_eq!(
        manager.get_agent("smoke-agent-a").unwrap().status,
        AgentStatus::Running
    );
    assert_eq!(
        manager.get_agent("smoke-agent-b").unwrap().status,
        AgentStatus::Running
    );

    // -------------------------------------------------------------------------
    // 6. Add 2 PTY sessions
    // -------------------------------------------------------------------------
    manager
        .add_session(make_session("smoke-session-1", "smoke-agent-a"))
        .unwrap();
    manager
        .add_session(make_session("smoke-session-2", "smoke-agent-b"))
        .unwrap();

    let sess_evt1 = rx.recv().await.unwrap();
    let sess_evt2 = rx.recv().await.unwrap();
    assert!(
        matches!(sess_evt1, StateEvent::SessionAdded { .. }),
        "expected SessionAdded, got {sess_evt1:?}"
    );
    assert!(
        matches!(sess_evt2, StateEvent::SessionAdded { .. }),
        "expected SessionAdded, got {sess_evt2:?}"
    );
    println!("  [ok] 2 SessionAdded events received");

    // -------------------------------------------------------------------------
    // 7. Remove one session and verify SessionRemoved event
    // -------------------------------------------------------------------------
    manager.remove_session("smoke-session-1").unwrap();

    let removed_evt = rx.recv().await.unwrap();
    match &removed_evt {
        StateEvent::SessionRemoved { session_id } => {
            assert_eq!(session_id, "smoke-session-1");
            println!("  [ok] SessionRemoved for {session_id}");
        }
        other => panic!("expected SessionRemoved, got {other:?}"),
    }

    // -------------------------------------------------------------------------
    // 8. Persist state to a temporary directory and reload it
    // -------------------------------------------------------------------------
    let tmp_dir = tempfile::tempdir().unwrap();
    let state_path = tmp_dir.path().join("smoke_state.json");

    manager.save(&state_path).unwrap();
    assert!(state_path.exists(), "state file should exist after save");
    println!("  [ok] State persisted to {}", state_path.display());

    // Load into a fresh manager and verify agents & team are identical
    let loaded = StateManager::with_persistence(state_path.clone());

    let loaded_a = loaded.get_agent("smoke-agent-a").expect("agent-a missing after reload");
    let loaded_b = loaded.get_agent("smoke-agent-b").expect("agent-b missing after reload");
    let loaded_team = loaded.get_team("smoke-team-1").expect("team missing after reload");

    assert_eq!(loaded_a.status, AgentStatus::Running, "persisted status should be Running");
    assert_eq!(loaded_b.status, AgentStatus::Running, "persisted status should be Running");
    assert_eq!(
        loaded_a.team_id.as_deref(),
        Some("smoke-team-1"),
        "agent-a team_id should match"
    );
    assert_eq!(loaded_team.agents.len(), 2, "team should still have 2 agents");
    assert_eq!(loaded_team.topology, Topology::Star);

    println!("  [ok] State reloaded — agents and team are identical");
    println!("  [ok] Smoke test passed successfully");
}
