import assert from "node:assert/strict";
import test from "node:test";
import { CodeMaintenanceSupervisor,CodeResearchAgent } from "../src/code-maintenance/code-maintenance-agents.js";

test("dependency issue is researched then assigned to upgrade agent with guarded checks",()=>{
 const issue={id:"e1",kind:"dependency" as const,componentIds:["transfer-service"],evidence:["unsupported package"]};
 const plan=new CodeMaintenanceSupervisor().plan(issue);
 assert.equal(plan.implementationAgent,"code-upgrade-agent");
 assert.equal(plan.automaticProductionMerge,false);
 assert.ok(plan.requiredChecks.includes("verified-exact-regression"));
 assert.ok(plan.requiredChecks.includes("recovery-chain-verification"));
});

test("runtime error receives root-cause research before repair",()=>{
 const issue={id:"e2",kind:"runtime" as const,componentIds:["recipient-access"],evidence:["exception"]};
 const research=new CodeResearchAgent().research(issue);
 assert.ok(research.tasks.includes("trace-root-cause"));
 assert.ok(research.tasks.includes("identify-smallest-safe-change"));
});
