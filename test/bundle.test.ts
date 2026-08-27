import assert from "node:assert/strict";
import {
  access,
  chmod,
  mkdtemp,
  mkdir,
  readFile,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { withInputBundle } from "../src/bundle.ts";

async function fixture(run: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "pi-agy-bundle-test-"));
  try {
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("copies target and mixed explicit sources with a manifest", async () => fixture(async (cwd) => {
  await mkdir(join(cwd, "notes"));
  await writeFile(join(cwd, "draft.md"), "draft");
  await writeFile(join(cwd, "notes", "facts.csv"), "a,b\n1,2");
  await writeFile(join(cwd, "notes", "scan.pdf"), "pdf bytes");

  await withInputBundle({
    cwd,
    targetPath: "draft.md",
    sources: ["notes/facts.csv", "notes/scan.pdf"],
  }, async (bundle) => {
    assert.deepEqual(bundle.entries.map(({ originalPath, bundledPath }) => ({ originalPath, bundledPath })), [
      { originalPath: "draft.md", bundledPath: "inputs/draft.md" },
      { originalPath: "notes/facts.csv", bundledPath: "inputs/facts.csv" },
      { originalPath: "notes/scan.pdf", bundledPath: "inputs/scan.pdf" },
    ]);
    assert.equal(await readFile(join(bundle.root, "inputs", "draft.md"), "utf8"), "draft");
    assert.equal(await readFile(join(bundle.root, "inputs", "facts.csv"), "utf8"), "a,b\n1,2");
    assert.deepEqual(JSON.parse(await readFile(bundle.manifestPath, "utf8")), bundle.entries);
  });
}));

test("writes inline edit text into the bundle", async () => fixture(async (cwd) => {
  await withInputBundle({ cwd, inlineText: "edit me" }, async (bundle) => {
    assert.deepEqual(bundle.entries, [{
      originalPath: "<inline-text>",
      bundledPath: "inputs/edit-text.md",
    }]);
    assert.equal(await readFile(join(bundle.root, "inputs", "edit-text.md"), "utf8"), "edit me");
  });
}));

test("copies the active voice guide and returns sample directories", async () => fixture(async (root) => {
  const cwd = join(root, "project");
  const profile = join(root, "profile");
  const samples = join(profile, "writing-samples");
  await mkdir(cwd);
  await mkdir(samples, { recursive: true });
  await writeFile(join(profile, "voice.md"), "voice");

  await withInputBundle({
    cwd,
    voiceGuide: join(profile, "voice.md"),
    sampleDirectories: [samples],
  }, async (bundle) => {
    assert.equal(bundle.voiceGuide, "profile/voice.md");
    assert.equal(await readFile(join(bundle.root, bundle.voiceGuide), "utf8"), "voice");
    assert.deepEqual(bundle.sampleDirectories, [samples]);
  });
}));

test("de-duplicates inputs and gives colliding basenames globally unique prefixes", async () => fixture(async (cwd) => {
  await mkdir(join(cwd, "a"));
  await mkdir(join(cwd, "b"));
  await mkdir(join(cwd, "c"));
  await writeFile(join(cwd, "a", "notes.md"), "a");
  await writeFile(join(cwd, "b", "2-notes.md"), "b");
  await writeFile(join(cwd, "c", "notes.md"), "c");

  await withInputBundle({
    cwd,
    sources: ["a/notes.md", "a/notes.md", "b/2-notes.md", "c/notes.md"],
  }, async (bundle) => {
    assert.deepEqual(bundle.entries.map((entry) => entry.bundledPath), [
      "inputs/notes.md",
      "inputs/2-notes.md",
      "inputs/3-notes.md",
    ]);
  });
}));

test("keeps inline text separate from a source named edit-text.md", async () => fixture(async (cwd) => {
  await writeFile(join(cwd, "edit-text.md"), "source");

  await withInputBundle({
    cwd,
    inlineText: "inline",
    sources: ["edit-text.md"],
  }, async (bundle) => {
    assert.deepEqual(bundle.entries.map((entry) => entry.bundledPath), [
      "inputs/edit-text.md",
      "inputs/2-edit-text.md",
    ]);
  });
}));

test("rejects missing files, directories, traversal, and escaping symlinks", async () => fixture(async (root) => {
  const cwd = join(root, "project");
  await mkdir(cwd);
  await mkdir(join(cwd, "directory"));
  await writeFile(join(root, "secret.txt"), "secret");
  await symlink(join(root, "secret.txt"), join(cwd, "secret-link"));

  for (const source of ["missing.txt", "directory", "../secret.txt", "secret-link"]) {
    await assert.rejects(
      withInputBundle({ cwd, sources: [source] }, async () => undefined),
      /regular file|outside the active workspace/i,
      source,
    );
  }
}));

test("accepts in-workspace filenames beginning with two dots", async () => fixture(async (cwd) => {
  await writeFile(join(cwd, "..notes.md"), "notes");
  await withInputBundle({ cwd, sources: ["..notes.md"] }, async (bundle) => {
    assert.equal(bundle.entries[0]?.originalPath, "..notes.md");
  });
}));

test("leaves source files unchanged and removes the bundle after completion", async () => fixture(async (cwd) => {
  const sourcePath = join(cwd, "source.md");
  await writeFile(sourcePath, "original");
  let bundleRoot = "";

  await withInputBundle({ cwd, sources: ["source.md"] }, async (bundle) => {
    bundleRoot = bundle.root;
    const bundledSource = join(bundle.root, bundle.entries[0]!.bundledPath);
    assert.equal((await stat(bundledSource)).mode & 0o222, 0);
    await chmod(bundledSource, 0o600);
    await writeFile(bundledSource, "changed copy");
  });

  assert.equal(await readFile(sourcePath, "utf8"), "original");
  await assert.rejects(access(bundleRoot));
}));

test("removes the bundle when the callback throws", async () => fixture(async (cwd) => {
  let bundleRoot = "";
  await assert.rejects(withInputBundle({ cwd }, async (bundle) => {
    bundleRoot = bundle.root;
    throw new Error("callback failed");
  }), /callback failed/);
  await assert.rejects(access(bundleRoot));
}));
