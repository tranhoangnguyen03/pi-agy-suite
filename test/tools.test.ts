import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerProseTools, type ProseToolDependencies } from "../src/tools.ts";
import type { AgyRunResult } from "../src/types.ts";

interface Tool {
  name: string;
  parameters: {
    properties: Record<string, unknown>;
    required?: string[];
  };
  execute: (
    id: string,
    params: Record<string, unknown>,
    signal: AbortSignal | undefined,
    update: undefined,
    ctx: { cwd: string },
  ) => Promise<{
    content: Array<{ type: string; text: string }>;
    details: Record<string, unknown>;
  }>;
}

function fakePi(): { pi: ExtensionAPI; tools: Map<string, Tool> } {
  const tools = new Map<string, Tool>();
  return {
    tools,
    pi: {
      registerTool(tool: Tool) {
        tools.set(tool.name, tool);
      },
    } as unknown as ExtensionAPI,
  };
}

function success(prose = "Clean prose."): AgyRunResult {
  return {
    response: {
      prose,
      consulted_samples: ["sample.md"],
      warnings: ["warning"],
      assumptions: ["assumption"],
    },
    usage: { input_tokens: 1, output_tokens: 2 },
    version: "1.1.11",
    model: "gemini-3.1-pro-low",
    binary: "/fake/agy",
  };
}

function dependencies(runAgy: ProseToolDependencies["runAgy"]): ProseToolDependencies {
  return {
    runAgy,
    resolveProfile: async () => ({
      voiceGuide: undefined,
      sampleDirectories: [],
      sampleFiles: [],
      warnings: ["No prose profile found"],
    }),
  };
}

test("registers exact draft and edit schemas", () => {
  const { pi, tools } = fakePi();
  registerProseTools(pi, dependencies(async () => success()));

  assert.deepEqual([...tools.keys()], ["agy_prose_draft", "agy_prose_edit"]);
  const draft = tools.get("agy_prose_draft")!;
  assert.deepEqual(Object.keys(draft.parameters.properties), ["brief", "context", "sources", "model", "reader"]);
  assert.deepEqual(draft.parameters.required, ["brief"]);
  const edit = tools.get("agy_prose_edit")!;
  assert.deepEqual(Object.keys(edit.parameters.properties), [
    "text", "path", "instruction", "context", "sources", "model", "reader",
  ]);
  assert.deepEqual(edit.parameters.required ?? [], []);
});

test("draft treats empty optional strings as omitted", async () => {
  let model: string | undefined = "unseen";
  let prompt = "";
  const { pi, tools } = fakePi();
  registerProseTools(pi, dependencies(async (options) => {
    model = options.model;
    prompt = options.prompt;
    return success();
  }));

  await tools.get("agy_prose_draft")!.execute(
    "1",
    { brief: "Draft", context: "", model: "" },
    undefined,
    undefined,
    { cwd: process.cwd() },
  );

  assert.equal(model, "gemini-3.7-flash-high");
  assert.doesNotMatch(prompt, /Context:/);
});

test("draft and edit trim model identifiers", async () => {
  const models: Array<string | undefined> = [];
  const { pi, tools } = fakePi();
  registerProseTools(pi, dependencies(async (options) => {
    models.push(options.model);
    return success();
  }));

  await tools.get("agy_prose_draft")!.execute(
    "1",
    { brief: "Draft", model: "  gemini-3.1-pro-low  " },
    undefined,
    undefined,
    { cwd: process.cwd() },
  );
  await tools.get("agy_prose_edit")!.execute(
    "2",
    { text: "rough", model: "  gemini-3.1-pro-low  ", reader: "general readers" },
    undefined,
    undefined,
    { cwd: process.cwd() },
  );

  assert.deepEqual(models, ["gemini-3.1-pro-low", "gemini-3.1-pro-low"]);
});

test("edit treats empty optional strings as omitted", async () => {
  let calls = 0;
  const { pi, tools } = fakePi();
  registerProseTools(pi, dependencies(async (options) => {
    calls += 1;
    return /one concise reader profile/i.test(options.prompt)
      ? { ...success(), response: { reader: "general readers", reason: "A fit." } }
      : success();
  }));
  const edit = tools.get("agy_prose_edit")!;

  const result = await edit.execute(
    "1",
    { path: "README.md", text: "", instruction: "", context: "", model: "" },
    undefined,
    undefined,
    { cwd: process.cwd() },
  );

  assert.equal(result.content[0]?.text, "Clean prose.");
  assert.equal(calls, 2);
});

test("edit rejects both or neither target before AGY starts", async () => {
  let calls = 0;
  const { pi, tools } = fakePi();
  registerProseTools(pi, dependencies(async () => { calls += 1; return success(); }));
  const edit = tools.get("agy_prose_edit")!;

  await assert.rejects(edit.execute("1", {}, undefined, undefined, { cwd: process.cwd() }), /exactly one.*text.*path/i);
  await assert.rejects(edit.execute("2", { text: "a", path: "b.md" }, undefined, undefined, { cwd: process.cwd() }), /exactly one.*text.*path/i);
  assert.equal(calls, 0);
});

test("reader policy controls one-call and two-call workflows", async () => {
  const prompts: string[] = [];
  const models: Array<string | undefined> = [];
  const signals: Array<AbortSignal | undefined> = [];
  const { pi, tools } = fakePi();
  registerProseTools(pi, dependencies(async (options) => {
    prompts.push(options.prompt);
    models.push(options.model);
    signals.push(options.signal);
    if (/one concise reader profile/i.test(options.prompt)) {
      return {
        ...success(),
        response: { reader: "an attentive reader", reason: "The work needs one." },
        usage: { input_tokens: 3, output_tokens: 4 },
      };
    }
    return success();
  }));
  const draft = tools.get("agy_prose_draft")!;
  const edit = tools.get("agy_prose_edit")!;

  await draft.execute("1", { brief: "Draft" }, undefined, undefined, { cwd: process.cwd() });
  await draft.execute("2", { brief: "Draft", reader: "auto" }, undefined, undefined, { cwd: process.cwd() });
  await draft.execute("3", { brief: "Draft", reader: "general readers" }, undefined, undefined, { cwd: process.cwd() });
  await edit.execute("4", { text: "rough" }, undefined, undefined, { cwd: process.cwd() });
  const controller = new AbortController();
  await edit.execute("5", { text: "rough", reader: " AUTO ", model: " custom-model " }, controller.signal, undefined, { cwd: process.cwd() });
  await edit.execute("6", { text: "rough", reader: "skeptical readers" }, undefined, undefined, { cwd: process.cwd() });

  assert.equal(prompts.length, 9);
  assert.equal(prompts.filter((prompt) => /one concise reader profile/i.test(prompt)).length, 3);
  assert.equal(prompts.filter((prompt) => /speaks in its own voice to an attentive reader/i.test(prompt)).length, 3);
  assert.equal(prompts.filter((prompt) => /speaks in its own voice to general readers/i.test(prompt)).length, 1);
  assert.equal(prompts.filter((prompt) => /speaks in its own voice to skeptical readers/i.test(prompt)).length, 1);
  assert.deepEqual(models.slice(0, 6), Array(6).fill("gemini-3.7-flash-high"));
  assert.deepEqual(models.slice(6, 8), ["custom-model", "custom-model"]);
  assert.equal(signals[6], controller.signal);
  assert.equal(signals[7], controller.signal);
  assert.equal(models[8], "gemini-3.7-flash-high");
});

test("automatic reader casting metadata is hidden and casting failure stops before prose generation", async () => {
  let calls = 0;
  const { pi, tools } = fakePi();
  registerProseTools(pi, dependencies(async (options) => {
    calls += 1;
    if (/one concise reader profile/i.test(options.prompt)) {
      return {
        ...success(),
        response: { reader: "an attentive reader", reason: "The work needs one." },
        usage: { input_tokens: 3, output_tokens: 4 },
      };
    }
    return success();
  }));

  const result = await tools.get("agy_prose_edit")!.execute(
    "1", { text: "rough" }, undefined, undefined, { cwd: process.cwd() },
  );
  assert.equal(calls, 2);
  assert.doesNotMatch(result.content[0]?.text ?? "", /attentive reader|work needs one/i);
  assert.deepEqual(result.details.reader, {
    profile: "an attentive reader",
    mode: "auto",
    reason: "The work needs one.",
    casting: {
      model: "gemini-3.1-pro-low",
      agyVersion: "1.1.11",
      usage: { input_tokens: 3, output_tokens: 4 },
    },
  });

  let failedCalls = 0;
  const failed = fakePi();
  registerProseTools(failed.pi, dependencies(async () => {
    failedCalls += 1;
    throw new Error("casting failed");
  }));
  await assert.rejects(failed.tools.get("agy_prose_edit")!.execute(
    "2", { text: "rough" }, undefined, undefined, { cwd: process.cwd() },
  ), /casting failed/);
  assert.equal(failedCalls, 1);
});

test("source validation fails before AGY starts", async () => {
  let calls = 0;
  const { pi, tools } = fakePi();
  registerProseTools(pi, dependencies(async () => { calls += 1; return success(); }));

  await assert.rejects(tools.get("agy_prose_draft")!.execute(
    "1",
    { brief: "Draft", sources: ["missing-source.md"] },
    undefined,
    undefined,
    { cwd: process.cwd() },
  ), /regular file/i);
  assert.equal(calls, 0);
});

test("successful visible content is prose only and details retain provenance", async () => {
  let prompt = "";
  let model: string | undefined;
  let addDirs: string[] | undefined;
  const { pi, tools } = fakePi();
  const deps = dependencies(async (options) => {
    prompt = options.prompt;
    model = options.model;
    addDirs = options.addDirs;
    return success();
  });
  deps.resolveProfile = async () => ({
    voiceGuide: undefined,
    sampleDirectories: ["/profiles/samples"],
    sampleFiles: [],
    warnings: [],
  });
  registerProseTools(pi, deps);

  const result = await tools.get("agy_prose_edit")!.execute(
    "1",
    { text: "rough", model: "gemini-3.1-pro-high", reader: "general readers" },
    undefined,
    undefined,
    { cwd: process.cwd() },
  );

  assert.equal(model, "gemini-3.1-pro-high");
  assert.deepEqual(addDirs, ["/profiles/samples"]);
  assert.equal(result.content[0]?.text, "Clean prose.");
  assert.doesNotMatch(result.content[0]?.text ?? "", /warning|sample\.md|assumption/);
  assert.match(prompt, /voice and prose tuning/i);
  assert.deepEqual(result.details.consultedSamples, ["sample.md"]);
  assert.deepEqual(result.details.warnings, ["warning"]);
  assert.deepEqual(result.details.assumptions, ["assumption"]);
  assert.equal(result.details.model, "gemini-3.1-pro-low");
  assert.equal(result.details.agyVersion, "1.1.11");
  assert.deepEqual(result.details.usage, { input_tokens: 1, output_tokens: 2 });
  assert.ok(Array.isArray(result.details.sourceManifest));
});

test("oversized single-line prose retains a nonempty visible prose prefix", async () => {
  const prose = "x".repeat(100_000);
  const { pi, tools } = fakePi();
  registerProseTools(pi, dependencies(async () => success(prose)));

  const result = await tools.get("agy_prose_draft")!.execute(
    "1", { brief: "Draft" }, undefined, undefined, { cwd: process.cwd() },
  );
  const visible = result.content[0]?.text ?? "";
  assert.ok(visible.length > 0);
  assert.match(visible, /^x+$/);
  assert.ok(Buffer.byteLength(visible) <= 51_200);
  assert.equal(await readFile(result.details.fullOutputPath as string, "utf8"), prose);
});

test("oversized prose stays prose-only visibly and is preserved in a temporary file", async () => {
  const prose = `${"line\n".repeat(2_100)}${"x".repeat(60_000)}`;
  const { pi, tools } = fakePi();
  registerProseTools(pi, dependencies(async () => success(prose)));

  const result = await tools.get("agy_prose_draft")!.execute(
    "1",
    { brief: "Draft" },
    undefined,
    undefined,
    { cwd: process.cwd() },
  );

  const visible = result.content[0]?.text ?? "";
  assert.doesNotMatch(visible, /Output truncated|Full output saved|pi-agy-output/i);
  assert.ok(Buffer.byteLength(visible) < 55_000);
  assert.ok(visible.split("\n").length <= 2_005);
  const outputPath = result.details.fullOutputPath;
  assert.equal(typeof outputPath, "string");
  assert.deepEqual(result.details.truncation, {
    outputLines: visible.split("\n").length,
    totalLines: prose.split("\n").length,
    fullOutputPath: outputPath,
  });
  await access(outputPath as string);
  assert.equal(await readFile(outputPath as string, "utf8"), prose);
});
