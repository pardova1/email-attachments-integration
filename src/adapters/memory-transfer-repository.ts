import type { TransferSession } from "../domain/transfer.js";
import type { TransferRepository } from "../ports/transfer-repository.js";

export class MemoryTransferRepository implements TransferRepository {
  private readonly sessions = new Map<string, TransferSession>();

  async save(session: TransferSession) {
    this.sessions.set(session.id, session);
  }

  async findById(id: string) {
    return this.sessions.get(id) ?? null;
  }

  async delete(id: string) {
    this.sessions.delete(id);
  }
}
