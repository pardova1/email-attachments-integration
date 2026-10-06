import assert from "node:assert/strict";
import test from "node:test";
import { TransferDiagnosticRecoveryAgent } from "../src/operations/transfer-diagnostic-recovery-agent.js";
const agent=new TransferDiagnosticRecoveryAgent();
test("sender fault gives sender a safe corrective solution only",()=>{const r=agent.analyze({code:"SENDER_AUTHENTICATION_REQUIRED",scope:"transfer",owner:"sender"});assert.match(r.senderNotice!,/sign in again/i);assert.equal(r.receiverNotice,undefined);assert.equal(r.continueUnrelatedTransfers,true);});
test("receiver fault notifies both sender and receiver with solution",()=>{const r=agent.analyze({code:"TRANSFER_EXPIRED",scope:"transfer",owner:"receiver"});assert.match(r.senderNotice!,/expired/i);assert.match(r.receiverNotice!,/expired/i);assert.equal(r.continueUnrelatedTransfers,true);});
test("system fault chooses safe retry only when explicitly available",()=>{assert.equal(agent.analyze({code:"TEMPORARY_BACKEND_FAILURE",scope:"transfer",owner:"system",safeRetryAvailable:true}).action,"retry-safe-operation");assert.equal(agent.analyze({code:"CONFIGURATION_MISSING",scope:"application",owner:"system"}).action,"operator-repair");});
