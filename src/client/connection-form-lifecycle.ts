// Reconcile deadlines after browser suspension without guessing connection
// details or starting another network request. The model owns expiry checks.
export function observeConnectionFormLifecycle(
 document:Pick<Document,"addEventListener"|"removeEventListener"|"visibilityState">,
 window:Pick<Window,"addEventListener"|"removeEventListener">|null,
 refresh:()=>void,
 invalidate:()=>void=refresh
):()=>void {
 let disposed=false;
 const networkChanged=()=>{if(!disposed)invalidate();};
 const resume=()=>{if(!disposed&&document.visibilityState==="visible")refresh();};
 document.addEventListener("visibilitychange",resume);
 window?.addEventListener("pageshow",resume);
 window?.addEventListener("focus",resume);
 window?.addEventListener("offline",networkChanged);
 window?.addEventListener("online",networkChanged);
 return ()=>{
  if(disposed)return;disposed=true;
  document.removeEventListener("visibilitychange",resume);
  window?.removeEventListener("pageshow",resume);
  window?.removeEventListener("focus",resume);
  window?.removeEventListener("offline",networkChanged);
  window?.removeEventListener("online",networkChanged);
 };
}
