import type {ConnectionFormRetryPolicy} from "./connection-form-model.js";
import type {ConnectionCheckInput} from "./connection-check-client.js";
import {BrowserConnectionCheckClient,type BrowserConnectionNavigator} from "./browser-connection-client.js";
import type {ConnectionTranslation} from "../email/connection-languages.js";
import {mountConnectionAssistance} from "./connection-form-view.js";

export interface ConnectionApplicationSession {
 currentCustomer:()=>string|undefined;
 accessToken:(signal:AbortSignal)=>Promise<string>;
 subscribe:(changed:()=>void)=>()=>void;
}
export interface SessionConnectionOptions {
 apiBase:string;
 retry?:ConnectionFormRetryPolicy;
 language?:string;
 translations?:Record<string,ConnectionTranslation>;
 software?:ConnectionCheckInput["software"];
 request?:typeof fetch;
 onReadinessChange?:(ready:boolean)=>void;
}

// Host session adapter only: no login UI, credentials, or persisted tokens.
export function mountSessionConnectionAssistance(container:HTMLElement,session:ConnectionApplicationSession,options:SessionConnectionOptions){
 let disposed=false,sessionGeneration=0,sendCheckGeneration=0;
 const current=()=>{try{const scope=session.currentCustomer();return typeof scope==="string"&&scope.trim()===scope&&scope.length>0&&scope.length<=256&&!/[\x00-\x1f\x7f]/.test(scope)?scope:undefined;}catch{return undefined;}};
 let scope=current();
 const client=new BrowserConnectionCheckClient(options.apiBase,async signal=>{
  signal.throwIfAborted();const expected=current();
  if(!expected||expected!==scope)throw new Error("CONNECTION_SESSION_REQUIRED");
  const token=await session.accessToken(signal);signal.throwIfAborted();
  if(disposed||current()!==expected||scope!==expected)throw new Error("CONNECTION_SESSION_CHANGED");
  return token;
 },options.request,container.ownerDocument.defaultView?.navigator as BrowserConnectionNavigator|undefined);
 const mounted=mountConnectionAssistance(container,client,{retry:options.retry,language:options.language,translations:options.translations,software:options.software});
 const ready=()=>{
  if(disposed||!scope||current()!==scope)return false;
  const state=mounted.model.state(),result=state.result;
  return state.phase==="assessed"&&result?.status==="assessed"&&!result.retryRequired&&result.validation.assessment.status==="verified";
 };
 let last:boolean|undefined;
 const stopReadiness=mounted.model.subscribe(()=>{const value=ready();if(value!==last){last=value;options.onReadinessChange?.(value);}});
 const stopSession=session.subscribe(()=>{
  if(disposed)return;const next=current();if(next===scope)return;
  sessionGeneration++;scope=next;mounted.model.resetAuthentication();if(scope)void mounted.checkNow();
 });
 // Host attachment/send handlers call this immediately before proceeding.
 // Always refresh evidence; an old ready flag alone cannot approve the action.
 const checkBeforeSending=async()=>{
  if(disposed||!scope||current()!==scope)return false;
  const expected=scope,generation=sessionGeneration,check=++sendCheckGeneration;
  await mounted.checkNow();
  return !disposed&&generation===sessionGeneration&&check===sendCheckGeneration&&current()===expected&&ready();
 };
 return {model:mounted.model,isReady:ready,checkBeforeSending,dispose(){if(disposed)return;disposed=true;stopSession();stopReadiness();mounted.dispose();if(last!==false){last=false;options.onReadinessChange?.(false);}}};
}
