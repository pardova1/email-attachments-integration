import assert from "node:assert/strict";
import test from "node:test";
import { GlobalEmailCapabilityRegistry } from "../src/email/global-email-capability-registry.js";

test("registry supports worldwide and regional integration cords", () => {
  const registry = new GlobalEmailCapabilityRegistry();
  registry.upsert({id:"smtp",method:"SMTP submission",family:"smtp-submission",regions:["*"],platforms:["*"],status:"supported",requiresAuthorization:true,lastReviewedAt:new Date().toISOString()});
  registry.upsert({id:"regional",method:"regional provider API",family:"provider-api",regions:["JP"],platforms:["web"],status:"testing",requiresAuthorization:true,lastReviewedAt:new Date().toISOString()});
  assert.equal(registry.supportedFor("JP","web").length,1);
  assert.equal(registry.researchQueue().length,1);
});
