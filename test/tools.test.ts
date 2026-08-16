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
  assert.deepEqual(Object.keys(draft.parameters.properties), ["brief", "context", "sources", "model"]);
  assert.deepEqual(draft.parameters.required, ["brief"]);
  const edit = tools.get("agy_prose_edit")!;
  assert.deepEqual(Object.keys(edit.parameters.properties), [
    "text", "path", "instruction", "context", "sources", "model",
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

  assert.equal(model, undefined);
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
    { text: "rough", model: "  gemini-3.1-pro-low  " },
    undefined,
    undefined,
    { cwd: process.cwd() },
  );

  assert.deepEqual(models, ["gemini-3.1-pro-low", "gemini-3.1-pro-low"]);
});

test("edit treats empty optional strings as omitted", async () => {
  let calls = 0;
  const { pi, tools } = fakePi();
  registerProseTools(pi, dependencies(async () => { calls += 1; return success(); }));
  const edit = tools.get("agy_prose_edit")!;

  const result = await edit.execute(
    "1",
    { path: "README.md", text: "", instruction: "", context: "", model: "" },
    undefined,
    undefined,
    { cwd: process.cwd() },
  );

  assert.equal(result.content[0]?.text, "Clean prose.");
  assert.equal(calls, 1);
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
    { text: "rough", model: "gemini-3.1-pro-high" },
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

test("oversized prose is truncated visibly and preserved in a temporary file", async () => {
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
  assert.match(visible, /Output truncated/);
  assert.ok(Buffer.byteLength(visible) < 55_000);
  assert.ok(visible.split("\n").length <= 2_005);
  const outputPath = result.details.fullOutputPath;
  assert.equal(typeof outputPath, "string");
  await access(outputPath as string);
  assert.equal(await readFile(outputPath as string, "utf8"), prose);
});
