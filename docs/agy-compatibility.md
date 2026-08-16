# AGY Compatibility Contract

This document records only the Antigravity CLI behavior that `pi-agy-suite` depends on. It is not a copy of the AGY manual or changelog.

Authoritative upstream changelog: <https://github.com/google-antigravity/antigravity-cli/blob/main/CHANGELOG.md>

## Support status

| AGY version | Status | Reason |
|---|---|---|
| 1.1.5 and older | Unsupported | Required structured output is absent or the headless model guarantee is insufficient. |
| 1.1.8–1.1.9 | Unsupported | Structured output exists, but the later headless `--model`/`--effort` fix is absent. |
| 1.1.10 | Minimum | Includes the headless model/effort selection fix required by the prose model contract. |
| 1.1.11 | Development baseline | Initial implementation baseline; fake-runner contract passes. |
| 1.1.13 | Verified | Doctor, fake-runner contracts, and the opt-in live suite pass. |

Policy:

- Latest stable AGY is recommended.
- The runner fails with upgrade guidance below the minimum version.
- The extension has no legacy fallback.
- “Minimum” means expected to work from known upstream behavior.
- “Verified” is used only after the opt-in live compatibility test passes.

## Required CLI surface

The runner depends on:

- `agy --version`
- `agy models`
- `agy -p` / `--print`
- `--model`
- `--mode plan`
- `--sandbox`
- `--new-project`
- `--add-dir`
- `--print-timeout`
- `--output-format json`
- `--json-schema`
- `--log-file`
- `--disable-slash-commands`

## Required behavior

- Headless runs honor the exact `--model` selection.
- An unknown model exits nonzero rather than silently falling back.
- The runner requests `--mode plan`; AGY 1.1.13 warns that plan mode has no effect when slash-command expansion is disabled, so the read-only contract also relies on read-only copies, sandboxing, and explicit no-write prompting.
- `--new-project` starts a fresh project-backed conversation.
- `--sandbox` applies in print mode.
- `agy --help` may write usage text to stderr; the doctor checks both stdout and stderr.
- JSON output contains the response and usage information consumed by the runner.
- `--json-schema` constrains the final response. AGY 1.1.13 may still wrap one valid schema object in a Markdown `json` fence; the runner unwraps exactly that form while rejecting surrounding prose or multiple objects.
- A prompt passed with `-p` is accepted as one argv value without reading stdin.
- A successful inference returns nonempty stdout.
- Cancellation can terminate the AGY child process tree.
- The model returns prose in the schema result without attempting file edits; headless AGY cannot approve write tools.
- On AGY 1.1.13, a live diagnostic that explicitly requested a write returned an auto-denied `write_file` permission error and left the read-only bundled file unchanged.
- A fresh invocation does not resume a previous conversation.

## Binary resolution

The extension checks `AGY_BIN`, then `agy` on `PATH`, then `~/.local/bin/agy`. An invalid explicit `AGY_BIN` fails immediately. Doctor output reports only the resolved path and compatibility facts; it does not print settings contents, credentials, account data, or project IDs.

## Model dependency

Default prose model:

```text
gemini-3.1-pro-low
```

If that model is not listed by `agy models`, the doctor and prose tools fail clearly. They never silently substitute another model. Individual calls may explicitly select another available AGY model.

## Known compatibility risks

Review upstream changes involving:

- print/headless mode;
- model slugs, routing, and effort;
- JSON and stream-JSON envelopes;
- JSON Schema enforcement;
- exit codes and empty-success behavior;
- permissions, plan mode, sandbox, workspace/project resolution, and inherited environment variables;
- authentication and credential storage;
- log-file and conversation behavior;
- custom agents and skills used by the next milestone.

## Upgrade verification

When AGY is updated:

1. Read upstream changelog entries from the last verified version through the new version.
2. Review changes in every known-risk category above.
3. Run `/agy-suite-doctor`.
4. Run unit and fake-runner compatibility tests.
5. Run `AGY_LIVE=1 npm run test:agy-live` manually.
6. Inspect sanitized structured output for schema/envelope drift.
7. Update this compatibility matrix.
8. Record the verified AGY version in `CHANGELOG.md`.

No AGY credentials are stored in CI. The live test is a manual pre-release gate and is skipped unless `AGY_LIVE=1` is set. Running it requires explicit approval because it consumes inference quota. A failed AGY call may also have consumed quota, so conductors report failures instead of retrying automatically.
