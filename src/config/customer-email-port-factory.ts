import type { RecoveryEmailPort } from "../email/recovery-email-port.js";
import { UnavailableRecoveryEmailAdapter } from "../adapters/unavailable-recovery-email-adapter.js";

export function createCustomerEmailPort(env: NodeJS.ProcessEnv = process.env): RecoveryEmailPort {
  if (env.NODE_ENV === "production") throw new Error("CUSTOMER_EMAIL_PROVIDER_NOT_CONFIGURED");
  return new UnavailableRecoveryEmailAdapter();
}
