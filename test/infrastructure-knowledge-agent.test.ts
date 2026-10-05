import assert from "node:assert/strict";
import test from "node:test";
import { InfrastructureKnowledgeAgent } from "../src/infrastructure/infrastructure-knowledge-agent.js";

test("network upgrade issue reports to coordination routing research and upgrade agents",()=>{
 const a=new InfrastructureKnowledgeAgent();
 const report=a.report({
  issueId:"i1",domain:"network",affectedComponentIds:["transfer-service"],
  severity:"degraded",description:"Transport compatibility changed",
  recommendedAction:"Validate supported replacement before rollout",requiresUpgradeValidation:true
 });
 for(const recipient of [
  "system-coordination-supervisor","transfer-service","network-protocol-intelligence-agent",
  "transfer-routing-agent","transfer-research-improvement-agent","safe-upgrade-pipeline"
 ]) assert.ok(report.recipients.includes(recipient));
 assert.equal(report.preservePrivateLanes,true);
 assert.equal(report.preserveVerifiedExact,true);
});

test("storage issue automatically includes storage director",()=>{
 const a=new InfrastructureKnowledgeAgent();
 const report=a.report({
  issueId:"i2",domain:"digital-storage",affectedComponentIds:["storage-worker"],
  severity:"critical",description:"Storage target unavailable",
  recommendedAction:"Fail over affected lane to eligible storage",requiresUpgradeValidation:false
 });
 assert.ok(report.recipients.includes("storage-director-agent"));
});
