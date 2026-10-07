import assert from "node:assert/strict"; import test from "node:test";
import { createLicensePaymentApplicationRepository } from "../src/config/license-payment-application-factory.js";
import { MemoryLicenseRepository } from "../src/adapters/memory-license-repository.js";
import { MemoryLicensePaymentApplicationRepository } from "../src/adapters/memory-license-payment-application-repository.js";
import { SupabaseLicensePaymentApplicationRepository } from "../src/adapters/supabase-license-payment-application-repository.js";
test("development composition uses memory payment idempotency",()=>{const r=createLicensePaymentApplicationRepository(new MemoryLicenseRepository(),{NODE_ENV:"test"});assert.ok(r instanceof MemoryLicensePaymentApplicationRepository);});
test("production composition requires durable payment idempotency configuration",()=>{assert.throws(()=>createLicensePaymentApplicationRepository(new MemoryLicenseRepository(),{NODE_ENV:"production"}),/DURABLE_PAYMENT_IDEMPOTENCY_NOT_CONFIGURED/);});
test("production composition uses Supabase atomic payment application repository",()=>{const r=createLicensePaymentApplicationRepository(new MemoryLicenseRepository(),{NODE_ENV:"production",SUPABASE_URL:"https://example.invalid",SUPABASE_SECRET_KEY:"secret"});assert.ok(r instanceof SupabaseLicensePaymentApplicationRepository);});
