import { createHash } from "node:crypto";
import type { StoragePort } from "../ports/storage.js";
export class VerifiedDownloadService {
  constructor(private readonly storage:StoragePort){}
  private async readPart(transferId:string,partNumber:number,signal?:AbortSignal) {
    if(!signal) return this.storage.readPart(transferId,partNumber);
    signal.throwIfAborted();
    let aborted!:()=>void;
    const cancellation=new Promise<never>((_resolve,reject)=>{
      aborted=()=>reject(signal.reason);
      signal.addEventListener("abort",aborted,{once:true});
    });
    try {
      return await Promise.race([this.storage.readPart(transferId,partNumber,signal),cancellation]);
    } finally {
      signal.removeEventListener("abort",aborted);
    }
  }
  async verify(transferId:string,totalParts:number,expectedSha256:string,expectedBytes:number,signal?:AbortSignal){
    const hash=createHash("sha256");
    let totalBytes=0;
    const verifiedParts: { sha256: string; bytes: number }[]=[];
    for(let partNumber=1;partNumber<=totalParts;partNumber++) {
      signal?.throwIfAborted();
      const part=await this.readPart(transferId,partNumber,signal);
      signal?.throwIfAborted();
      hash.update(part);totalBytes+=part.length;
      verifiedParts.push({sha256:createHash("sha256").update(part).digest("hex"),bytes:part.length});
    }
    if(totalBytes!==expectedBytes||hash.digest("hex").toLowerCase()!==expectedSha256.toLowerCase()) throw new Error("FILE_INTEGRITY_COMMAND_VIOLATION");
    return verifiedParts;
  }
  async *streamVerified(transferId:string,totalParts:number,expectedSha256:string,expectedBytes:number,signal?:AbortSignal){
    const verifiedParts=await this.verify(transferId,totalParts,expectedSha256,expectedBytes,signal);
    for(let partNumber=1;partNumber<=totalParts;partNumber++) {
      signal?.throwIfAborted();
      const part=Buffer.from(await this.readPart(transferId,partNumber,signal));
      signal?.throwIfAborted();
      const verified=verifiedParts[partNumber-1];
      if(part.length!==verified.bytes||createHash("sha256").update(part).digest("hex")!==verified.sha256) {
        throw new Error("FILE_INTEGRITY_COMMAND_VIOLATION");
      }
      yield part;
    }
  }
}
