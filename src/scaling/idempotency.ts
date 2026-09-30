export class IdempotencyRegistry {
  private readonly completed = new Map<string, string>();

  remember(key: string, transferId: string) {
    const existing = this.completed.get(key);
    if (existing && existing !== transferId) throw new Error("IDEMPOTENCY_KEY_CONFLICT");
    this.completed.set(key, transferId);
    return transferId;
  }

  lookup(key: string) {
    return this.completed.get(key) ?? null;
  }
}
