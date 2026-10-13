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
test("active license interval includes its start and excludes expiry and invalid times",()=>{
 const start=new Date("2026-10-13T00:00:00Z"),license=createAnnualLicense("a",start);
 assert.equal(isLicenseActive(license,new Date(start.getTime()-1)),false);assert.equal(isLicenseActive(license,start),true);
 assert.equal(isLicenseActive(license,new Date(license.expiresAt.getTime()-1)),true);assert.equal(isLicenseActive(license,license.expiresAt),false);
 assert.equal(isLicenseActive(license,new Date("invalid")),false);assert.equal(isLicenseActive({...license,startsAt:new Date("invalid")},start),false);
 assert.equal(isLicenseActive({...license,status:"expired"},start),false);
});
