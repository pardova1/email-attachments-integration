import assert from "node:assert/strict";
import test from "node:test";
import { issueTransferToken, verifyTransferToken } from "../src/security/transfer-token.js";
import { sha256, verifySha256 } from "../src/security/checksum.js";

test("scoped transfer token validates before expiration", () => {
  const secret = "test-secret";
  const token = issueTransferToken({
    transferId: "transfer-1",
    scope: "upload",
    exp: Math.floor(Date.now() / 1000) + 60
  }, secret);

  const claims = verifyTransferToken(token, secret, "upload");
  assert.equal(claims.transferId, "transfer-1");
});

test("token cannot be reused for a different scope", () => {
  const token = issueTransferToken({
    transferId: "transfer-1",
    scope: "upload",
    exp: Math.floor(Date.now() / 1000) + 60
  }, "test-secret");

  assert.throws(() => verifyTransferToken(token, "test-secret", "download"), /INVALID_TOKEN_SCOPE/);
});

test("sha256 integrity verification rejects altered data", () => {
  const original = Buffer.from("original");
  const digest = sha256(original);
  assert.equal(verifySha256(original, digest), digest);
  assert.throws(() => verifySha256(Buffer.from("altered"), digest), /CHECKSUM_MISMATCH/);
});
