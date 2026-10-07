import type { RecoveryDecision } from "../operations/transfer-diagnostic-recovery-agent.js";
import type { IdempotentEmailDispatcher } from "./idempotent-email-dispatcher.js";
export interface TransferParticipants { senderEmail:string; receiverEmail?:string; }
export class RecoveryEmailDispatcher {
  constructor(private readonly email:IdempotentEmailDispatcher){}
  async dispatch(eventKey:string,decision:RecoveryDecision,people:TransferParticipants){
    if(decision.receiverNotice&&!people.receiverEmail)throw new Error("RECEIVER_EMAIL_REQUIRED_FOR_RECOVERY_NOTICE");
    const deliveries:Promise<unknown>[]=[];
    if(decision.senderNotice)deliveries.push(this.email.send(`recovery:${eventKey}:sender:${people.senderEmail}`,{recipient:people.senderEmail,subject:"Transfer action required",text:decision.senderNotice}));
    if(decision.receiverNotice)deliveries.push(this.email.send(`recovery:${eventKey}:receiver:${people.receiverEmail!}`,{recipient:people.receiverEmail!,subject:"Download action required",text:decision.receiverNotice}));
    await Promise.all(deliveries);return {sent:deliveries.length};
  }
}
