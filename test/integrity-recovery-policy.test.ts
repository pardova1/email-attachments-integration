import assert from "node:assert/strict";
import test from "node:test";
import { IntegrityRecoveryPolicy } from "../src/integrity/integrity-recovery-policy.js";

const policy = new IntegrityRecoveryPolicy();

test("untouched verified transfer continues", () => {
  assert.equal(policy.decide({ checkpointVerified:true, alteredParts:[], originalBytesAvailable:true, affectedPartsRecoverable:true, automatedRecoveryExhausted:false }), "continue-from-verified-checkpoint");
});

test("altered recoverable parts are retransmitted automatically", () => {
  assert.equal(policy.decide({ checkpointVerified:false, alteredParts:[4], originalBytesAvailable:true, affectedPartsRecoverable:true, automatedRecoveryExhausted:false }), "retransmit-affected-parts");
});

test("agent may restart internally when partial repair is unsafe", () => {
  assert.equal(policy.decide({ checkpointVerified:false, alteredParts:[4,5], originalBytesAvailable:true, affectedPartsRecoverable:false, automatedRecoveryExhausted:false }), "restart-transfer-internally");
});

test("user contact is last resort", () => {
  assert.equal(policy.decide({ checkpointVerified:false, alteredParts:[4], originalBytesAvailable:false, affectedPartsRecoverable:false, automatedRecoveryExhausted:true }), "contact-user-last-resort");
});
