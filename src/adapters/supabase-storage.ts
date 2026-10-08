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
    if (response.ok) return;
    if (response.status === 400 || response.status === 409) {
      const existing = await this.readPart(transferId, partNumber);
      if (existing.equals(data)) return;
      throw new Error("FILE_INTEGRITY_COMMAND_VIOLATION");
    }
    throw new Error("TRANSFER_STORAGE_WRITE_FAILED");
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
    // The remove API takes exact object paths; a directory prefix is not recursive deletion.
    const prefix = `${transferId}/parts`;
    for (;;) {
      const listed = await fetch(`${this.base}/list/${encodeURIComponent(this.bucket)}`, {
        method: "POST", headers: { ...this.headers, "Content-Type": "application/json" },
        body: JSON.stringify({ prefix, limit: 100, offset: 0, sortBy: { column: "name", order: "asc" } })
      });
      if (!listed.ok) throw new Error("TRANSFER_STORAGE_PURGE_FAILED");
      const objects = await listed.json() as { name: string }[];
      if (!objects.length) return;
      if (objects.some(object => !/^\d+$/.test(object.name))) throw new Error("TRANSFER_STORAGE_PURGE_FAILED");
      const response = await fetch(`${this.base}/${encodeURIComponent(this.bucket)}`, {
        method: "DELETE", headers: { ...this.headers, "Content-Type": "application/json" },
        body: JSON.stringify({ prefixes: objects.map(object => `${prefix}/${object.name}`) })
      });
      if (!response.ok) throw new Error("TRANSFER_STORAGE_PURGE_FAILED");
    }
  }
  private objectUrl(transferId:string,partNumber:number) {
    return `${this.base}/${encodeURIComponent(this.bucket)}/${encodeURIComponent(transferId)}/parts/${partNumber}`;
  }
}
