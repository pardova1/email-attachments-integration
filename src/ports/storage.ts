export interface StoragePort {
  putPart(transferId: string, partNumber: number, data: Buffer): Promise<void>;
  complete(transferId: string, totalParts: number): Promise<{ objectKey: string; sha256: string }>;
  readPart(transferId: string, partNumber: number): Promise<Buffer>;
  purge(transferId: string): Promise<void>;
}
