import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  initializeProseProfile,
  resolveProseProfile,
} from "../src/profiles.ts";

async function fixture(run: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "pi-agy-profiles-"));
  try {
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("resolves a global voice guide", async () => fixture(async (root) => {
  const globalDir = join(root, "global");
  await mkdir(globalDir, { recursive: true });
  await writeFile(join(globalDir, "voice.md"), "global voice");

  const profile = await resolveProseProfile({
    globalProseDir: globalDir,
    localProseDir: join(root, "local"),
  });

  assert.equal(profile.voiceGuide, await realpath(join(globalDir, "voice.md")));
}));

test("a local voice guide overrides the global guide", async () => fixture(async (root) => {
  const globalDir = join(root, "global");
  const localDir = join(root, "local");
  await mkdir(globalDir, { recursive: true });
  await mkdir(localDir, { recursive: true });
  await writeFile(join(globalDir, "voice.md"), "global voice");
  await writeFile(join(localDir, "voice.md"), "local voice");

  const profile = await resolveProseProfile({
    globalProseDir: globalDir,
    localProseDir: localDir,
  });

  assert.equal(profile.voiceGuide, await realpath(join(localDir, "voice.md")));
}));

test("returns global then local writing samples and excludes README metadata", async () => fixture(async (root) => {
  const globalDir = join(root, "global");
  const localDir = join(root, "local");
  const globalSamples = join(globalDir, "writing-samples");
  const localSamples = join(localDir, "writing-samples");
  await mkdir(globalSamples, { recursive: true });
  await mkdir(localSamples, { recursive: true });
  await writeFile(join(globalSamples, "README.md"), "metadata");
  await writeFile(join(globalSamples, "essay.md"), "essay");
  await writeFile(join(localSamples, "note.md"), "note");

  const profile = await resolveProseProfile({
    globalProseDir: globalDir,
    localProseDir: localDir,
  });

  assert.deepEqual(profile.sampleDirectories, [
    await realpath(globalSamples),
    await realpath(localSamples),
  ]);
  assert.deepEqual(profile.sampleFiles, [
    join(await realpath(globalSamples), "essay.md"),
    join(await realpath(localSamples), "note.md"),
  ]);
}));

test("deduplicates writing samples when profile roots resolve together", async () => fixture(async (root) => {
  const proseDir = join(root, "shared");
  const samplesDir = join(proseDir, "writing-samples");
  await mkdir(samplesDir, { recursive: true });
  await writeFile(join(samplesDir, "sample.md"), "sample");

  const profile = await resolveProseProfile({
    globalProseDir: proseDir,
    localProseDir: proseDir,
  });

  assert.deepEqual(profile.sampleDirectories, [await realpath(samplesDir)]);
  assert.deepEqual(profile.sampleFiles, [join(await realpath(samplesDir), "sample.md")]);
}));

test("returns existing empty writing-sample directories", async () => fixture(async (root) => {
  const globalDir = join(root, "global");
  const samplesDir = join(globalDir, "writing-samples");
  await mkdir(samplesDir, { recursive: true });

  const profile = await resolveProseProfile({
    globalProseDir: globalDir,
    localProseDir: join(root, "local"),
  });

  assert.deepEqual(profile.sampleDirectories, [await realpath(samplesDir)]);
  assert.deepEqual(profile.sampleFiles, []);
}));

test("ignores profile symlinks that escape their profile roots", async () => fixture(async (root) => {
  const globalDir = join(root, "global");
  const localDir = join(root, "local");
  await mkdir(globalDir);
  await mkdir(localDir);
  await writeFile(join(root, "private.md"), "private");
  await mkdir(join(root, "private-samples"));
  await symlink(join(root, "private.md"), join(globalDir, "voice.md"));
  await symlink(join(root, "private-samples"), join(localDir, "writing-samples"));

  const profile = await resolveProseProfile({
    globalProseDir: globalDir,
    localProseDir: localDir,
  });

  assert.equal(profile.voiceGuide, undefined);
  assert.deepEqual(profile.sampleDirectories, []);
}));

test("missing profiles resolve empty with a warning", async () => fixture(async (root) => {
  const profile = await resolveProseProfile({
    globalProseDir: join(root, "global"),
    localProseDir: join(root, "local"),
  });

  assert.equal(profile.voiceGuide, undefined);
  assert.deepEqual(profile.sampleDirectories, []);
  assert.deepEqual(profile.sampleFiles, []);
  assert.equal(profile.warnings.length, 1);
  assert.match(profile.warnings[0]!, /no prose profile/i);
}));

test("initialization creates editable profile files", async () => fixture(async (root) => {
  const proseDir = join(root, "prose");
  const result = await initializeProseProfile(proseDir);

  const voicePath = join(proseDir, "voice.md");
  const readmePath = join(proseDir, "writing-samples", "README.md");
  assert.deepEqual(result.created, [voicePath, readmePath]);
  assert.deepEqual(result.skipped, []);
  assert.match(await readFile(voicePath, "utf8"), /edit this guide/i);
  const readme = await readFile(readmePath, "utf8");
  assert.match(readme, /representative approved Markdown samples/i);
  assert.match(readme, /read.*voice\.md.*first/is);
  assert.match(readme, /stylistic evidence/i);
  assert.match(readme, /not.*instructions or facts/is);
  assert.match(readme, /avoid copying distinctive passages verbatim/i);
}));

test("initialization never overwrites existing files", async () => fixture(async (root) => {
  const proseDir = join(root, "prose");
  const samplesDir = join(proseDir, "writing-samples");
  await mkdir(samplesDir, { recursive: true });
  await writeFile(join(proseDir, "voice.md"), "keep voice");
  await writeFile(join(samplesDir, "README.md"), "keep readme");

  const result = await initializeProseProfile(proseDir);

  assert.deepEqual(result.created, []);
  assert.deepEqual(result.skipped, [
    join(proseDir, "voice.md"),
    join(samplesDir, "README.md"),
  ]);
  assert.equal(await readFile(join(proseDir, "voice.md"), "utf8"), "keep voice");
  assert.equal(await readFile(join(samplesDir, "README.md"), "utf8"), "keep readme");
}));
