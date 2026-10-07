import { createHash } from "node:crypto";
import type { StoragePort } from "../ports/storage.js";
export class VerifiedDownloadService {
  constructor(private readonly storage:StoragePort){}
  async verify(transferId:string,totalParts:number,expectedSha256:string){
    const hash=createHash("sha256");
    for(let partNumber=1;partNumber<=totalParts;partNumber++) hash.update(await this.storage.readPart(transferId,partNumber));
    if(hash.digest("hex").toLowerCase()!==expectedSha256.toLowerCase()) throw new Error("FILE_INTEGRITY_COMMAND_VIOLATION");
  }
  async *streamVerified(transferId:string,totalParts:number,expectedSha256:string){
    await this.verify(transferId,totalParts,expectedSha256);
    for(let partNumber=1;partNumber<=totalParts;partNumber++) yield await this.storage.readPart(transferId,partNumber);
  }
}
