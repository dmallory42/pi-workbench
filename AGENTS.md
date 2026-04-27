# pi-workbench Agent Instructions

## Testing expectations

- Every regression fix must include a test that would have failed before the fix.
- Every new feature must include appropriate test coverage.
- Prefer tests at the lowest reliable level:
  - pure renderer/unit tests for sidebar visual states
  - registry/unit tests for persistence behavior
  - tmux smoke tests for pane layout, focus, switching, and process lifecycle behavior
- If a behavior is impractical to automate, document the manual verification steps in the change summary and explain why it is not automated.
- Before committing, run:

```bash
npm run check
```

This runs build, unit tests, and tmux smoke tests.

## Product quality bar

- Do not rely on fake components as the only smoke test for user-visible behavior. The real sidebar path must be exercised for UI regressions.
- Keep the workbench feeling like an app, not raw tmux. Avoid exposing tmux mechanics unless needed for recovery/debugging.
- Preserve the core UX: compact left sidebar, active Pi session on the right, simple keyboard controls, and resumable session history.
