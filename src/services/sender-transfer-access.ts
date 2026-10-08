import { issueTransferToken, verifyTransferToken } from "../security/transfer-token.js";
import type { RequestHandler } from "express";

export class SenderTransferAccessService {
  constructor(private readonly secret: string) {
    if (!secret) throw new Error("TOKEN_SIGNING_SECRET_REQUIRED");
  }

  issue(transferId: string, uploadExpiresAt: Date) {
    if (!Number.isFinite(uploadExpiresAt.getTime()) || uploadExpiresAt.getTime() <= Date.now()) {
      throw new Error("UPLOAD_WINDOW_EXPIRED");
    }
    return issueTransferToken({ transferId, scope: "upload", exp: Math.floor(uploadExpiresAt.getTime() / 1000) }, this.secret);
  }

  verify(authorization: string | undefined, expectedTransferId: string) {
    if (!authorization?.startsWith("Bearer ")) throw new Error("SENDER_TRANSFER_AUTHORIZATION_REQUIRED");
    const claims = verifyTransferToken(authorization.slice(7).trim(), this.secret, "upload");
    if (claims.transferId !== expectedTransferId) throw new Error("TOKEN_TRANSFER_MISMATCH");
    return claims;
  }
}

export function requireSenderTransferAccess(access: SenderTransferAccessService): RequestHandler {
  return (req, res, next) => {
    try {
      access.verify(req.header("authorization"), String(req.params.id));
      next();
    } catch {
      res.status(401).json({ error: "SENDER_TRANSFER_AUTHORIZATION_REQUIRED" });
    }
  };
}
