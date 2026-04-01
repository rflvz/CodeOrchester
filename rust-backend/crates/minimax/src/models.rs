use serde::{Deserialize, Serialize};

// ── Request types ──────────────────────────────────────────────────────────────

/// A single message in a conversation turn.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Message {
    /// Either `"user"` or `"assistant"`.
    pub role: String,
    pub content: String,
}

impl Message {
    pub fn user(content: impl Into<String>) -> Self {
        Self { role: "user".to_owned(), content: content.into() }
    }

    pub fn assistant(content: impl Into<String>) -> Self {
        Self { role: "assistant".to_owned(), content: content.into() }
    }
}

/// The body sent to the MiniMax `/v1/text/chatcompletion_v2` endpoint.
#[derive(Debug, Serialize)]
pub struct CompletionRequest {
    pub model: String,
    pub messages: Vec<Message>,
    pub stream: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub temperature: Option<f32>,
}

impl CompletionRequest {
    pub fn new(model: impl Into<String>, prompt: impl Into<String>, stream: bool) -> Self {
        Self {
            model: model.into(),
            messages: vec![Message::user(prompt)],
            stream,
            max_tokens: None,
            temperature: None,
        }
    }
}

// ── Response types ─────────────────────────────────────────────────────────────

/// A single completion choice returned by the API.
#[derive(Debug, Deserialize)]
pub struct Choice {
    /// Populated for non-streaming responses.
    pub message: Option<Message>,
    /// Populated for streaming SSE chunks.
    pub delta: Option<Message>,
    pub finish_reason: Option<String>,
    #[serde(default)]
    pub index: u32,
}

/// Top-level response for a (non-streaming) completion request.
#[derive(Debug, Deserialize)]
pub struct Completion {
    pub id: String,
    pub choices: Vec<Choice>,
    #[serde(default)]
    pub model: String,
    pub usage: Option<Usage>,
}

impl Completion {
    /// Convenience accessor for the text of the first choice.
    pub fn text(&self) -> Option<&str> {
        self.choices.first()?.message.as_ref().map(|m| m.content.as_str())
    }
}

/// Token usage statistics.
#[derive(Debug, Deserialize)]
pub struct Usage {
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
    pub total_tokens: u32,
}
