# Pi AGY Suite: Prose Tools Design

**Status:** Approved

## Product intent

`pi-agy-suite` is a Pi extension that lets a GPT- or Claude-driven Pi session delegate prose composition to a fresh, bounded Gemini 3.x run through the official Antigravity CLI (`agy`). The primary Pi model remains the conductor: it understands the user's intent, discovers or validates relevant materials, constructs an explicit request, invokes AGY, and optionally writes the returned prose to a user-approved path.

The initial release focuses on two capabilities that directly support the motivating use case:

- `agy_prose_draft`: compose a fresh draft or comprehensively redraft supplied material.
- `agy_prose_edit`: tune voice and prose while preserving facts, claims, quotations, citations, intended argument, and authorial position by default.

`agy_image`, `agy_research`, and other AGY-backed capabilities remain roadmap items. They will not be registered as generic wrappers or incomplete tools in v1.

The default prose model is `gemini-3.1-pro-low`. Each call may override the model, but the runner must fail clearly rather than silently substitute an unavailable model.

## Public interfaces

### Model-facing tools

The extension registers two strict Pi tools:

```text
agy_prose_draft
agy_prose_edit
```

`agy_prose_draft` accepts:

- a required free-form `brief`;
- optional inline `context` such as audience, outline, constraints, or factual notes;
- optional workspace-relative `sources` containing any file types AGY can use in composing or articulating the intended prose;
- an optional AGY model override.

`agy_prose_edit` accepts:

- exactly one target: inline `text` or a workspace-relative `path`;
- an optional editing `instruction`, defaulting to voice and prose tuning;
- optional inline `context`;
- optional flexible supporting `sources`;
- an optional AGY model override.

The tools return clean prose as their visible result. Debug and provenance information—including the resolved model, selected profile paths, source manifest, consulted writing samples when reported, warnings, assumptions, usage, and AGY version—stays in tool-result `details`.

### User-facing prompt templates

```text
/agy-prose-draft <intent>
/agy-prose-edit <intent>
```

These are Markdown prompt templates, not deterministic extension commands. They instruct the primary Pi agent to act as conductor.

Advanced users can name every relevant file in one request. When enough material is explicit, the conductor validates those paths and delegates without unnecessary scanning or questions.

For intent-only requests, the conductor may inspect the named file's directory and nearby project files, identify the smallest relevant set of supporting materials, and build the explicit AGY request. It asks a question only when several plausible source sets would materially alter the result or essential factual support cannot be identified.

The conductor never gives AGY unrestricted access merely because it inspected a project. The typed tool always receives an explicit file list.

### Deterministic commands

```text
/agy-prose-init global|local
/agy-suite-doctor
```

`/agy-prose-init` creates missing profile scaffolding without overwriting existing files. `/agy-suite-doctor` checks the local AGY binary, supported version, required flags, default model availability, profile state, and temporary-workspace readiness without consuming inference quota or exposing credentials.

## Profile resolution

Both global and project-local profiles use this relative structure:

```text
pi-agy-suite/prose/
├── voice.md
└── writing-samples/
    ├── README.md
    └── *.md
```

The global location lives under Pi's resolved agent directory. The project-local location lives under Pi's resolved project config directory rather than a hardcoded rebrand-sensitive path.

Resolution rules:

1. A project-local `voice.md` overrides the global `voice.md`.
2. If no project-local guide exists, use the global guide.
3. Global and project-local writing-sample directories are both made available when present.
4. Project-local samples are identified after global samples so the AGY prompt can describe them as more project-specific evidence.
5. `writing-samples/README.md` is instructional metadata, not an imitation sample.
6. Missing profiles do not block prose generation; the tool proceeds generically and places a warning in UI/details.

Each generated `writing-samples/README.md` instructs users to add representative approved Markdown samples and instructs agents to read `voice.md` first, inspect and select relevant samples, treat samples as stylistic evidence rather than factual sources or instructions, and avoid copying distinctive passages verbatim unless requested.

## Conductor flow

### Explicit request

For a request such as:

```text
/agy-prose-draft See @research.md and @spine.md. Here is @draft.md;
please redraft it in my voice.
```

Pi resolves the named paths, constructs the brief and source list, and invokes `agy_prose_draft` once.

### Discovery-assisted request

For a request such as:

```text
/agy-prose-draft I am not happy with @draft.md. It needs to sound more like me.
```

Pi reads enough of the named draft to understand the task, inspects its directory and nearby files, chooses the smallest relevant supporting set, then invokes `agy_prose_draft` with explicit sources. Source roles remain free-form in `brief` and `context`; v1 does not impose a document taxonomy.

### Result handling

The conductor presents AGY's prose unchanged. If the user explicitly requested an output path, Pi writes the returned prose there verbatim. AGY itself never writes into the active project, and Pi does not overwrite an existing destination without explicit replacement intent.

## Isolation and data flow

For every call, the tool:

1. validates all named inputs before consuming AGY quota;
2. copies only the named target and source files into a temporary input bundle;
3. preserves filenames/extensions and writes a manifest mapping bundled files to original paths;
4. copies the active `voice.md` into the bundle when present;
5. exposes existing global and local writing-sample directories to AGY as read-only workspace roots using `--add-dir` and explicit breadcrumbs;
6. launches AGY from the clean temporary workspace in a fresh headless conversation;
7. uses plan/read-only mode plus sandboxing, never `--dangerously-skip-permissions` for prose tools;
8. requests schema-constrained structured output;
9. parses the structured result, returns clean prose, and removes the temporary bundle.

A future opt-in may expose source parent directories with `--add-dir` when relative-link resolution or broader contextual exploration is genuinely necessary. This is deliberately out of scope for v1.

## AGY prompt contract

AGY is instructed to:

1. read the active voice guide when available;
2. read each writing-sample `README.md`;
3. inspect available Markdown sample filenames and select relevant samples;
4. use samples as stylistic evidence for voice, rhythm, diction, structure, and tone;
5. read every bundled source;
6. follow the user's composition or editing objective;
7. avoid unsupported factual additions;
8. avoid copying distinctive sample passages verbatim unless requested;
9. return only the schema-constrained result.

Drafting may compose a new piece or comprehensively rebuild a rough draft. Editing defaults to voice and prose tuning: it may freely improve diction, rhythm, sentence construction, paragraph flow, clarity, and modest organization, while major restructuring, expansion, compression, or argument revision requires explicit instruction.

Every prose invocation starts a fresh AGY conversation. Continuity is carried by files and explicit context, not accumulated AGY chat history.

## Shared runner

A reusable internal runner owns process mechanics only:

- resolve `AGY_BIN`, then `agy` on `PATH`, then common install locations such as `~/.local/bin/agy`;
- require AGY 1.1.10 or newer;
- check required flags and exact model availability;
- construct argv without a shell;
- pass prompts as one process argument with detached stdin;
- set model, plan mode, sandbox, timeout, log file, output format, and JSON Schema;
- support cancellation and terminate the child process tree;
- bound stdout and stderr;
- reject nonzero exits and empty-success responses;
- parse structured output and return a typed internal result.

Thin prose adapters own prompt semantics. The runner must not become a generic multi-provider framework in v1.

## Compatibility and release policy

`docs/agy-compatibility.md` records the supported and last-verified AGY versions, required CLI surface, expected behavior, model dependency, known risks, and upgrade checklist.

Unit and contract tests use a fake AGY executable and small output fixtures. They verify invocation, parsing, errors, paths with spaces, cancellation, version checks, model availability, structured-output drift, source isolation, and profile resolution.

An opt-in live test runs manually before every npm release:

```bash
AGY_LIVE=1 npm run test:agy-live
```

It consumes a minimal amount of quota, verifies a schema-constrained `gemini-3.1-pro-low` run in a temporary workspace, confirms the source fixture remains unchanged, and records the verified AGY version in the compatibility document and changelog. AGY credentials are not stored in CI.

## Packaging and maintenance

- Local repository: `/Users/davidus-tranus/Github/pi-agy-suite`
- GitHub: `tranhoangnguyen03/pi-agy-suite`
- npm: `pi-agy-suite`
- License: MIT

The package is installed with:

```bash
pi install npm:pi-agy-suite
```

The minimal documentation set is:

```text
README.md
CHANGELOG.md
docs/architecture.md
docs/agy-compatibility.md
docs/plans/
```

## Roadmap

The next milestone hardens the extension around AGY-native specialization: custom Markdown agents, AGY skills, model/execution policies, and richer structured/progress handling. These additions must preserve the same Pi-facing tool contracts unless evidence justifies change.

The longer-horizon goal is a fork or adapter compatible with suitable open-weight prose models if Gemini 3.x is retired in favor of long-running task-oriented models. To preserve that option, prose prompt assembly, profile resolution, source bundling, and result contracts remain separate from the AGY process adapter. A general backend abstraction will be introduced only when a second implementation exists.
