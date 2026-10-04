import assert from "node:assert/strict";
import test from "node:test";
import { createAuthoritativeDownloadWindow,remainingDownloadTime } from "../src/time/authoritative-download-window.js";

test("receiver gets exactly four hours after verified availability",()=>{
 const verified=new Date("2026-10-04T16:00:00.000Z");
 const w=createAuthoritativeDownloadWindow(verified);
 assert.equal(w.downloadAvailableAt,"2026-10-04T16:00:00.000Z");
 assert.equal(w.downloadExpiresAt,"2026-10-04T20:00:00.000Z");
 assert.equal(w.durationHours,4);
});

test("countdown derives from server expiration rather than device clock settings",()=>{
 const w=createAuthoritativeDownloadWindow(new Date("2026-10-04T16:00:00.000Z"));
 const r=remainingDownloadTime(w.downloadExpiresAt,new Date("2026-10-04T16:00:48.000Z"));
 assert.equal(r.countdown,"03:59:12");
 assert.equal(r.expired,false);
});
