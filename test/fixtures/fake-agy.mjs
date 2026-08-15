#!/usr/bin/env node
import { writeSync } from "node:fs";
import { appendFile, readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";

const args = process.argv.slice(2);
if (process.env.FAKE_AGY_RECORD) {
  await appendFile(process.env.FAKE_AGY_RECORD, `${JSON.stringify(args)}\n`);
}
if (process.env.FAKE_AGY_RECORD_CWD) {
  await writeFile(process.env.FAKE_AGY_RECORD_CWD, JSON.stringify({
    cwd: process.cwd(),
    pwd: process.env.PWD,
    initCwd: process.env.INIT_CWD ?? null,
    npmPrefix: process.env.npm_config_local_prefix ?? null,
  }));
}

if (args.includes("--version")) {
  if (process.env.FAKE_AGY_VERSION_DELAY) {
    await new Promise((resolve) => setTimeout(resolve, Number(process.env.FAKE_AGY_VERSION_DELAY)));
  }
  console.log(process.env.FAKE_AGY_VERSION ?? "1.1.11");
  process.exit(0);
}

if (args[0] === "models") {
  console.log(process.env.FAKE_AGY_MODELS ?? "gemini-3.1-pro-low\tGemini 3.1 Pro (Low)");
  process.exit(0);
}

if (args.includes("--help")) {
  const flags = [
    "--add-dir", "--disable-slash-commands", "--json-schema", "--log-file",
    "--mode", "--model", "--new-project", "--output-format", "--print-timeout", "--sandbox",
  ].filter((flag) => flag !== process.env.FAKE_AGY_HELP_OMIT);
  const help = flags.join("\n");
  if (process.env.FAKE_AGY_HELP_STDERR === "1") console.error(help);
  else console.log(help);
  if (process.env.FAKE_AGY_SECRET_NOISE) console.error(process.env.FAKE_AGY_SECRET_NOISE);
  process.exit(0);
}

if (process.env.FAKE_AGY_MODE === "nonzero") {
  writeSync(2, `${"x".repeat(100_000)}FAKE_FAILURE_END\n`);
  process.exit(23);
}

if (process.env.FAKE_AGY_MODE === "sleep") {
  const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
    stdio: "ignore",
  });
  if (process.env.FAKE_AGY_CHILD_PID) {
    await writeFile(process.env.FAKE_AGY_CHILD_PID, String(child.pid));
  }
  setInterval(() => {}, 1000);
} else if (process.env.FAKE_AGY_MODE === "empty") {
  process.exit(0);
} else if (process.env.FAKE_AGY_MODE === "missing-response") {
  console.log(JSON.stringify({ usage: {} }));
} else if (process.env.FAKE_AGY_MODE === "missing-usage") {
  console.log(JSON.stringify({ response: JSON.stringify({ prose: "ok" }) }));
} else if (process.env.FAKE_AGY_MODE === "malformed-usage") {
  console.log(JSON.stringify({ response: JSON.stringify({ prose: "ok" }), usage: "unknown" }));
} else if (process.env.FAKE_AGY_MODE === "malformed-response") {
  console.log(JSON.stringify({ response: "not-json", usage: {} }));
} else if (process.env.FAKE_AGY_RESPONSE_FILE) {
  process.stdout.write(await readFile(process.env.FAKE_AGY_RESPONSE_FILE, "utf8"));
} else {
  console.log(JSON.stringify({
    response: JSON.stringify({ prose: "ok" }),
    usage: {},
  }));
}
