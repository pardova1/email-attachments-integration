export interface UploadPartReceipt {
  partNumber: number;
  providerPartId: string;
  bytes: number;
  sha256: string;
}

export interface ProductionTransitStorage {
  begin(transferId: string, contentType: string): Promise<{ uploadId: string }>;
  putPart(uploadId: string, partNumber: number, data: Buffer, sha256: string): Promise<UploadPartReceipt>;
  complete(uploadId: string, parts: UploadPartReceipt[]): Promise<{ objectKey: string }>;
  openDownload(objectKey: string): Promise<{ streamUrl: string; expiresAt: Date }>;
  purge(objectKey: string): Promise<void>;
}
