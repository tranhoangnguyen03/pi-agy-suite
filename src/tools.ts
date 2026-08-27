import {
  CONFIG_DIR_NAME,
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  getAgentDir,
  truncateHead,
  type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import { Type, type Static } from "typebox";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { withInputBundle } from "./bundle.ts";
import { DEFAULT_AGY_MODEL, runAgy } from "./agy-runner.ts";
import { resolveProseProfile } from "./profiles.ts";
import {
  buildDraftPrompt,
  buildDraftReaderPrompt,
  buildEditPrompt,
  buildEditReaderPrompt,
  parseProseResponse,
  parseReaderResponse,
  PROSE_RESULT_SCHEMA,
  READER_RESULT_SCHEMA,
} from "./prose.ts";
import type { AgyRunResult, ResolvedProseProfile } from "./types.ts";

const draftSchema = Type.Object({
  brief: Type.String({ description: "Free-form composition or redrafting objective" }),
  context: Type.Optional(Type.String()),
  sources: Type.Optional(Type.Array(Type.String())),
  model: Type.Optional(Type.String()),
  reader: Type.Optional(Type.String({ description: "Reader profile; use auto to cast one from the brief and sources" })),
});

const editSchema = Type.Object({
  text: Type.Optional(Type.String({ description: "Pasted prose to edit; omit when using path" })),
  path: Type.Optional(Type.String({ description: "Workspace file to edit; omit when using text" })),
  instruction: Type.Optional(Type.String()),
  context: Type.Optional(Type.String()),
  sources: Type.Optional(Type.Array(Type.String())),
  model: Type.Optional(Type.String()),
  reader: Type.Optional(Type.String({ description: "Reader profile; omitted or auto casts one from the existing work" })),
});

type DraftInput = Static<typeof draftSchema>;
type EditInput = Static<typeof editSchema>;

function nonempty(value: string | undefined): string | undefined {
  return value?.trim() ? value : undefined;
}

function modelId(value: string | undefined): string | undefined {
  return value?.trim() || undefined;
}

function readerId(value: string | undefined, defaultToAuto: boolean): string | undefined {
  const reader = value?.trim();
  if (!reader) return defaultToAuto ? "auto" : undefined;
  return reader.toLowerCase() === "auto" ? "auto" : reader;
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

function bytePrefix(text: string, maxBytes: number): string {
  let low = 0;
  let high = text.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (Buffer.byteLength(text.slice(0, middle)) <= maxBytes) low = middle;
    else high = middle - 1;
  }
  if (low > 0 && /[\uD800-\uDBFF]/.test(text[low - 1]!)) low -= 1;
  return text.slice(0, low);
}

async function visibleProse(prose: string): Promise<{
  text: string;
  fullOutputPath?: string;
  truncation?: { outputLines: number; totalLines: number; fullOutputPath: string };
}> {
  const truncated = truncateHead(prose, {
    maxBytes: DEFAULT_MAX_BYTES,
    maxLines: DEFAULT_MAX_LINES,
  });
  if (!truncated.truncated) return { text: prose };

  const directory = await mkdtemp(join(tmpdir(), "pi-agy-output-"));
  const fullOutputPath = join(directory, "prose.md");
  await writeFile(fullOutputPath, prose, { mode: 0o600 });
  const text = truncated.content || bytePrefix(prose, DEFAULT_MAX_BYTES);
  return {
    text,
    fullOutputPath,
    truncation: {
      outputLines: text.split("\n").length,
      totalLines: truncated.totalLines,
      fullOutputPath,
    },
  };
}

async function executeProse(
  cwd: string,
  options: {
    targetPath?: string;
    inlineText?: string;
    sources?: string[];
    model?: string;
    reader?: string;
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
  const model = options.model ?? DEFAULT_AGY_MODEL;
  return withInputBundle({
    cwd,
    targetPath: options.targetPath,
    inlineText: options.inlineText,
    sources: options.sources,
    voiceGuide: profile.voiceGuide,
    sampleDirectories: profile.sampleDirectories,
  }, async (bundle) => {
    let reader = options.reader;
    let reason: string | undefined;
    let casting: { model: string; agyVersion: string; usage: Record<string, unknown> } | undefined;

    if (reader === "auto") {
      const castingSchemaPath = join(bundle.root, "reader-result.schema.json");
      await writeFile(castingSchemaPath, JSON.stringify(READER_RESULT_SCHEMA));
      const castingPrompt = options.prompt.kind === "draft"
        ? buildDraftReaderPrompt({ brief: options.prompt.brief, context: options.prompt.context, bundle })
        : buildEditReaderPrompt({ instruction: options.prompt.instruction, context: options.prompt.context, bundle });
      const cast = await dependencies.runAgy({
        cwd: bundle.root,
        prompt: castingPrompt,
        schemaPath: castingSchemaPath,
        addDirs: bundle.sampleDirectories,
        model,
        signal: options.signal,
      });
      const selected = parseReaderResponse(cast.response);
      reader = selected.reader;
      reason = selected.reason;
      casting = { model: cast.model, agyVersion: cast.version, usage: cast.usage };
    }

    const schemaPath = join(bundle.root, "prose-result.schema.json");
    await writeFile(schemaPath, JSON.stringify(PROSE_RESULT_SCHEMA));
    const prompt = options.prompt.kind === "draft"
      ? buildDraftPrompt({ brief: options.prompt.brief, context: options.prompt.context, reader, bundle })
      : buildEditPrompt({ instruction: options.prompt.instruction, context: options.prompt.context, reader, bundle });
    const agy = await dependencies.runAgy({
      cwd: bundle.root,
      prompt,
      schemaPath,
      addDirs: bundle.sampleDirectories,
      model,
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
        reader: reader ? {
          profile: reader,
          mode: options.reader === "auto" ? "auto" : "explicit",
          ...(reason ? { reason } : {}),
          ...(casting ? { casting } : {}),
        } : undefined,
        fullOutputPath: visible.fullOutputPath,
        truncation: visible.truncation,
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
        reader: readerId(params.reader, false),
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
        reader: readerId(params.reader, true),
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
