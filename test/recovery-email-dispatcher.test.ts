import assert from "node:assert/strict";
import test from "node:test";
import { RecoveryEmailDispatcher } from "../src/email/recovery-email-dispatcher.js";
import type { RecoveryEmail, RecoveryEmailPort } from "../src/email/recovery-email-port.js";
import { MemoryNotificationOutbox } from "../src/adapters/memory-notification-outbox.js";
import { IdempotentEmailDispatcher } from "../src/email/idempotent-email-dispatcher.js";

import { TransferDiagnosticRecoveryAgent } from "../src/operations/transfer-diagnostic-recovery-agent.js";
class Capture implements RecoveryEmailPort { sent:RecoveryEmail[]=[]; async send(m:RecoveryEmail){this.sent.push(m);} }
test("sender fault emails only sender with corrective guidance",async()=>{const c=new Capture(),d=new RecoveryEmailDispatcher(new IdempotentEmailDispatcher(new MemoryNotificationOutbox(),c)),a=new TransferDiagnosticRecoveryAgent();await d.dispatch("transfer-event-1",a.analyze({code:"SENDER_AUTHENTICATION_REQUIRED",scope:"transfer",owner:"sender"}),{senderEmail:"sender@example.com",receiverEmail:"receiver@example.com"});assert.equal(c.sent.length,1);assert.equal(c.sent[0].recipient,"sender@example.com");assert.match(c.sent[0].text,/sign in again/i);});
test("receiver fault emails sender and receiver separately",async()=>{const c=new Capture(),d=new RecoveryEmailDispatcher(new IdempotentEmailDispatcher(new MemoryNotificationOutbox(),c)),a=new TransferDiagnosticRecoveryAgent();await d.dispatch("transfer-event-1",a.analyze({code:"TRANSFER_EXPIRED",scope:"transfer",owner:"receiver"}),{senderEmail:"sender@example.com",receiverEmail:"receiver@example.com"});assert.deepEqual(c.sent.map(x=>x.recipient),["sender@example.com","receiver@example.com"]);assert.match(c.sent[0].text,/expired/i);assert.match(c.sent[1].text,/expired/i);});
test("receiver notice cannot be falsely reported sent without receiver address",async()=>{const c=new Capture(),d=new RecoveryEmailDispatcher(new IdempotentEmailDispatcher(new MemoryNotificationOutbox(),c)),a=new TransferDiagnosticRecoveryAgent();await assert.rejects(()=>d.dispatch("transfer-event-1",a.analyze({code:"TRANSFER_EXPIRED",scope:"transfer",owner:"receiver"}),{senderEmail:"sender@example.com"}),/RECEIVER_EMAIL_REQUIRED/);assert.equal(c.sent.length,0);});
