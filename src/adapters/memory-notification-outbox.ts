import {randomUUID} from "node:crypto";
import {assertNotificationBatch,NOTIFICATION_CLAIM_LEASE_MS,NOTIFICATION_RETRY_WINDOW_MS,type NotificationOutbox,type NotificationOutboxEntry,type NotificationOutboxClaim} from "../email/notification-outbox.js";
import type {RecoveryEmail} from "../email/recovery-email-port.js";
export class MemoryNotificationOutbox implements NotificationOutbox {
 private readonly entries=new Map<string,NotificationOutboxEntry>();
 constructor(private readonly clock=()=>new Date()){}
 async reserve(key:string,message:RecoveryEmail){
  const prior=this.entries.get(key);if(prior)return {entry:structuredClone(prior),created:false};
  const entry:NotificationOutboxEntry={key,message:structuredClone(message),status:"pending"};this.entries.set(key,entry);return {entry:structuredClone(entry),created:true};
 }
 async listRetryCandidates(cutoff:Date,limit:number,afterKey?:string,signal?:AbortSignal){
  signal?.throwIfAborted();assertNotificationBatch(cutoff,limit);
  return [...this.entries.values()].filter(entry=>(afterKey===undefined||entry.key>afterKey)&&(entry.status==="pending"||entry.status==="sending"&&Date.parse(entry.claimExpiresAt??"")<=cutoff.getTime())).map(entry=>entry.key).sort().slice(0,limit);
 }
 async claim(key:string,signal?:AbortSignal){
  signal?.throwIfAborted();
  const entry=this.entries.get(key),now=this.clock().getTime();
  if(!Number.isFinite(now))throw new Error("INVALID_NOTIFICATION_CLOCK");
  if(!entry||entry.status==="sent"||entry.status==="reconciliation-required")return null;
  if(entry.status==="sending"&&Date.parse(entry.claimExpiresAt??"")>now)return null;
  if(entry.firstAttemptAt&&(!entry.retryUntil||Date.parse(entry.retryUntil)<=now)||entry.status==="sending"&&!entry.firstAttemptAt){entry.status="reconciliation-required";delete entry.claimToken;delete entry.claimExpiresAt;return null;}
  entry.firstAttemptAt??=new Date(now).toISOString();entry.retryUntil??=new Date(now+NOTIFICATION_RETRY_WINDOW_MS).toISOString();
  entry.status="sending";entry.claimToken=randomUUID();entry.claimExpiresAt=new Date(Math.min(now+NOTIFICATION_CLAIM_LEASE_MS,Date.parse(entry.retryUntil))).toISOString();
  return structuredClone(entry) as NotificationOutboxClaim;
 }
 async release(key:string,claimToken:string){
  const entry=this.entries.get(key);if(entry?.status==="sending"&&entry.claimToken===claimToken){entry.status="pending";delete entry.claimToken;delete entry.claimExpiresAt;}
 }
 async markSent(key:string,claimToken:string){
  const entry=this.entries.get(key);if(entry?.status!=="sending"||entry.claimToken!==claimToken)throw new Error("NOTIFICATION_CLAIM_NOT_CURRENT");
  entry.status="sent";delete entry.claimToken;delete entry.claimExpiresAt;
 }
 async get(key:string,signal?:AbortSignal){signal?.throwIfAborted();const entry=this.entries.get(key);return entry?structuredClone(entry):null;}
}
