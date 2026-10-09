import type { RequestHandler } from "express";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { TransferService } from "../services/transfer-service.js";
import type { RecipientAccessService } from "../services/recipient-access.js";
import type { VerifiedDownloadService } from "../services/verified-download-service.js";
import { PUBLIC_TECHNICAL_DIFFICULTIES_NOTICE } from "../incidents/public-incident-notification.js";

export function createRecipientDownloadHandler(
  transfers: Pick<TransferService, "refresh" | "get">,
  access: RecipientAccessService,
  downloads: VerifiedDownloadService
): RequestHandler {
  return async (req, res) => {
    const controller = new AbortController();
    const disconnected = () => { if (!res.writableFinished) controller.abort(); };
    res.once("close", disconnected);
    let parts: AsyncGenerator<Buffer> | undefined;
    let expiryTimer: ReturnType<typeof setTimeout> | undefined;
    try {
      const id = String(req.params.id), token = String(req.query.token ?? "");
      access.verify(token, id);
      await transfers.refresh(id);
      const session = transfers.get(id);
      if (session.status !== "complete" || !session.downloadExpiresAt) throw new Error("DOWNLOAD_WINDOW_NOT_READY");
      const claims = access.verify(token, id, session.downloadExpiresAt);
      const deadline = Math.min(session.downloadExpiresAt.getTime(), claims.exp * 1000);
      const assertActive = () => {
        controller.signal.throwIfAborted();
        if (Date.now() >= deadline) throw new Error("DOWNLOAD_WINDOW_EXPIRED");
      };
      assertActive();
      expiryTimer = setTimeout(() => {
        controller.abort();
        if (res.headersSent) res.destroy();
      }, deadline - Date.now());
      expiryTimer.unref();
      parts = downloads.streamVerified(id, Math.ceil(session.totalBytes / session.chunkBytes), session.originalSha256, session.totalBytes, controller.signal);
      const first = await parts.next();
      // Whole-file verification can take time; authorization must still hold before any bytes leave.
      await transfers.refresh(id);
      const current = transfers.get(id);
      if (current.status !== "complete" || !current.downloadExpiresAt) throw new Error("DOWNLOAD_WINDOW_NOT_READY");
      access.verify(token, id, current.downloadExpiresAt);
      assertActive();
      res.setHeader("Content-Type", session.contentType);
      res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(session.fileName)}`);
      res.setHeader("Content-Length", String(session.totalBytes));
      const remaining = parts;
      const source = Readable.from((async function* () {
        assertActive();
        if (!first.done) yield first.value;
        for await (const part of remaining) {
          assertActive();
          yield part;
        }
      })(), { objectMode: false, highWaterMark: 64 * 1024 });
      await pipeline(source, res, { signal: controller.signal });
    } catch {
      if (res.destroyed) return;
      if (res.headersSent) { res.destroy(); return; }
      res.removeHeader("Content-Length");
      res.removeHeader("Content-Disposition");
      res.status(403).json({ error: PUBLIC_TECHNICAL_DIFFICULTIES_NOTICE });
    } finally {
      clearTimeout(expiryTimer);
      res.off("close", disconnected);
      controller.abort();
      await parts?.return(undefined);
    }
  };
}
