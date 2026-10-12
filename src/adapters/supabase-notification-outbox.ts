import {assertNotificationBatch,NOTIFICATION_RETRY_WINDOW_MS} from "../email/notification-outbox.js";
import type {NotificationOutbox,NotificationOutboxEntry,NotificationOutboxClaim} from "../email/notification-outbox.js";
import type {RecoveryEmail} from "../email/recovery-email-port.js";
type Row={notification_key:string;recipient:string;subject:string;body_text:string;status:NotificationOutboxEntry["status"];first_attempt_at?:string|null;retry_until?:string|null;claim_token?:string|null;claim_expires_at?:string|null};
const columns="notification_key,recipient,subject,body_text,status,first_attempt_at,retry_until,claim_token,claim_expires_at";
export class SupabaseNotificationOutbox implements NotificationOutbox {
 constructor(private readonly url:string,private readonly secretKey:string,private readonly request:typeof fetch=globalThis.fetch){}
 private headers(){return {apikey:this.secretKey,Authorization:`Bearer ${this.secretKey}`,"content-type":"application/json"};}
 private entry(row:Row,key:string):NotificationOutboxEntry{
  if(!row||row.notification_key!==key||typeof row.recipient!=="string"||typeof row.subject!=="string"||typeof row.body_text!=="string"||!["pending","sending","sent","reconciliation-required"].includes(row.status))throw new Error("INVALID_NOTIFICATION_OUTBOX_RESPONSE");
  return {key:row.notification_key,message:{recipient:row.recipient,subject:row.subject,text:row.body_text},status:row.status,...(row.first_attempt_at?{firstAttemptAt:row.first_attempt_at}:{}),...(row.retry_until?{retryUntil:row.retry_until}:{}),...(row.claim_token?{claimToken:row.claim_token}:{}),...(row.claim_expires_at?{claimExpiresAt:row.claim_expires_at}:{})};
 }
 private async rows(path:string,init:RequestInit,error:string):Promise<Row[]>{
  const response=await this.request(`${this.url}/rest/v1/${path}`,{...init,headers:{...this.headers(),...init.headers},redirect:"error",credentials:"omit",cache:"no-store"});
  if(!response.ok||response.redirected){if(response.body)void response.body.cancel().catch(()=>{});throw new Error(error);}
  try{const value=await response.json();if(!Array.isArray(value))throw new Error(error);return value as Row[];}catch{throw new Error(error);}
 }
 async reserve(key:string,message:RecoveryEmail){
  const rows=await this.rows("notification_outbox?on_conflict=notification_key",{method:"POST",headers:{Prefer:"resolution=ignore-duplicates,return=representation"},body:JSON.stringify({notification_key:key,recipient:message.recipient,subject:message.subject,body_text:message.text,status:"pending"})},"NOTIFICATION_OUTBOX_RESERVE_FAILED");
  if(rows[0])return {entry:this.entry(rows[0],key),created:true};const prior=await this.get(key);if(!prior)throw new Error("NOTIFICATION_OUTBOX_RESERVE_FAILED");return {entry:prior,created:false};
 }
 async listRetryCandidates(cutoff:Date,limit:number,afterKey?:string,signal?:AbortSignal){
  signal?.throwIfAborted();assertNotificationBatch(cutoff,limit);
  const query=new URLSearchParams({select:"notification_key",order:"notification_key.asc",limit:String(limit),or:`(status.eq.pending,and(status.eq.sending,claim_expires_at.lte.${cutoff.toISOString()}))`});
  if(afterKey!==undefined)query.set("notification_key",`gt.${afterKey}`);
  const rows=await this.rows(`notification_outbox?${query}`,{signal},"NOTIFICATION_OUTBOX_READ_FAILED");signal?.throwIfAborted();
  if(rows.length>limit||rows.some(row=>!row||typeof row.notification_key!=="string"||!row.notification_key)||new Set(rows.map(row=>row.notification_key)).size!==rows.length)throw new Error("INVALID_NOTIFICATION_OUTBOX_RESPONSE");
  return rows.map(row=>row.notification_key);
 }
 async claim(key:string,signal?:AbortSignal):Promise<NotificationOutboxClaim|null>{
  const rows=await this.rows("rpc/claim_notification_v2",{method:"POST",body:JSON.stringify({p_notification_key:key}),signal},"NOTIFICATION_OUTBOX_CLAIM_FAILED");
  if(!rows[0])return null;const entry=this.entry(rows[0],key);
  if(entry.status!=="sending"||!entry.claimToken||!entry.firstAttemptAt||!entry.retryUntil||!entry.claimExpiresAt||[entry.firstAttemptAt,entry.retryUntil,entry.claimExpiresAt].some(value=>!Number.isFinite(Date.parse(value))))throw new Error("INVALID_NOTIFICATION_OUTBOX_CLAIM");
  const first=Date.parse(entry.firstAttemptAt),until=Date.parse(entry.retryUntil),expires=Date.parse(entry.claimExpiresAt),now=Date.now();
  if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(entry.claimToken)||first>now||until<=first||until-first>NOTIFICATION_RETRY_WINDOW_MS||expires<=now||expires>until)throw new Error("INVALID_NOTIFICATION_OUTBOX_CLAIM");
  return entry as NotificationOutboxClaim;
 }
 async release(key:string,claimToken:string){await this.rows("rpc/release_notification_v2",{method:"POST",body:JSON.stringify({p_notification_key:key,p_claim_token:claimToken})},"NOTIFICATION_OUTBOX_RELEASE_FAILED");}
 async markSent(key:string,claimToken:string){
  const rows=await this.rows("rpc/mark_notification_sent_v2",{method:"POST",body:JSON.stringify({p_notification_key:key,p_claim_token:claimToken})},"NOTIFICATION_OUTBOX_MARK_SENT_FAILED");
  if(!rows[0]||this.entry(rows[0],key).status!=="sent")throw new Error("NOTIFICATION_CLAIM_NOT_CURRENT");
 }
 async get(key:string,signal?:AbortSignal){signal?.throwIfAborted();const rows=await this.rows(`notification_outbox?notification_key=eq.${encodeURIComponent(key)}&select=${columns}`,{signal},"NOTIFICATION_OUTBOX_READ_FAILED");return rows[0]?this.entry(rows[0],key):null;}
}
