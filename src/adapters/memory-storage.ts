import { createHash } from "node:crypto";
import type { StoragePort } from "../ports/storage.js";

export class MemoryStorage implements StoragePort {
  private readonly parts = new Map<string, Map<number, Buffer>>();
  private readonly completed = new Set<string>();

  async putPart(transferId: string, partNumber: number, data: Buffer) {
    const transfer = this.parts.get(transferId) ?? new Map<number, Buffer>();
    const existing = transfer.get(partNumber);
    if (existing) {
      if (existing.equals(data)) return;
      throw new Error("FILE_INTEGRITY_COMMAND_VIOLATION");
    }
    transfer.set(partNumber, Buffer.from(data));
    this.parts.set(transferId, transfer);
  }

  async complete(transferId: string, totalParts: number) {
    const transfer = this.parts.get(transferId);
    if (!transfer || transfer.size !== totalParts) throw new Error("TRANSFER_INCOMPLETE");

    const hash = createHash("sha256");
    let totalBytes = 0;
    for (let partNumber = 1; partNumber <= totalParts; partNumber++) {
      const part = transfer.get(partNumber);
      if (!part) throw new Error("TRANSFER_INCOMPLETE");
      hash.update(part);
      totalBytes += part.length;
    }

    const sha256 = hash.digest("hex");
    this.completed.add(transferId);
    return { objectKey: `memory://${transferId}`, sha256, totalBytes };
  }

  async readPart(transferId: string, partNumber: number) {
    if (!this.completed.has(transferId)) throw new Error("TRANSFER_NOT_READY");
    const part = this.parts.get(transferId)?.get(partNumber);
    if (!part) throw new Error("TRANSFER_STORAGE_READ_FAILED");
    return Buffer.from(part);
  }


  async purge(transferId: string) {
    this.parts.delete(transferId);
    this.completed.delete(transferId);
  }
}
