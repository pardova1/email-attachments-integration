import type { TransferExpirationCandidateSource } from "../ports/transfer-state-repository.js";
import { assertExpirationBatch } from "../ports/transfer-state-repository.js";

export class TransferExpirationWorker {
  private afterId?: string;
  private running = false;

  constructor(
    private readonly source: TransferExpirationCandidateSource,
    private readonly cleaner: { cleanupExpired(id: string, cutoff: Date): Promise<boolean> },
    private readonly batchSize = 100
  ) {
    assertExpirationBatch(new Date(), batchSize);
  }

  async runOnce(cutoff = new Date()) {
    if (this.running) return { scanned: 0, cleaned: 0, failed: 0, skipped: true };
    this.running = true;
    try {
      const ids = await this.source.listExpirationCandidates(cutoff, this.batchSize, this.afterId);
      let cleaned = 0, failed = 0;
      for (const id of ids) {
        try { if (await this.cleaner.cleanupExpired(id, cutoff)) cleaned++; }
        catch { failed++; }
      }
      // Advance even on failure: failed records are revisited after the cursor wraps.
      this.afterId = ids.length ? ids.at(-1) : undefined;
      return { scanned: ids.length, cleaned, failed, skipped: false };
    } finally {
      this.running = false;
    }
  }

  start(intervalMs = 60_000, report: (result: Awaited<ReturnType<TransferExpirationWorker["runOnce"]>> | undefined) => void = () => {}) {
    if (!Number.isInteger(intervalMs) || intervalMs < 1000) throw new Error("INVALID_EXPIRATION_INTERVAL");
    const tick = () => { void this.runOnce().then(report, () => report(undefined)); };
    tick();
    const timer = setInterval(tick, intervalMs);
    timer.unref();
    return () => clearInterval(timer);
  }
}
