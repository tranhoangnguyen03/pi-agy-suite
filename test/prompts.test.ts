import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

for (const [name, tool] of [
  ["agy-prose-draft", "agy_prose_draft"],
  ["agy-prose-edit", "agy_prose_edit"],
] as const) {
  test(`${name} conductor template follows the delegation contract`, async () => {
    const template = await readFile(new URL(`../prompts/${name}.md`, import.meta.url), "utf8");
    assert.match(template, /\$ARGUMENTS|\$@/);
    assert.match(template, new RegExp(tool));
    assert.match(template, /explicit.*user-named/is);
    assert.match(template, /discovery-assisted|intent-only/i);
    assert.match(template, /smallest relevant.*source/i);
    assert.match(template, /never.*entire director/is);
    assert.match(template, /unrelated files/i);
    assert.match(template, /secrets/i);
    assert.match(template, /project instructions/i);
    assert.match(template, /ask.*ambiguity.*materially change/is);
    assert.match(template, /present.*AGY.*prose unchanged/is);
    assert.match(template, /explicit replacement intent.*overwrit/is);
    assert.match(template, /argument-hint: "\[intent and @sources\]"/);
  });
}
