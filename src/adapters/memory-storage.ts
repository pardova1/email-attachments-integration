import { createHash } from "node:crypto";
import type { StoragePort } from "../ports/storage.js";
import type { TransitStorage } from "../ports/transit-storage.js";

export class MemoryStorage implements StoragePort, TransitStorage {
  private readonly parts = new Map<string, Map<number, Buffer>>();
  private readonly completed = new Set<string>();

  async putPart(transferId: string, partNumber: number, data: Buffer) {
    const transfer = this.parts.get(transferId) ?? new Map<number, Buffer>();
    transfer.set(partNumber, data);
    this.parts.set(transferId, transfer);
  }

  async complete(transferId: string, totalParts: number) {
    const transfer = this.parts.get(transferId);
    if (!transfer || transfer.size !== totalParts) throw new Error("TRANSFER_INCOMPLETE");

    const hash = createHash("sha256");
    for (let partNumber = 1; partNumber <= totalParts; partNumber++) {
      const part = transfer.get(partNumber);
      if (!part) throw new Error("TRANSFER_INCOMPLETE");
      hash.update(part);
    }

    const sha256 = hash.digest("hex");
    this.completed.add(transferId);
    return { objectKey: `memory://${transferId}`, sha256 };
  }

  async openForDownload(transferId: string) {
    if (!this.completed.has(transferId)) throw new Error("TRANSFER_NOT_READY");
    return { objectKey: `memory://${transferId}` };
  }

  async purge(transferId: string) {
    this.parts.delete(transferId);
    this.completed.delete(transferId);
  }
}
