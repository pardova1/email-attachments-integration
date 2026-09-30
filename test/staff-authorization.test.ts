import assert from "node:assert/strict";
import test from "node:test";
import { issueStaffToken, verifyStaffToken } from "../src/security/staff-authorization.js";

test("authorized staff token verifies", () => {
  const secret = "test-secret";
  const token = issueStaffToken({ staffId: "staff-1", role: "operations-staff", exp: Math.floor(Date.now()/1000)+60 }, secret);
  assert.equal(verifyStaffToken(token, secret).role, "operations-staff");
});

test("invalid staff token is rejected", () => {
  assert.throws(() => verifyStaffToken("bad.token", "test-secret"), /STAFF_AUTHORIZATION_REQUIRED/);
});
