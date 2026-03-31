// IPC crate — WebSocket layer between Rust backend and Electron renderer.
// Implementation: DAW-544

pub mod commands;
pub mod events;
pub mod handler;
pub mod server;

pub use server::IpcServer;
