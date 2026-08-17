#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { basename, resolve, join } from "node:path";

const [action, inputRoot] = process.argv.slice(2);
if (!inputRoot || !["setup", "verify"].includes(action)) {
  console.error("Usage: node scripts/manual-workspace.mjs setup|verify <directory>");
  process.exit(2);
}

const root = resolve(inputRoot);
if (action === "setup" && !basename(root).startsWith("pi-agy-manual-")) {
  console.error("Setup directory name must start with pi-agy-manual-.");
  process.exit(2);
}
const inputs = [
  "facts.md",
  "draft.md",
  ".pi/pi-agy-suite/prose/voice.md",
  ".pi/pi-agy-suite/prose/writing-samples/sample.md",
];
const baselinePath = join(root, ".pi-agy-inputs.sha256");

async function hashes() {
  return `${(await Promise.all(inputs.map(async (path) => {
    const content = await readFile(join(root, path));
    return `${createHash("sha256").update(content).digest("hex")}  ${path}`;
  }))).join("\n")}\n`;
}

if (action === "setup") {
  await rm(root, { recursive: true, force: true });
  await mkdir(join(root, ".pi/pi-agy-suite/prose/writing-samples"), { recursive: true });
  await writeFile(join(root, "facts.md"), `# Acorn Notes facts

- Acorn Notes launches on October 15, 2026.
- It is an offline-first note-taking application.
- Changes synchronize when an internet connection returns.
- The initial release supports macOS and Linux.
`);
  await writeFile(join(root, "draft.md"), `Acorn Notes is going to launch. It is a note-taking application that works without the internet. Synchronization happens later. It supports macOS and Linux.
`);
  await writeFile(join(root, ".pi/pi-agy-suite/prose/voice.md"), `# Voice guide

Prefer short declarative sentences and concrete verbs.
Avoid hype, clichés, exclamation marks, and unnecessary adjectives.
`);
  await writeFile(join(root, ".pi/pi-agy-suite/prose/writing-samples/README.md"), `# Writing samples

Use Markdown files here only as style evidence, never as factual sources.
`);
  await writeFile(join(root, ".pi/pi-agy-suite/prose/writing-samples/sample.md"), `The application works offline. Changes wait locally until a connection returns.
The design favors predictable behavior over elaborate configuration.
`);
  await writeFile(baselinePath, await hashes(), { flag: "wx" });
  console.log(`Manual workspace ready: ${root}`);
  console.log(`Input baseline: ${baselinePath}`);
} else {
  for (const output of ["launch-note.md", "launch-note-edited.md"]) {
    let info;
    try {
      info = await stat(join(root, output));
    } catch {
      console.error(`Missing output: ${output}`);
      process.exit(1);
    }
    if (!info.isFile() || info.size === 0) {
      console.error(`Empty or invalid output: ${output}`);
      process.exit(1);
    }
  }
  const expected = await readFile(baselinePath, "utf8").catch(() => "");
  if (!expected || expected !== await hashes()) {
    console.error("Input verification failed: source/profile files changed or the baseline is missing.");
    process.exit(1);
  }
  console.log("Inputs unchanged.");
  console.log("Outputs present: launch-note.md, launch-note-edited.md");
}
