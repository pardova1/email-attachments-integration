import type { PersistedTransferState, TransferStateRepository } from "../ports/transfer-state-repository.js";
import { assertExpirationBatch } from "../ports/transfer-state-repository.js";

type SupabaseTransferStateRepositoryConfig = {
  url: string;
  secretKey: string;
};

type TransferStateRow = {
  transfer_id: string; lane_id: string; key_reference: string | null; file_name: string; content_type: string;
  total_bytes: number | string; chunk_bytes: number; original_sha256: string; sender_expiration_confirmed: boolean;
  created_at: string; status: PersistedTransferState["status"]; confirmed_parts: number[];
  part_sha256: Record<string, string>; active_storage_id: string | null; last_verified_part: number | null;
  upload_expires_at: string; download_available_at: string | null; download_expires_at: string | null;
  updated_at: string; version: number;
};

export class SupabaseTransferStateRepository implements TransferStateRepository {
  private readonly endpoint: string;
  private readonly headers: Record<string, string>;

  constructor(config: SupabaseTransferStateRepositoryConfig) {
    this.endpoint = `${config.url.replace(/\/$/, "")}/rest/v1/transfer_states`;
    this.headers = {
      apikey: config.secretKey,
      Authorization: `Bearer ${config.secretKey}`,
      "Content-Type": "application/json"
    };
  }

  async get(transferId: string) {
    const response = await fetch(`${this.endpoint}?transfer_id=eq.${encodeURIComponent(transferId)}&select=*`, {
      headers: this.headers
    });
    if (!response.ok) throw new Error("TRANSFER_STATE_READ_FAILED");
    const rows = await response.json() as TransferStateRow[];
    return rows[0] ? fromRow(rows[0]) : undefined;
  }

  async listExpirationCandidates(cutoff: Date, limit: number, afterId?: string) {
    assertExpirationBatch(cutoff, limit);
    const timestamp = cutoff.toISOString();
    const query = new URLSearchParams({
      select: "transfer_id", order: "transfer_id.asc", limit: String(limit),
      or: `(status.eq.expired,and(download_expires_at.not.is.null,download_expires_at.lte.${timestamp}),and(download_expires_at.is.null,upload_expires_at.lte.${timestamp}))`
    });
    if (afterId) query.set("transfer_id", `gt.${afterId}`);
    const response = await fetch(`${this.endpoint}?${query}`, { headers: this.headers });
    if (!response.ok) throw new Error("TRANSFER_EXPIRATION_SCAN_FAILED");
    const rows = await response.json() as { transfer_id: string }[];
    return rows.map(row => row.transfer_id);
  }

  async create(state: PersistedTransferState) {
    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: { ...this.headers, Prefer: "return=minimal" },
      body: JSON.stringify(toRow(state))
    });
    if (response.status === 409) throw new Error("TRANSFER_STATE_ALREADY_EXISTS");
    if (!response.ok) throw new Error("TRANSFER_STATE_CREATE_FAILED");
  }

  async save(state: PersistedTransferState, expectedVersion: number) {
    const next = { ...state, version: expectedVersion + 1, updatedAt: new Date().toISOString() };
    const response = await fetch(
      `${this.endpoint}?transfer_id=eq.${encodeURIComponent(state.transferId)}&version=eq.${expectedVersion}`,
      {
        method: "PATCH",
        headers: { ...this.headers, Prefer: "return=representation" },
        body: JSON.stringify(toRow(next))
      }
    );
    if (!response.ok) throw new Error("TRANSFER_STATE_SAVE_FAILED");
    const rows = await response.json() as TransferStateRow[];
    if (rows.length === 0) {
      const current = await this.get(state.transferId);
      if (!current) throw new Error("TRANSFER_STATE_NOT_FOUND");
      throw new Error("TRANSFER_STATE_VERSION_CONFLICT");
    }
    return fromRow(rows[0]);
  }
}

function toRow(state: PersistedTransferState) {
  return {
    transfer_id: state.transferId, lane_id: state.laneId, key_reference: state.keyReference ?? null,
    file_name: state.fileName, content_type: state.contentType, total_bytes: state.totalBytes,
    chunk_bytes: state.chunkBytes, original_sha256: state.originalSha256,
    sender_expiration_confirmed: state.senderExpirationConfirmed, created_at: state.createdAt,
    status: state.status, confirmed_parts: state.confirmedParts, part_sha256: state.partSha256,
    active_storage_id: state.activeStorageId ?? null, last_verified_part: state.lastVerifiedPart ?? null,
    upload_expires_at: state.uploadExpiresAt, download_available_at: state.downloadAvailableAt ?? null,
    download_expires_at: state.downloadExpiresAt ?? null, updated_at: state.updatedAt, version: state.version
  };
}

function fromRow(row: TransferStateRow): PersistedTransferState {
  return {
    transferId: row.transfer_id, laneId: row.lane_id, ...(row.key_reference ? { keyReference: row.key_reference } : {}),
    fileName: row.file_name, contentType: row.content_type, totalBytes: Number(row.total_bytes), chunkBytes: row.chunk_bytes,
    originalSha256: row.original_sha256, senderExpirationConfirmed: row.sender_expiration_confirmed,
    createdAt: row.created_at, status: row.status, confirmedParts: row.confirmed_parts,
    partSha256: Object.fromEntries(Object.entries(row.part_sha256).map(([key, value]) => [Number(key), value])),
    ...(row.active_storage_id ? { activeStorageId: row.active_storage_id } : {}),
    ...(row.last_verified_part !== null ? { lastVerifiedPart: row.last_verified_part } : {}),
    uploadExpiresAt: row.upload_expires_at,
    ...(row.download_available_at ? { downloadAvailableAt: row.download_available_at } : {}),
    ...(row.download_expires_at ? { downloadExpiresAt: row.download_expires_at } : {}),
    updatedAt: row.updated_at, version: row.version
  };
}
