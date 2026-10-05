import assert from "node:assert/strict";
import test from "node:test";
import { CiErrorIntakeCoordinator } from "../src/code-maintenance/ci-error-intake.js";

test("CI test failure becomes a structured repair incident",()=>{
 const result=new CiErrorIntakeCoordinator().intake({
  runId:"123",stage:"test",componentIds:["recipient-access"],
  summary:"recipient access test failed",evidence:["DOWNLOAD_WINDOW_EXPIRED mismatch"]
 });
 assert.equal(result.issue.kind,"test");
 assert.equal(result.maintenancePlan.implementationAgent,"code-repair-agent");
 assert.equal(result.maintenancePlan.automaticProductionMerge,false);
});

test("CI dependency failure is routed to upgrade agent",()=>{
 const result=new CiErrorIntakeCoordinator().intake({
  runId:"124",stage:"dependency",componentIds:["server"],
  summary:"dependency requires supported upgrade",evidence:[]
 });
 assert.equal(result.maintenancePlan.implementationAgent,"code-upgrade-agent");
});
