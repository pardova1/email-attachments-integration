import assert from "node:assert/strict";
import test from "node:test";
import { ANNUAL_LICENSE_USD_CENTS, createAnnualLicense, isLicenseActive } from "../src/billing/annual-license.js";

test("annual license costs exactly four US dollars", () => {
  assert.equal(ANNUAL_LICENSE_USD_CENTS, 400);
});

test("annual license is active during its one-year term", () => {
  const start = new Date("2026-01-01T00:00:00Z");
  const license = createAnnualLicense("u1", start);
  assert.equal(isLicenseActive(license, new Date("2026-06-01T00:00:00Z")), true);
  assert.equal(isLicenseActive(license, new Date("2027-01-02T00:00:00Z")), false);
});
