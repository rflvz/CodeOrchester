# Catálogo de Labels para Desarrollo de Software

Referencia completa de labels recomendados. Verificar siempre con `Linear:list_issue_labels` antes de crear.

## Labels de Tipo de Trabajo

| Nombre | Color Hex | Descripción | Cuándo crear |
|---|---|---|---|
| `feature` | `#0075FF` | Nueva funcionalidad | Cualquier trabajo nuevo de producto |
| `bug` | `#E5484D` | Error o comportamiento incorrecto | Comportamiento no esperado en producción o desarrollo |
| `chore` | `#8B8D98` | Mantenimiento, refactor, deuda técnica | Trabajo técnico sin valor de producto directo |
| `docs` | `#12A594` | Documentación técnica o de producto | READMEs, wikis, docstrings, changelogs |
| `test` | `#AB4ABA` | Tests unitarios, integración, e2e | Cobertura nueva o mejora de suite de tests |
| `security` | `#F76808` | Vulnerabilidades, permisos, auditoría | CVEs, revisiones de acceso, pentesting |
| `performance` | `#FDBA74` | Optimización y benchmarks | Reducción de latencia, mejora de throughput |
| `ux` | `#E54666` | Mejoras de experiencia de usuario | Cambios de flujo, accesibilidad, usabilidad |
| `design-system` | `#6E56CF` | Componentes de design system | Tokens, componentes reutilizables, Storybook |

## Labels de Área Técnica

| Nombre | Color Hex | Descripción | Stack típico |
|---|---|---|---|
| `frontend` | `#6E56CF` | UI, componentes, CSS | React, Next.js, Vue, Angular |
| `backend` | `#1C9D6C` | API, lógica de negocio, servidor | Node.js, Java, Python, Go |
| `infra` | `#F5A623` | DevOps, CI/CD, cloud | Docker, K8s, GitHub Actions, AWS |
| `database` | `#0D74CE` | Migraciones, queries, esquema | PostgreSQL, Oracle, MongoDB |
| `api` | `#30A46C` | Endpoints REST/GraphQL, contratos | OpenAPI, gRPC, REST |
| `mobile` | `#D6409F` | Apps nativas o híbridas | React Native, Flutter, Swift |
| `auth` | `#C2298A` | Autenticación y autorización | JWT, OAuth2, RBAC, sesiones |
| `cache` | `#3D9A50` | Sistemas de caché | Redis, Memcached, CDN |
| `queue` | `#BF7AF0` | Colas y mensajería asíncrona | RabbitMQ, Kafka, SQS |

## Labels de Estado Especial

| Nombre | Color Hex | Cuándo usar |
|---|---|---|
| `blocked` | `#E5484D` | Issue no puede avanzar; añadir comentario con razón y ETA |
| `needs-review` | `#F5A623` | Requiere decisión de diseño, producto, o arquitectura |
| `breaking-change` | `#CE2C31` | Rompe compatibilidad hacia atrás; requiere migration guide |
| `good-first-issue` | `#30A46C` | Apto para nuevos miembros del equipo |
| `epic` | `#0075FF` | Issue padre que agrupa sub-tareas relacionadas |
| `spike` | `#8B8D98` | Investigación técnica, PoC, prototipo |
| `hotfix` | `#E5484D` | Fix urgente para producción; prioridad siempre Urgent |
| `wont-fix` | `#B5B5B5` | Decisión activa de no resolver |
| `duplicate` | `#B5B5B5` | Duplicado de otra issue (usar también `duplicateOf`) |

## Labels de Proceso (Scrum/Kanban)

| Nombre | Color Hex | Cuándo usar |
|---|---|---|
| `ready` | `#12A594` | Issue completamente especificada, lista para tomar |
| `needs-spec` | `#F5A623` | Falta definición; no iniciar sin ella |
| `in-review` | `#6E56CF` | En revisión de código (además del estado del board) |
| `qa` | `#D6409F` | En proceso de QA / testing manual |

---

## Crear labels en batch (ejemplo)

Para un proyecto nuevo, crear todos los labels de tipo + área más comunes:

```javascript
const labels = [
  { name: "feature", color: "#0075FF" },
  { name: "bug", color: "#E5484D" },
  { name: "chore", color: "#8B8D98" },
  { name: "docs", color: "#12A594" },
  { name: "test", color: "#AB4ABA" },
  { name: "frontend", color: "#6E56CF" },
  { name: "backend", color: "#1C9D6C" },
  { name: "infra", color: "#F5A623" },
  { name: "database", color: "#0D74CE" },
  { name: "blocked", color: "#E5484D" },
  { name: "breaking-change", color: "#CE2C31" },
  { name: "epic", color: "#0075FF" }
]
// Llamar Linear:create_issue_label para cada uno
```

---

## Reglas de uso de labels

1. Cada issue debe tener exactamente un label de tipo (feature, bug, chore, etc.)
2. Cada issue puede tener 0-2 labels de área técnica
3. Los labels de estado especial son opcionales y situacionales
4. No mezclar `feature` + `bug` en la misma issue; si es ambiguo, usar el tipo dominante
5. `breaking-change` siempre va acompañado de descripción del impacto en el campo description
6. `blocked` siempre va acompañado de un comentario explicando la razón
