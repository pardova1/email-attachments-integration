import { createTransfer, expectedPartCount, progress, type TransferSession } from "../domain/transfer.js";
import { assertVerifiedExact } from "../domain/file-integrity-command.js";
import type { StoragePort } from "../ports/storage.js";
import { IntegrityViolationRegistry } from "../integrity/violation-registry.js";

export class TransferService {
  private readonly sessions = new Map<string, TransferSession>();
  constructor(private readonly storage: StoragePort, private readonly violations = new IntegrityViolationRegistry()) {}

  create(input: { fileName: string; contentType: string; totalBytes: number; chunkBytes?: number; originalSha256: string; senderExpirationConfirmed: boolean }) {
    const session = createTransfer(input); this.sessions.set(session.id, session); return session;
  }
  get(id: string) {
    const session = this.sessions.get(id);
    if (!session) throw new Error("TRANSFER_NOT_FOUND");
    if (session.expiresAt.getTime() <= Date.now()) { session.status = "expired"; throw new Error("TRANSFER_EXPIRED"); }
    return session;
  }
  async uploadPart(id: string, partNumber: number, data: Buffer) {
    const session = this.get(id); const totalParts = expectedPartCount(session);
    if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > totalParts) throw new Error("INVALID_PART_NUMBER");
    await this.storage.putPart(id, partNumber, data); session.receivedParts.add(partNumber); session.status = "uploading"; return progress(session);
  }
  async complete(id: string) {
    const session = this.get(id); const totalParts = expectedPartCount(session);
    if (session.receivedParts.size !== totalParts) throw new Error("TRANSFER_INCOMPLETE");
    const stored = await this.storage.complete(id, totalParts);
    try {
      assertVerifiedExact(session.originalSha256, stored.sha256);
    } catch {
      const violation = this.violations.report({
        transferId: session.id,
        type: "INTEGRITY-WHOLE-FILE-MISMATCH",
        expectedSha256: session.originalSha256,
        receivedSha256: stored.sha256,
        details: "Completed bytes do not match sender original. Transfer must be recovered and verified again."
      });
      throw new Error(`FILE_INTEGRITY_COMMAND_VIOLATION:${violation.violationId}`);
    }
    session.status = "complete";
    return { ...stored, status: session.status, verifiedExact: true as const };
  }
  integrityViolations(id: string) {
    this.get(id);
    return this.violations.forTransfer(id);
  }
  status(id: string) { const session = this.get(id); return { id, status: session.status, ...progress(session), expiresAt: session.expiresAt }; }
}
