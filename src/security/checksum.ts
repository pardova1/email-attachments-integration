import { createHash } from "node:crypto";

export function sha256(data: Buffer) {
  return createHash("sha256").update(data).digest("hex");
}

export function verifySha256(data: Buffer, expected: string) {
  const actual = sha256(data);
  if (actual !== expected.toLowerCase()) throw new Error("CHECKSUM_MISMATCH");
  return actual;
}
