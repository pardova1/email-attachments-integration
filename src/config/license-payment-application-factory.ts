import type { LicensePaymentApplicationRepository } from "../billing/license-payment-application-repository.js";
import type { LicenseRepository } from "../billing/license-repository.js";
import { MemoryLicensePaymentApplicationRepository } from "../adapters/memory-license-payment-application-repository.js";
import { SupabaseLicensePaymentApplicationRepository } from "../adapters/supabase-license-payment-application-repository.js";

export function createLicensePaymentApplicationRepository(
  licenses:LicenseRepository,
  env:NodeJS.ProcessEnv=process.env
):LicensePaymentApplicationRepository{
  const url=env.SUPABASE_URL;
  const secretKey=env.SUPABASE_SECRET_KEY;
  if(url&&secretKey) return new SupabaseLicensePaymentApplicationRepository(url,secretKey);
  if(env.NODE_ENV==="production") throw new Error("DURABLE_PAYMENT_IDEMPOTENCY_NOT_CONFIGURED");
  return new MemoryLicensePaymentApplicationRepository(licenses);
}
