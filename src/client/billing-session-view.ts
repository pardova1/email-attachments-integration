import {BillingClient,BillingClientError,type BillingCheckout,type BillingLicense} from "./billing-client.js";
import {priceForPlan,type LicensePlan} from "../billing/annual-license.js";
import type {ConnectionApplicationSession} from "./connection-session-view.js";
export const BILLING_LABELS={title:"Annual license",individual:"Individual",business:"Business",purchase:"Start checkout",open:"Open secure checkout",confirm:"Check payment",another:"Start another purchase",signedOut:"Sign in to purchase a license.",idle:"Choose a plan to continue.",working:"Please wait…",checkoutReady:"Complete checkout, then check payment here.",confirmed:"Payment verified. License expires:",expired:"This license has expired.",busy:"Payment processing is busy. Please try again shortly.",rejected:"Payment could not be confirmed. Complete checkout and try again.",unavailable:"Payment service is unavailable. Please try again.",annual:"USD per year"};
export interface SessionBillingOptions {
 apiBase:string;request?:typeof fetch;timeoutMs?:number;labels?:typeof BILLING_LABELS;language?:string;direction?:"ltr"|"rtl";
 onConfirmed?:(license:BillingLicense)=>void;
}
// Embeddable host-session panel. No automatic charge, navigation, or token storage.
export function mountSessionBilling(container:HTMLElement,session:ConnectionApplicationSession,options:SessionBillingOptions){
 const labels={...BILLING_LABELS,...options.labels};
 if(Object.values(labels).some(value=>typeof value!=="string"||!value.trim()))throw new Error("INVALID_BILLING_LABELS");
 const current=()=>{try{const id=session.currentCustomer();return typeof id==="string"&&id.trim()===id&&id.length>0&&id.length<=200&&!/[\x00-\x1f\x7f]/.test(id)?id:undefined;}catch{return undefined;}};
 let scope=current(),generation=0,disposed=false,busy=false,plan:LicensePlan="individual",requestId:string|undefined,checkout:BillingCheckout|undefined,license:BillingLicense|undefined,controller:AbortController|undefined,message=scope?labels.idle:labels.signedOut;
 const client=new BillingClient(options.apiBase,async signal=>{
  const expected=scope,version=generation;if(!expected||current()!==expected)throw new Error("SESSION_REQUIRED");
  const token=await session.accessToken(signal);signal.throwIfAborted();
  if(disposed||version!==generation||current()!==expected)throw new Error("SESSION_CHANGED");return token;
 },options.request,options.timeoutMs);
 const doc=container.ownerDocument,root=doc.createElement("section");root.lang=options.language??"en";root.dir=options.direction??"ltr";
 const title=doc.createElement("h2");title.textContent=labels.title;
 const select=doc.createElement("select");select.name="license-plan";select.setAttribute("aria-label",labels.title);
 for(const p of ["individual","business"] as const){const option=doc.createElement("option");option.value=p;option.textContent=`${labels[p]} — $${(priceForPlan(p)/100).toFixed(2)} ${labels.annual}`;select.append(option);}
 const purchase=doc.createElement("button");purchase.type="button";purchase.textContent=labels.purchase;
 const link=doc.createElement("a");link.textContent=labels.open;link.target="_blank";link.rel="noopener noreferrer";link.setAttribute("referrerpolicy","no-referrer");
 const confirm=doc.createElement("button");confirm.type="button";confirm.textContent=labels.confirm;
 const another=doc.createElement("button");another.type="button";another.textContent=labels.another;
 const notice=doc.createElement("p");notice.setAttribute("role","status");notice.setAttribute("aria-live","polite");
 root.append(title,select,purchase,link,confirm,another,notice);container.replaceChildren(root);
 const render=()=>{if(disposed)return;const signedIn=!!scope&&current()===scope;select.disabled=busy||!!requestId||!signedIn;purchase.disabled=busy||!!checkout||!signedIn;link.hidden=!checkout||!signedIn;link.removeAttribute("href");if(checkout&&signedIn)link.href=checkout.checkoutUrl;confirm.hidden=!checkout;confirm.disabled=busy||!signedIn;another.hidden=!requestId;another.disabled=busy||!signedIn;root.setAttribute("aria-busy",String(busy));notice.textContent=message;};
 const reset=()=>{generation++;controller?.abort();controller=undefined;busy=false;checkout=undefined;license=undefined;requestId=undefined;plan="individual";select.selectedIndex=0;message=scope?labels.idle:labels.signedOut;render();};
 const run=async(kind:"checkout"|"confirm")=>{
  if(disposed||busy||kind==="checkout"&&checkout||kind==="confirm"&&!checkout)return;if(!scope||current()!==scope){scope=current();reset();return;}
  let confirmed:BillingLicense|undefined;const expected=scope,version=generation;controller=new AbortController();const signal=controller.signal;busy=true;message=labels.working;render();
  try{
   if(kind==="checkout"){requestId??=globalThis.crypto.randomUUID();const value=await client.checkout({plan,requestId},signal);if(disposed||version!==generation||current()!==expected)return;checkout=value;message=labels.checkoutReady;}
   else if(checkout){const value=await client.confirm(checkout.providerReference,signal);if(disposed||version!==generation||current()!==expected)return;license=value;confirmed=value;message=value.status==="active"&&Date.parse(value.expiresAt)>Date.now()?`${labels.confirmed} ${value.expiresAt}`:labels.expired;}
  }catch(error){if(!disposed&&version===generation&&current()===expected){message=error instanceof BillingClientError?error.code==="BILLING_BUSY"?labels.busy:error.code==="PAYMENT_REJECTED"?labels.rejected:error.code==="AUTHENTICATION_REQUIRED"?labels.signedOut:labels.unavailable:labels.unavailable;}}
  finally{if(!disposed&&version===generation){busy=false;controller=undefined;if(current()!==scope){scope=current();reset();}else render();}}
  if(confirmed&&!disposed&&version===generation&&current()===expected){try{options.onConfirmed?.({...confirmed});}catch{/* Host callback cannot undo server verification or break the panel. */}}
 };
 const choose=()=>{if(!busy&&!requestId&&(select.value==="individual"||select.value==="business")){plan=select.value;requestId=undefined;message=labels.idle;render();}};
 const buy=()=>{void run("checkout");},check=()=>{void run("confirm");},restart=()=>{if(!busy)reset();};
 select.addEventListener("change",choose);purchase.addEventListener("click",buy);confirm.addEventListener("click",check);another.addEventListener("click",restart);
 const unsubscribe=session.subscribe(()=>{if(disposed)return;const next=current();if(next!==scope){scope=next;reset();}});render();
 return {checkoutNow:()=>run("checkout"),confirmNow:()=>run("confirm"),dispose(){if(disposed)return;disposed=true;generation++;controller?.abort();unsubscribe();select.removeEventListener("change",choose);purchase.removeEventListener("click",buy);confirm.removeEventListener("click",check);another.removeEventListener("click",restart);root.remove();}};
}
