import type { PersistedTransferState, TransferStateRepository } from "../ports/transfer-state-repository.js";

export class MemoryTransferStateRepository implements TransferStateRepository {
  private readonly states = new Map<string, PersistedTransferState>();

  async get(transferId: string) {
    const state = this.states.get(transferId);
    return state ? structuredClone(state) : undefined;
  }

  async create(state: PersistedTransferState) {
    if (this.states.has(state.transferId)) throw new Error("TRANSFER_STATE_ALREADY_EXISTS");
    this.states.set(state.transferId, structuredClone(state));
  }

  async save(state: PersistedTransferState, expectedVersion: number) {
    const current = this.states.get(state.transferId);
    if (!current) throw new Error("TRANSFER_STATE_NOT_FOUND");
    if (current.version !== expectedVersion) throw new Error("TRANSFER_STATE_VERSION_CONFLICT");
    const saved = { ...structuredClone(state), version: expectedVersion + 1, updatedAt: new Date().toISOString() };
    this.states.set(saved.transferId, saved);
    return structuredClone(saved);
  }
}
