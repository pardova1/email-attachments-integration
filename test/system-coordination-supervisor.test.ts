import assert from "node:assert/strict";
import test from "node:test";
import { SystemCoordinationSupervisor } from "../src/operations/system-coordination-supervisor.js";

test("detects a broken hand-in-hand dependency even when components report operating",()=>{
 const result=new SystemCoordinationSupervisor().assess(
  [{componentId:"transfer-service",state:"operating"},{componentId:"storage",state:"operating"}],
  [{from:"transfer-service",to:"storage",state:"broken"}]
 );
 assert.equal(result.overall,"incident");
 assert.equal(result.requiresRecovery,true);
 assert.deepEqual(result.brokenDependencies,["transfer-service->storage"]);
 assert.equal(result.preserveUnaffectedLanes,true);
});

test("reports operating only when components and dependencies operate together",()=>{
 const result=new SystemCoordinationSupervisor().assess(
  [{componentId:"transfer-service",state:"operating"},{componentId:"storage",state:"operating"}],
  [{from:"transfer-service",to:"storage",state:"operating"}]
 );
 assert.equal(result.overall,"operating");
 assert.equal(result.requiresRecovery,false);
});
