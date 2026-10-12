export interface RecoveryEmail {
  recipient: string;
  subject: string;
  text: string;
}
export interface RecoveryEmailSendContext { idempotencyKey:string; firstAttemptAt?:string; retryUntil?:string; signal?:AbortSignal; }
export interface RecoveryEmailPort {
  send(message: RecoveryEmail, context?:RecoveryEmailSendContext): Promise<void>;
}
