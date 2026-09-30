export interface StoragePort {
  putPart(transferId: string, partNumber: number, data: Buffer): Promise<void>;
  complete(transferId: string, totalParts: number): Promise<{ objectKey: string; sha256: string }>;
}
