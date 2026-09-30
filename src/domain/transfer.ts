import { randomUUID } from "node:crypto";

export const INITIAL_MAX_TRANSFER_BYTES = 500 * 1024 ** 3;
export const DEFAULT_CHUNK_BYTES = 64 * 1024 ** 2;

export type TransferStatus = "created" | "uploading" | "complete" | "expired";

export interface TransferSession {
  id: string;
  fileName: string;
  contentType: string;
  totalBytes: number;
  chunkBytes: number;
  receivedParts: Set<number>;
  status: TransferStatus;
  createdAt: Date;
  expiresAt: Date;
}

export function createTransfer(input: {
  fileName: string;
  contentType: string;
  totalBytes: number;
  chunkBytes?: number;
}): TransferSession {
  if (input.totalBytes <= 0 || input.totalBytes > INITIAL_MAX_TRANSFER_BYTES) {
    throw new Error("TRANSFER_SIZE_NOT_SUPPORTED");
  }
  return {
    id: randomUUID(),
    fileName: input.fileName,
    contentType: input.contentType,
    totalBytes: input.totalBytes,
    chunkBytes: input.chunkBytes ?? DEFAULT_CHUNK_BYTES,
    receivedParts: new Set(),
    status: "created",
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
  };
}

export function expectedPartCount(t: TransferSession): number {
  return Math.ceil(t.totalBytes / t.chunkBytes);
}

export function progress(t: TransferSession) {
  const totalParts = expectedPartCount(t);
  return {
    receivedParts: t.receivedParts.size,
    totalParts,
    percent: totalParts === 0 ? 0 : Math.floor((t.receivedParts.size / totalParts) * 100)
  };
}
