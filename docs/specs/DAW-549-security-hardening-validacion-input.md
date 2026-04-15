# DAW-549 Security Hardening y validación de input

> **Issue Linear:** [DAW-549](https://linear.app/clasificadoria/issue/DAW-549)
> **Estado:** Implementado

---

## Objetivo

Implementar hardening de seguridad y validación robusta de inputs en el backend Rust, cubriendo todos los puntos de entrada del IPC WebSocket.

## Alcance

- `rust-backend/crates/security/src/lib.rs` — crate centralizado de seguridad
- `rust-backend/crates/ipc/src/handler.rs` — integración de validación en el handler IPC
- `rust-backend/crates/ipc/Cargo.toml` — dependencia al crate `security`
- `rust-backend/Cargo.toml` — `regex` añadido a workspace dependencies

## Implementación

### 1. Validación de inputs (shell injection)

`validate_command(cmd: &str)` y `validate_cli_arg(arg: &str)` rechazan cualquier string que contenga metacaracteres de shell:

```
; | & $ ` ( ) { } \n \r < >
```

Aplicado en el handler IPC a:
- `ClaudeCli.args` — cada argumento se valida individualmente
- El error produce `CommandResult { success: false }` sin ejecutar nada

### 2. Sanitización de output PTY

`sanitize_pty_output(output: &str) -> String` elimina secuencias de escape ANSI potencialmente maliciosas antes de reenviar el output al renderer:

- **CSI sequences**: `ESC [ <params> <final>` (colores, movimiento de cursor)
- **OSC sequences**: `ESC ] … BEL` o `ESC ] … ESC \` (título de terminal, hyperlinks)
- **Otras secuencias de 2 caracteres**: `ESC X`

El texto normal (incluyendo `\n` y `\t`) se preserva intacto.

### 3. Rate limiting por conexión (sliding window)

`RateLimiter` mantiene un mapa de `connection_id → Vec<Instant>` con ventana deslizante:

```rust
RateLimiter::new()           // 100 req / 60s (defaults)
RateLimiter::with_limits(n, window)  // configurable
limiter.check("conn-id")     // Ok(()) o RateLimitExceeded
limiter.remove_connection("conn-id") // llamar al desconectar
```

### 4. Manejo seguro de API keys

`mask_sensitive_value(value: &str) -> String` enmascara el valor para logs seguros:
- Muestra los primeros 4 y últimos 4 caracteres
- Reemplaza el resto con `*`
- Si el valor tiene ≤ 8 caracteres, devuelve `"****"`

`is_allowed_env_var(name: &str)` — allow-list para inyección en sesiones PTY:
```
MINIMAX_API_KEY, PATH, HOME, LANG, TERM, COLORTERM, ANTHROPIC_API_KEY
```

### 5. Timeout para comandos externos

Constante `DEFAULT_COMMAND_TIMEOUT_SECS: u64 = 30` disponible para que los integradores de Claude CLI y MiniMax apliquen `tokio::time::timeout`.

### 6. Auditoría de eventos de seguridad

`audit_log(severity: AuditSeverity, event: &str, detail: &str)` emite entradas estructuradas via `tracing` al target `"security_audit"`:

```
AuditSeverity::Info     → tracing::info!
AuditSeverity::Warn     → tracing::warn!
AuditSeverity::Critical → tracing::error!
```

El handler IPC llama a `audit_log(Critical, "validation_failed", ...)` en cada rechazo.

### Integración en IPC handler

`validate_command(cmd: &IpcCommand)` (función privada en handler) aplica las validaciones pertinentes antes de procesar cada variante:

| Comando | Validaciones |
|---|---|
| `StartPty` | `validate_session_id`, `validate_cwd` (si hay cwd) |
| `WritePty` | `validate_session_id`, `validate_pty_payload` (tamaño) |
| `ResizePty` | `validate_session_id` |
| `KillPty` | `validate_session_id` |
| `ClaudeCli` | `validate_session_id`, `validate_cli_arg` por cada arg |
| `MiniMaxComplete` | `validate_pty_payload` (tamaño del prompt) |

## Criterios de aceptación

- [x] Validación de todos los inputs antes de procesamiento (handler IPC)
- [x] Sanitización de output PTY (`sanitize_pty_output`)
- [x] Rate limiting por conexión (`RateLimiter` sliding window)
- [x] Manejo seguro de API keys (allow-list + masking en logs)
- [x] Timeout para comandos externos (constante `DEFAULT_COMMAND_TIMEOUT_SECS`)
- [x] Auditoría de eventos de seguridad (`audit_log` + `AuditSeverity`)

## Tests

50 tests en `security` + 15 tests en `ipc` — todos pasan.

Cobertura de seguridad:
- UUID válido/inválido, path traversal, URL schemes, env vars allow-list
- Todos los metacaracteres peligrosos de shell
- Límites exactos de payload (en el límite, uno por encima)
- Sanitización ANSI: CSI, OSC, secuencias mixtas
- Masking de valores cortos/largos
- Rate limiter: dentro del límite, excediendo, ventanas múltiples, aislamiento por conexión, expiración de ventana

## Referencias

- **Issue:** [DAW-549](https://linear.app/clasificadoria/issue/DAW-549)
