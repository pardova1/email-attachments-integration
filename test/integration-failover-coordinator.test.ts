import assert from "node:assert/strict";
import test from "node:test";
import { IntegrationFailoverCoordinator } from "../src/integrations/integration-failover-coordinator.js";

test("switches to another authorized operating adapter without changing transfer rules",()=>{
 const result=new IntegrationFailoverCoordinator().decide({
  capability:"storage",failedAdapterId:"a",transferId:"t1",laneId:"l1",
  candidates:[
   {id:"a",capability:"storage",interfaceType:"api",authorized:true,operating:false,priority:20},
   {id:"b",capability:"storage",interfaceType:"sdk",authorized:true,operating:true,priority:10}
  ]
 });
 assert.equal(result.action,"switch-adapter");
 assert.equal(result.selectedAdapterId,"b");
 assert.equal(result.preserveTransferIdentity,true);
 assert.equal(result.preservePrivateLane,true);
 assert.equal(result.preserveExpiration,true);
 assert.equal(result.requireVerifiedExact,true);
});

test("escalates instead of bypassing authorization when no eligible adapter exists",()=>{
 const result=new IntegrationFailoverCoordinator().decide({
  capability:"email",failedAdapterId:"a",
  candidates:[{id:"b",capability:"email",interfaceType:"api",authorized:false,operating:true,priority:100}]
 });
 assert.equal(result.action,"escalate");
 assert.equal(result.selectedAdapterId,undefined);
});
