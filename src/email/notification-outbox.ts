import type { RecoveryEmail } from "./recovery-email-port.js";
export interface NotificationOutboxEntry { key:string; message:RecoveryEmail; status:"pending"|"sending"|"sent"; }
export interface NotificationOutbox {
 reserve(key:string,message:RecoveryEmail):Promise<{entry:NotificationOutboxEntry;created:boolean}>;
 claim(key:string):Promise<NotificationOutboxEntry|null>;
 release(key:string):Promise<void>;
 markSent(key:string):Promise<void>;
 get(key:string):Promise<NotificationOutboxEntry|null>;
}
