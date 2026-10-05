import assert from "node:assert/strict";
import test from "node:test";
import { IntegrationOperatingMonitor } from "../src/integrations/integration-operating-monitor.js";

test("warns on degradation before complete outage",()=>{
 const r=new IntegrationOperatingMonitor().assess({
  adapterId:"storage-a",sampledAt:new Date().toISOString(),successRate:.85,
  latencyMs:6000,consecutiveFailures:2,rateLimited:false,authenticated:true
 });
 assert.equal(r.state,"degraded");
 assert.equal(r.triggerFailover,false);
 assert.ok(r.reasons.includes("low-success-rate"));
 assert.ok(r.reasons.includes("high-latency"));
});

test("unavailable integration triggers failover coordination",()=>{
 const r=new IntegrationOperatingMonitor().assess({
  adapterId:"email-a",sampledAt:new Date().toISOString(),successRate:.3,
  latencyMs:1000,consecutiveFailures:5,rateLimited:false,authenticated:true
 });
 assert.equal(r.state,"unavailable");
 assert.equal(r.triggerFailover,true);
 assert.ok(r.notifyAgents.includes("integration-failover-coordinator"));
});
