# pi-agy-suite

A typed [Pi](https://github.com/earendil-works/pi) extension that delegates prose drafting and editing to fresh Gemini runs through the official Antigravity CLI (`agy`). Pi remains the conductor; AGY receives only explicitly selected files and configured writing samples.

## Requirements

- Node.js 22.19 or newer.
- Antigravity CLI 1.1.10 or newer; latest stable is recommended.
- AGY authentication completed through its normal Google sign-in or supported enterprise flow.
- The exact default model `gemini-3.1-pro-low` available to the account.

Install AGY using Google's official instructions, run `agy` once to authenticate, then check the local setup with `/agy-suite-doctor`. The extension resolves `AGY_BIN` first, then `agy` on `PATH`, then `~/.local/bin/agy`. It fails instead of substituting another model.

## Install

The package is not published yet. After release:

```bash
pi install npm:@tranhoangnguyen03/pi-agy-suite
```

For local verification:

```bash
pi -e /absolute/path/to/pi-agy-suite
```

Use `/reload` after changing installed extension or profile files.

## Public interfaces

### Tools

- `agy_prose_draft` — compose fresh prose or comprehensively redraft supplied material.
- `agy_prose_edit` — tune voice, diction, rhythm, clarity, flow, and modest organization while preserving facts, claims, quotations, citations, argument, and authorial position by default.

Both return clean prose visibly. Model, AGY version, selected profiles, source manifest, consulted samples, warnings, assumptions, and usage remain in hidden tool details.

### Prompt templates

```text
/agy-prose-draft [intent and @sources]
/agy-prose-edit [intent and @sources]
```

Explicit request:

```text
/agy-prose-draft See @research.md and @spine.md. Redraft @draft.md in my voice.
```

Discovery-assisted request:

```text
/agy-prose-edit @draft.md does not sound like me.
```

For the second form, Pi may inspect nearby files to select the smallest relevant source set. AGY still receives only the explicit list passed to the typed tool.

Pi presents returned prose unchanged. If the user requested an output path, Pi writes it verbatim; it must not overwrite an existing file without explicit replacement intent.

### Commands

```text
/agy-prose-init global
/agy-prose-init local
/agy-suite-doctor
```

Initialization creates missing profile files and never overwrites existing ones. The doctor checks AGY version, required flags, exact default-model availability, profiles, and temporary-workspace readiness without inference quota.

## Prose profiles

Global profile:

```text
<resolved Pi agent directory>/pi-agy-suite/prose/
```

Project-local profile:

```text
<project>/<resolved Pi config directory>/pi-agy-suite/prose/
```

Both use:

```text
pi-agy-suite/prose/
├── voice.md
└── writing-samples/
    ├── README.md
    └── *.md
```

A local `voice.md` overrides the global guide. Existing global and local sample directories are both exposed read-only, global first and local second. `README.md` is instructional metadata, not an imitation sample. Missing profiles produce a warning rather than blocking generic prose generation.

## Privacy and isolation

For each run the extension:

1. validates every named input before inference;
2. rejects missing files, directories, traversal, and workspace-escaping symlinks;
3. copies only explicit inputs and the selected voice guide into a temporary bundle;
4. exposes configured sample directories read-only with `--add-dir`;
5. launches a fresh `agy -p` process with `--new-project`, `--mode plan`, `--sandbox`, `--disable-slash-commands`, and a JSON Schema;
6. never uses `--dangerously-skip-permissions`;
7. removes the input bundle after the call.

The Pi conductor may inspect the active project, but AGY never receives unrestricted project access. Do not pass credentials, AGY settings, project IDs, private profiles, unrelated files, or project instructions as sources.

## Development and release gates

```bash
npm ci
npm run check
npm pack --dry-run
npm run test:agy-live
```

The last command skips by default. The manual pre-release compatibility gate consumes quota and requires explicit approval:

```bash
AGY_LIVE=1 npm run test:agy-live
```

CI is credential-free and never runs AGY inference.

## Roadmap

Later milestones may add AGY-native Markdown agents, skills, model/execution policies, research and image capabilities, richer progress handling, and—only when a second backend exists—an open-weight adapter. V1 intentionally has no generic backend framework or document-role taxonomy.

## Documentation

- [Architecture](docs/architecture.md)
- [AGY compatibility contract](docs/agy-compatibility.md)
- [Approved design](docs/plans/2026-08-09-pi-agy-suite-design.md)
- [Contributing](CONTRIBUTING.md)

## License

MIT
