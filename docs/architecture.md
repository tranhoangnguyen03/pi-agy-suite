# Architecture

`pi-agy-suite` keeps a GPT- or Claude-driven Pi session in the conductor role while delegating prose production to fresh Gemini sessions through the official Antigravity CLI.

```text
user intent
    │
    ▼
Pi prompt template and conductor
    │  discovers/validates the smallest relevant source set
    ▼
agy_prose_draft / agy_prose_edit
    │  bundles explicit inputs and resolves prose profiles
    ▼
shared AGY runner
    │  enforces version, model, sandbox, schema, timeout, cancellation
    ▼
fresh agy -p run (gemini-3.1-pro-low by default)
    │
    ▼
clean prose to Pi; provenance remains in tool details
```

## Boundaries

- The conductor may inspect the active project; AGY receives only explicit copied inputs.
- AGY never writes into the active project.
- Voice/profile resolution and source bundling are independent of process invocation.
- The shared runner owns mechanics, not prose semantics.
- The v1 package has no speculative general backend abstraction. A backend interface is introduced only when an open-weight implementation exists.

The approved detailed design is in [`docs/plans/2026-08-09-pi-agy-suite-design.md`](plans/2026-08-09-pi-agy-suite-design.md).
