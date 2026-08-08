# pi-agy-suite

Specialized [Pi](https://github.com/earendil-works/pi) tools that delegate prose drafting and editing to fresh Gemini runs through the official Antigravity CLI (`agy`).

> Status: design approved; implementation has not started.

## Planned v1

- `agy_prose_draft` — create or comprehensively redraft prose using an optional voice guide, writing samples, and explicit source files.
- `agy_prose_edit` — tune voice and prose while preserving meaning and factual content by default.
- `/agy-prose-draft` and `/agy-prose-edit` — Pi conductor prompt templates for direct and discovery-assisted workflows.
- `/agy-prose-init global|local` — create prose-profile scaffolding without overwriting existing files.
- `/agy-suite-doctor` — check AGY compatibility, model availability, and profile state.

The default model is `gemini-3.1-pro-low`. AGY 1.1.10 or newer is required; latest stable is recommended.

## Planned install

```bash
pi install npm:@tranhoangnguyen03/pi-agy-suite
```

The package is not published to npm yet.

## Prose profiles

Global and project-local profiles use the same relative layout:

```text
pi-agy-suite/prose/
├── voice.md
└── writing-samples/
    ├── README.md
    └── *.md
```

A project-local `voice.md` overrides the global guide. Global and local writing samples are both available to AGY.

## Design

- [Approved design](docs/plans/2026-08-09-pi-agy-suite-design.md)
- [Architecture](docs/architecture.md)
- [AGY compatibility contract](docs/agy-compatibility.md)

## License

MIT
