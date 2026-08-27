import { readdir, realpath, stat, mkdir, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, sep } from "node:path";
import type { ResolvedProseProfile } from "./types.ts";
import {
  VOICE_TEMPLATE,
  WRITING_SAMPLES_TEMPLATE,
} from "./profile-templates.ts";

interface ProfileRoots {
  globalProseDir: string;
  localProseDir: string;
}

export interface ProfileInitializationResult {
  created: string[];
  skipped: string[];
}

function within(parent: string, child: string): boolean {
  const path = relative(parent, child);
  return path === "" || (path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path));
}

async function profileAsset(
  root: string,
  path: string,
  kind: "file" | "directory",
): Promise<string | undefined> {
  try {
    const canonicalRoot = await realpath(root);
    const canonicalPath = await realpath(path);
    const info = await stat(canonicalPath);
    const validKind = kind === "file" ? info.isFile() : info.isDirectory();
    return validKind && within(canonicalRoot, canonicalPath) ? canonicalPath : undefined;
  } catch {
    return undefined;
  }
}

async function samplesIn(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name !== "README.md" && entry.name.endsWith(".md"))
    .map((entry) => join(directory, entry.name))
    .sort();
}

export async function resolveProseProfile({
  globalProseDir,
  localProseDir,
}: ProfileRoots): Promise<ResolvedProseProfile> {
  const globalVoice = await profileAsset(globalProseDir, join(globalProseDir, "voice.md"), "file");
  const localVoice = await profileAsset(localProseDir, join(localProseDir, "voice.md"), "file");
  const voiceGuide = localVoice ?? globalVoice;

  const sampleDirectories: string[] = [];
  const sampleFiles: string[] = [];
  const seenSampleDirectories = new Set<string>();
  for (const proseDir of [globalProseDir, localProseDir]) {
    const directory = await profileAsset(proseDir, join(proseDir, "writing-samples"), "directory");
    if (directory && !seenSampleDirectories.has(directory)) {
      seenSampleDirectories.add(directory);
      sampleDirectories.push(directory);
      sampleFiles.push(...await samplesIn(directory));
    }
  }

  return {
    voiceGuide,
    sampleDirectories,
    sampleFiles,
    warnings: voiceGuide || sampleDirectories.length > 0
      ? []
      : ["No prose profile found; AGY will write without voice guidance."],
  };
}

export async function initializeProseProfile(
  proseDir: string,
): Promise<ProfileInitializationResult> {
  const samplesDir = join(proseDir, "writing-samples");
  await mkdir(samplesDir, { recursive: true });

  const created: string[] = [];
  const skipped: string[] = [];
  for (const [path, content] of [
    [join(proseDir, "voice.md"), VOICE_TEMPLATE],
    [join(samplesDir, "README.md"), WRITING_SAMPLES_TEMPLATE],
  ] as const) {
    try {
      await writeFile(path, content, { flag: "wx" });
      created.push(path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      skipped.push(path);
    }
  }

  return { created, skipped };
}
