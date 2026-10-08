import assert from "node:assert/strict";
import test from "node:test";
import { issueTransferToken, verifyTransferToken } from "../src/security/transfer-token.js";
import { sha256, verifySha256 } from "../src/security/checksum.js";
import { createHmac } from "node:crypto";

test("signed malformed claims never authorize a transfer",()=>{
 const malformed=[{transferId:"a",scope:"upload"},{transferId:"a",scope:"upload",exp:"9999999999"},{transferId:"a",scope:"upload",exp:null},{transferId:"",scope:"upload",exp:9999999999},null];
 for(const claims of malformed){
  const payload=Buffer.from(JSON.stringify(claims)).toString("base64url");
  const signature=createHmac("sha256","test-secret").update(payload).digest("base64url");
  assert.throws(()=>verifyTransferToken(`${payload}.${signature}`,"test-secret","upload"),/INVALID_TOKEN/);
 }
});

test("token parser rejects trailing segments and signature junk",()=>{
 const token=issueTransferToken({transferId:"a",scope:"upload",exp:Math.floor(Date.now()/1000)+60},"test-secret");
 assert.throws(()=>verifyTransferToken(`${token}.extra`,"test-secret","upload"),/INVALID_TOKEN/);
 assert.throws(()=>verifyTransferToken(`${token}!`,"test-secret","upload"),/INVALID_TOKEN/);
});

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
