import { issueTransferToken, verifyTransferToken } from "../security/transfer-token.js";

export class RecipientAccessService {
  constructor(private readonly secret: string) {
    if (!secret) throw new Error("TOKEN_SIGNING_SECRET_REQUIRED");
  }

  issue(transferId: string, expiresAt: Date) {
    if (expiresAt.getTime() <= Date.now()) throw new Error("DOWNLOAD_WINDOW_EXPIRED");
    return issueTransferToken({
      transferId,
      scope: "download",
      exp: Math.floor(expiresAt.getTime() / 1000)
    }, this.secret);
  }

  verify(token: string, expectedTransferId: string, authoritativeExpiresAt?: Date, now = new Date()) {
    const claims = verifyTransferToken(token, this.secret, "download");
    if (claims.transferId !== expectedTransferId) throw new Error("TOKEN_TRANSFER_MISMATCH");

    if (authoritativeExpiresAt) {
      if (authoritativeExpiresAt.getTime() <= now.getTime()) throw new Error("DOWNLOAD_WINDOW_EXPIRED");
      const authoritativeExpSeconds = Math.floor(authoritativeExpiresAt.getTime() / 1000);
      if (claims.exp > authoritativeExpSeconds) throw new Error("TOKEN_EXCEEDS_DOWNLOAD_WINDOW");
    }

    return claims;
  }
}
