# DAW-567 CreateAgentModal: completar pasos 2 y 3, añadir modo edición

> **Issue Linear:** [DAW-567](https://linear.app/clasificadoria/issue/DAW-567)
> **PR:** pendiente
> **Estado:** Draft

---

## Objetivo

Completar el flujo de creación de agentes implementando los pasos 2 (Intellect) y 3 (Deployment) del modal, y añadir soporte para editar agentes existentes.

## Contexto

`CreateAgentModal.tsx` tiene un indicador de 3 pasos pero solo el paso 1 (Identity) está implementado. Los pasos 2 y 3 están con `opacity-40` y deshabilitados. `AgentDashboard` tiene un botón Edit que llama a `handleEditAgent(agentId)` y establece `editingAgent`, pero el modal siempre crea un agente nuevo ignorando ese estado.

## Alcance

- `src/components/Shared/CreateAgentModal.tsx` — implementar pasos 2 y 3, añadir modo edición
- `src/stores/agentStore.ts` — verificar que `updateAgent()` existe con la firma correcta
- `src/types/index.ts` — extender tipo `Agent` con campos de Intellect y Deployment si faltan

## Requisitos

### Funcionales

**Paso 2 - Intellect:**
- Selector de modelo: Claude Haiku / Sonnet / Opus (con descripción de cada uno)
- Slider o input de temperatura (0.0 - 1.0)
- Input de max tokens
- Multi-selector de skills asignados al agente (desde `skillStore`)

**Paso 3 - Deployment:**
- Input de directorio de trabajo (cwd) con botón para seleccionar via diálogo de Electron
- Key-value editor para variables de entorno del agente
- Toggle de modo de ejecución (auto-start / manual)

**Modo edición:**
- Cuando `editingAgent` está definido, el modal pre-carga todos los campos con los datos del agente
- Submit llama a `updateAgent()` en lugar de `createAgent()`
- El título del modal cambia a "Edit Agent"

### No funcionales
- Navegación Next/Back entre pasos con validación antes de avanzar
- Sin regresiones en el paso 1 existente

## Criterios de aceptación

- [ ] Los 3 pasos son navegables y sus campos se rellenan correctamente
- [ ] Crear agente con los 3 pasos completos genera un agente con todos los campos
- [ ] Botón Edit en AgentDashboard abre el modal con los datos del agente pre-cargados
- [ ] Guardar en modo edición actualiza el agente sin crear uno nuevo
- [ ] Tests cubriendo creación completa (3 pasos) y edición de agente

## Casos límite / Edge cases

- Agente sin skills asignados (ningún skill en el store)
- Directorio de trabajo inválido o que no existe
- Cancelar en paso 2 o 3 (no persiste cambios parciales)

## Fuera de alcance

- Configuración avanzada de prompts del sistema (eso es una feature separada)
- Clonado de agentes

## Referencias

- **Issue:** [DAW-567](https://linear.app/clasificadoria/issue/DAW-567)
- **PR:** pendiente
