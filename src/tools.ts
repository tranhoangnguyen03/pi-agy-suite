import {
  CONFIG_DIR_NAME,
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  formatSize,
  getAgentDir,
  truncateHead,
  type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import { Type, type Static } from "typebox";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { withInputBundle } from "./bundle.ts";
import { runAgy } from "./agy-runner.ts";
import { resolveProseProfile } from "./profiles.ts";
import {
  buildDraftPrompt,
  buildEditPrompt,
  parseProseResponse,
  PROSE_RESULT_SCHEMA,
} from "./prose.ts";
import type { AgyRunResult, ResolvedProseProfile } from "./types.ts";

const draftSchema = Type.Object({
  brief: Type.String({ description: "Free-form composition or redrafting objective" }),
  context: Type.Optional(Type.String()),
  sources: Type.Optional(Type.Array(Type.String())),
  model: Type.Optional(Type.String()),
});

const editSchema = Type.Object({
  text: Type.Optional(Type.String({ description: "Pasted prose to edit; omit when using path" })),
  path: Type.Optional(Type.String({ description: "Workspace file to edit; omit when using text" })),
  instruction: Type.Optional(Type.String()),
  context: Type.Optional(Type.String()),
  sources: Type.Optional(Type.Array(Type.String())),
  model: Type.Optional(Type.String()),
});

type DraftInput = Static<typeof draftSchema>;
type EditInput = Static<typeof editSchema>;

function nonempty(value: string | undefined): string | undefined {
  return value?.trim() ? value : undefined;
}

function modelId(value: string | undefined): string | undefined {
  return value?.trim() || undefined;
}

export interface ProseToolDependencies {
  runAgy: typeof runAgy;
  resolveProfile: (cwd: string) => Promise<ResolvedProseProfile>;
}

const defaults: ProseToolDependencies = {
  runAgy,
  resolveProfile: (cwd) => resolveProseProfile({
    globalProseDir: join(getAgentDir(), "pi-agy-suite", "prose"),
    localProseDir: join(cwd, CONFIG_DIR_NAME, "pi-agy-suite", "prose"),
  }),
};

async function visibleProse(prose: string): Promise<{
  text: string;
  fullOutputPath?: string;
}> {
  const truncated = truncateHead(prose, {
    maxBytes: DEFAULT_MAX_BYTES,
    maxLines: DEFAULT_MAX_LINES,
  });
  if (!truncated.truncated) return { text: prose };

  const directory = await mkdtemp(join(tmpdir(), "pi-agy-output-"));
  const fullOutputPath = join(directory, "prose.md");
  await writeFile(fullOutputPath, prose, { mode: 0o600 });
  const note = `\n\n[Output truncated: ${truncated.outputLines} of ${truncated.totalLines} lines (${formatSize(truncated.outputBytes)} of ${formatSize(truncated.totalBytes)}). Full output saved to: ${fullOutputPath}]`;
  return { text: truncated.content + note, fullOutputPath };
}

async function executeProse(
  cwd: string,
  options: {
    targetPath?: string;
    inlineText?: string;
    sources?: string[];
    model?: string;
    signal?: AbortSignal;
    prompt: {
      kind: "draft";
      brief: string;
      context?: string;
    } | {
      kind: "edit";
      instruction?: string;
      context?: string;
    };
  },
  dependencies: ProseToolDependencies,
) {
  const profile = await dependencies.resolveProfile(cwd);
  return withInputBundle({
    cwd,
    targetPath: options.targetPath,
    inlineText: options.inlineText,
    sources: options.sources,
    voiceGuide: profile.voiceGuide,
    sampleDirectories: profile.sampleDirectories,
  }, async (bundle) => {
    const schemaPath = join(bundle.root, "prose-result.schema.json");
    await writeFile(schemaPath, JSON.stringify(PROSE_RESULT_SCHEMA));
    const prompt = options.prompt.kind === "draft"
      ? buildDraftPrompt({ brief: options.prompt.brief, context: options.prompt.context, bundle })
      : buildEditPrompt({ instruction: options.prompt.instruction, context: options.prompt.context, bundle });
    const agy = await dependencies.runAgy({
      cwd: bundle.root,
      prompt,
      schemaPath,
      addDirs: bundle.sampleDirectories,
      model: options.model,
      signal: options.signal,
    });
    const prose = parseProseResponse(agy.response);
    const visible = await visibleProse(prose.prose);
    return {
      content: [{ type: "text" as const, text: visible.text }],
      details: {
        model: agy.model,
        agyVersion: agy.version,
        profile: {
          voiceGuide: profile.voiceGuide,
          sampleDirectories: profile.sampleDirectories,
          sampleFiles: profile.sampleFiles,
        },
        sourceManifest: bundle.entries,
        consultedSamples: prose.consultedSamples,
        warnings: [...profile.warnings, ...prose.warnings],
        assumptions: prose.assumptions,
        usage: agy.usage,
        fullOutputPath: visible.fullOutputPath,
      },
    };
  });
}

export function registerProseTools(
  pi: ExtensionAPI,
  dependencies: ProseToolDependencies = defaults,
): void {
  const promptGuidelines = [
    "Use explicit user-named files with agy_prose_draft or agy_prose_edit without unnecessary discovery.",
    "For intent-only prose requests, inspect nearby project files and pass only the smallest relevant explicit source set to agy_prose_draft or agy_prose_edit.",
    "Never pass whole directories, secrets, unrelated files, or project instructions to AGY prose tools.",
    "Present AGY prose unchanged. If the user requested an output path, use Pi's write tool to save it verbatim; otherwise do not create a file. Never overwrite without explicit replacement intent.",
    "Do not automatically retry an AGY failure because retries consume quota; report the error and ask before trying again.",
  ];

  pi.registerTool({
    name: "agy_prose_draft",
    label: "AGY Prose Draft",
    description: "Compose or comprehensively redraft prose through a fresh, isolated AGY run using only explicit source files.",
    promptSnippet: "Draft or comprehensively redraft prose with isolated explicit sources",
    promptGuidelines,
    parameters: draftSchema,
    async execute(_id, params: DraftInput, signal, _update, ctx) {
      return executeProse(ctx.cwd, {
        sources: params.sources,
        model: modelId(params.model),
        signal,
        prompt: { kind: "draft", brief: params.brief, context: nonempty(params.context) },
      }, dependencies);
    },
  });

  pi.registerTool({
    name: "agy_prose_edit",
    label: "AGY Prose Edit",
    description: "Tune voice and prose through a fresh, isolated AGY run while preserving meaning and facts by default.",
    promptSnippet: "Edit voice and prose conservatively with isolated explicit sources",
    promptGuidelines,
    parameters: editSchema,
    async execute(_id, params: EditInput, signal, _update, ctx) {
      const text = nonempty("text" in params ? params.text : undefined);
      const path = nonempty("path" in params ? params.path : undefined);
      if ((text === undefined) === (path === undefined)) {
        throw new Error("Provide exactly one non-empty edit target: text or path.");
      }
      return executeProse(ctx.cwd, {
        targetPath: path,
        inlineText: text,
        sources: params.sources,
        model: modelId(params.model),
        signal,
        prompt: {
          kind: "edit",
          instruction: nonempty(params.instruction),
          context: nonempty(params.context),
        },
      }, dependencies);
    },
  });
}
