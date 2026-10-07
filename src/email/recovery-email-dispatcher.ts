import type { RecoveryDecision } from "../operations/transfer-diagnostic-recovery-agent.js";
import type { RecoveryEmailPort } from "./recovery-email-port.js";

export interface TransferParticipants { senderEmail:string; receiverEmail?:string; }

export class RecoveryEmailDispatcher {
  constructor(private readonly email:RecoveryEmailPort){}
  async dispatch(decision:RecoveryDecision, people:TransferParticipants){
    if(decision.receiverNotice && !people.receiverEmail) throw new Error("RECEIVER_EMAIL_REQUIRED_FOR_RECOVERY_NOTICE");
    const deliveries:Promise<void>[]=[];
    if(decision.senderNotice) deliveries.push(this.email.send({recipient:people.senderEmail,subject:"Transfer action required",text:decision.senderNotice}));
    if(decision.receiverNotice) deliveries.push(this.email.send({recipient:people.receiverEmail!,subject:"Download action required",text:decision.receiverNotice}));
    await Promise.all(deliveries);
    return {sent:deliveries.length};
  }
}
