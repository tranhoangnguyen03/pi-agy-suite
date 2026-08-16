import { constants } from "node:fs";
import { access, mkdtemp, realpath, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { spawn } from "node:child_process";
import type { AgyRunResult } from "./types.ts";

export const MINIMUM_AGY_VERSION = "1.1.10";
export const DEFAULT_AGY_MODEL = "gemini-3.1-pro-low";
const MAX_STDOUT_BYTES = 2 * 1024 * 1024;
const MAX_STDERR_BYTES = 64 * 1024;

interface RunAgyOptions {
  cwd: string;
  prompt: string;
  schemaPath: string;
  addDirs?: string[];
  model?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}

interface ProcessResult {
  stdout: string;
  stderr: string;
  code: number;
}

async function executable(path: string): Promise<string | undefined> {
  try {
    await access(path, constants.X_OK);
    return await realpath(path);
  } catch {
    return undefined;
  }
}

export async function resolveAgyBinary(
  env: NodeJS.ProcessEnv = process.env,
  home: string = homedir(),
): Promise<string> {
  if (env.AGY_BIN) {
    const binary = await executable(env.AGY_BIN);
    if (!binary) throw new Error(`AGY_BIN is not executable: ${env.AGY_BIN}`);
    return binary;
  }

  for (const directory of (env.PATH ?? "").split(delimiter).filter(Boolean)) {
    const binary = await executable(join(directory, process.platform === "win32" ? "agy.exe" : "agy"));
    if (binary) return binary;
  }

  const fallback = await executable(join(home, ".local", "bin", process.platform === "win32" ? "agy.exe" : "agy"));
  if (fallback) return fallback;
  throw new Error("AGY executable not found. Install AGY or set AGY_BIN.");
}

function boundedAppend(current: Buffer, chunk: Buffer, limit: number, tail = false): Buffer {
  const combined = Buffer.concat([current, chunk]);
  return combined.length <= limit
    ? combined
    : tail ? combined.subarray(combined.length - limit) : combined.subarray(0, limit);
}

function terminate(child: ReturnType<typeof spawn>): void {
  if (child.exitCode !== null || child.pid === undefined) return;
  if (process.platform === "win32") {
    spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore" });
  } else {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      child.kill("SIGTERM");
    }
  }
}

export async function runAgyProcess(
  binary: string,
  args: string[],
  options: { cwd?: string; signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<ProcessResult> {
  if (options.signal?.aborted) throw new Error("AGY run aborted.");
  const child = spawn(binary, args, {
    cwd: options.cwd,
    env: options.cwd ? {
      ...process.env,
      INIT_CWD: options.cwd,
      npm_config_local_prefix: options.cwd,
      PWD: options.cwd,
    } : process.env,
    shell: false,
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout: Buffer = Buffer.alloc(0);
  let stderr: Buffer = Buffer.alloc(0);
  child.stdout.on("data", (chunk: Buffer) => {
    stdout = boundedAppend(stdout, chunk, MAX_STDOUT_BYTES);
  });
  child.stderr.on("data", (chunk: Buffer) => {
    stderr = boundedAppend(stderr, chunk, MAX_STDERR_BYTES, true);
  });

  let timedOut = false;
  const timeout = options.timeoutMs === undefined ? undefined : setTimeout(() => {
    timedOut = true;
    terminate(child);
  }, options.timeoutMs);
  const abort = () => terminate(child);
  options.signal?.addEventListener("abort", abort, { once: true });

  try {
    const result = await new Promise<ProcessResult>((resolve, reject) => {
      child.once("error", reject);
      child.once("close", (code) => resolve({
        stdout: stdout.toString("utf8"),
        stderr: stderr.toString("utf8"),
        code: code ?? 1,
      }));
    });
    if (options.signal?.aborted) throw new Error("AGY run aborted.");
    if (timedOut) throw new Error(`AGY timed out after ${options.timeoutMs}ms.`);
    return result;
  } finally {
    if (timeout) clearTimeout(timeout);
    options.signal?.removeEventListener("abort", abort);
  }
}

function parseStructuredResponse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    const fenced = raw.trim().match(/^```(?:json)?\s*\n([\s\S]*?)\n```$/i);
    if (!fenced) throw new Error("AGY response was not schema-constrained JSON.");
    try {
      return JSON.parse(fenced[1]!);
    } catch {
      throw new Error("AGY response was not schema-constrained JSON.");
    }
  }
}

function compareVersions(left: string, right: string): number {
  const a = left.split(".").map(Number);
  const b = right.split(".").map(Number);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

async function checked(
  binary: string,
  args: string[],
  options: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<ProcessResult> {
  const result = await runAgyProcess(binary, args, options);
  if (result.code !== 0) {
    throw new Error(`AGY ${args.join(" ")} failed (${result.code}): ${result.stderr.trim()}`);
  }
  return result;
}

export async function inspectAgy(
  binary?: string,
  options: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<{
  binary: string;
  version: string;
  models: string[];
}> {
  binary ??= await resolveAgyBinary();
  const versionText = (await checked(binary, ["--version"], options)).stdout.trim();
  const version = versionText.match(/\d+\.\d+\.\d+/)?.[0];
  if (!version) throw new Error(`Unable to parse AGY version: ${versionText}`);
  if (compareVersions(version, MINIMUM_AGY_VERSION) < 0) {
    throw new Error(`AGY ${MINIMUM_AGY_VERSION} or newer is required; found ${version}.`);
  }

  const models = (await checked(binary, ["models"], options)).stdout
    .split(/\r?\n/)
    .map((line) => line.trim().split(/\s+/)[0] ?? "")
    .filter(Boolean);
  return { binary, version, models };
}

export async function runAgy({
  cwd,
  prompt,
  schemaPath,
  addDirs = [],
  model = DEFAULT_AGY_MODEL,
  timeoutMs = 300_000,
  signal,
}: RunAgyOptions): Promise<AgyRunResult> {
  const { binary, version, models } = await inspectAgy(undefined, { signal, timeoutMs });
  if (!models.includes(model)) {
    throw new Error(`AGY model ${model} is not available. No fallback model was used.`);
  }

  const logDir = await mkdtemp(join(tmpdir(), "pi-agy-log-"));
  try {
    const args = [
      "-p", prompt,
      "--model", model,
      "--mode", "plan",
      "--sandbox",
      "--new-project",
      "--disable-slash-commands",
      "--output-format", "json",
      "--json-schema", schemaPath,
      "--log-file", join(logDir, "agy.log"),
      "--print-timeout", `${timeoutMs}ms`,
      ...addDirs.flatMap((directory) => ["--add-dir", directory]),
    ];
    const result = await runAgyProcess(binary, args, { cwd, signal, timeoutMs });
    if (result.code !== 0) {
      throw new Error(`AGY inference failed (${result.code}): ${result.stderr.trim()}`);
    }
    if (!result.stdout.trim()) throw new Error("AGY returned empty output.");

    let envelope: unknown;
    try {
      envelope = JSON.parse(result.stdout);
    } catch {
      throw new Error("AGY returned malformed JSON output.");
    }
    if (!envelope || typeof envelope !== "object" || !("response" in envelope)) {
      throw new Error("AGY JSON output is missing the response field.");
    }
    const rawResponse = (envelope as { response: unknown }).response;
    if (typeof rawResponse !== "string") {
      throw new Error("AGY response must contain schema-constrained JSON text.");
    }

    const response = parseStructuredResponse(rawResponse);
    if (!response || typeof response !== "object" || Array.isArray(response)) {
      throw new Error("AGY response was not a JSON object.");
    }
    if (!("usage" in envelope)) throw new Error("AGY JSON output is missing the usage field.");
    const usage = (envelope as { usage: unknown }).usage;
    if (!usage || typeof usage !== "object" || Array.isArray(usage)) {
      throw new Error("AGY usage must be an object.");
    }
    return {
      response: response as Record<string, unknown>,
      usage: usage as Record<string, unknown>,
      version,
      model,
      binary,
    };
  } finally {
    await rm(logDir, { recursive: true, force: true });
  }
}
