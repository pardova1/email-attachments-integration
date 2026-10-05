import assert from "node:assert/strict";
import test from "node:test";
import { ApprovedReleaseRegistry,ApprovedRelease } from "../src/releases/approved-release-registry.js";

const release=(version:string):ApprovedRelease=>({
 version,commitSha:"abc123",approvedAt:new Date().toISOString(),status:"approved",
 checks:{compile:true,tests:true,security:true,dependencyCompatibility:true,
 privateLaneIsolation:true,fourHourExpiration:true,verifiedExact:true,recoveryChain:true}
});

test("new approved release supersedes prior last-known-good",()=>{
 const r=new ApprovedReleaseRegistry();
 r.approve(release("1.0.0"));
 r.approve(release("1.1.0"));
 assert.equal(r.get("1.0.0")?.status,"superseded");
 assert.equal(r.lastKnownGood().version,"1.1.0");
});

test("revoked release cannot remain rollback target",()=>{
 const r=new ApprovedReleaseRegistry();
 r.approve(release("1.0.0"));
 r.revoke("1.0.0");
 assert.throws(()=>r.lastKnownGood(),/NO_UNAMBIGUOUS_APPROVED_RELEASE/);
});
