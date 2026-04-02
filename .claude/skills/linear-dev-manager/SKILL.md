---
name: linear-dev-manager
description: Gestión completa de proyectos de desarrollo de software en Linear usando MCP. Usa este skill cuando el usuario quiera crear proyectos en Linear, crear issues de desarrollo, configurar labels para sprints o features, establecer bloqueos y dependencias entre issues, obtener nombres de branch para git, crear milestones, estructurar épicas con sub-issues, o planificar el backlog de un proyecto. Actívalo si el usuario menciona Linear junto con cualquier tarea de planificación, desarrollo, sprints, issues, tickets, features, bugs, o branching. También si piden "crear una estructura de proyecto", "preparar el backlog", "añadir dependencias entre tareas" o "qué branch debo usar".
---

# Linear Dev Manager

Skill para gestión completa de proyectos de software en Linear: proyectos, issues, labels, bloqueos y branching.

## Flujo de trabajo recomendado

Antes de crear cualquier cosa, ejecutar siempre en este orden:
1. Verificar equipo existente con `Linear:get_team`
2. Verificar labels existentes con `Linear:list_issue_labels`
3. Crear lo que falte (labels, proyecto, issues)
4. Vincular dependencias al final

---

## 1. CREAR PROYECTO

**Herramienta:** `Linear:save_project`  
Campos obligatorios: `name`, `team`

```
Linear:save_project({
  name: "Nombre del proyecto",
  team: "Nombre o ID del equipo",
  description: "Descripción en Markdown",
  summary: "Resumen corto (max 255 chars)",
  icon: ":rocket:",
  priority: 2,           // 0=None 1=Urgent 2=High 3=Medium 4=Low
  startDate: "2025-01-01",
  targetDate: "2025-03-31",
  lead: "me"
})
```

**Convenciones de nombres de proyecto:**
- `[Producto] - [Feature principal]` → "Auth Service - OAuth2 Integration"
- `[Versión] - [Release name]` → "v2.0 - Performance Milestone"
- Evitar nombres ambiguos; incluir contexto de negocio

**Después de crear el proyecto:**  
Añadir milestones con `Linear:save_milestone` para dividir el trabajo en fases.

```
Linear:save_milestone({
  project: "nombre-del-proyecto",
  name: "MVP",
  description: "Features mínimas para el primer release",
  targetDate: "2025-02-15"
})
```

---

## 2. LABELS RECOMENDADOS PARA DESARROLLO

Antes de crear issues, verificar con `Linear:list_issue_labels` si ya existen.  
Si no existen, crearlos con `Linear:create_issue_label`.

### Set de labels estándar para software

**Por tipo de trabajo:**
| Label | Color | Cuándo usarlo |
|---|---|---|
| `feature` | `#0075FF` | Nueva funcionalidad |
| `bug` | `#E5484D` | Error o comportamiento incorrecto |
| `chore` | `#8B8D98` | Mantenimiento, refactor, deuda técnica |
| `docs` | `#12A594` | Documentación |
| `test` | `#AB4ABA` | Tests unitarios, integración, e2e |
| `security` | `#F76808` | Vulnerabilidades, permisos, auditoría |
| `performance` | `#FDBA74` | Optimización, benchmarks |

**Por área técnica:**
| Label | Color | Cuándo usarlo |
|---|---|---|
| `frontend` | `#6E56CF` | UI, componentes, estilos |
| `backend` | `#1C9D6C` | API, lógica de servidor, base de datos |
| `infra` | `#F5A623` | Docker, CI/CD, despliegue, cloud |
| `database` | `#0D74CE` | Migraciones, queries, esquema |
| `api` | `#30A46C` | Endpoints, contratos, integraciones |

**Por estado especial:**
| Label | Color | Cuándo usarlo |
|---|---|---|
| `blocked` | `#E5484D` | Issue no puede avanzar |
| `needs-review` | `#F5A623` | Requiere decisión o revisión de diseño |
| `breaking-change` | `#CE2C31` | Rompe compatibilidad hacia atrás |
| `good-first-issue` | `#30A46C` | Apto para nuevos miembros |

Crear un label:
```
Linear:create_issue_label({
  name: "feature",
  color: "#0075FF",
  description: "Nueva funcionalidad",
  teamId: "uuid-del-equipo"   // opcional; omitir para label de workspace
})
```

---

## 3. CREAR ISSUES DE DESARROLLO

**Herramienta:** `Linear:save_issue`  
Campos obligatorios: `title`, `team`

### Anatomía de una issue bien formada

```
Linear:save_issue({
  title: "[Área] Descripción accionable del trabajo",
  team: "nombre-equipo",
  project: "nombre-proyecto",
  description: "## Contexto\n...\n## Criterios de aceptación\n- [ ] ...\n## Referencias\n- ...",
  state: "Todo",            // Backlog | Todo | In Progress | In Review | Done
  priority: 2,              // 0=None 1=Urgent 2=High 3=Normal 4=Low
  labels: ["feature", "backend"],
  estimate: 3,              // puntos de historia
  assignee: "me",
  milestone: "MVP",
  dueDate: "2025-02-10"
})
```

### Plantilla de descripción (Markdown)

```markdown
## Contexto
Explicar por qué existe esta issue. Qué problema resuelve.

## Criterios de aceptación
- [ ] Criterio concreto y verificable 1
- [ ] Criterio concreto y verificable 2
- [ ] Tests cubriendo el caso principal

## Notas técnicas
Consideraciones de implementación, decisiones de diseño, APIs afectadas.

## Spec en repo
[docs/specs/DAW-XXX-nombre-feature.md](docs/specs/DAW-XXX-nombre-feature.md) o N/A

## Referencias
- [Link a diseño/PRD](#)
- Issue relacionada: [ID-123]
```

### Convención de Specs (SDD)

Cada issue que introduce un cambio de comportamiento externo observable debe enlazar su spec en `docs/specs/`.

- Formato de archivo: `docs/specs/<TEAM-ID>-<feature-kebab>.md`
- Usar `docs/specs/TEMPLATE.md` como punto de partida
- La spec se crea en el mismo PR que el código de la feature
- Si la feature se retira, marcar la spec como `[DEPRECATED]` en el título (nunca eliminarla)

### Títulos de issue según tipo

| Tipo | Formato | Ejemplo |
|---|---|---|
| Feature | `[Área] Implementar X para Y` | `[Auth] Implementar login con Google OAuth2` |
| Bug | `[Bug] Descripción del comportamiento incorrecto` | `[Bug] JWT expira antes del tiempo configurado` |
| Chore | `[Refactor/Chore] Qué se hace` | `[Chore] Migrar configuración a variables de entorno` |
| Test | `[Test] Cobertura para X` | `[Test] E2E para flujo de checkout` |
| Docs | `[Docs] Documentar X` | `[Docs] Documentar endpoints de la API de pagos` |

### Jerarquía: Épicas y sub-issues

Para trabajo grande, crear una issue padre (épica) y luego sub-issues:

```
// 1. Crear la épica
Linear:save_issue({
  title: "[Epic] Sistema de autenticación",
  team: "engineering",
  labels: ["feature"],
  priority: 1,
  estimate: 13
})

// 2. Crear sub-issues vinculadas al padre
Linear:save_issue({
  title: "[Auth] Implementar registro de usuario",
  team: "engineering",
  parentId: "ID-DE-LA-EPICA",
  labels: ["feature", "backend"],
  estimate: 3
})
```

---

## 4. BLOQUEOS Y DEPENDENCIAS

Linear distingue tres tipos de relación entre issues:

| Relación | Campo | Semántica |
|---|---|---|
| Esta issue está bloqueada por | `blockedBy` | No puedo avanzar hasta que X termine |
| Esta issue bloquea a | `blocks` | Si yo no termino, X no puede empezar |
| Esta issue está relacionada con | `relatedTo` | Contexto compartido, sin dependencia dura |

**Importante:** estas relaciones son append-only. No se pueden eliminar por MCP, solo añadir.

```
// Issue B está bloqueada por Issue A
Linear:save_issue({
  id: "ID-ISSUE-B",
  blockedBy: ["ID-ISSUE-A"]
})

// Issue A bloquea a Issue C y D
Linear:save_issue({
  id: "ID-ISSUE-A",
  blocks: ["ID-ISSUE-C", "ID-ISSUE-D"]
})

// Issues relacionadas (sin dependencia dura)
Linear:save_issue({
  id: "ID-ISSUE-X",
  relatedTo: ["ID-ISSUE-Y"]
})
```

### Cuando añadir el label `blocked`

Si una issue está esperando a algo externo (no una issue de Linear sino un tercero, una decisión, una API externa), añadir el label `blocked` y documentar la razón en un comentario:

```
Linear:create_comment({
  issueId: "ID-DE-LA-ISSUE",
  body: "**Bloqueada por:** [razón concreta]\n**Fecha estimada de desbloqueo:** YYYY-MM-DD\n**Responsable de seguimiento:** @nombre"
})
```

---

## 5. BRANCHING (NOMBRES DE RAMA DESDE LINEAR)

Linear genera automáticamente el nombre de rama sugerido para cada issue. Para obtenerlo:

```
Linear:get_issue({
  id: "ID-DE-LA-ISSUE"
})
// El campo `branchName` contiene el nombre de rama sugerido
// Ejemplo: "feature/ENG-42-implementar-login-oauth2"
```

### Convención estándar de branches

Si el workspace no tiene el formato configurado, usar:

```
[tipo]/[TEAM-ID]-[descripcion-en-kebab-case]
```

| Tipo de issue | Prefijo de rama |
|---|---|
| feature | `feature/` |
| bug | `fix/` |
| chore/refactor | `chore/` |
| hotfix urgente | `hotfix/` |
| docs | `docs/` |
| test | `test/` |

Ejemplos:
```
feature/ENG-42-oauth2-google-login
fix/ENG-87-jwt-expiry-bug
chore/ENG-101-migrate-env-config
hotfix/ENG-99-critical-auth-bypass
```

### Flujo git recomendado

```bash
# 1. Obtener el branchName desde Linear:get_issue
# 2. Crear y cambiar a la rama
git checkout -b feature/ENG-42-oauth2-google-login

# 3. Al hacer commit, referenciar el ID de Linear para auto-linking
git commit -m "feat(auth): add Google OAuth2 provider [ENG-42]"

# 4. Al abrir PR, incluir el ID en el título
# "feat: OAuth2 Google login [ENG-42]"
```

Linear detecta automáticamente el ID en commits y PRs y vincula el branch a la issue.

---

## 6. FLUJO COMPLETO: SETUP DE PROYECTO DESDE CERO

Seguir estos pasos en orden para inicializar un proyecto correctamente:

```
PASO 1: Verificar equipo
→ Linear:get_team({ query: "nombre-equipo" })

PASO 2: Crear labels si no existen
→ Linear:list_issue_labels({ team: "nombre-equipo" })
→ Linear:create_issue_label(...) para cada label faltante

PASO 3: Crear el proyecto
→ Linear:save_project({ name, team, description, startDate, targetDate })

PASO 4: Crear milestones
→ Linear:save_milestone({ project, name: "MVP", targetDate })
→ Linear:save_milestone({ project, name: "v1.0", targetDate })

PASO 5: Crear épicas (issues padre)
→ Linear:save_issue({ title: "[Epic] ...", team, labels: [...] })

PASO 6: Crear sub-issues por épica
→ Linear:save_issue({ title, team, parentId: "ID-EPICA", ... })

PASO 7: Establecer dependencias
→ Linear:save_issue({ id, blockedBy: [...] }) para cada bloqueo

PASO 8: Asignar y estimar
→ Linear:save_issue({ id, assignee, estimate, dueDate })
```

---

## 7. PATRONES COMUNES

### Issue de bug con contexto completo

```
Linear:save_issue({
  title: "[Bug] La sesión se cierra al navegar entre tabs",
  team: "engineering",
  priority: 1,
  labels: ["bug", "frontend"],
  state: "Todo",
  description: "## Descripción\nAl abrir el dashboard en una segunda tab, la sesión se invalida en la primera.\n\n## Pasos para reproducir\n1. Iniciar sesión\n2. Abrir nueva tab con la misma URL\n3. Volver a la primera tab\n\n## Comportamiento esperado\nLa sesión debe persistir en todas las tabs.\n\n## Entorno\n- Browser: Chrome 122\n- Auth: JWT en localStorage"
})
```

### Issue de infraestructura con bloqueos

```
// Primero crear la issue de infra
Linear:save_issue({
  title: "[Infra] Configurar pipeline CI/CD en GitHub Actions",
  team: "engineering",
  labels: ["infra", "chore"],
  priority: 2
})

// Luego marcar como bloqueante de los deploys
Linear:save_issue({
  id: "ID-INFRA-ISSUE",
  blocks: ["ID-DEPLOY-STAGING", "ID-DEPLOY-PROD"]
})
```

---

## Referencia rápida de herramientas

| Acción | Herramienta |
|---|---|
| Crear/actualizar proyecto | `Linear:save_project` |
| Crear milestone | `Linear:save_milestone` |
| Crear/actualizar issue | `Linear:save_issue` |
| Crear label | `Linear:create_issue_label` |
| Ver labels existentes | `Linear:list_issue_labels` |
| Obtener branch name | `Linear:get_issue` → campo `branchName` |
| Añadir comentario | `Linear:create_comment` |
| Listar issues | `Linear:list_issues` |
| Ver proyecto | `Linear:get_project` |
| Ver equipo | `Linear:get_team` |

Consulta `references/label-catalog.md` para el catálogo completo de labels con colores hex.
