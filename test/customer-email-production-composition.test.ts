import assert from "node:assert/strict";
import test from "node:test";
import { createCustomerEmailPort } from "../src/config/customer-email-port-factory.js";
import { UnavailableRecoveryEmailAdapter } from "../src/adapters/unavailable-recovery-email-adapter.js";

test("development customer email composition remains explicitly unavailable", () => {
  assert.ok(createCustomerEmailPort({ NODE_ENV: "development" }) instanceof UnavailableRecoveryEmailAdapter);
});

test("production customer email composition fails closed without a selected provider", () => {
  assert.throws(() => createCustomerEmailPort({ NODE_ENV: "production" }), /CUSTOMER_EMAIL_PROVIDER_NOT_CONFIGURED/);
});

test("selected Resend provider is available to production composition with server-only configuration",async()=>{
 const {ResendCustomerEmailAdapter}=await import("../src/adapters/resend-customer-email-adapter.js");
 const adapter=createCustomerEmailPort({NODE_ENV:"production",CUSTOMER_EMAIL_PROVIDER:"resend",RESEND_API_KEY:"re_synthetic_test_key",CUSTOMER_EMAIL_FROM:"bridge@example.com"},async()=>new Response(JSON.stringify({id:"synthetic"}),{headers:{"content-type":"application/json"}}));
 assert.ok(adapter instanceof ResendCustomerEmailAdapter);await adapter.send({recipient:"receiver@example.com",subject:"Test",text:"Synthetic"},{idempotencyKey:"synthetic-event",firstAttemptAt:new Date().toISOString(),retryUntil:new Date(Date.now()+3600000).toISOString()});
});
test("missing unknown and malformed production email configuration stays unavailable",()=>{
 for(const config of [{CUSTOMER_EMAIL_PROVIDER:"unknown"},{CUSTOMER_EMAIL_PROVIDER:"resend"},{CUSTOMER_EMAIL_PROVIDER:"resend",RESEND_API_KEY:"bad",CUSTOMER_EMAIL_FROM:"bridge@example.com"},{CUSTOMER_EMAIL_PROVIDER:"resend",RESEND_API_KEY:"re_synthetic_test_key",CUSTOMER_EMAIL_FROM:"bridge@example.com",CUSTOMER_EMAIL_TIMEOUT_MS:"0"}])assert.throws(()=>createCustomerEmailPort({NODE_ENV:"production",...config}));
});
