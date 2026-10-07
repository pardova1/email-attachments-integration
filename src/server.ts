import express from "express";
import { z } from "zod";
import { MemoryStorage } from "./adapters/memory-storage.js";
import { SupabaseStorage } from "./adapters/supabase-storage.js";
import type { StoragePort } from "./ports/storage.js";
import { TransferService } from "./services/transfer-service.js";
import { RecipientAccessService } from "./services/recipient-access.js";
import { senderExpirationNotice, recipientExpirationNotice } from "./domain/expiration-notices.js";
import { requireChunkSha256 } from "./services/chunk-integrity-gate.js";
import { MemoryLicenseRepository } from "./adapters/memory-license-repository.js";
import { SupabaseLicenseRepository } from "./adapters/supabase-license-repository.js";
import type { LicenseRepository } from "./billing/license-repository.js";
import { EntitlementService } from "./billing/entitlement-service.js";
import type { PaymentProvider } from "./billing/payment-provider.js";
import { SendAuthorizationService } from "./services/send-authorization-service.js";
import { verifyStaffToken } from "./security/staff-authorization.js";
import { PUBLIC_TECHNICAL_DIFFICULTIES_NOTICE } from "./incidents/public-incident-notification.js";
import { MemoryTransferStateRepository } from "./adapters/memory-transfer-state-repository.js";
import { SupabaseTransferStateRepository } from "./adapters/supabase-transfer-state-repository.js";
import type { TransferStateRepository } from "./ports/transfer-state-repository.js";
import { requireProductionConfig, requireProductionSecret } from "./config/production-secrets.js";
import { SupabaseSenderAuthenticator } from "./security/supabase-sender-authenticator.js";
import { VerifiedDownloadService } from "./services/verified-download-service.js";
import { createLicensePaymentApplicationRepository } from "./config/license-payment-application-factory.js";
import { createNotificationOutbox } from "./config/notification-outbox-factory.js";

const app = express();
const storage = createStorage();
const transferStateRepository = createTransferStateRepository();
const service = new TransferService(storage, undefined, transferStateRepository);
const verifiedDownloads = new VerifiedDownloadService(storage);
const notificationOutbox = createNotificationOutbox();

function createStorage(): StoragePort {
  const url = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (url && secretKey) return new SupabaseStorage(url, secretKey);
  if (process.env.NODE_ENV === "production") throw new Error("DURABLE_BYTE_STORAGE_NOT_CONFIGURED");
  return new MemoryStorage();
}

function createTransferStateRepository(): TransferStateRepository {
  const url = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (url && secretKey) return new SupabaseTransferStateRepository({ url, secretKey });
  if (process.env.NODE_ENV === "production") throw new Error("DURABLE_TRANSFER_STATE_NOT_CONFIGURED");
  return new MemoryTransferStateRepository();
}
function createLicenseRepository(): LicenseRepository {
  const url = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (url && secretKey) return new SupabaseLicenseRepository(url, secretKey);
  if (process.env.NODE_ENV === "production") throw new Error("DURABLE_LICENSE_STATE_NOT_CONFIGURED");
  return new MemoryLicenseRepository();
}

const signingSecret = requireProductionSecret("TOKEN_SIGNING_SECRET", "development-only-secret");
const staffSigningSecret = requireProductionSecret("STAFF_SIGNING_SECRET", "development-staff-secret");
const recipientAccess = new RecipientAccessService(signingSecret);
const licenses = createLicenseRepository();
const unavailablePayments: PaymentProvider = {
  async createCheckout() { throw new Error("PAYMENT_PROVIDER_NOT_CONFIGURED"); },
  async verifyPayment() { throw new Error("PAYMENT_PROVIDER_NOT_CONFIGURED"); }
};
const paymentApplications = createLicensePaymentApplicationRepository(licenses);
const entitlements = new EntitlementService(unavailablePayments, licenses, paymentApplications);
const authorizedSends = new SendAuthorizationService(entitlements, service);
const senderAuthenticator = new SupabaseSenderAuthenticator(
  requireProductionConfig("SUPABASE_URL", "http://localhost:54321"),
  requireProductionSecret("SUPABASE_PUBLISHABLE_KEY", "development-publishable-key")
);

app.use(express.json({ limit: "1mb" }));
app.get("/health", (_req, res) => res.json({ ok: true }));

const createSchema = z.object({
  fileName: z.string().min(1).max(1024),
  contentType: z.string().min(1).max(255),
  totalBytes: z.number().int().positive(),
  chunkBytes: z.number().int().positive().optional(),
  senderExpirationConfirmed: z.literal(true),
  originalSha256: z.string().regex(/^[a-fA-F0-9]{64}$/)
});

app.post("/v1/transfers", async (req, res) => {
  try {
    const input = createSchema.parse(req.body);
    const sender = await senderAuthenticator.authenticate(req.header("authorization"));
    const t = await authorizedSends.createForValidUser(sender.userId, input);
    res.status(201).json({
      id: t.id,
      chunkBytes: t.chunkBytes,
      uploadExpiresAt: t.uploadExpiresAt,
      senderNotice: senderExpirationNotice,
      recipientNotice: recipientExpirationNotice,
      uploadPartUrlTemplate: `/v1/transfers/${t.id}/parts/{partNumber}`
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "INVALID_REQUEST";
    const status = message === "SENDER_AUTHENTICATION_REQUIRED" ? 401 : message === "ACTIVE_LICENSE_REQUIRED" ? 403 : 400;
    res.status(status).json({
      error: message,
      ...(message === "ACTIVE_LICENSE_REQUIRED" ? { note: "Please renew your service." } : {})
    });
  }
});

app.put("/v1/transfers/:id/parts/:partNumber", express.raw({ type: "*/*", limit: "70mb" }), async (req, res) => {
  try {
    const data = Buffer.from(req.body);
    const checksum = req.header("x-content-sha256");
    requireChunkSha256(data, checksum);
    const result = await service.uploadPart(req.params.id, Number(req.params.partNumber), data);
    res.json({ ...result, checksumVerified: true });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "UPLOAD_FAILED" });
  }
});

app.get("/v1/transfers/:id", async (req, res) => {
  try { await service.ensureLoaded(req.params.id); res.json(service.status(req.params.id)); }
  catch (error) { res.status(404).json({ error: error instanceof Error ? error.message : "NOT_FOUND" }); }
});

app.get("/v1/staff/transfers/:id/integrity-violations", (req, res) => {
  try {
    const authorization = req.header("authorization") ?? "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    const staff = verifyStaffToken(token, staffSigningSecret);
    res.json({ audience: "staff-only", staffRole: staff.role, transferId: req.params.id, violations: service.integrityViolations(req.params.id) });
  } catch {
    res.status(403).json({ error: "STAFF_AUTHORIZATION_REQUIRED" });
  }
});

app.post("/v1/transfers/:id/complete", async (req, res) => {
  try {
    const completed = await service.complete(req.params.id);
    const session = service.get(req.params.id);
    if (!session.downloadExpiresAt) throw new Error("DOWNLOAD_WINDOW_NOT_READY");
    const downloadToken = recipientAccess.issue(session.id, session.downloadExpiresAt);
    res.json({
      ...completed,
      downloadExpiresAt: session.downloadExpiresAt,
      recipientNotice: recipientExpirationNotice,
      recipientAccess: `/v1/transfers/${session.id}/download?token=${downloadToken}`
    });
  } catch (error) {
    res.status(409).json({ error: PUBLIC_TECHNICAL_DIFFICULTIES_NOTICE });
  }
});

app.get("/v1/transfers/:id/download", async (req, res) => {
  try {
    const token = String(req.query.token ?? "");
    recipientAccess.verify(token, req.params.id);
    await service.ensureLoaded(req.params.id);
    const session = service.get(req.params.id);
    const totalParts = Math.ceil(session.totalBytes / session.chunkBytes);
    const parts = verifiedDownloads.streamVerified(req.params.id, totalParts, session.originalSha256);
    const first = await parts.next();
    res.setHeader("Content-Type", session.contentType);
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(session.fileName)}`);
    res.setHeader("Content-Length", String(session.totalBytes));
    if (!first.done && !res.write(first.value)) await new Promise<void>(resolve => res.once("drain", resolve));
    for await (const part of parts) {
      if (!res.write(part)) await new Promise<void>(resolve => res.once("drain", resolve));
    }
    res.end();
  } catch (error) {
    res.status(403).json({ error: PUBLIC_TECHNICAL_DIFFICULTIES_NOTICE });
  }
});

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => console.log(`email-attachments-integration listening on :${port}`));
