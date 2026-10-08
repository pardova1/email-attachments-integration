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

function validClaims(value: unknown): value is Claims {
  if (!value || typeof value !== "object") return false;
  const claims = value as Claims;
  return typeof claims.transferId === "string" && claims.transferId.length > 0 &&
    (claims.scope === "upload" || claims.scope === "download") &&
    Number.isSafeInteger(claims.exp) && claims.exp > 0;
}

export function issueTransferToken(claims: Claims, secret: string) {
  if (!secret) throw new Error("TOKEN_SIGNING_SECRET_REQUIRED");
  if (!validClaims(claims)) throw new Error("INVALID_TOKEN_CLAIMS");
  const payload = encode(JSON.stringify(claims));
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyTransferToken(token: string, secret: string, requiredScope: TransferScope): Claims {
  if (!secret) throw new Error("TOKEN_SIGNING_SECRET_REQUIRED");
  const parts = token.split(".");
  if (parts.length !== 2 || parts.some(part => !/^[A-Za-z0-9_-]+$/.test(part))) throw new Error("INVALID_TOKEN");
  const [payload, signature] = parts;

  const expected = createHmac("sha256", secret).update(payload).digest();
  const supplied = Buffer.from(signature, "base64url");
  if (supplied.toString("base64url") !== signature || expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
    throw new Error("INVALID_TOKEN");
  }

  let claims: unknown;
  try { claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")); }
  catch { throw new Error("INVALID_TOKEN"); }
  if (!validClaims(claims)) throw new Error("INVALID_TOKEN");
  if (claims.scope !== requiredScope) throw new Error("INVALID_TOKEN_SCOPE");
  if (claims.exp <= Math.floor(Date.now() / 1000)) throw new Error("TOKEN_EXPIRED");
  return claims;
}
