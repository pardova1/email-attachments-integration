import { randomUUID } from "node:crypto";

export const INITIAL_MAX_TRANSFER_BYTES = 500 * 1024 ** 3;
export const DEFAULT_CHUNK_BYTES = 64 * 1024 ** 2;
export const MAX_CHUNK_BYTES = DEFAULT_CHUNK_BYTES;
export const ACTIVE_TRANSFER_EXPIRATION_HOURS = 4;
export const TRANSFER_EXPIRATION_MS = ACTIVE_TRANSFER_EXPIRATION_HOURS * 60 * 60 * 1000;
export const FUTURE_EXPIRATION_OPTIONS_HOURS = [24] as const;

export type TransferStatus = "created" | "uploading" | "complete" | "expired";

export interface TransferSession {
  id: string;
  fileName: string;
  contentType: string;
  totalBytes: number;
  chunkBytes: number;
  originalSha256: string;
  receivedParts: Set<number>;
  status: TransferStatus;
  createdAt: Date;
  uploadExpiresAt: Date;
  downloadAvailableAt: Date | null;
  downloadExpiresAt: Date | null;
  senderExpirationConfirmed: boolean;
}

export function createTransfer(input: {
  fileName: string;
  contentType: string;
  totalBytes: number;
  chunkBytes?: number;
  originalSha256: string;
  senderExpirationConfirmed: boolean;
}): TransferSession {
  if (!input.senderExpirationConfirmed) throw new Error("EXPIRATION_CONFIRMATION_REQUIRED");
  if (!Number.isSafeInteger(input.totalBytes) || input.totalBytes <= 0 || input.totalBytes > INITIAL_MAX_TRANSFER_BYTES) throw new Error("TRANSFER_SIZE_NOT_SUPPORTED");
  const chunkBytes = input.chunkBytes ?? DEFAULT_CHUNK_BYTES;
  if (!Number.isSafeInteger(chunkBytes) || chunkBytes <= 0 || chunkBytes > MAX_CHUNK_BYTES) throw new Error("INVALID_CHUNK_SIZE");
  if (!/^[a-f0-9]{64}$/i.test(input.originalSha256)) throw new Error("INVALID_ORIGINAL_SHA256");
  const createdAt = new Date();
  return {
    id: randomUUID(), fileName: input.fileName, contentType: input.contentType,
    totalBytes: input.totalBytes, chunkBytes,
    originalSha256: input.originalSha256.toLowerCase(), receivedParts: new Set(),
    status: "created", createdAt,
    uploadExpiresAt: new Date(createdAt.getTime() + TRANSFER_EXPIRATION_MS),
    downloadAvailableAt: null,
    downloadExpiresAt: null,
    senderExpirationConfirmed: true
  };
}

export function expectedPartCount(t: TransferSession): number { return Math.ceil(t.totalBytes / t.chunkBytes); }
export function progress(t: TransferSession) {
  const totalParts = expectedPartCount(t);
  return { receivedParts: t.receivedParts.size, totalParts, percent: totalParts === 0 ? 0 : Math.floor((t.receivedParts.size / totalParts) * 100) };
}
