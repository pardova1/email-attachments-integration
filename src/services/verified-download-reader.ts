import { createHash } from "node:crypto";
import type { StoragePort } from "../ports/storage.js";
import type { TransferSession } from "../domain/transfer.js";
export class VerifiedDownloadReader {
  constructor(private readonly storage:StoragePort){}
  async readVerified(session:TransferSession){
    const totalParts=Math.ceil(session.totalBytes/session.chunkBytes);
    const parts:Buffer[]=[]; const hash=createHash("sha256"); let bytes=0;
    for(let partNumber=1;partNumber<=totalParts;partNumber++){const part=await this.storage.readPart(session.id,partNumber);parts.push(part);hash.update(part);bytes+=part.length;}
    if(bytes!==session.totalBytes||hash.digest("hex").toLowerCase()!==session.originalSha256.toLowerCase()) throw new Error("FILE_INTEGRITY_COMMAND_VIOLATION");
    return parts;
  }
}
