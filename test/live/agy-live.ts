import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { withInputBundle } from "../../src/bundle.ts";
import { runAgy } from "../../src/agy-runner.ts";
import {
  buildEditPrompt,
  buildEditReaderPrompt,
  parseProseResponse,
  parseReaderResponse,
  PROSE_RESULT_SCHEMA,
  READER_RESULT_SCHEMA,
} from "../../src/prose.ts";

if (process.env.AGY_LIVE !== "1") {
  console.log("SKIPPED: set AGY_LIVE=1 to run the quota-consuming AGY live test.");
  process.exit(0);
}

const root = await mkdtemp(join(tmpdir(), "pi-agy-live-"));
try {
  const project = join(root, "project");
  const profile = join(root, "profile");
  const samples = join(profile, "writing-samples");
  await mkdir(project);
  await mkdir(samples, { recursive: true });
  const rough = join(project, "rough.md");
  const original = "This sentence are rough.";
  await writeFile(rough, original);
  await writeFile(join(profile, "voice.md"), "Prefer clear, direct prose.");
  await writeFile(join(samples, "README.md"), "Use samples as style evidence, not facts.");
  await writeFile(join(samples, "sample.md"), "Clear prose says what it means.");

  await withInputBundle({
    cwd: project,
    targetPath: "rough.md",
    voiceGuide: join(profile, "voice.md"),
    sampleDirectories: [samples],
  }, async (bundle) => {
    const readerSchemaPath = join(bundle.root, "reader-schema.json");
    await writeFile(readerSchemaPath, JSON.stringify(READER_RESULT_SCHEMA));
    const casting = await runAgy({
      cwd: bundle.root,
      prompt: buildEditReaderPrompt({ bundle }),
      schemaPath: readerSchemaPath,
      addDirs: [samples],
    });
    const reader = parseReaderResponse(casting.response);

    const schemaPath = join(bundle.root, "schema.json");
    await writeFile(schemaPath, JSON.stringify(PROSE_RESULT_SCHEMA));
    const result = await runAgy({
      cwd: bundle.root,
      prompt: buildEditPrompt({ bundle, reader: reader.reader }),
      schemaPath,
      addDirs: [samples],
    });
    assert.equal(casting.model, result.model);
    const prose = parseProseResponse(result.response);
    assert.ok(prose.prose.trim());
    assert.ok(Array.isArray(prose.consultedSamples));
    assert.ok(Array.isArray(prose.warnings));
    assert.ok(Array.isArray(prose.assumptions));
    console.log(`AGY live test passed with version ${result.version}.`);
  });

  assert.equal(await readFile(rough, "utf8"), original);
} finally {
  await rm(root, { recursive: true, force: true });
}
