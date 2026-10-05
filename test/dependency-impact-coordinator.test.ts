import assert from "node:assert/strict";
import test from "node:test";
import { DependencyImpactCoordinator } from "../src/operations/dependency-impact-coordinator.js";

test("finds downstream cascade risk before multiple services fail",()=>{
 const c=new DependencyImpactCoordinator([
  {from:"storage",to:"transfer-service",critical:true},
  {from:"transfer-service",to:"integrity-verification",critical:true},
  {from:"integrity-verification",to:"recipient-delivery",critical:true},
  {from:"recipient-delivery",to:"notifications",critical:false}
 ]);
 const impact=c.assess("storage");
 assert.deepEqual(impact.directlyAffected,["transfer-service"]);
 for(const id of ["transfer-service","integrity-verification","recipient-delivery","notifications"])
  assert.ok(impact.transitivelyAffected.includes(id));
 assert.equal(impact.isolateSource,true);
 assert.equal(impact.preserveUnaffectedLanes,true);
});
