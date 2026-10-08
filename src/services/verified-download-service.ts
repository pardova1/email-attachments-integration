import { createHash } from "node:crypto";
import type { StoragePort } from "../ports/storage.js";
export class VerifiedDownloadService {
  constructor(private readonly storage:StoragePort){}
  async verify(transferId:string,totalParts:number,expectedSha256:string,expectedBytes:number,signal?:AbortSignal){
    const hash=createHash("sha256");
    let totalBytes=0;
    for(let partNumber=1;partNumber<=totalParts;partNumber++) {
      signal?.throwIfAborted();
      const part=await this.storage.readPart(transferId,partNumber);
      signal?.throwIfAborted();
      hash.update(part);totalBytes+=part.length;
    }
    if(totalBytes!==expectedBytes||hash.digest("hex").toLowerCase()!==expectedSha256.toLowerCase()) throw new Error("FILE_INTEGRITY_COMMAND_VIOLATION");
  }
  async *streamVerified(transferId:string,totalParts:number,expectedSha256:string,expectedBytes:number,signal?:AbortSignal){
    await this.verify(transferId,totalParts,expectedSha256,expectedBytes,signal);
    for(let partNumber=1;partNumber<=totalParts;partNumber++) {
      signal?.throwIfAborted();
      const part=await this.storage.readPart(transferId,partNumber);
      signal?.throwIfAborted();
      yield part;
    }
  }
}
