import assert from "node:assert/strict"; import test from "node:test";
import { FinancialCustomerEmailDispatcher } from "../src/billing/financial-customer-email-dispatcher.js";
import type { RecoveryEmail, RecoveryEmailPort } from "../src/email/recovery-email-port.js";
import { MemoryNotificationOutbox } from "../src/adapters/memory-notification-outbox.js";
import { IdempotentEmailDispatcher } from "../src/email/idempotent-email-dispatcher.js";

class Capture implements RecoveryEmailPort { sent:RecoveryEmail[]=[]; async send(m:RecoveryEmail){this.sent.push(m);} }
test("successful purchaser receives license confirmation",async()=>{const c=new Capture(),d=new FinancialCustomerEmailDispatcher(new IdempotentEmailDispatcher(new MemoryNotificationOutbox(),c));await d.sendPurchaseConfirmation("payment-1","buyer@example.com",{userId:"u1",plan:"individual",licenseName:"Personal",startsAt:new Date("2026-01-01T00:00:00Z"),expiresAt:new Date("2027-01-01T00:00:00Z"),amountPaidUsdCents:400,status:"active"});assert.equal(c.sent[0].recipient,"buyer@example.com");assert.match(c.sent[0].subject,/Payment confirmed/);assert.match(c.sent[0].text,/individual license is active/);});
test("failed purchaser receives failure explanation and no success language",async()=>{const c=new Capture(),d=new FinancialCustomerEmailDispatcher(new IdempotentEmailDispatcher(new MemoryNotificationOutbox(),c));await d.sendPaymentFailure("payment-2","buyer@example.com");assert.equal(c.sent[0].recipient,"buyer@example.com");assert.match(c.sent[0].subject,/Payment not completed/);assert.match(c.sent[0].text,/no license was activated/);assert.doesNotMatch(c.sent[0].text,/payment was confirmed/i);});
