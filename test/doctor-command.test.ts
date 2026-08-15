import assert from "node:assert/strict";
import { chmod, cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import extension from "../index.ts";

const fakeFixture = new URL("./fixtures/fake-agy.mjs", import.meta.url);

test("registers /agy-suite-doctor and returns its custom report", async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-agy-doctor-command-"));
  const agy = join(root, "agy");
  await cp(fakeFixture, agy);
  await chmod(agy, 0o755);
  const previous = process.env.AGY_BIN;
  process.env.AGY_BIN = agy;
  try {
    let handler: ((args: string, ctx: { cwd: string }) => Promise<void>) | undefined;
    const messages: Array<{ customType: string; content: string }> = [];
    extension({
      registerTool() {},
      registerCommand(name: string, command: { handler: typeof handler }) {
        if (name === "agy-suite-doctor") handler = command.handler;
      },
      sendMessage(message: { customType: string; content: string }) {
        messages.push(message);
      },
    } as unknown as ExtensionAPI);

    assert.ok(handler);
    await handler("", { cwd: root });
    assert.equal(messages[0]?.customType, "pi-agy-suite");
    assert.match(messages[0]?.content ?? "", /Status: supported/);
  } finally {
    if (previous === undefined) delete process.env.AGY_BIN;
    else process.env.AGY_BIN = previous;
    await rm(root, { recursive: true, force: true });
  }
});
