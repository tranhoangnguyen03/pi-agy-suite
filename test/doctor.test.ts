import assert from "node:assert/strict";
import { chmod, cp, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { runDoctor } from "../src/doctor.ts";

const fakeFixture = new URL("./fixtures/fake-agy.mjs", import.meta.url);

async function fixture(run: (root: string, agy: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "pi-agy-doctor-test-"));
  const agy = join(root, "agy");
  await cp(fakeFixture, agy);
  await chmod(agy, 0o755);
  try {
    await run(root, agy);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function environment<T>(values: Record<string, string | undefined>, run: () => Promise<T>): Promise<T> {
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  Object.assign(process.env, values);
  for (const [key, value] of Object.entries(values)) if (value === undefined) delete process.env[key];
  try {
    return await run();
  } finally {
    Object.assign(process.env, previous);
    for (const [key, value] of Object.entries(previous)) if (value === undefined) delete process.env[key];
  }
}

test("reports binary, version, flags, model, and profile state without inference", async () => fixture(async (root, agy) => {
  const globalDir = join(root, "global");
  const localDir = join(root, "local");
  const record = join(root, "calls.jsonl");
  await mkdir(join(globalDir, "writing-samples"), { recursive: true });
  await mkdir(localDir);
  await writeFile(join(localDir, "voice.md"), "voice");

  await environment({ AGY_BIN: agy, FAKE_AGY_RECORD: record }, async () => {
    const report = await runDoctor({ globalProseDir: globalDir, localProseDir: localDir });
    assert.equal(report.ok, true);
    assert.match(report.text, new RegExp(agy.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(report.text, /installed: 1\.1\.11/i);
    assert.match(report.text, /minimum: 1\.1\.10/i);
    assert.match(report.text, /status: supported/i);
    assert.match(report.text, /gemini-3\.1-pro-low.*available/i);
    assert.match(report.text, /voice guide.*local/i);
    assert.match(report.text, /global samples.*present/i);
    assert.match(report.text, /local samples.*missing/i);
    for (const flag of [
      "--model", "--mode", "--sandbox", "--new-project", "--add-dir", "--print-timeout",
      "--output-format", "--json-schema", "--log-file", "--disable-slash-commands",
    ]) assert.match(report.text, new RegExp(flag));

    const calls = await (await import("node:fs/promises")).readFile(record, "utf8");
    assert.doesNotMatch(calls, /"-p"|"--print"/);
  });
}));

test("reads AGY help from stderr", async () => fixture(async (root, agy) => {
  await environment({ AGY_BIN: agy, FAKE_AGY_HELP_STDERR: "1" }, async () => {
    const report = await runDoctor({
      globalProseDir: join(root, "global"),
      localProseDir: join(root, "local"),
    });
    assert.equal(report.ok, true);
    assert.match(report.text, /--model: present/);
  });
}));

test("reports missing binary, old version, missing flag, and missing model", async () => fixture(async (root, agy) => {
  const roots = { globalProseDir: join(root, "global"), localProseDir: join(root, "local") };
  const missing = await runDoctor({ ...roots, env: { PATH: "", AGY_BIN: join(root, "missing") }, home: join(root, "home") });
  assert.equal(missing.ok, false);
  assert.match(missing.text, /not executable|not found/i);

  await environment({
    AGY_BIN: agy,
    FAKE_AGY_VERSION: "1.1.9",
    FAKE_AGY_HELP_OMIT: "--mode",
    FAKE_AGY_MODELS: "gemini-3.1-pro-high\tHigh",
  }, async () => {
    const report = await runDoctor(roots);
    assert.equal(report.ok, false);
    assert.match(report.text, /Installed: 1\.1\.9[\s\S]*Status: unsupported/i);
    assert.match(report.text, /--mode.*missing/i);
    assert.match(report.text, /gemini-3\.1-pro-low.*missing/i);
  });
}));

test("doctor output is sanitized", async () => fixture(async (root, agy) => {
  const secret = "SUPER_SECRET_VALUE";
  await environment({
    AGY_BIN: agy,
    GOOGLE_API_KEY: secret,
    AGY_PROJECT_ID: "private-project-123",
    FAKE_AGY_SECRET_NOISE: secret,
  }, async () => {
    const report = await runDoctor({
      globalProseDir: join(root, "global"),
      localProseDir: join(root, "local"),
    });
    assert.doesNotMatch(report.text, new RegExp(secret));
    assert.doesNotMatch(report.text, /private-project-123/);
    assert.doesNotMatch(report.text, /GOOGLE_API_KEY|AGY_PROJECT_ID/);
  });
}));
