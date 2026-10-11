// Reconcile deadlines after suspension. Optional recovery performs normal
// discovery again; browser online status alone never establishes readiness.
export function observeConnectionFormLifecycle(
 document:Pick<Document,"addEventListener"|"removeEventListener"|"visibilityState">,
 window:Pick<Window,"addEventListener"|"removeEventListener">|null,
 refresh:()=>void,
 invalidate:()=>void=refresh,
 recover?:()=>void,
 recoveryDelayMs=250
):()=>void {
 if(!Number.isInteger(recoveryDelayMs)||recoveryDelayMs<0||recoveryDelayMs>1000)throw new Error("INVALID_CONNECTION_RECOVERY_DELAY");
 let disposed=false,pending=false,timer:ReturnType<typeof setTimeout>|undefined;
 const cancel=()=>{if(timer!==undefined)clearTimeout(timer);timer=undefined;};
 const schedule=()=>{
  cancel();
  if(!recover||!pending||disposed||document.visibilityState==="hidden")return;
  timer=setTimeout(()=>{timer=undefined;if(disposed||!pending||document.visibilityState==="hidden")return;pending=false;recover();},recoveryDelayMs);
 };
 const offline=()=>{if(disposed)return;pending=false;cancel();invalidate();};
 const online=()=>{if(disposed)return;invalidate();pending=true;schedule();};
 const resume=()=>{if(!disposed&&document.visibilityState==="visible"){refresh();if(pending)schedule();}};
 document.addEventListener("visibilitychange",resume);
 window?.addEventListener("pageshow",resume);
 window?.addEventListener("focus",resume);
 window?.addEventListener("offline",offline);
 window?.addEventListener("online",online);
 return ()=>{
  if(disposed)return;disposed=true;pending=false;cancel();
  document.removeEventListener("visibilitychange",resume);
  window?.removeEventListener("pageshow",resume);
  window?.removeEventListener("focus",resume);
  window?.removeEventListener("offline",offline);
  window?.removeEventListener("online",online);
 };
}
