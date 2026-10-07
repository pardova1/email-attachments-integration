import type { RecoveryEmail, RecoveryEmailPort } from "./recovery-email-port.js";
import type { NotificationOutbox } from "./notification-outbox.js";
export class IdempotentEmailDispatcher {
 constructor(private readonly outbox:NotificationOutbox,private readonly email:RecoveryEmailPort){}
 async send(key:string,message:RecoveryEmail){
  const {entry}=await this.outbox.reserve(key,message);
  if(entry.status==="sent") return {sent:false,deduplicated:true};
  await this.email.send(entry.message);
  await this.outbox.markSent(key);
  return {sent:true,deduplicated:false};
 }
}
