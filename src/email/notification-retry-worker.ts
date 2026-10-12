import {assertNotificationBatch,type NotificationOutbox} from "./notification-outbox.js";
import type {IdempotentEmailDispatcher} from "./idempotent-email-dispatcher.js";
export interface NotificationRetryResult {scanned:number;sent:number;failed:number;reconciliationRequired:number;skipped:boolean;}
// Pages saved events fairly, then uses the same atomic claim and provider key
// as immediate dispatch. This worker never reserves a new email from old input.
export class NotificationRetryWorker {
 private afterKey?:string;
 private running=false;
 private active?:AbortController;
 private started=false;
 constructor(private readonly outbox:NotificationOutbox,private readonly dispatcher:Pick<IdempotentEmailDispatcher,"retry">,private readonly batchSize=25,private readonly timeoutMs=30_000){
  assertNotificationBatch(new Date(),batchSize);
  if(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>300_000)throw new Error("INVALID_NOTIFICATION_WORKER_TIMEOUT");
 }
 async runOnce(cutoff=new Date(),external?:AbortSignal):Promise<NotificationRetryResult>{
  assertNotificationBatch(cutoff,this.batchSize);external?.throwIfAborted();
  if(this.running)return {scanned:0,sent:0,failed:0,reconciliationRequired:0,skipped:true};
  this.running=true;const controller=new AbortController();this.active=controller;
  const signal=external?AbortSignal.any([external,controller.signal]):controller.signal;
  let aborted!:()=>void;
  const cancelled=new Promise<never>((_resolve,reject)=>{aborted=()=>reject(signal.reason);signal.addEventListener("abort",aborted,{once:true});});
  const timer=setTimeout(()=>controller.abort(new Error("NOTIFICATION_BATCH_TIMEOUT")),this.timeoutMs);
  try{
   return await Promise.race([(async()=>{
    const keys=await this.outbox.listRetryCandidates(new Date(cutoff),this.batchSize,this.afterKey,signal);signal.throwIfAborted();
    if(!Array.isArray(keys)||keys.length>this.batchSize||keys.some(key=>typeof key!=="string"||!key)||new Set(keys).size!==keys.length)throw new Error("INVALID_NOTIFICATION_BATCH_RESPONSE");
    let sent=0,failed=0,reconciliationRequired=0;
    for(const key of keys){
     signal.throwIfAborted();
     try{if((await this.dispatcher.retry(key,signal)).sent)sent++;}
     catch(error){signal.throwIfAborted();if(error instanceof Error&&["NOTIFICATION_RECONCILIATION_REQUIRED","CUSTOMER_EMAIL_RECONCILIATION_REQUIRED"].includes(error.message))reconciliationRequired++;else failed++;}
     signal.throwIfAborted();this.afterKey=key;
    }
    if(!keys.length)this.afterKey=undefined;
    return {scanned:keys.length,sent,failed,reconciliationRequired,skipped:false};
   })(),cancelled]);
  }finally{clearTimeout(timer);signal.removeEventListener("abort",aborted);if(this.active===controller)this.active=undefined;this.running=false;}
 }
 start(intervalMs=30_000,report:(result:NotificationRetryResult|undefined)=>void=()=>{}){
  if(!Number.isInteger(intervalMs)||intervalMs<1000||intervalMs>300_000)throw new Error("INVALID_NOTIFICATION_RETRY_INTERVAL");
  if(this.started)throw new Error("NOTIFICATION_WORKER_ALREADY_STARTED");this.started=true;
  const publish=(result:NotificationRetryResult|undefined)=>{try{report(result);}catch{ /* Reporting cannot stop queue recovery. */ }};
  let stopped=false,timer:ReturnType<typeof setTimeout>|undefined;
  const tick=async()=>{
   try{const result=await this.runOnce();if(!stopped)publish(result);}catch{if(!stopped)publish(undefined);}
   finally{if(!stopped){timer=setTimeout(()=>{void tick();},intervalMs);timer.unref();}}
  };
  void tick();
  return ()=>{if(stopped)return;stopped=true;this.started=false;if(timer)clearTimeout(timer);this.active?.abort(new Error("NOTIFICATION_WORKER_STOPPED"));};
 }
}
