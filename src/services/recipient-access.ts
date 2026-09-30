import { issueTransferToken, verifyTransferToken } from "../security/transfer-token.js";

export class RecipientAccessService {
  constructor(private readonly secret: string) {
    if (!secret) throw new Error("TOKEN_SIGNING_SECRET_REQUIRED");
  }

  issue(transferId: string, expiresAt: Date) {
    return issueTransferToken({
      transferId,
      scope: "download",
      exp: Math.floor(expiresAt.getTime() / 1000)
    }, this.secret);
  }

  verify(token: string, expectedTransferId: string) {
    const claims = verifyTransferToken(token, this.secret, "download");
    if (claims.transferId !== expectedTransferId) throw new Error("TOKEN_TRANSFER_MISMATCH");
    return claims;
  }
}
