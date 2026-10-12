import {createHmac,timingSafeEqual} from "node:crypto";
export const STRIPE_WEBHOOK_MAX_BYTES=256*1024;
export function verifyStripeWebhookSignature(body:Buffer,header:string|undefined,secret:string,now=Date.now()){
 const invalid=()=>new Error("STRIPE_WEBHOOK_REJECTED");
 if(!Buffer.isBuffer(body)||body.length===0||body.length>STRIPE_WEBHOOK_MAX_BYTES||!header||header.length>4096||!Number.isFinite(now))throw invalid();
 const parts=header.split(",").map(value=>value.trim().split("="));
 if(parts.length>32)throw invalid();
 const timestamps=parts.filter(value=>value[0]==="t");
 if(timestamps.length!==1||timestamps[0].length!==2||!/^\d{1,12}$/.test(timestamps[0][1]))throw invalid();
 const timestamp=timestamps[0][1];
 if(Math.abs(now/1000-Number(timestamp))>300)throw invalid();
 const expected=createHmac("sha256",secret).update(timestamp).update(".").update(body).digest();
 const signatures=parts.filter(value=>value[0]==="v1"&&value.length===2&&/^[a-fA-F0-9]{64}$/.test(value[1]));
 if(!signatures.some(value=>timingSafeEqual(expected,Buffer.from(value[1],"hex"))))throw invalid();
}
