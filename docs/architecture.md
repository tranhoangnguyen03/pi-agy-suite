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
    │  resolves profiles and creates a temporary explicit-input bundle
    ▼
prose adapter
    │  owns draft/edit semantics, reader casting, and result schemas
    ▼
shared AGY runner
    │  enforces binary, version, exact model, sandbox, timeout, cancellation
    ▼
one direct run, or a fresh casting run followed by generation
    │  gemini-3.7-flash-high by default
    │
    ▼
clean prose to Pi; provenance remains in tool details
```

## Components

- `index.ts` registers tools and deterministic commands.
- `src/profiles.ts` resolves layered global/local prose profiles and initializes missing scaffolding without overwrites.
- `src/bundle.ts` validates workspace-relative files, copies explicit inputs and the voice guide, writes the manifest, and owns cleanup.
- `src/prose.ts` builds separate draft/edit and task-specific reader-casting prompts and validates both schema-constrained result types.
- `src/agy-runner.ts` owns AGY discovery, compatibility preflight, subprocess bounds, secure argv construction, timeout, cancellation, and JSON-envelope parsing.
- `src/tools.ts` composes those pieces into the two Pi-facing tools and keeps provenance in details.
- `src/doctor.ts` checks the compatibility contract without starting inference.
- `prompts/` contains conductor instructions for explicit and discovery-assisted requests.

## Data and trust boundaries

1. Pi may inspect the active project to understand intent.
2. The typed tool accepts an explicit file list; source roles remain free-form.
3. Named files are canonicalized, required to be regular files inside the active workspace, and copied read-only into a temporary directory.
4. The active voice guide is copied into that directory. Validated global/local writing-sample directories are exposed read-only with `--add-dir`.
5. AGY runs from the temporary workspace in a fresh project-backed conversation, plan mode, and sandbox, with slash-command expansion disabled and a JSON Schema applied.
6. Automatic casting and generation use separate fresh AGY invocations over the same bounded temporary bundle and exact model. An explicit reader skips casting.
7. AGY never receives the active project directory and never writes user output. Pi alone may write returned prose to an explicitly approved path.
8. Temporary input and log directories are removed after the run. Oversized successful prose is retained in a private temporary output file and referenced from tool details/output truncation notice.

## Compatibility boundary

The runner supports only official AGY 1.1.10 or newer and fails when the exact requested model is unavailable. It constructs argv without a shell, passes the prompt as one argument, ignores stdin, bounds process output, rejects malformed/empty responses, and terminates the process group on timeout or cancellation.

The doctor reuses discovery/process mechanics but invokes only `--version`, `--help`, and `models`; it never uses `-p` and therefore consumes no inference quota.

## Non-goals

- No unrestricted project delegation.
- No credentials, AGY settings contents, project IDs, private profiles, or unrelated repository files in AGY prompts.
- No hardcoded document-role or extension taxonomy.
- No generic provider/backend framework until a second backend exists.
- No research, image, or incomplete generic AGY wrapper in v1.

The approved detailed design is in [`docs/plans/2026-08-09-pi-agy-suite-design.md`](plans/2026-08-09-pi-agy-suite-design.md).
