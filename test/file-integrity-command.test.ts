import assert from "node:assert/strict";
import test from "node:test";
import { FILE_INTEGRITY_COMMAND, assertVerifiedExact } from "../src/domain/file-integrity-command.js";

test("file mutation is permanently prohibited by the integrity command", () => {
  assert.equal(FILE_INTEGRITY_COMMAND.allowMutation, false);
});

test("transfer success requires matching whole-file fingerprints", () => {
  assert.deepEqual(assertVerifiedExact("abc", "abc"), { verifiedExact: true });
  assert.throws(() => assertVerifiedExact("abc", "def"), /FILE_INTEGRITY_COMMAND_VIOLATION/);
});
