# Security Policy

Report vulnerabilities privately through GitHub Security Advisories after the repository is published.

The extension executes the local `agy` binary and may expose explicitly selected documents and configured writing samples to the Antigravity service. Review Google's applicable terms and data-use settings. The prose tools must never receive credentials or unrestricted project access.

Runs use a fresh temporary project, read-only copies, sandboxing, and headless AGY permissions that auto-deny unapproved writes. AGY 1.1.13 reports that `--mode plan` has no effect when slash-command expansion is disabled, so plan mode is not itself a write boundary. The extension never uses `--dangerously-skip-permissions`; a live diagnostic confirmed that an attempted write was denied and the bundled file remained unchanged.
