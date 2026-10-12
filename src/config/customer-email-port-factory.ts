import {ResendCustomerEmailAdapter} from "../adapters/resend-customer-email-adapter.js";
import type { RecoveryEmailPort } from "../email/recovery-email-port.js";
import { UnavailableRecoveryEmailAdapter } from "../adapters/unavailable-recovery-email-adapter.js";

export function createCustomerEmailPort(env: NodeJS.ProcessEnv = process.env, request:typeof fetch=globalThis.fetch): RecoveryEmailPort {
  const provider=env.CUSTOMER_EMAIL_PROVIDER?.trim();
  if(provider!==undefined){
    if(provider!=="resend")throw new Error("UNSUPPORTED_CUSTOMER_EMAIL_PROVIDER");
    const key=env.RESEND_API_KEY,from=env.CUSTOMER_EMAIL_FROM;
    if(!key||!from)throw new Error("CUSTOMER_EMAIL_PROVIDER_NOT_CONFIGURED");
    return new ResendCustomerEmailAdapter(key,from,request,env.CUSTOMER_EMAIL_TIMEOUT_MS===undefined?10_000:Number(env.CUSTOMER_EMAIL_TIMEOUT_MS));
  }
  if (env.NODE_ENV === "production") throw new Error("CUSTOMER_EMAIL_PROVIDER_NOT_CONFIGURED");
  return new UnavailableRecoveryEmailAdapter();
}
