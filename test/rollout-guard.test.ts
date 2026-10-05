import assert from "node:assert/strict";
import test from "node:test";
import { RolloutGuard } from "../src/releases/rollout-guard.js";

const good={
 version:"2.0.0",compilePassed:true,testsPassed:true,securityPassed:true,
 dependenciesOperating:true,privateLaneIsolationPassed:true,
 fourHourExpirationPassed:true,verifiedExactPassed:true,recoveryChainPassed:true
};

test("rolls back when an upgrade breaks a permanent rule",()=>{
 const result=new RolloutGuard().evaluate({...good,fourHourExpirationPassed:false},"1.9.0");
 assert.equal(result.action,"rollback");
 assert.equal(result.targetVersion,"1.9.0");
 assert.ok(result.reasons.includes("four-hour-expiration"));
});

test("continues only when all rollout checks pass",()=>{
 const result=new RolloutGuard().evaluate(good,"1.9.0");
 assert.equal(result.action,"continue");
 assert.equal(result.targetVersion,"2.0.0");
});
