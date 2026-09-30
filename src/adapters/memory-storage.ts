import type { StoragePort } from "../ports/storage.js";

export class MemoryStorage implements StoragePort {
  private readonly parts = new Map<string, Map<number, Buffer>>();

  async putPart(transferId: string, partNumber: number, data: Buffer) {
    const transfer = this.parts.get(transferId) ?? new Map<number, Buffer>();
    transfer.set(partNumber, data);
    this.parts.set(transferId, transfer);
  }

  async complete(transferId: string, totalParts: number) {
    const transfer = this.parts.get(transferId);
    if (!transfer || transfer.size !== totalParts) throw new Error("TRANSFER_INCOMPLETE");
    return { objectKey: `memory://${transferId}` };
  }
}
