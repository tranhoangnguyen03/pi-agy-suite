import assert from "node:assert/strict";
import test from "node:test";
import extension from "../index.ts";

test("exports a Pi extension factory", () => {
  assert.equal(typeof extension, "function");
});
