import assert from "node:assert/strict";
import test from "node:test";
import { recipientEmailTimeWindow } from "../src/email/recipient-time-window-model.js";

test("email model exposes start end and remaining time",()=>{
 const m=recipientEmailTimeWindow(
  "2026-10-04T16:00:00.000Z","2026-10-04T20:00:00.000Z",
  new Date("2026-10-04T17:00:00.000Z")
 );
 assert.equal(m.availableFrom,"2026-10-04T16:00:00.000Z");
 assert.equal(m.expiresAt,"2026-10-04T20:00:00.000Z");
 assert.equal(m.timeRemaining,"03:00:00");
 assert.equal(m.connectionAllowed,true);
});

test("connection ends when authoritative expiration is reached",()=>{
 const m=recipientEmailTimeWindow(
  "2026-10-04T16:00:00.000Z","2026-10-04T20:00:00.000Z",
  new Date("2026-10-04T20:00:00.000Z")
 );
 assert.equal(m.timeRemaining,"00:00:00");
 assert.equal(m.status,"EXPIRED");
 assert.equal(m.connectionAllowed,false);
});
