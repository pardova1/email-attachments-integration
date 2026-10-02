import assert from "node:assert/strict";
import test from "node:test";
import { IntegrityRecoverySupervisor } from "../src/operations/integrity-recovery-supervisor.js";

test("supervisor repairs altered recoverable parts without contacting user", () => {
  const plan = new IntegrityRecoverySupervisor().plan("t1","l1",{
    checkpointVerified:false, alteredParts:[7], originalBytesAvailable:true,
    affectedPartsRecoverable:true, automatedRecoveryExhausted:false
  });
  assert.equal(plan.action,"retransmit-affected-parts");
  assert.equal(plan.automatic,true);
  assert.equal(plan.contactUser,false);
  assert.equal(plan.requireFinalWholeFileVerification,true);
});

test("supervisor chooses internal restart before user contact", () => {
  const plan = new IntegrityRecoverySupervisor().plan("t2","l2",{
    checkpointVerified:false, alteredParts:[7,8], originalBytesAvailable:true,
    affectedPartsRecoverable:false, automatedRecoveryExhausted:false
  });
  assert.equal(plan.action,"restart-transfer-internally");
  assert.equal(plan.contactUser,false);
  assert.equal(plan.preserveVerifiedParts,false);
});

test("user contact occurs only when automatic recovery is exhausted", () => {
  const plan = new IntegrityRecoverySupervisor().plan("t3","l3",{
    checkpointVerified:false, alteredParts:[7], originalBytesAvailable:false,
    affectedPartsRecoverable:false, automatedRecoveryExhausted:true
  });
  assert.equal(plan.action,"contact-user-last-resort");
  assert.equal(plan.automatic,false);
  assert.equal(plan.contactUser,true);
});
