# Changelog

All notable changes to this project will be documented here.

## 0.1.0 - Unreleased

### Added

- Typed `agy_prose_draft` and `agy_prose_edit` Pi tools with schema-constrained AGY results.
- `/agy-prose-draft` and `/agy-prose-edit` conductor templates for explicit and discovery-assisted requests.
- `/agy-prose-init global|local` profile initialization without overwrites.
- `/agy-suite-doctor` compatibility checks that do not consume inference quota.
- Layered global/local voice guides and writing samples.
- Explicit-source temporary bundling with path, traversal, symlink, manifest, and cleanup checks.
- A bounded AGY runner requiring AGY 1.1.10+, the exact selected model, a fresh project, plan mode, sandboxing, slash-command disablement, timeout, cancellation, and structured output.
- Credential-free CI and a guarded manual AGY live-test script.
- Compatibility handling for a single schema-constrained JSON object wrapped in a Markdown fence.

### Fixed

- `agy_prose_edit` now treats empty provider-generated optional strings as omitted, so a valid `path` target does not falsely conflict with an empty `text` field.
- Conductors now distinguish visible prose from explicit file output and never retry quota-consuming AGY failures without asking.
- `/agy-suite-doctor` now says explicitly that it did not run live inference.

### Compatibility

- Default model: `gemini-3.1-pro-low`.
- Minimum AGY: 1.1.10.
- Initial development baseline: AGY 1.1.11; verified local baseline: AGY 1.1.13.
- Live AGY verification: passed on AGY 1.1.13 with `gemini-3.1-pro-low`.

### Known limitations

- V1 supports prose drafting and editing only.
- AGY receives explicit copied inputs and configured writing-sample directories; source-parent directory access and relative-link resolution are out of scope.
- No generic backend interface, document-role taxonomy, research tool, image tool, or automatic conversation continuity.
- On AGY 1.1.13, `--mode plan` has no effect when slash-command expansion is disabled; read-only copies, sandboxing, explicit no-write instructions, and headless permission denial provide the write boundary instead.
