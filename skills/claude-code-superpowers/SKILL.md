---
name: claude-code-superpowers
description: Advanced Claude Code slash commands and workflow patterns for power users. Provides structured templates for PR reviews, smart commits, codebase explanations, bug hunting, refactoring, test generation, performance optimization, and security audits. Use when invoked via /review-pr, /smart-commit, /explain-codebase, /find-bugs, /refactor, /generate-tests, /optimize, or /security-audit.
---

## /review-pr

Perform a structured PR review covering:

1. **Summary** — what does this PR do in 2-3 sentences?
2. **Architecture** — does the approach fit the existing patterns? Any better alternatives?
3. **Correctness** — logic bugs, edge cases, off-by-one errors, null/undefined handling
4. **Security** — injection risks, exposed secrets, auth/authz gaps, input validation
5. **Performance** — N+1 queries, unnecessary re-renders, missing memoization, large bundles
6. **Tests** — coverage gaps, missing edge cases, test quality
7. **Verdict** — Approve / Request Changes / Needs Discussion

Format each section as a collapsible with severity tags: 🔴 blocking · 🟡 suggestion · 🟢 nitpick

---

## /smart-commit

Generate a conventional commit message from staged changes:

```
<type>(<scope>): <short description>

<body — what changed and why, not how>

<footer — breaking changes, issue refs>
```

Types: `feat` · `fix` · `refactor` · `test` · `docs` · `chore` · `perf` · `style`

Rules:
- Scope = affected module/component (e.g., `topology`, `settings`, `agents`)
- Subject line ≤ 72 chars, imperative mood ("add" not "added")
- Body explains *why*, not *what* (the diff already shows what)
- Reference Linear issues as `[DAW-XXX]` in the footer

---

## /explain-codebase

Generate an architectural overview:

1. **Purpose** — what problem does this codebase solve?
2. **Entry points** — main files, how the app starts
3. **Layer diagram** — data flow from UI → state → backend/IPC
4. **Key abstractions** — stores, services, components, types
5. **Data flow** — how a typical user action propagates through the system
6. **External dependencies** — APIs, native modules, CLI tools
7. **Testing strategy** — test types, coverage approach, how to run

---

## /find-bugs

Static analysis checklist to run mentally or with grep:

- [ ] Unhandled promise rejections (`.then()` without `.catch()`, unawaited async)
- [ ] Race conditions (concurrent state updates, missing cleanup in `useEffect`)
- [ ] Memory leaks (event listeners not removed, intervals not cleared)
- [ ] Null/undefined access without guards
- [ ] Off-by-one in array indexing or loop bounds
- [ ] Stale closures in React callbacks (missing deps in `useCallback`/`useEffect`)
- [ ] Type assertions (`as X`) hiding runtime type errors
- [ ] Hardcoded credentials or API keys in source
- [ ] Missing `await` before async calls
- [ ] Mutating state directly instead of returning new objects

---

## /refactor

Safe refactoring workflow:

1. **Identify** — scope the change, list all call sites with `grep`
2. **Characterise** — write/run existing tests before touching anything
3. **Extract** — pull logic into a named function/module (no behavior change)
4. **Rename** — update all references (`replace_all: true` in Edit tool)
5. **Simplify** — remove duplication, apply DRY only where it reduces complexity
6. **Verify** — run tests, check types compile, do a visual diff

Do NOT refactor and add features in the same commit.

---

## /generate-tests

Test generation template for a given function/component:

```typescript
describe('<Unit under test>', () => {
  // Happy path
  it('should <expected behavior> when <normal input>', () => { ... });

  // Edge cases
  it('should handle empty input', () => { ... });
  it('should handle maximum/minimum values', () => { ... });

  // Error paths
  it('should throw/return error when <invalid input>', () => { ... });

  // Side effects
  it('should call <dependency> with correct args', () => { ... });
  it('should NOT call <dependency> when <condition>', () => { ... });
});
```

Coverage targets: happy path · boundary values · error paths · side effects · async timing

---

## /optimize

Performance audit checklist:

**React**
- Unnecessary re-renders → add `React.memo`, `useMemo`, `useCallback`
- Large component trees → lazy-load with `React.lazy` + `Suspense`
- Expensive list renders → virtualize with a windowing library

**State**
- Global state subscriptions → subscribe to slices, not entire stores
- Derived state recalculated on every render → memoize with `useMemo`

**Network**
- Waterfall requests → parallelize with `Promise.all`
- Missing cache headers → add `Cache-Control` or use SWR/React Query

**Bundle**
- Large dependencies → check with `vite-bundle-visualizer`
- Unused imports → tree-shaking, remove dead code

**Electron IPC**
- Synchronous IPC (`sendSync`) → replace with async `invoke`
- Frequent small messages → batch or debounce

---

## /security-audit

OWASP Top 10 + Electron-specific checklist:

- [ ] **Injection** — SQL, command, path traversal in user inputs
- [ ] **XSS** — `dangerouslySetInnerHTML`, unescaped interpolation, CSP policy
- [ ] **Secrets** — API keys/tokens in source, `.env` committed, keys in logs
- [ ] **Auth/AuthZ** — missing checks, privilege escalation paths
- [ ] **Electron nodeIntegration** — must be `false`; use `contextBridge` only
- [ ] **Electron contextIsolation** — must be `true`
- [ ] **Remote content** — never load remote URLs in BrowserWindow with Node access
- [ ] **IPC validation** — validate all data received from renderer in main process
- [ ] **Dependency vulnerabilities** — run `npm audit`
- [ ] **Prototype pollution** — `Object.assign({}, userInput)` with untrusted keys
