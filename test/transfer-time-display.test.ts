import assert from "node:assert/strict";
import test from "node:test";
import { buildTransferTimeDisplay } from "../src/time/transfer-time-display.js";

test("same expiration is localized for US sender and international receiver", () => {
  const now = new Date("2026-09-30T19:15:00Z");
  const expiresAt = new Date("2026-09-30T23:15:00Z");
  const display = buildTransferTimeDisplay(
    expiresAt,
    { locationLabel: "New York, NY, USA", timeZone: "America/New_York" },
    { locationLabel: "London, United Kingdom", timeZone: "Europe/London" },
    now
  );

  assert.equal(display.countdown, "04:00:00");
  assert.equal(display.authoritativeExpiresAt, expiresAt.toISOString());
  assert.match(display.senderNow.localTime, /3:15:00 PM/);
  assert.match(display.receiverNow.localTime, /8:15:00 PM/);
  assert.equal(display.senderExpiration.localDate, "September 30, 2026");
  assert.equal(display.receiverExpiration.localDate, "October 1, 2026");
});

test("Tokyo receiver sees next-day local date while sharing same expiration instant", () => {
  const now = new Date("2026-09-30T19:15:00Z");
  const expiresAt = new Date("2026-09-30T23:15:00Z");
  const display = buildTransferTimeDisplay(
    expiresAt,
    { locationLabel: "New York, NY, USA", timeZone: "America/New_York" },
    { locationLabel: "Tokyo, Japan", timeZone: "Asia/Tokyo" },
    now
  );
  assert.equal(display.receiverNow.localDate, "October 1, 2026");
  assert.equal(display.receiverExpiration.localDate, "October 1, 2026");
  assert.equal(display.countdown, "04:00:00");
});
