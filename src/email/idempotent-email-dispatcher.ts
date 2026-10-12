import type {RecoveryEmail,RecoveryEmailPort} from "./recovery-email-port.js";
import type {NotificationOutbox,NotificationOutboxEntry} from "./notification-outbox.js";
export class IdempotentEmailDispatcher {
 constructor(private readonly outbox:NotificationOutbox,private readonly email:RecoveryEmailPort){}
 async send(key:string,message:RecoveryEmail){
  const {entry}=await this.outbox.reserve(key,message);
  return this.dispatch(key,entry);
 }
 async retry(key:string,signal?:AbortSignal){
  signal?.throwIfAborted();const entry=await this.outbox.get(key,signal);signal?.throwIfAborted();
  if(!entry)throw new Error("NOTIFICATION_OUTBOX_ENTRY_NOT_FOUND");
  return this.dispatch(key,entry,signal);
 }
 private async dispatch(key:string,entry:NotificationOutboxEntry,signal?:AbortSignal){
  signal?.throwIfAborted();
  if(entry.status==="sent")return {sent:false,deduplicated:true};
  if(entry.status==="reconciliation-required")throw new Error("NOTIFICATION_RECONCILIATION_REQUIRED");
  const claimed=await this.outbox.claim(key,signal);
  signal?.throwIfAborted();
  if(!claimed){if((await this.outbox.get(key,signal))?.status==="reconciliation-required")throw new Error("NOTIFICATION_RECONCILIATION_REQUIRED");return {sent:false,deduplicated:true};}
  try{
   await this.email.send(claimed.message,{idempotencyKey:key,firstAttemptAt:claimed.firstAttemptAt,retryUntil:claimed.retryUntil,signal});
   signal?.throwIfAborted();
   await this.outbox.markSent(key,claimed.claimToken);return {sent:true,deduplicated:false};
  }catch(error){await this.outbox.release(key,claimed.claimToken);throw error;}
 }
}
