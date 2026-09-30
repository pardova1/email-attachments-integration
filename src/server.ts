import express from "express";
import { z } from "zod";
import { MemoryStorage } from "./adapters/memory-storage.js";
import { TransferService } from "./services/transfer-service.js";
import { RecipientAccessService } from "./services/recipient-access.js";
import { senderExpirationNotice, recipientExpirationNotice } from "./domain/expiration-notices.js";
import { verifySha256 } from "./security/checksum.js";
import { MemoryLicenseRepository } from "./adapters/memory-license-repository.js";
import { EntitlementService } from "./billing/entitlement-service.js";
import type { PaymentProvider } from "./billing/payment-provider.js";
import { SendAuthorizationService } from "./services/send-authorization-service.js";

const app = express();
const storage = new MemoryStorage();
const service = new TransferService(storage);
const signingSecret = process.env.TOKEN_SIGNING_SECRET ?? "development-only-secret";
const recipientAccess = new RecipientAccessService(signingSecret);
const licenses = new MemoryLicenseRepository();
const unavailablePayments: PaymentProvider = {
  async createCheckout() { throw new Error("PAYMENT_PROVIDER_NOT_CONFIGURED"); },
  async verifyPayment() { throw new Error("PAYMENT_PROVIDER_NOT_CONFIGURED"); }
};
const entitlements = new EntitlementService(unavailablePayments, licenses);
const authorizedSends = new SendAuthorizationService(entitlements, service);

app.use(express.json({ limit: "1mb" }));
app.get("/health", (_req, res) => res.json({ ok: true }));

const createSchema = z.object({
  fileName: z.string().min(1).max(1024),
  contentType: z.string().min(1).max(255),
  totalBytes: z.number().int().positive(),
  chunkBytes: z.number().int().positive().optional(),
  senderExpirationConfirmed: z.literal(true),
  originalSha256: z.string().regex(/^[a-fA-F0-9]{64}$/),
  userId: z.string().min(1).max(255)
});

app.post("/v1/transfers", async (req, res) => {
  try {
    const input = createSchema.parse(req.body);
    const { userId, ...transferInput } = input;
    const t = await authorizedSends.createForValidUser(userId, transferInput);
    res.status(201).json({
      id: t.id,
      chunkBytes: t.chunkBytes,
      expiresAt: t.expiresAt,
      senderNotice: senderExpirationNotice,
      recipientNotice: recipientExpirationNotice,
      uploadPartUrlTemplate: `/v1/transfers/${t.id}/parts/{partNumber}`
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "INVALID_REQUEST";
    const status = message === "ACTIVE_LICENSE_REQUIRED" ? 403 : 400;
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
    if (checksum) verifySha256(data, checksum);
    const result = await service.uploadPart(req.params.id, Number(req.params.partNumber), data);
    res.json({ ...result, checksumVerified: Boolean(checksum) });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "UPLOAD_FAILED" });
  }
});

app.get("/v1/transfers/:id", (req, res) => {
  try { res.json(service.status(req.params.id)); }
  catch (error) { res.status(404).json({ error: error instanceof Error ? error.message : "NOT_FOUND" }); }
});

app.post("/v1/transfers/:id/complete", async (req, res) => {
  try {
    const completed = await service.complete(req.params.id);
    const session = service.get(req.params.id);
    const downloadToken = recipientAccess.issue(session.id, session.expiresAt);
    res.json({
      ...completed,
      expiresAt: session.expiresAt,
      recipientNotice: recipientExpirationNotice,
      recipientAccess: `/v1/transfers/${session.id}/download?token=${downloadToken}`
    });
  } catch (error) {
    res.status(409).json({ error: error instanceof Error ? error.message : "COMPLETE_FAILED" });
  }
});

app.get("/v1/transfers/:id/download", async (req, res) => {
  try {
    const token = String(req.query.token ?? "");
    recipientAccess.verify(token, req.params.id);
    service.get(req.params.id);
    const object = await storage.openForDownload(req.params.id);
    res.json({ transferId: req.params.id, objectKey: object.objectKey, notice: recipientExpirationNotice });
  } catch (error) {
    res.status(403).json({ error: error instanceof Error ? error.message : "ACCESS_DENIED" });
  }
});

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => console.log(`email-attachments-integration listening on :${port}`));
