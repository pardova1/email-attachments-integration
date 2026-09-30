import { createHmac, timingSafeEqual } from "node:crypto";

export type TransferScope = "upload" | "download";

interface Claims {
  transferId: string;
  scope: TransferScope;
  exp: number;
}

function encode(value: string) {
  return Buffer.from(value).toString("base64url");
}

export function issueTransferToken(claims: Claims, secret: string) {
  const payload = encode(JSON.stringify(claims));
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyTransferToken(token: string, secret: string, requiredScope: TransferScope): Claims {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) throw new Error("INVALID_TOKEN");

  const expected = createHmac("sha256", secret).update(payload).digest();
  const supplied = Buffer.from(signature, "base64url");
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
    throw new Error("INVALID_TOKEN");
  }

  const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Claims;
  if (claims.scope !== requiredScope) throw new Error("INVALID_TOKEN_SCOPE");
  if (claims.exp <= Math.floor(Date.now() / 1000)) throw new Error("TOKEN_EXPIRED");
  return claims;
}
