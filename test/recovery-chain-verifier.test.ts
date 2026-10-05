import assert from "node:assert/strict";
import test from "node:test";
import { RecoveryChainVerifier } from "../src/operations/recovery-chain-verifier.js";

test("does not declare recovery when a downstream handoff remains broken",()=>{
 const result=new RecoveryChainVerifier().verify([
  {componentId:"storage",componentState:"passed",inboundDependencyState:"passed",outboundDependencyState:"passed"},
  {componentId:"transfer-service",componentState:"passed",inboundDependencyState:"passed",outboundDependencyState:"failed"},
  {componentId:"integrity-verification",componentState:"passed",inboundDependencyState:"failed",outboundDependencyState:"passed"}
 ]);
 assert.equal(result.resolved,false);
 assert.equal(result.mayResumeAffectedTransfers,false);
 assert.ok(result.failedChecks.includes("transfer-service:outbound"));
});

test("affected transfers resume only after entire checked chain passes",()=>{
 const result=new RecoveryChainVerifier().verify([
  {componentId:"storage",componentState:"passed",inboundDependencyState:"passed",outboundDependencyState:"passed"},
  {componentId:"transfer-service",componentState:"passed",inboundDependencyState:"passed",outboundDependencyState:"passed"},
  {componentId:"integrity-verification",componentState:"passed",inboundDependencyState:"passed",outboundDependencyState:"passed"}
 ]);
 assert.equal(result.resolved,true);
 assert.equal(result.mayResumeAffectedTransfers,true);
 assert.equal(result.requireVerifiedExact,true);
});
