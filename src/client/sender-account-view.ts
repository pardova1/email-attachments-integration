import {BillingClient} from "./billing-client.js";
import {mountSessionBilling,type SessionBillingOptions} from "./billing-session-view.js";
import {mountSessionConnectionAssistance,type ConnectionApplicationSession,type SessionConnectionOptions} from "./connection-session-view.js";
export interface SenderAccountOptions {
 apiOrigin:string;
 request?:typeof fetch;
 billing?:Omit<SessionBillingOptions,"apiBase">;
 connection?:Omit<SessionConnectionOptions,"apiBase">;
}
// One host-session composition. Preflight is a UI check, never transfer authority.
export function mountSenderAccount(container:HTMLElement,session:ConnectionApplicationSession,options:SenderAccountOptions){
 const origin=new URL(options.apiOrigin);
 if(origin.protocol!=="https:"||origin.origin!==options.apiOrigin||origin.username||origin.password)throw new Error("INVALID_SENDER_ACCOUNT_ORIGIN");
 let disposed=false,generation=0,pending:AbortController|undefined;
 const current=()=>{try{const id=session.currentCustomer();return typeof id==="string"&&id.trim()===id&&id.length>0&&id.length<=200&&!/[\x00-\x1f\x7f]/.test(id)?id:undefined;}catch{return undefined;}};
 let scope=current();
 const doc=container.ownerDocument,root=doc.createElement("div"),billingNode=doc.createElement("section"),connectionNode=doc.createElement("section");
 billingNode.setAttribute("data-sender-billing","");connectionNode.setAttribute("data-sender-connection","");root.append(billingNode,connectionNode);
 const billing=mountSessionBilling(billingNode,session,{...options.billing,apiBase:`${origin.origin}/v1/billing`,request:options.billing?.request??options.request});
 let connection:ReturnType<typeof mountSessionConnectionAssistance>;
 try{connection=mountSessionConnectionAssistance(connectionNode,session,{...options.connection,apiBase:`${origin.origin}/v1/connection`,request:options.connection?.request??options.request});}
 catch(error){billing.dispose();throw error;}
 const status=new BillingClient(`${origin.origin}/v1/billing`,async signal=>{
  signal.throwIfAborted();const expected=current(),version=generation;
  if(!expected||expected!==scope||disposed)throw new Error("SESSION_REQUIRED");
  const token=await session.accessToken(signal);signal.throwIfAborted();
  if(disposed||version!==generation||current()!==expected)throw new Error("SESSION_CHANGED");return token;
 },options.billing?.request??options.request,options.billing?.timeoutMs);
 let stopSession:()=>void;
 try{stopSession=session.subscribe(()=>{if(disposed)return;const next=current();if(next===scope)return;scope=next;generation++;pending?.abort();});}
 catch(error){billing.dispose();connection.dispose();throw error;}
 container.replaceChildren(root);
 const checkBeforeSending=async()=>{
  if(disposed||!scope||current()!==scope)return false;
  const expected=scope,version=++generation;pending?.abort();const controller=new AbortController();pending=controller;
  const unchanged=()=>!disposed&&!controller.signal.aborted&&version===generation&&scope===expected&&current()===expected;
  try{
   if(!await connection.checkBeforeSending()||!unchanged())return false;
   // Read licensing after connection probes so it cannot become stale while
   // awaiting those probes. Neither the visible list nor payment callbacks grant readiness.
   const result=await status.licenseStatus(controller.signal);
   if(!unchanged())return false;
   connection.model.refresh();
   const assessed=connection.model.state().result;
   if(!connection.isReady()||assessed?.status!=="assessed"||!assessed.validation.assessment.expiresAt||Date.parse(assessed.validation.assessment.expiresAt)<=Date.now())return false;
   const now=Date.now();return unchanged()&&result.licenses.some(license=>license.active&&Date.parse(license.startsAt)<=now&&now<Date.parse(license.expiresAt));
  }catch{return false;}
  finally{if(pending===controller)pending=undefined;}
 };
 return {billing,connection,checkBeforeSending,dispose(){if(disposed)return;disposed=true;generation++;pending?.abort();stopSession();billing.dispose();connection.dispose();root.remove();}};
}
