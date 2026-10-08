import type { PersistedTransferState, TransferStateRepository } from "../ports/transfer-state-repository.js";
import { assertExpirationBatch } from "../ports/transfer-state-repository.js";

export class MemoryTransferStateRepository implements TransferStateRepository {
  private readonly states = new Map<string, PersistedTransferState>();

  async listExpirationCandidates(cutoff: Date, limit: number, afterId?: string) {
    assertExpirationBatch(cutoff, limit);
    return [...this.states.values()]
      .filter(state => (!afterId || state.transferId > afterId) &&
        (state.status === "expired" || new Date(state.downloadExpiresAt ?? state.uploadExpiresAt).getTime() <= cutoff.getTime()))
      .map(state => state.transferId).sort().slice(0, limit);
  }

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
