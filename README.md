# pi-agy-suite

A typed [Pi](https://github.com/earendil-works/pi) extension that delegates prose drafting and editing to fresh Gemini runs through the official Antigravity CLI (`agy`). Pi remains the conductor; AGY receives only explicitly selected files and configured writing samples.

## Requirements

- Node.js 22.19 or newer.
- Antigravity CLI 1.1.10 or newer; latest stable is recommended.
- AGY authentication completed through its normal Google sign-in or supported enterprise flow.
- The exact default model `gemini-3.7-flash-high` available to the account.

Install AGY using Google's official instructions, run `agy` once to authenticate, then check the local setup with `/agy-suite-doctor`. The extension resolves `AGY_BIN` first, then `agy` on `PATH`, then `~/.local/bin/agy`. It fails instead of substituting another model.

## Install

The package is not published yet. After release:

```bash
pi install npm:pi-agy-suite
```

For deterministic isolated verification:

```bash
SUITE=/absolute/path/to/pi-agy-suite
TESTDIR="${TMPDIR:-/tmp}/pi-agy-manual-test"
node "$SUITE/scripts/manual-workspace.mjs" setup "$TESTDIR"
cd "$TESTDIR"
pi \
  --no-extensions --extension "$SUITE/index.ts" \
  --no-skills \
  --no-prompt-templates \
  --prompt-template "$SUITE/prompts/agy-prose-draft.md" \
  --prompt-template "$SUITE/prompts/agy-prose-edit.md" \
  --no-themes --no-context-files --no-approve \
  --tools read,write,agy_prose_draft,agy_prose_edit \
  --no-session
```

`setup` replaces only the named disposable test directory, creates a clean voice guide and real sample, and records a nonempty input checksum baseline. The Pi command loads only this extension's runtime and prompt templates. `write` is enabled only so Pi can save prose when the request names an output path; the AGY subprocess remains read-only.

After both manual draft/edit calls, exit Pi and verify the mechanics without inference:

```bash
node "$SUITE/scripts/manual-workspace.mjs" verify "$TESTDIR"
```

Verification fails unless both output files exist and every source/profile input still matches its setup checksum. Use `/reload` after changing extension or profile files.

## Public interfaces

### Tools

- `agy_prose_draft` — compose fresh prose or comprehensively redraft supplied material.
- `agy_prose_edit` — tune voice, diction, rhythm, clarity, flow, and modest organization while preserving facts, claims, quotations, citations, argument, and authorial position by default.

Both return prose only in visible tool content. Model, AGY version, selected reader, casting rationale/usage when applicable, selected profiles, source manifest, consulted samples, warnings, assumptions, generation usage, and any oversized-output truncation/path metadata remain in hidden tool details.

### Prompt templates

```text
/agy-prose-draft [intent and @sources]
/agy-prose-edit [intent and @sources]
```

Explicit request that creates a new file:

```text
/agy-prose-draft Using only @facts.md, write a 100–140 word launch note to launch-note.md. The destination does not exist; create it after drafting.
```

Expect one AGY drafting call followed by one Pi `write` call. Without `to launch-note.md`, the result is displayed only and no file is created.

Explicit edit request that creates a separate file:

```text
/agy-prose-edit Edit @launch-note.md for clarity and voice using @facts.md as factual support. Save the result to launch-note-edited.md; the destination does not exist.
```

For the second form, Pi may inspect nearby files to select the smallest relevant source set. Because no reader is specified, editing defaults to one reader-casting call plus one editing call. AGY still receives only the explicit list passed to the typed tool.

### Reader profiles and call counts

The work always keeps its own voice. One reader profile supplies attention and taste; it is not a second author or a style-imitation instruction.

- `agy_prose_edit`: omitted `reader` or `reader: "auto"` casts a reader from the complete work, then edits for that reader (**two AGY calls**). An explicit reader profile skips casting (**one call**).
- `agy_prose_draft`: omitted `reader` drafts directly (**one call**). `reader: "auto"` casts from the brief and sources, then drafts (**two calls**). An explicit reader profile drafts directly (**one call**).
- The exact selected `model` applies to every call in the workflow. The default is `gemini-3.7-flash-high`; no fallback is used.
- Casting returns one concise reader profile and a hidden rationale. The rationale is metadata, not editing instructions.
- A no-op edit is valid when the input already holds the selected reader's attention.

Pi presents returned prose unchanged when it fits the visible output limit; oversized visible content is a prose-only prefix while hidden details retain the private full-output path. Draft/edit tools return prose; they do not create project files themselves. If the user requested an output path, the Pi conductor writes the result verbatim with Pi's `write` tool; it must not overwrite an existing file without explicit replacement intent. A local test session must therefore enable `write` when testing file output.

Model output is not guaranteed to improve prose. Review raw and edited versions before replacing or publishing anything; [`docs/evaluating-prose.md`](docs/evaluating-prose.md) provides a high-level binary reader-judgment method. If an AGY call fails, assume it may already have consumed quota. The conductor reports the failure and asks before retrying.

### Commands

```text
/agy-prose-init global
/agy-prose-init local
/agy-suite-doctor
```

Initialization creates missing profile files and never overwrites existing ones. The doctor checks AGY version, required flags, exact default-model availability, voice profile, actual global/local Markdown sample-file counts, and temporary-workspace readiness without inference quota. `README.md` metadata does not count as a sample.

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

The doctor and the default live-test command are quota-free; doctor output explicitly says `Live inference: not run`. The manual pre-release compatibility gate exercises automatic reader casting and editing, consumes two inference calls, and requires explicit approval:

```bash
AGY_LIVE=1 npm run test:agy-live
```

CI is credential-free and never runs AGY inference.

## Roadmap

Later milestones may add AGY-native Markdown agents, skills, model/execution policies, research and image capabilities, richer progress handling, and—only when a second backend exists—an open-weight adapter. V1 intentionally has no generic backend framework or document-role taxonomy.

## Documentation

- [Architecture](docs/architecture.md)
- [AGY compatibility contract](docs/agy-compatibility.md)
- [Evaluating prose](docs/evaluating-prose.md)
- [Approved design](docs/plans/2026-08-09-pi-agy-suite-design.md)
- [Contributing](CONTRIBUTING.md)

## License

MIT
