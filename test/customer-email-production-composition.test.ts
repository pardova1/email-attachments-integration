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
