// Reconcile deadlines after browser suspension without guessing connection
// details or starting another network request. The model owns expiry checks.
export function observeConnectionFormLifecycle(
 document:Pick<Document,"addEventListener"|"removeEventListener"|"visibilityState">,
 window:Pick<Window,"addEventListener"|"removeEventListener">|null,
 refresh:()=>void
):()=>void {
 let disposed=false;
 const resume=()=>{if(!disposed&&document.visibilityState==="visible")refresh();};
 document.addEventListener("visibilitychange",resume);
 window?.addEventListener("pageshow",resume);
 window?.addEventListener("focus",resume);
 return ()=>{
  if(disposed)return;disposed=true;
  document.removeEventListener("visibilitychange",resume);
  window?.removeEventListener("pageshow",resume);
  window?.removeEventListener("focus",resume);
 };
}
