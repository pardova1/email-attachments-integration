import type {RecoveryEmail,RecoveryEmailPort} from "./recovery-email-port.js";
import type {NotificationOutbox} from "./notification-outbox.js";
export class IdempotentEmailDispatcher {
 constructor(private readonly outbox:NotificationOutbox,private readonly email:RecoveryEmailPort){}
 async send(key:string,message:RecoveryEmail){
  const {entry}=await this.outbox.reserve(key,message);
  if(entry.status==="sent")return {sent:false,deduplicated:true};
  if(entry.status==="reconciliation-required")throw new Error("NOTIFICATION_RECONCILIATION_REQUIRED");
  const claimed=await this.outbox.claim(key);
  if(!claimed){if((await this.outbox.get(key))?.status==="reconciliation-required")throw new Error("NOTIFICATION_RECONCILIATION_REQUIRED");return {sent:false,deduplicated:true};}
  try{
   await this.email.send(claimed.message,{idempotencyKey:key,firstAttemptAt:claimed.firstAttemptAt,retryUntil:claimed.retryUntil});
   await this.outbox.markSent(key,claimed.claimToken);return {sent:true,deduplicated:false};
  }catch(error){await this.outbox.release(key,claimed.claimToken);throw error;}
 }
}
