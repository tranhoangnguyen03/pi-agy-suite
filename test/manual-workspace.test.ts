import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("../scripts/manual-workspace.mjs", import.meta.url));

async function run(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  const child = spawn(process.execPath, [script, ...args], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const code = await new Promise<number>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (value) => resolve(value ?? 1));
  });
  return { code, stdout, stderr };
}

test("manual workspace setup creates clean fixtures and a nonempty baseline", async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-agy-manual-test-"));
  await rm(root, { recursive: true });
  try {
    const result = await run(["setup", root]);
    assert.equal(result.code, 0, result.stderr);
    assert.match(await readFile(join(root, "facts.md"), "utf8"), /October 15, 2026/);
    assert.match(await readFile(join(root, ".pi/pi-agy-suite/prose/voice.md"), "utf8"), /Prefer short declarative sentences/);
    assert.match(await readFile(join(root, ".pi/pi-agy-suite/prose/writing-samples/sample.md"), "utf8"), /works offline/);
    const baseline = await readFile(join(root, ".pi-agy-inputs.sha256"), "utf8");
    assert.ok(baseline.trim());
    assert.match(baseline, /facts\.md/);
    assert.match(baseline, /voice\.md/);
    assert.match(baseline, /sample\.md/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("manual workspace setup refuses non-disposable directory names", async () => {
  const root = await mkdtemp(join(tmpdir(), "ordinary-directory-"));
  try {
    await writeFile(join(root, "keep.txt"), "keep\n");
    const result = await run(["setup", root]);
    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /pi-agy-manual-/i);
    assert.equal(await readFile(join(root, "keep.txt"), "utf8"), "keep\n");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("manual workspace verify requires outputs and unchanged inputs", async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-agy-manual-test-"));
  await rm(root, { recursive: true });
  try {
    assert.equal((await run(["setup", root])).code, 0);
    const missing = await run(["verify", root]);
    assert.notEqual(missing.code, 0);
    assert.match(missing.stderr, /missing.*launch-note\.md/i);

    await writeFile(join(root, "launch-note.md"), "");
    await writeFile(join(root, "launch-note-edited.md"), "edit\n");
    const empty = await run(["verify", root]);
    assert.notEqual(empty.code, 0);
    assert.match(empty.stderr, /empty.*launch-note\.md/i);

    await writeFile(join(root, "launch-note.md"), "draft\n");
    const valid = await run(["verify", root]);
    assert.equal(valid.code, 0, valid.stderr);
    assert.match(valid.stdout, /inputs unchanged/i);
    assert.match(valid.stdout, /outputs present/i);

    await writeFile(join(root, "facts.md"), "changed\n");
    const changed = await run(["verify", root]);
    assert.notEqual(changed.code, 0);
    assert.match(changed.stderr, /input verification failed/i);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
