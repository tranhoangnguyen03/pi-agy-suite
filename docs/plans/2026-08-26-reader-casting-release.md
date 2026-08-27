# Reader Casting Release Implementation Plan

> **REQUIRED SUB-SKILL:** Use the executing-plans skill to implement this plan task-by-task.

**Goal:** Ship reader-profile casting for prose drafting/editing, Flash High defaults, sanitized binary evaluation guidance, and honest release documentation without publishing private benchmarks.

**Architecture:** Reuse `executeProse` and `runAgy`. Add one small casting schema/prompt helper and an optional `reader` tool parameter. Automatic casting runs in the same temporary read-only bundle immediately before prose generation; explicit readers skip casting. Edit defaults to automatic casting, while draft defaults to direct generation. Both calls use the exact same selected model and never retry or fall back.

**Tech Stack:** TypeScript, Node.js standard library, TypeBox, node:test, existing AGY runner.

---

### Task 1: Prompt and casting contract

**Files:**
- Modify: `src/prose.ts`
- Test: `test/prose.test.ts`

1. Add failing tests for task-specific casting prompts, reader-aware draft/edit prompts, and casting response validation.
2. Run `npm test -- --test-name-pattern='reader|casting'` and verify RED.
3. Add the minimal casting schema, parser, prompt builders, and reader framing.
4. Re-run focused tests and verify GREEN.

### Task 2: Tool call policy and metadata

**Files:**
- Modify: `src/tools.ts`
- Test: `test/tools.test.ts`

1. Add failing tests for the `reader` field and call counts: edit omitted/auto = two; edit explicit = one; draft omitted = one; draft auto = two; draft explicit = one.
2. Add failing tests for casting failure short-circuit, same exact model on both calls, hidden cast reason/usage, and Flash High default.
3. Run focused tests and verify RED.
4. Implement the smallest shared cast-then-generate branch in `executeProse`.
5. Re-run focused tests and verify GREEN.

### Task 3: Conductors and public documentation

**Files:**
- Modify: `prompts/agy-prose-draft.md`
- Modify: `prompts/agy-prose-edit.md`
- Modify: `test/prompts.test.ts`
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Modify: `docs/agy-compatibility.md`
- Create: `docs/evaluating-prose.md`
- Modify: `package.json`

1. Add failing conductor tests for reader behavior, quota transparency, and no automatic retry.
2. Run focused tests and verify RED.
3. Update conductors and sanitized docs. Include the binary covenant rubric and explicitly avoid guaranteed-improvement claims.
4. Re-run focused tests and verify GREEN.

### Task 4: Release verification and review

1. Inspect `git diff --check` and `git status`.
2. Run `npm run check`.
3. Run quota-free `npm run test:agy-live` and confirm skip.
4. Run `npm pack --dry-run` and inspect contents.
5. Obtain independent executable code/release review.
6. Fix Critical/Important findings through TDD and re-review.
7. Commit the release candidate changes.
8. Ask for explicit approval before `AGY_LIVE=1 npm run test:agy-live`.

No merge, tag, push, PR, npm authentication, or publication.
