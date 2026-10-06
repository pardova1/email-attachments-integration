import type { RecoveryEmail, RecoveryEmailPort } from "../email/recovery-email-port.js";
export class UnavailableRecoveryEmailAdapter implements RecoveryEmailPort {
  async send(_message:RecoveryEmail):Promise<void>{ throw new Error("RECOVERY_EMAIL_PROVIDER_NOT_CONFIGURED"); }
}
