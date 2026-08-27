# Pi AGY Suite v1 Implementation Plan

> **REQUIRED SUB-SKILL:** Use the executing-plans skill to implement this plan task-by-task.

## Execution checkpoint — 2026-08-09

Implementation is paused in the isolated worktree:

```text
/Users/davidus-tranus/Github/pi-agy-suite/.worktrees/v1-prose
```

Branch:

```text
feature/v1-prose
```

The repository's `main` branch contains only the approved design/docs baseline plus `.worktrees/` ignore configuration. No implementation commits exist on the feature branch yet.

Task 1 has begun under TDD but is **not complete**:

- RED was observed by running `node --experimental-strip-types --test test/load.test.ts`; it failed with `ERR_MODULE_NOT_FOUND` for `index.ts`, as intended.
- Uncommitted scaffold files now exist: `package.json`, `tsconfig.json`, `index.ts`, `src/types.ts`, and `test/load.test.ts`.
- `npm install`, `npm run check`, and the Task 1 commit have **not** been run.
- Tasks 2–11 have not started.
- Two native subagent launches failed before producing output or source changes; their temporary artifacts were removed. Do not infer implementation progress from those attempts.

A fresh implementer must start by inspecting `git status`, reviewing the uncommitted scaffold against Task 1, then resume at **Task 1, Step 4** only after completing any missing Step 3 setup such as `npm install`. Preserve TDD evidence already recorded above; all later production behavior still requires its own observed failing test before implementation.

Quality-gate phases agreed with the user:

1. Tasks 1–3 — package, profiles/init, and secure source bundling.
2. Task 4 — shared AGY runner and compatibility contract.
3. Tasks 5–6 — prose contracts and typed tools.
4. Tasks 7–9 — conductor templates, doctor, and manual live gate.
5. Tasks 10–11 — documentation, CI, package/release readiness.

At each phase boundary: run the full relevant checks, inspect the diff/status, obtain independent spec/correctness review, fix Important/Critical findings, and commit before proceeding.

**Goal:** Publish a typed Pi extension that delegates flexible prose drafting and voice-focused editing to fresh, isolated `gemini-3.1-pro-low` runs through AGY.

**Architecture:** Two thin Pi tools and two conductor prompt templates share profile resolution, explicit-source bundling, and one AGY subprocess runner. Pi may explore the active project, but AGY sees only a temporary bundle of explicitly selected inputs plus configured writing-sample directories; AGY returns schema-constrained prose and never writes into the project.

**Tech Stack:** TypeScript source loaded directly by Pi/jiti, Pi extension APIs, TypeBox, Node.js standard library, Node's built-in test runner, TypeScript compiler, official Antigravity CLI 1.1.10+.

---

## Task 1: Create the Pi package skeleton

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `index.ts`
- Create: `src/types.ts`
- Create: `test/load.test.ts`

**Step 1: Write the failing package-load test**

Create `test/load.test.ts` using `node:test` and `node:assert/strict`. Import the default export from `../index.ts` and assert that it is a function.

```ts
import assert from "node:assert/strict";
import test from "node:test";
import extension from "../index.ts";

test("exports a Pi extension factory", () => {
  assert.equal(typeof extension, "function");
});
```

**Step 2: Run the test to verify it fails**

Run:

```bash
npm test
```

Expected: failure because the package, dependencies, and entry point do not exist.

**Step 3: Add the minimal package configuration**

Create `package.json` with:

- name `pi-agy-suite`;
- initial version `0.1.0`;
- `type: module`;
- `main` and `exports` pointing to `./index.ts`;
- `pi.extensions: ["./index.ts"]`;
- `pi.prompts: ["./prompts"]`;
- files limited to runtime source, prompts, README, changelog, license, and compatibility docs;
- MIT license, public publish config, repository metadata, `pi-package` keywords;
- Node `>=22.19.0`;
- peer dependencies on `@earendil-works/pi-coding-agent`, `@earendil-works/pi-tui`, and `typebox`;
- development dependencies on matching current Pi packages, `typebox`, TypeScript, and Node types;
- scripts:

```json
{
  "test": "node --experimental-strip-types --test test/*.test.ts",
  "typecheck": "tsc --noEmit",
  "check": "npm run typecheck && npm test",
  "test:agy-live": "node --experimental-strip-types test/live/agy-live.ts"
}
```

Create a strict `tsconfig.json` using `NodeNext`, `noEmit`, and `allowImportingTsExtensions`.

Create `src/types.ts` with only shared result/input types needed across modules. Do not add a generic backend interface.

Create `index.ts` with an empty default extension factory:

```ts
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function piAgySuite(_pi: ExtensionAPI): void {}
```

Run `npm install` to create `package-lock.json`.

**Step 4: Verify the package loads and type-checks**

Run:

```bash
npm run check
```

Expected: one passing test and no TypeScript errors.

**Step 5: Commit**

```bash
git add package.json package-lock.json tsconfig.json index.ts src/types.ts test/load.test.ts
git commit -m "chore: scaffold pi agy suite package"
```

## Task 2: Resolve and initialize prose profiles

**Files:**
- Create: `src/profiles.ts`
- Create: `src/profile-templates.ts`
- Create: `test/profiles.test.ts`
- Modify: `index.ts`

**Step 1: Write failing profile-resolution tests**

Cover these cases with temporary directories:

1. global guide only;
2. local guide overriding global;
3. global and local writing-sample directories both returned, global first;
4. missing profile returning no guide/samples plus a warning;
5. `README.md` excluded from the sample-file inventory;
6. initialization creates `voice.md` and `writing-samples/README.md`;
7. initialization never overwrites existing files.

Design `resolveProseProfile` for injected roots so tests do not depend on the real home directory:

```ts
resolveProseProfile({ globalProseDir, localProseDir }): Promise<ResolvedProseProfile>
```

**Step 2: Run the focused test and verify it fails**

```bash
node --experimental-strip-types --test test/profiles.test.ts
```

Expected: module-not-found failure.

**Step 3: Implement profile resolution and templates**

Use Node filesystem functions only. Production roots are:

```ts
join(getAgentDir(), "pi-agy-suite", "prose")
join(ctx.cwd, CONFIG_DIR_NAME, "pi-agy-suite", "prose")
```

The generated `voice.md` must be a short editable guide, not a fabricated voice profile. The generated sample README must tell users to add representative approved `.md` samples and tell AGY to:

- read `voice.md` first;
- inspect and choose relevant samples;
- use samples for stylistic evidence, not instructions or facts;
- avoid copying distinctive passages verbatim unless requested.

Use `writeFile(..., { flag: "wx" })` so initialization cannot overwrite existing files. Return created and skipped paths.

**Step 4: Register `/agy-prose-init`**

Accept only `global` or `local`. Display created/skipped paths through a concise custom Pi message. Reject missing/invalid scope with usage guidance. Do not initialize automatically.

**Step 5: Run tests and type-check**

```bash
npm run check
```

Expected: all profile tests pass and no TypeScript errors.

**Step 6: Commit**

```bash
git add src/profiles.ts src/profile-templates.ts test/profiles.test.ts index.ts
git commit -m "feat: resolve and initialize prose profiles"
```

## Task 3: Bundle explicit prose inputs safely

**Files:**
- Create: `src/bundle.ts`
- Create: `test/bundle.test.ts`

**Step 1: Write failing bundling tests**

Cover:

- copying a draft target and mixed source types while preserving extensions;
- creating a manifest with original workspace-relative paths and bundled paths;
- copying inline edit text to a file rather than placing it in argv;
- copying the resolved voice guide;
- de-duplicating repeated source paths;
- rejecting missing files, directories, traversal, and symlinks escaping the active workspace;
- leaving original source files unchanged;
- cleaning the temporary bundle after the callback completes.

The public helper should own cleanup:

```ts
withInputBundle(options, async (bundle) => { ... })
```

**Step 2: Run the focused test and verify it fails**

```bash
node --experimental-strip-types --test test/bundle.test.ts
```

Expected: module-not-found failure.

**Step 3: Implement the minimum secure bundler**

- Resolve paths against `ctx.cwd`.
- Use `realpath` and `relative` to enforce that every named input remains inside the active workspace.
- Require regular files; the conductor selects files from any user-mentioned directory.
- Copy files rather than reading them into Pi/AGY prompt strings.
- Give colliding basenames deterministic numeric prefixes.
- Write `manifest.json` into the temporary workspace.
- Copy the active voice guide to `profile/voice.md` when available.
- Return existing sample directories separately so the runner can pass them with `--add-dir`.
- Remove the temporary directory in `finally`.

Do not classify documents or restrict extensions in v1.

**Step 4: Run tests and type-check**

```bash
npm run check
```

Expected: bundling and existing tests pass.

**Step 5: Commit**

```bash
git add src/bundle.ts test/bundle.test.ts
git commit -m "feat: isolate explicit prose inputs"
```

## Task 4: Build the shared AGY runner

**Files:**
- Create: `src/agy-runner.ts`
- Create: `test/fixtures/fake-agy.mjs`
- Create: `test/fixtures/agy-json-success.json`
- Create: `test/runner.test.ts`
- Modify: `docs/agy-compatibility.md` if observed CLI behavior differs

**Step 1: Write failing runner contract tests**

The fake executable should record argv and provide controlled version/help/models/inference outputs. Test:

- binary resolution order: `AGY_BIN`, `PATH`, `~/.local/bin/agy`;
- rejecting AGY below 1.1.10;
- checking exact model availability;
- passing `--model gemini-3.1-pro-low` by default;
- passing `--mode plan`, `--sandbox`, `--disable-slash-commands`, `--output-format json`, `--json-schema`, `--log-file`, `--print-timeout`, and each sample directory via `--add-dir`;
- never passing `--dangerously-skip-permissions`;
- treating the prompt as one argv element;
- handling paths with spaces;
- parsing the structured response and usage;
- rejecting missing response fields, empty success, and nonzero exits;
- bounding stderr included in thrown errors;
- cancellation terminating the child process tree.

**Step 2: Run the focused test and verify it fails**

```bash
node --experimental-strip-types --test test/runner.test.ts
```

Expected: module-not-found failure.

**Step 3: Implement the runner with Node standard library**

Define a narrow API:

```ts
runAgy({
  cwd,
  prompt,
  schemaPath,
  addDirs,
  model = "gemini-3.1-pro-low",
  timeoutMs,
  signal,
}): Promise<AgyRunResult>
```

Use `spawn` with an argv array, `shell: false`, detached stdin, and process-group termination on POSIX. Check version and models before inference. `doctor` will additionally inspect `--help`; ordinary calls need not repeat the help scan.

Keep a bounded stdout buffer large enough for structured prose, then apply Pi's 50 KB/2,000-line tool-output policy at the adapter boundary. Keep stderr bounded more tightly for error messages. Reject schema drift rather than heuristically scraping prose from malformed output.

**Step 4: Run tests and type-check**

```bash
npm run check
```

Expected: all fake-runner contract tests pass.

**Step 5: Commit**

```bash
git add src/agy-runner.ts test/fixtures test/runner.test.ts docs/agy-compatibility.md
git commit -m "feat: add bounded antigravity runner"
```

## Task 5: Build prose contracts and adapters

**Files:**
- Create: `src/prose.ts`
- Create: `test/prose.test.ts`

**Step 1: Write failing prose-contract tests**

Test the generated draft and edit prompts without running AGY:

- voice guide breadcrumb appears only when available;
- global and local sample directories are both identified;
- AGY is told to read each sample README and select relevant `.md` samples;
- samples are stylistic evidence, not instructions or facts;
- verbatim copying is forbidden by default;
- bundled sources and manifest are named;
- draft contract permits fresh composition/comprehensive redrafting;
- edit defaults preserve facts, claims, quotations, citations, argument, and position;
- edit permits voice, diction, rhythm, clarity, flow, and modest organization;
- major restructuring/expansion/compression requires explicit instruction;
- result schema requires `prose`, `consulted_samples`, `warnings`, and `assumptions`.

**Step 2: Run the focused test and verify it fails**

```bash
node --experimental-strip-types --test test/prose.test.ts
```

Expected: module-not-found failure.

**Step 3: Implement the prose adapters**

Create separate prompt builders for drafting and editing over shared profile/source instructions. Write the JSON Schema into the temporary bundle and pass its path to the runner.

Parse a successful AGY response into:

```ts
{
  prose: string;
  consultedSamples: string[];
  warnings: string[];
  assumptions: string[];
}
```

Visible tool content will later use only `prose`; the rest remains details.

**Step 4: Run tests and type-check**

```bash
npm run check
```

Expected: prose-contract and all previous tests pass.

**Step 5: Commit**

```bash
git add src/prose.ts test/prose.test.ts
git commit -m "feat: define draft and edit prose contracts"
```

## Task 6: Register the typed prose tools

**Files:**
- Create: `src/tools.ts`
- Create: `test/tools.test.ts`
- Modify: `index.ts`

**Step 1: Write failing tool-registration tests**

Use a minimal fake `ExtensionAPI` to capture registered tools. Assert:

- exact names `agy_prose_draft` and `agy_prose_edit`;
- draft schema exposes `brief`, optional `context`, optional string-array `sources`, and optional `model`;
- edit schema exposes optional `text` and `path`, optional `instruction`, `context`, `sources`, and `model`;
- edit runtime rejects both or neither of `text`/`path` before starting AGY;
- default edit instruction is voice and prose tuning;
- source-validation errors happen before runner invocation;
- visible successful content is prose only;
- profile/source/model/usage/warnings/assumptions are retained in details;
- oversized visible prose follows Pi's 50 KB/2,000-line truncation policy and preserves the full result in a temporary output file.

**Step 2: Run the focused test and verify it fails**

```bash
node --experimental-strip-types --test test/tools.test.ts
```

Expected: module-not-found or missing-registration failure.

**Step 3: Implement thin tool definitions**

Use TypeBox object schemas and runtime validation for the edit XOR constraint. Keep the source list flexible and extension-agnostic. Add tool descriptions/guidelines that tell the Pi conductor:

- use explicit user-named materials without unnecessary discovery;
- for intent-only requests, inspect nearby project files and select the smallest relevant set before calling the tool;
- never pass whole directories or secrets;
- present AGY prose unchanged;
- write it verbatim only when the user requested an output path.

Tools resolve profiles, call `withInputBundle`, build the capability prompt/schema, invoke the shared runner, then return the clean result.

**Step 4: Run tests and type-check**

```bash
npm run check
```

Expected: tool and all previous tests pass.

**Step 5: Commit**

```bash
git add src/tools.ts test/tools.test.ts index.ts
git commit -m "feat: expose agy prose tools"
```

## Task 7: Add conductor prompt templates

**Files:**
- Create: `prompts/agy-prose-draft.md`
- Create: `prompts/agy-prose-edit.md`
- Create: `test/prompts.test.ts`

**Step 1: Write failing template-content tests**

Read both templates and assert that they:

- interpolate `$ARGUMENTS`/`$@`;
- name the exact typed tool;
- distinguish explicit and discovery-assisted requests;
- instruct Pi to use the smallest relevant source set;
- forbid entire-directory delegation, unrelated files, secrets, and project instructions;
- ask only when ambiguity would materially change the result;
- preserve AGY's prose unchanged;
- require explicit replacement intent before overwriting an output path.

**Step 2: Run the focused test and verify it fails**

```bash
node --experimental-strip-types --test test/prompts.test.ts
```

Expected: missing-template failure.

**Step 3: Write the two Markdown templates**

Use concise frontmatter descriptions and an argument hint of `[intent and @sources]`. Keep drafting permissive and editing conservative by default. When invoked without arguments, ask the user for the intended piece or edit rather than launching a deterministic wizard.

**Step 4: Run tests and type-check**

```bash
npm run check
```

Expected: templates satisfy the conductor contract.

**Step 5: Commit**

```bash
git add prompts test/prompts.test.ts
git commit -m "feat: add prose conductor templates"
```

## Task 8: Add the compatibility doctor

**Files:**
- Create: `src/doctor.ts`
- Create: `test/doctor.test.ts`
- Modify: `index.ts`

**Step 1: Write failing doctor tests**

Using the fake AGY executable, test reports for:

- found binary and exact path;
- installed, minimum, and status versions;
- all required flags;
- default-model availability;
- global/local guide and sample-directory state;
- missing binary, old version, missing flag, and missing model;
- sanitized output that contains no environment values, credentials, project IDs, or AGY settings content;
- no inference (`-p`) call.

**Step 2: Run the focused test and verify it fails**

```bash
node --experimental-strip-types --test test/doctor.test.ts
```

Expected: module-not-found failure.

**Step 3: Implement and register `/agy-suite-doctor`**

Reuse runner discovery/version/model helpers. Run `agy --help` and check the compatibility contract's required flags, including `--disable-slash-commands`. Present a concise custom message with pass/warn/fail lines. The command must not consume quota.

**Step 4: Run tests and type-check**

```bash
npm run check
```

Expected: all doctor and existing tests pass.

**Step 5: Commit**

```bash
git add src/doctor.ts test/doctor.test.ts index.ts
git commit -m "feat: add agy compatibility doctor"
```

## Task 9: Add the opt-in live release gate

**Files:**
- Create: `test/live/agy-live.ts`
- Modify: `CONTRIBUTING.md`
- Modify: `docs/agy-compatibility.md`

**Step 1: Implement the guarded live script**

If `AGY_LIVE !== "1"`, print a skip message and exit zero. Otherwise:

1. resolve and validate AGY;
2. create a temporary voice guide, writing sample, and rough draft;
3. run one minimal `gemini-3.1-pro-low` schema-constrained prose edit;
4. assert nonempty prose and valid hidden metadata;
5. assert the original rough draft is byte-for-byte unchanged;
6. remove the temporary workspace;
7. print the exact AGY version that passed.

Do not print account, credential, quota, project, or profile contents.

**Step 2: Verify the guarded default path**

```bash
npm run test:agy-live
```

Expected: explicit skipped message and exit zero without AGY inference.

**Step 3: Run the real live test manually**

```bash
AGY_LIVE=1 npm run test:agy-live
```

Expected: one passing inference on `gemini-3.1-pro-low`; record the exact AGY version.

**Step 4: Update compatibility evidence**

Change the installed version's matrix status to “Verified” and record the date. Update `CONTRIBUTING.md` if the real CLI required any procedural adjustment.

**Step 5: Commit**

```bash
git add test/live/agy-live.ts CONTRIBUTING.md docs/agy-compatibility.md
git commit -m "test: add manual agy compatibility gate"
```

## Task 10: Final documentation and package verification

**Files:**
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Modify: `docs/architecture.md`
- Modify: `docs/agy-compatibility.md`
- Create: `.github/workflows/ci.yml`

**Step 1: Complete user documentation**

Document:

- AGY installation/authentication and 1.1.10 minimum;
- binary resolution and `AGY_BIN` override;
- package install and `/reload`;
- global/local profile locations and layering;
- advanced explicit request and novice discovery-assisted request examples;
- draft versus edit behavior;
- chat return and explicit output-path handling;
- privacy/isolation boundaries;
- doctor and manual release gate;
- roadmap for AGY-native specialization, research/image capabilities, and a future open-weight fork.

**Step 2: Add credential-free CI**

Create `.github/workflows/ci.yml` that checks out, installs with `npm ci`, and runs `npm run check` on supported Node. Do not configure AGY or secrets.

**Step 3: Run complete verification**

```bash
npm run check
npm pack --dry-run
```

Expected: all tests/type checks pass; tarball contains only declared runtime/docs files and excludes tests, credentials, temporary bundles, and personal profiles.

**Step 4: Inspect package through Pi**

Run from a temporary Pi session or local package install:

```bash
pi -e /Users/davidus-tranus/Github/pi-agy-suite
```

Verify commands/templates/tools load. Run `/agy-suite-doctor`, then perform one approved draft/edit smoke test.

**Step 5: Update changelog**

Record the verified AGY version, live test, public tools/commands/templates, and known limitations under `0.1.0`.

**Step 6: Commit**

```bash
git add README.md CHANGELOG.md docs .github/workflows/ci.yml
git commit -m "docs: prepare initial pi agy suite release"
```

## Task 11: Publish the initial release

**Files:**
- Modify: `package.json` only if release metadata changed

**Step 1: Verify a clean release tree**

```bash
git status --short
git log --oneline --decorate -10
npm run check
AGY_LIVE=1 npm run test:agy-live
npm pack --dry-run
```

Expected: clean tree, all checks pass, live AGY version recorded, package contents correct.

**Step 2: Push the implementation branch and open a PR**

Use GitHub's normal review flow. Do not publish npm from an unreviewed branch.

**Step 3: Merge and tag**

After review, merge to `main`, create tag `v0.1.0`, and push it.

**Step 4: Authenticate npm interactively**

The user runs `npm login` in their terminal if needed. Do not collect or handle npm credentials in Pi.

**Step 5: Publish public package**

```bash
npm publish --access public
```

**Step 6: Verify installation from the registry**

```bash
npm view pi-agy-suite version
pi -e npm:pi-agy-suite
```

Expected: version `0.1.0` and a successful temporary Pi load.
