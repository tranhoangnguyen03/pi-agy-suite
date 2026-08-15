import assert from "node:assert/strict";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { CONFIG_DIR_NAME, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import extension from "../index.ts";

interface Command {
  handler: (args: string, ctx: { cwd: string }) => Promise<void>;
}

test("registers agy-prose-init and rejects invalid scope", async () => {
  let command: Command | undefined;
  const messages: Array<{ content: string }> = [];
  extension({
    registerTool() {},
    registerCommand(name: string, value: Command) {
      if (name === "agy-prose-init") command = value;
    },
    sendMessage(message: { content: string }) {
      messages.push(message);
    },
  } as unknown as ExtensionAPI);

  assert.ok(command);
  await command.handler("", { cwd: "/unused" });
  assert.equal(messages[0]?.content, "Usage: /agy-prose-init global|local");
});

test("agy-prose-init local creates files under Pi's project config directory", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "pi-agy-init-command-"));
  try {
    let command: Command | undefined;
    const messages: Array<{ content: string }> = [];
    extension({
      registerTool() {},
      registerCommand(name: string, value: Command) {
        if (name === "agy-prose-init") command = value;
      },
      sendMessage(message: { content: string }) {
        messages.push(message);
      },
    } as unknown as ExtensionAPI);

    assert.ok(command);
    await command.handler("local", { cwd });
    const proseDir = join(cwd, CONFIG_DIR_NAME, "pi-agy-suite", "prose");
    await access(join(proseDir, "voice.md"));
    await access(join(proseDir, "writing-samples", "README.md"));
    assert.match(messages[0]?.content ?? "", /Created:/);

    await command.handler("local", { cwd });
    assert.match(messages[1]?.content ?? "", /Skipped existing:/);
    assert.match(await readFile(join(proseDir, "voice.md"), "utf8"), /Edit this guide/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
