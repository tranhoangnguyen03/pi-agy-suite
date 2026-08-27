# Contributing

## AGY compatibility changes

Before changing the runner or publishing a release:

1. Read the upstream AGY changelog since the last verified version.
2. Run the unit and fake-runner contract tests.
3. Run `npm run test:agy-live` and confirm the guarded default path skips without inference.
4. With explicit quota approval, run `AGY_LIVE=1 npm run test:agy-live` manually.
5. Update `docs/agy-compatibility.md` and `CHANGELOG.md` with the exact verified AGY version and date.

## Publishing to npm

Publish manually from a clean, committed release tree. Never paste npm credentials, OTPs, tokens, or authentication URLs into issues, pull requests, chat, or repository files.

1. Confirm the npm identity and package availability:

   ```bash
   npm whoami
   npm view pi-agy-suite name version dist-tags.latest
   ```

   A first release normally returns `404` from `npm view`. Registry availability can change until publication.
2. Run the release checks and inspect the exact payload:

   ```bash
   git status --porcelain=v1
   npm run check
   npm run test:agy-live
   npm pack --dry-run --json
   ```

   The Git status output must be empty. The guarded live command must skip unless a separately approved `AGY_LIVE=1` run is required.
3. Publish interactively from the directory containing the release `package.json`:

   ```bash
   npm publish --access public
   ```

   `npm whoami` does not satisfy publish-time two-factor authentication. If npm returns `EOTP`, complete the browser or OTP challenge locally. Do not expose the authentication URL or automatically retry; first verify registry state.
4. Confirm publication from the registry:

   ```bash
   npm view pi-agy-suite name version dist-tags.latest
   ```

   Do not claim success until the registry reports the intended name, version, and `latest` tag.

Never commit AGY or npm credentials, Pi auth files, generated temporary input bundles, or private writing profiles and samples.
