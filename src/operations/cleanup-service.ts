export interface PurgeableTransitStorage {
  purge(transferId: string): Promise<void>;
}

export class CleanupService {
  constructor(private readonly storage: PurgeableTransitStorage) {}

  async purgeIfExpired(transferId: string, expiresAt: Date, now = new Date()) {
    if (now.getTime() < expiresAt.getTime()) return false;
    await this.storage.purge(transferId);
    return true;
  }
}
