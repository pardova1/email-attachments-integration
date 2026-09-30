import { createHmac, timingSafeEqual } from "node:crypto";

export type StaffRole = "administrator" | "support-staff" | "operations-staff";

interface StaffClaims {
  staffId: string;
  role: StaffRole;
  exp: number;
}

function encode(value: object) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

export function issueStaffToken(claims: StaffClaims, secret: string) {
  if (!secret) throw new Error("STAFF_SIGNING_SECRET_REQUIRED");
  const payload = encode(claims);
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyStaffToken(token: string, secret: string): StaffClaims {
  if (!secret) throw new Error("STAFF_SIGNING_SECRET_REQUIRED");
  const [payload, signature] = token.split(".");
  if (!payload || !signature) throw new Error("STAFF_AUTHORIZATION_REQUIRED");
  const expected = createHmac("sha256", secret).update(payload).digest();
  const received = Buffer.from(signature, "base64url");
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) throw new Error("STAFF_AUTHORIZATION_REQUIRED");
  const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as StaffClaims;
  if (!claims.staffId || !["administrator", "support-staff", "operations-staff"].includes(claims.role)) throw new Error("STAFF_AUTHORIZATION_REQUIRED");
  if (claims.exp <= Math.floor(Date.now() / 1000)) throw new Error("STAFF_AUTHORIZATION_EXPIRED");
  return claims;
}
