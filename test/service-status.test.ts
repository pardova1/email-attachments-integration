import assert from "node:assert/strict";
import test from "node:test";
import { createAnnualLicense } from "../src/billing/annual-license.js";
import { buildServiceStatus } from "../src/profile/service-status.js";

test("active profile shows valid green status and renewal date", () => {
  const license = createAnnualLicense("u1", new Date("2026-09-30T00:00:00Z"));
  const status = buildServiceStatus(license, new Date("2027-01-01T00:00:00Z"));
  assert.equal(status.userStatus, "Valid");
  assert.equal(status.indicator, "green");
  assert.equal(status.purchaseDate.toISOString(), "2026-09-30T00:00:00.000Z");
  assert.equal(status.nextRenewalDate.toISOString(), license.expiresAt.toISOString());
  assert.equal(status.note, undefined);
});

test("expired profile shows red renewal-required status and renewal note", () => {
  const license = createAnnualLicense("u1", new Date("2025-09-30T00:00:00Z"));
  const status = buildServiceStatus(license, new Date("2026-10-01T00:00:00Z"));
  assert.equal(status.userStatus, "Renewal Required");
  assert.equal(status.indicator, "red");
  assert.equal(status.note, "Please renew your service.");
});
