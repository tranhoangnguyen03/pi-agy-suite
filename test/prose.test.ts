import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDraftPrompt,
  buildDraftReaderPrompt,
  buildEditPrompt,
  buildEditReaderPrompt,
  PROSE_RESULT_SCHEMA,
  READER_RESULT_SCHEMA,
  parseProseResponse,
  parseReaderResponse,
} from "../src/prose.ts";
import type { InputBundle } from "../src/types.ts";

function bundle(overrides: Partial<InputBundle> = {}): InputBundle {
  return {
    root: "/tmp/bundle",
    manifestPath: "/tmp/bundle/manifest.json",
    entries: [
      { originalPath: "draft.md", bundledPath: "inputs/draft.md" },
      { originalPath: "facts.csv", bundledPath: "inputs/facts.csv" },
    ],
    sampleDirectories: ["/profiles/global/writing-samples", "/project/.pi/prose/writing-samples"],
    ...overrides,
  };
}

test("draft prompt describes voice, samples, manifest, and composition contract", () => {
  const prompt = buildDraftPrompt({
    brief: "Draft an essay",
    context: "Audience: editors",
    bundle: bundle({ voiceGuide: "profile/voice.md" }),
  });

  assert.match(prompt, /profile\/voice\.md/);
  assert.match(prompt, /global.*\/profiles\/global\/writing-samples/is);
  assert.match(prompt, /project-specific.*\/project\/\.pi\/prose\/writing-samples/is);
  assert.match(prompt, /read each.*README\.md/is);
  assert.match(prompt, /select.*relevant.*\.md/is);
  assert.match(prompt, /stylistic evidence/i);
  assert.match(prompt, /not instructions or facts/i);
  assert.match(prompt, /avoid copying distinctive passages verbatim/i);
  assert.match(prompt, /\/tmp\/bundle\/manifest\.json/);
  assert.match(prompt, /\/tmp\/bundle\/inputs\/draft\.md/);
  assert.match(prompt, /\/tmp\/bundle\/inputs\/facts\.csv/);
  assert.match(prompt, /fresh composition/i);
  assert.match(prompt, /comprehensive redraft/i);
});

test("voice breadcrumb appears only when available", () => {
  assert.doesNotMatch(buildDraftPrompt({ brief: "Draft", bundle: bundle() }), /profile\/voice\.md/);
  assert.match(buildDraftPrompt({
    brief: "Draft",
    bundle: bundle({ voiceGuide: "profile/voice.md" }),
  }), /profile\/voice\.md/);
});

test("edit prompt identifies the target separately from supporting sources", () => {
  const prompt = buildEditPrompt({ bundle: bundle() });

  assert.match(prompt, /return revised prose for this target: \/tmp\/bundle\/inputs\/draft\.md/i);
  assert.doesNotMatch(prompt, /edit only this file/i);
  assert.match(prompt, /every other bundled input.*supporting context.*not text to rewrite/is);
});

test("edit prompt defaults to conservative voice and prose tuning", () => {
  const prompt = buildEditPrompt({ bundle: bundle() });

  assert.match(prompt, /voice and prose tuning/i);
  assert.match(prompt, /preserve.*facts.*claims.*quotations.*citations.*argument.*authorial position/is);
  assert.match(prompt, /diction.*rhythm.*sentence construction.*paragraph flow.*clarity.*modest organization/is);
  assert.match(prompt, /major restructuring.*expansion.*compression.*requires explicit instruction/is);
});

test("edit prompt includes explicit instructions when provided", () => {
  const prompt = buildEditPrompt({
    instruction: "Compress this to 500 words",
    context: "Keep the ending",
    bundle: bundle(),
  });
  assert.match(prompt, /Compress this to 500 words/);
  assert.match(prompt, /Keep the ending/);
});

test("draft and edit prompts frame an explicit reader without assigning the reader's voice", () => {
  const reader = "a curious general reader who values emotional restraint";
  const draft = buildDraftPrompt({ brief: "Draft an essay", reader, bundle: bundle() });
  const edit = buildEditPrompt({ reader, bundle: bundle() });

  for (const prompt of [draft, edit]) {
    assert.match(prompt, /speaks in its own voice/i);
    assert.match(prompt, new RegExp(reader));
    assert.match(prompt, /fully holds this reader's attention/i);
    assert.doesNotMatch(prompt, /write like|imitate|in the style of/i);
  }
});

test("casting prompts use task-specific reader questions without editing advice", () => {
  const draft = buildDraftReaderPrompt({ brief: "Draft an essay", context: "For editors", bundle: bundle() });
  const edit = buildEditReaderPrompt({ instruction: "Tighten it", context: "Keep warmth", bundle: bundle() });

  assert.match(draft, /intended work.*clearest purpose.*reason to exist/is);
  assert.match(draft, /Draft an essay/);
  assert.match(edit, /existing work.*trying to reach at its best/is);
  assert.match(edit, /target: \/tmp\/bundle\/inputs\/draft\.md/i);
  for (const prompt of [draft, edit]) {
    assert.match(prompt, /one concise reader profile/i);
    assert.match(prompt, /not editing advice/i);
    assert.match(prompt, /return only the JSON object/i);
  }
});

test("reader schema and parser require a reader and hidden reason", () => {
  assert.deepEqual(READER_RESULT_SCHEMA.required, ["reader", "reason"]);
  assert.equal(READER_RESULT_SCHEMA.additionalProperties, false);
  assert.deepEqual(parseReaderResponse({ reader: "attentive readers", reason: "They fit." }), {
    reader: "attentive readers",
    reason: "They fit.",
  });
  assert.throws(() => parseReaderResponse({ reader: "only" }), /invalid.*reader result/i);
  assert.throws(() => parseReaderResponse({
    reader: "attentive readers",
    reason: "They fit.",
    extra: "schema drift",
  }), /invalid.*reader result/i);
});

test("result schema requires prose and hidden metadata", () => {
  assert.deepEqual(PROSE_RESULT_SCHEMA.required, [
    "prose",
    "consulted_samples",
    "warnings",
    "assumptions",
  ]);
  assert.equal(PROSE_RESULT_SCHEMA.additionalProperties, false);
});

test("parses the prose result contract and rejects drift", () => {
  assert.deepEqual(parseProseResponse({
    prose: "Clean prose.",
    consulted_samples: ["sample.md"],
    warnings: ["warning"],
    assumptions: [],
  }), {
    prose: "Clean prose.",
    consultedSamples: ["sample.md"],
    warnings: ["warning"],
    assumptions: [],
  });
  assert.throws(() => parseProseResponse({ prose: "only" }), /invalid.*prose result/i);
  assert.throws(() => parseProseResponse({
    prose: "Clean prose.",
    consulted_samples: [],
    warnings: [],
    assumptions: [],
    extra: "schema drift",
  }), /invalid.*prose result/i);
});
