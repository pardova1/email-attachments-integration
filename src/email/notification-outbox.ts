import type {RecoveryEmail} from "./recovery-email-port.js";
export const NOTIFICATION_CLAIM_LEASE_MS=2*60*1000;
// Stay inside Resend's 24-hour window, allowing an hour for timing uncertainty.
export const NOTIFICATION_RETRY_WINDOW_MS=23*60*60*1000;
export interface NotificationOutboxEntry {
 key:string;message:RecoveryEmail;status:"pending"|"sending"|"sent"|"reconciliation-required";
 firstAttemptAt?:string;retryUntil?:string;claimToken?:string;claimExpiresAt?:string;
}
export interface NotificationOutboxClaim extends NotificationOutboxEntry {
 status:"sending";firstAttemptAt:string;retryUntil:string;claimToken:string;claimExpiresAt:string;
}
export interface NotificationOutbox {
 reserve(key:string,message:RecoveryEmail):Promise<{entry:NotificationOutboxEntry;created:boolean}>;
 listRetryCandidates(cutoff:Date,limit:number,afterKey?:string,signal?:AbortSignal):Promise<string[]>;
 claim(key:string,signal?:AbortSignal):Promise<NotificationOutboxClaim|null>;
 release(key:string,claimToken:string):Promise<void>;
 markSent(key:string,claimToken:string):Promise<void>;
 get(key:string,signal?:AbortSignal):Promise<NotificationOutboxEntry|null>;
}

export function assertNotificationBatch(cutoff:Date,limit:number){
 if(!Number.isFinite(cutoff.getTime())||!Number.isInteger(limit)||limit<1||limit>100)throw new Error("INVALID_NOTIFICATION_BATCH");
}
