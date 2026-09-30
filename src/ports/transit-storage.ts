export interface TransitStorage {
  putPart(transferId: string, partNumber: number, data: Buffer): Promise<void>;
  complete(transferId: string, totalParts: number): Promise<{ objectKey: string }>;
  openForDownload(transferId: string): Promise<{ objectKey: string }>;
  purge(transferId: string): Promise<void>;
}
