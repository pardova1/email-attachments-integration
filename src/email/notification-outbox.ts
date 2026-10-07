import type { RecoveryEmail } from "./recovery-email-port.js";
export interface NotificationOutboxEntry { key:string; message:RecoveryEmail; status:"pending"|"sent"; }
export interface NotificationOutbox {
  reserve(key:string,message:RecoveryEmail):Promise<{entry:NotificationOutboxEntry;created:boolean}>;
  markSent(key:string):Promise<void>;
  get(key:string):Promise<NotificationOutboxEntry|null>;
}
