import assert from "node:assert/strict";
import test from "node:test";
import { PUBLIC_TECHNICAL_DIFFICULTIES_NOTICE, resolutionNotice } from "../src/incidents/public-incident-notification.js";

test("public failure notice exposes no technical details", () => {
  assert.equal(PUBLIC_TECHNICAL_DIFFICULTIES_NOTICE, "Technical difficulties. Please try again later.");
});

test("affected sender is told to resend after resolution", () => {
  assert.match(resolutionNotice("sender").message, /resend/i);
});

test("affected receiver is told to retry download after resolution", () => {
  assert.match(resolutionNotice("receiver").message, /downloading/i);
});
