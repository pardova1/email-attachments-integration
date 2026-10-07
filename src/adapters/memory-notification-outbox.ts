import type { NotificationOutbox, NotificationOutboxEntry } from "../email/notification-outbox.js";
import type { RecoveryEmail } from "../email/recovery-email-port.js";
export class MemoryNotificationOutbox implements NotificationOutbox {
 private readonly entries=new Map<string,NotificationOutboxEntry>();
 async reserve(key:string,message:RecoveryEmail){const prior=this.entries.get(key);if(prior)return {entry:structuredClone(prior),created:false};const entry:NotificationOutboxEntry={key,message:structuredClone(message),status:"pending"};this.entries.set(key,entry);return {entry:structuredClone(entry),created:true};}
 async markSent(key:string){const e=this.entries.get(key);if(!e)throw new Error("NOTIFICATION_OUTBOX_ENTRY_NOT_FOUND");e.status="sent";}
 async get(key:string){const e=this.entries.get(key);return e?structuredClone(e):null;}
}
