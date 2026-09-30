import assert from "node:assert/strict";
import test from "node:test";
import { receiverAssistance } from "../src/recipient/receiver-assistance.js";

test("interrupted download asks receiver to retry", () => {
  const notice = receiverAssistance("download-interrupted");
  assert.match(notice.message, /retry/i);
  assert.equal(notice.recommendApplication, false);
});

test("repeated connection failure recommends application", () => {
  const notice = receiverAssistance("repeated-connection-failure");
  assert.equal(notice.recommendApplication, true);
  assert.match(notice.message, /original file will not be changed/i);
});

test("receiver computer storage issue gives a specific correction", () => {
  const notice = receiverAssistance("insufficient-storage");
  assert.match(notice.message, /free enough storage/i);
  assert.equal(notice.preserveTechnicalDetailsInBackend, true);
});
