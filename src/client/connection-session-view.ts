import {ConnectionCheckClient,type ConnectionCheckInput} from "./connection-check-client.js";
import {mountConnectionAssistance} from "./connection-form-view.js";

export interface ConnectionApplicationSession {
 currentCustomer:()=>string|undefined;
 accessToken:(signal:AbortSignal)=>Promise<string>;
 subscribe:(changed:()=>void)=>()=>void;
}
export interface SessionConnectionOptions {
 apiBase:string;
 language?:string;
 software?:ConnectionCheckInput["software"];
 request?:typeof fetch;
 onReadinessChange?:(ready:boolean)=>void;
}

// Host session adapter only: no login UI, credentials, or persisted tokens.
export function mountSessionConnectionAssistance(container:HTMLElement,session:ConnectionApplicationSession,options:SessionConnectionOptions){
 let disposed=false;
 const current=()=>{try{const scope=session.currentCustomer();return typeof scope==="string"&&scope.trim()===scope&&scope.length>0&&scope.length<=256&&!/[\x00-\x1f\x7f]/.test(scope)?scope:undefined;}catch{return undefined;}};
 let scope=current();
 const client=new ConnectionCheckClient(options.apiBase,async signal=>{
  signal.throwIfAborted();const expected=current();
  if(!expected||expected!==scope)throw new Error("CONNECTION_SESSION_REQUIRED");
  const token=await session.accessToken(signal);signal.throwIfAborted();
  if(disposed||current()!==expected||scope!==expected)throw new Error("CONNECTION_SESSION_CHANGED");
  return token;
 },options.request);
 const mounted=mountConnectionAssistance(container,client,{language:options.language,software:options.software});
 const ready=()=>{
  if(disposed||!scope||current()!==scope)return false;
  const state=mounted.model.state(),result=state.result;
  return state.phase==="assessed"&&result?.status==="assessed"&&!result.retryRequired&&result.validation.assessment.status==="verified";
 };
 let last:boolean|undefined;
 const stopReadiness=mounted.model.subscribe(()=>{const value=ready();if(value!==last){last=value;options.onReadinessChange?.(value);}});
 const stopSession=session.subscribe(()=>{
  if(disposed)return;const next=current();if(next===scope)return;
  scope=next;mounted.model.resetAuthentication();if(scope)void mounted.model.check(options.software);
 });
 return {model:mounted.model,isReady:ready,dispose(){if(disposed)return;disposed=true;stopSession();stopReadiness();mounted.dispose();if(last!==false){last=false;options.onReadinessChange?.(false);}}};
}
