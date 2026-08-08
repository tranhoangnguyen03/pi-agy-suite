# Contributing

## AGY compatibility changes

Before changing the runner or publishing a release:

1. Read the upstream AGY changelog since the last verified version.
2. Run the unit and fake-runner contract tests.
3. Run the opt-in live check manually: `AGY_LIVE=1 npm run test:agy-live`.
4. Update `docs/agy-compatibility.md` and `CHANGELOG.md` with the verified AGY version.

Never commit AGY credentials, Pi auth files, generated temporary input bundles, or private writing profiles and samples.
