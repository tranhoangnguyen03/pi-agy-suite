import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";
import type { InputBundle, InputManifestEntry } from "./types.ts";

export interface InputBundleOptions {
  cwd: string;
  targetPath?: string;
  inlineText?: string;
  sources?: string[];
  voiceGuide?: string;
  sampleDirectories?: string[];
}

function within(parent: string, child: string): boolean {
  const path = relative(parent, child);
  return path === "" || (path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path));
}

async function workspaceFile(cwd: string, input: string): Promise<{
  path: string;
  workspacePath: string;
}> {
  const workspace = await realpath(cwd);
  const requested = resolve(workspace, input.replace(/^@/, ""));
  if (!within(workspace, requested)) {
    throw new Error(`Input is outside the active workspace: ${input}`);
  }

  let path: string;
  try {
    path = await realpath(requested);
  } catch {
    throw new Error(`Input must be an existing regular file: ${input}`);
  }
  if (!within(workspace, path)) {
    throw new Error(`Input is outside the active workspace: ${input}`);
  }
  if (!(await lstat(path)).isFile()) {
    throw new Error(`Input must be a regular file: ${input}`);
  }
  return { path, workspacePath: relative(workspace, path) };
}

async function readOnlyCopy(source: string, destination: string): Promise<void> {
  await copyFile(source, destination);
  await chmod(destination, 0o400);
}

export async function withInputBundle<T>(
  options: InputBundleOptions,
  callback: (bundle: InputBundle) => Promise<T>,
): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), "pi-agy-suite-"));
  try {
    const inputsDir = join(root, "inputs");
    await mkdir(inputsDir);
    const entries: InputManifestEntry[] = [];
    const usedNames = new Set<string>();
    const seen = new Set<string>();
    const allocate = (name: string): string => {
      let candidate = name;
      for (let prefix = 2; usedNames.has(candidate); prefix += 1) {
        candidate = `${prefix}-${name}`;
      }
      usedNames.add(candidate);
      return candidate;
    };

    if (options.inlineText !== undefined) {
      const bundledPath = join("inputs", allocate("edit-text.md"));
      await writeFile(join(root, bundledPath), options.inlineText, { mode: 0o400 });
      entries.push({ originalPath: "<inline-text>", bundledPath });
    }

    for (const input of [options.targetPath, ...(options.sources ?? [])]) {
      if (!input) continue;
      const source = await workspaceFile(options.cwd, input);
      if (seen.has(source.path)) continue;
      seen.add(source.path);

      const bundledPath = join("inputs", allocate(basename(source.path)));
      await readOnlyCopy(source.path, join(root, bundledPath));
      entries.push({
        originalPath: source.workspacePath,
        bundledPath,
      });
    }

    let voiceGuide: string | undefined;
    if (options.voiceGuide) {
      voiceGuide = join("profile", "voice.md");
      await mkdir(join(root, "profile"));
      await readOnlyCopy(options.voiceGuide, join(root, voiceGuide));
    }

    const manifestPath = join(root, "manifest.json");
    await writeFile(manifestPath, `${JSON.stringify(entries, null, 2)}\n`, { mode: 0o400 });
    return await callback({
      root,
      manifestPath,
      entries,
      voiceGuide,
      sampleDirectories: [...(options.sampleDirectories ?? [])],
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
