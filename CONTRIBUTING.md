# Contributing

## AGY compatibility changes

Before changing the runner or publishing a release:

1. Read the upstream AGY changelog since the last verified version.
2. Run the unit and fake-runner contract tests.
3. Run `npm run test:agy-live` and confirm the guarded default path skips without inference.
4. With explicit quota approval, run `AGY_LIVE=1 npm run test:agy-live` manually.
5. Update `docs/agy-compatibility.md` and `CHANGELOG.md` with the exact verified AGY version and date.

Never commit AGY credentials, Pi auth files, generated temporary input bundles, or private writing profiles and samples.
