import assert from "node:assert/strict"; import test from "node:test"; import { createHash } from "node:crypto";
import { requireChunkSha256 } from "../src/services/chunk-integrity-gate.js";
test("chunk checksum is mandatory",()=>{assert.throws(()=>requireChunkSha256(Buffer.from("a"),undefined),/CHUNK_SHA256_REQUIRED/);});
test("matching chunk checksum passes",()=>{const b=Buffer.from("exact");const h=createHash("sha256").update(b).digest("hex");assert.equal(requireChunkSha256(b,h),true);});
test("mismatched chunk checksum is rejected",()=>{assert.throws(()=>requireChunkSha256(Buffer.from("altered"),"0".repeat(64)));});
