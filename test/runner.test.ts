import assert from "node:assert/strict";
import {
  chmod,
  cp,
  mkdtemp,
  mkdir,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import test from "node:test";
import {
  resolveAgyBinary,
  runAgy,
} from "../src/agy-runner.ts";

const fixtureAgy = new URL("./fixtures/fake-agy.mjs", import.meta.url);
const successFixture = new URL("./fixtures/agy-json-success.json", import.meta.url);

async function fixture(run: (root: string, agy: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "pi-agy-runner-test-"));
  const agy = join(root, "fake agy");
  await cp(fixtureAgy, agy);
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

async function schema(root: string): Promise<string> {
  const path = join(root, "schema.json");
  await writeFile(path, JSON.stringify({ type: "object", required: ["prose"] }));
  return path;
}

async function recorded(recordPath: string): Promise<string[][]> {
  return (await readFile(recordPath, "utf8")).trim().split("\n").map((line) => JSON.parse(line) as string[]);
}

test("resolves AGY_BIN before PATH and the home fallback", async () => fixture(async (root, agy) => {
  const pathDir = join(root, "path-bin");
  const home = join(root, "home");
  await mkdir(pathDir);
  await mkdir(join(home, ".local", "bin"), { recursive: true });
  const pathAgy = join(pathDir, "agy");
  const homeAgy = join(home, ".local", "bin", "agy");
  await cp(fixtureAgy, pathAgy);
  await cp(fixtureAgy, homeAgy);
  await chmod(pathAgy, 0o755);
  await chmod(homeAgy, 0o755);

  assert.equal(await resolveAgyBinary({ AGY_BIN: agy, PATH: pathDir }, home), await realpath(agy));
  assert.equal(await resolveAgyBinary({ PATH: pathDir }, home), await realpath(pathAgy));
  assert.equal(await resolveAgyBinary({ PATH: "" }, home), await realpath(homeAgy));
}));

test("rejects AGY below 1.1.10", async () => fixture(async (root, agy) => {
  await environment({ AGY_BIN: agy, FAKE_AGY_VERSION: "1.1.9" }, async () => {
    await assert.rejects(runAgy({
      cwd: root,
      prompt: "write",
      schemaPath: await schema(root),
    }), /AGY 1\.1\.10 or newer.*1\.1\.9/i);
  });
}));

test("cancellation covers AGY version preflight", async () => fixture(async (root, agy) => {
  await environment({
    AGY_BIN: agy,
    FAKE_AGY_VERSION_DELAY: "300",
  }, async () => {
    const controller = new AbortController();
    const started = Date.now();
    const running = runAgy({
      cwd: root,
      prompt: "write",
      schemaPath: await schema(root),
      signal: controller.signal,
    });
    setTimeout(() => controller.abort(), 20);
    await assert.rejects(running, /aborted/i);
    assert.ok(Date.now() - started < 200, "preflight cancellation was not prompt");
  });
}));

test("timeout covers AGY version preflight", async () => fixture(async (root, agy) => {
  await environment({
    AGY_BIN: agy,
    FAKE_AGY_VERSION_DELAY: "300",
  }, async () => {
    const started = Date.now();
    await assert.rejects(runAgy({
      cwd: root,
      prompt: "write",
      schemaPath: await schema(root),
      timeoutMs: 30,
    }), /timed out/i);
    assert.ok(Date.now() - started < 200, "preflight timeout was not prompt");
  });
}));

test("requires the exact requested model", async () => fixture(async (root, agy) => {
  await environment({
    AGY_BIN: agy,
    FAKE_AGY_MODELS: "gemini-3.1-pro-high\tGemini Pro High",
  }, async () => {
    await assert.rejects(runAgy({
      cwd: root,
      prompt: "write",
      schemaPath: await schema(root),
    }), /model.*gemini-3\.1-pro-low.*not available/i);
  });
}));

test("passes the secure compatibility argv contract with prompt as one argument", async () => fixture(async (root, agy) => {
  const workspace = join(root, "workspace with spaces");
  const samples = join(root, "samples with spaces");
  const recordPath = join(root, "argv.jsonl");
  const cwdPath = join(root, "cwd.json");
  await mkdir(workspace);
  await mkdir(samples);
  await environment({
    AGY_BIN: agy,
    FAKE_AGY_RECORD: recordPath,
    FAKE_AGY_RECORD_CWD: cwdPath,
    FAKE_AGY_RESPONSE_FILE: successFixture.pathname,
  }, async () => {
    const schemaPath = await schema(workspace);
    const prompt = "one prompt\nwith spaces and --flags";
    await runAgy({
      cwd: workspace,
      prompt,
      schemaPath,
      addDirs: [samples],
      timeoutMs: 12_345,
    });

    const calls = await recorded(recordPath);
    const args = calls.find((call) => call.includes("-p"));
    assert.ok(args);
    for (const pair of [
      ["--model", "gemini-3.1-pro-low"],
      ["--mode", "plan"],
      ["--output-format", "json"],
      ["--json-schema", schemaPath],
      ["--add-dir", samples],
      ["--print-timeout", "12345ms"],
    ]) {
      const index = args.indexOf(pair[0]!);
      assert.equal(args[index + 1], pair[1], pair[0]);
    }
    assert.ok(args.includes("--sandbox"));
    assert.ok(args.includes("--new-project"));
    assert.ok(args.includes("--disable-slash-commands"));
    assert.ok(args.includes("--log-file"));
    assert.ok(args.includes(prompt));
    assert.equal(args.filter((arg) => arg === prompt).length, 1);
    assert.ok(!args.includes("--dangerously-skip-permissions"));
    const recordedCwd = JSON.parse(await readFile(cwdPath, "utf8")) as {
      cwd: string;
      pwd: string;
      initCwd: string;
      npmPrefix: string;
    };
    for (const path of Object.values(recordedCwd)) {
      assert.equal(await realpath(path), await realpath(workspace));
    }
  });
}));

test("parses schema-constrained response and usage", async () => fixture(async (root, agy) => {
  await environment({
    AGY_BIN: agy,
    FAKE_AGY_RESPONSE_FILE: successFixture.pathname,
  }, async () => {
    const result = await runAgy({
      cwd: root,
      prompt: "write",
      schemaPath: await schema(root),
    });
    assert.deepEqual(result.response, {
      prose: "Clean prose.",
      consulted_samples: ["sample.md"],
      warnings: [],
      assumptions: [],
    });
    assert.deepEqual(result.usage, {
      input_tokens: 12,
      output_tokens: 8,
      cache_read_tokens: 3,
    });
    assert.equal(result.version, "1.1.11");
    assert.equal(result.model, "gemini-3.1-pro-low");
  });
}));

test("rejects missing response or usage, malformed structured response, and empty success", async () => fixture(async (root, agy) => {
  for (const [mode, pattern] of [
    ["missing-response", /missing.*response/i],
    ["missing-usage", /missing.*usage/i],
    ["malformed-usage", /usage.*object/i],
    ["malformed-response", /schema-constrained.*JSON/i],
    ["empty", /empty output/i],
  ] as const) {
    await environment({ AGY_BIN: agy, FAKE_AGY_MODE: mode }, async () => {
      await assert.rejects(runAgy({
        cwd: root,
        prompt: "write",
        schemaPath: await schema(root),
      }), pattern);
    });
  }
}));

test("reports nonzero exits with bounded stderr", async () => fixture(async (root, agy) => {
  await environment({ AGY_BIN: agy, FAKE_AGY_MODE: "nonzero" }, async () => {
    await assert.rejects(runAgy({
      cwd: root,
      prompt: "write",
      schemaPath: await schema(root),
    }), (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /FAKE_FAILURE_END/);
      assert.ok(Buffer.byteLength(error.message) < 70_000);
      return true;
    });
  });
}));

test("cancellation terminates the AGY process group", async () => fixture(async (root, agy) => {
  const childPidPath = join(root, "child.pid");
  await environment({
    AGY_BIN: agy,
    FAKE_AGY_MODE: "sleep",
    FAKE_AGY_CHILD_PID: childPidPath,
  }, async () => {
    const controller = new AbortController();
    const running = runAgy({
      cwd: root,
      prompt: "write",
      schemaPath: await schema(root),
      signal: controller.signal,
      timeoutMs: 30_000,
    });
    for (let attempt = 0; attempt < 100; attempt += 1) {
      try {
        await readFile(childPidPath);
        break;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    }
    const childPid = Number(await readFile(childPidPath, "utf8"));
    controller.abort();
    await assert.rejects(running, /aborted/i);
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.throws(() => process.kill(childPid, 0));
  });
}));

test("PATH search uses platform delimiters", async () => fixture(async (root, agy) => {
  const bin = join(root, "bin");
  await mkdir(bin);
  const named = join(bin, "agy");
  await cp(agy, named);
  await chmod(named, 0o755);
  assert.equal(await resolveAgyBinary({ PATH: `${join(root, "missing")}${delimiter}${bin}` }, join(root, "home")), await realpath(named));
}));
