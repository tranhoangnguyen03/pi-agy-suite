import { realpath, stat } from "node:fs/promises";
import {
  DEFAULT_AGY_MODEL,
  MINIMUM_AGY_VERSION,
  resolveAgyBinary,
  runAgyProcess,
} from "./agy-runner.ts";
import { resolveProseProfile } from "./profiles.ts";

const REQUIRED_FLAGS = [
  "--model",
  "--mode",
  "--sandbox",
  "--new-project",
  "--add-dir",
  "--print-timeout",
  "--output-format",
  "--json-schema",
  "--log-file",
  "--disable-slash-commands",
] as const;

interface DoctorOptions {
  globalProseDir: string;
  localProseDir: string;
  env?: NodeJS.ProcessEnv;
  home?: string;
}

export interface DoctorReport {
  ok: boolean;
  text: string;
}

async function directory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

export async function runDoctor({
  globalProseDir,
  localProseDir,
  env = process.env,
  home,
}: DoctorOptions): Promise<DoctorReport> {
  let binary: string;
  try {
    binary = await resolveAgyBinary(env, home);
  } catch (error) {
    return { ok: false, text: `FAIL AGY binary: ${(error as Error).message}` };
  }

  const [versionResult, helpResult, modelsResult, profile] = await Promise.all([
    runAgyProcess(binary, ["--version"]),
    runAgyProcess(binary, ["--help"]),
    runAgyProcess(binary, ["models"]),
    resolveProseProfile({ globalProseDir, localProseDir }),
  ]);
  const version = versionResult.stdout.trim().match(/\d+\.\d+\.\d+/)?.[0] ?? "unknown";
  const supported = version !== "unknown" && version.localeCompare(MINIMUM_AGY_VERSION, undefined, { numeric: true }) >= 0;
  const models = modelsResult.stdout.split(/\r?\n/).map((line) => line.trim().split(/\s+/)[0]);
  const modelAvailable = models.includes(DEFAULT_AGY_MODEL);
  const helpTokens = new Set(`${helpResult.stdout}\n${helpResult.stderr}`.split(/\s+/));
  const flags = REQUIRED_FLAGS.map((flag) => ({ flag, present: helpTokens.has(flag) }));
  const canonicalGlobal = await realpath(globalProseDir).catch(() => globalProseDir);
  const canonicalLocal = await realpath(localProseDir).catch(() => localProseDir);
  const localVoice = profile.voiceGuide?.startsWith(canonicalLocal) === true;
  const globalSamples = profile.sampleDirectories.some((path) => path.startsWith(canonicalGlobal));
  const localSamples = profile.sampleDirectories.some((path) => path.startsWith(canonicalLocal));
  const temporaryReady = await directory(process.env.TMPDIR ?? "/tmp");
  const ok = versionResult.code === 0 && helpResult.code === 0 && modelsResult.code === 0 &&
    supported && modelAvailable && flags.every(({ present }) => present) && temporaryReady;

  return {
    ok,
    text: [
      `AGY binary: ${binary}`,
      `Installed: ${version}`,
      `Minimum: ${MINIMUM_AGY_VERSION}`,
      `Status: ${supported ? "supported" : "unsupported"}`,
      `Default model ${DEFAULT_AGY_MODEL}: ${modelAvailable ? "available" : "missing"}`,
      ...flags.map(({ flag, present }) => `${flag}: ${present ? "present" : "missing"}`),
      `Voice guide: ${profile.voiceGuide ? localVoice ? "local" : "global" : "missing"}`,
      `Global samples: ${globalSamples ? "present" : "missing"}`,
      `Local samples: ${localSamples ? "present" : "missing"}`,
      `Temporary workspace: ${temporaryReady ? "ready" : "unavailable"}`,
      "Live inference: not run (doctor is quota-free)",
    ].join("\n"),
  };
}
