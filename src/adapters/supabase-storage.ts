import { createHash } from "node:crypto";
import type { StoragePort } from "../ports/storage.js";

export class SupabaseStorage implements StoragePort {
  private readonly base: string;
  private readonly headers: Record<string,string>;
  constructor(url: string, secretKey: string, private readonly bucket = "transfer-bytes") {
    this.base = `${url.replace(/\/$/, "")}/storage/v1/object`;
    this.headers = { apikey: secretKey, Authorization: `Bearer ${secretKey}` };
  }
  async putPart(transferId: string, partNumber: number, data: Buffer) {
    const response = await fetch(this.objectUrl(transferId, partNumber), {
      method:"POST", headers:{...this.headers,"Content-Type":"application/octet-stream","x-upsert":"false"}, body:new Uint8Array(data)
    });
    if (!response.ok) throw new Error("TRANSFER_STORAGE_WRITE_FAILED");
  }
  async readPart(transferId: string, partNumber: number) {
    const response = await fetch(this.objectUrl(transferId, partNumber), { headers:this.headers });
    if (!response.ok) throw new Error("TRANSFER_STORAGE_READ_FAILED");
    return Buffer.from(await response.arrayBuffer());
  }
  async complete(transferId: string, totalParts: number) {
    const hash=createHash("sha256");
    for(let n=1;n<=totalParts;n++) hash.update(await this.readPart(transferId,n));
    return { objectKey:`supabase://${this.bucket}/${transferId}`, sha256:hash.digest("hex") };
  }
  async purge(transferId: string) {
    const response=await fetch(`${this.base}/${encodeURIComponent(this.bucket)}`,{
      method:"DELETE",headers:{...this.headers,"Content-Type":"application/json"},
      body:JSON.stringify({prefixes:[`${transferId}/`]})
    });
    if (!response.ok) throw new Error("TRANSFER_STORAGE_PURGE_FAILED");
  }
  private objectUrl(transferId:string,partNumber:number) {
    return `${this.base}/${encodeURIComponent(this.bucket)}/${encodeURIComponent(transferId)}/parts/${partNumber}`;
  }
}
