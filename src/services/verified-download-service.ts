import { createHash } from "node:crypto";
import type { StoragePort } from "../ports/storage.js";
export class VerifiedDownloadService {
  constructor(private readonly storage:StoragePort){}
  async readVerified(transferId:string,totalParts:number,expectedSha256:string){
    const parts:Buffer[]=[]; const hash=createHash("sha256");
    for(let partNumber=1;partNumber<=totalParts;partNumber++){const part=await this.storage.readPart(transferId,partNumber);parts.push(part);hash.update(part);}
    const actual=hash.digest("hex");
    if(actual.toLowerCase()!==expectedSha256.toLowerCase()) throw new Error("FILE_INTEGRITY_COMMAND_VIOLATION");
    return parts;
  }
}
