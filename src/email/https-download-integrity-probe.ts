import { createHash, randomUUID } from "node:crypto";
import type { ConnectionEnvironment } from "./global-connection-readiness-agent.js";
import { GlobalConnectionReadinessAgent } from "./global-connection-readiness-agent.js";
import type { ConnectionProbeResult, ConnectionProbeTool } from "./global-connection-validation-runner.js";

export interface DownloadProbeReceipt {
 reference:string;
 environment:ConnectionEnvironment;
 target:string;
 checkedAt:string;
 outcome:ConnectionProbeResult["outcome"];
 reason:string;
 bytesReceived:number;
 integrityVerified:boolean;
}
// Use an operator-owned, non-customer fixture. This checks HTTPS byte transport,
// not an actual recipient browser or its installation requirements.
export class HttpsDownloadIntegrityProbe implements ConnectionProbeTool {
 readonly id="https-download-integrity";
 private readonly target:string;
 private readonly environment:ConnectionEnvironment;
 private readonly sha256:string;
 private readonly receipts=new Map<string,DownloadProbeReceipt>();
 constructor(target:string,environment:ConnectionEnvironment,private readonly expectedBytes:number,sha256:string,private readonly request:typeof fetch=globalThis.fetch) {
  const url=new URL(target);
  if(url.protocol!=="https:"||url.username||url.password||url.search||url.hash||!Number.isInteger(expectedBytes)||expectedBytes<1||expectedBytes>1024*1024||!/^[a-fA-F0-9]{64}$/.test(sha256))throw new Error("INVALID_DOWNLOAD_PROBE_CONFIGURATION");
  this.environment=new GlobalConnectionReadinessAgent().assess(environment).environment;
  this.target=url.href;this.sha256=sha256.toLowerCase();
 }
 async run(environment:ConnectionEnvironment,signal:AbortSignal):Promise<ConnectionProbeResult> {
  signal.throwIfAborted();
  let outcome:ConnectionProbeResult["outcome"]="failed",reason="ENVIRONMENT_MISMATCH",bytesReceived=0,integrityVerified=false;
  const actual=new GlobalConnectionReadinessAgent().assess(environment).environment;
  if(FIELDS.every(field=>actual[field]===this.environment[field])){
   let response:Response|undefined,reader:ReadableStreamDefaultReader<Uint8Array>|undefined,aborted:(()=>void)|undefined;
   try{
    response=await this.request(this.target,{method:"GET",redirect:"error",credentials:"omit",cache:"no-store",signal});
    signal.throwIfAborted();
    if(response.status===403||response.status===451){outcome="restricted";reason="DOWNLOAD_ACCESS_RESTRICTED";}
    else if(response.status!==200||response.redirected||!response.body){reason="UNEXPECTED_DOWNLOAD_RESPONSE";}
    else{
     reason="DOWNLOAD_INTEGRITY_MISMATCH";
     const length=response.headers.get("content-length");
     if(length!==null&&(!/^\d+$/.test(length)||Number(length)!==this.expectedBytes))throw new Error("FIXTURE_LENGTH_MISMATCH");
     reader=response.body.getReader();
     const cancelled=new Promise<never>((_resolve,reject)=>{
      aborted=()=>reject(signal.reason);signal.addEventListener("abort",aborted,{once:true});
     });
     const hash=createHash("sha256");
     while(true){
      signal.throwIfAborted();
      const part=await Promise.race([reader.read(),cancelled]);
      signal.throwIfAborted();
      if(part.done)break;
      bytesReceived+=part.value.byteLength;
      if(bytesReceived>this.expectedBytes)throw new Error("FIXTURE_TOO_LARGE");
      hash.update(part.value);
     }
     integrityVerified=bytesReceived===this.expectedBytes&&hash.digest("hex")===this.sha256;
     if(integrityVerified){outcome="passed";reason="DOWNLOAD_BYTES_VERIFIED";}
    }
   }catch{
    signal.throwIfAborted();
    if(reason!=="DOWNLOAD_INTEGRITY_MISMATCH")reason="HTTPS_DOWNLOAD_FAILED";
   }finally{
    if(aborted)signal.removeEventListener("abort",aborted);
    if(reader){void reader.cancel().catch(()=>{});try{reader.releaseLock();}catch{/* An uncooperative read must not block cleanup. */}}
    else if(response?.body)void response.body.cancel().catch(()=>{});
   }
  }
  signal.throwIfAborted();
  const reference=`download-probe:${randomUUID()}`;
  this.receipts.set(reference,{reference,environment:structuredClone(this.environment),target:this.target,checkedAt:new Date().toISOString(),outcome,reason,bytesReceived,integrityVerified});
  if(this.receipts.size>1000)this.receipts.delete(this.receipts.keys().next().value!);
  // A server-side fixture request cannot prove that a recipient needs no app.
  return {outcome,testReference:reference};
 }
 receipt(reference:string){const value=this.receipts.get(reference);return value?structuredClone(value):undefined;}
}
const FIELDS=["country","network","provider","client","platform","softwareVersion"] as const;
