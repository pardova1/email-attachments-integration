export const FILE_INTEGRITY_COMMAND = Object.freeze({
  mode: "immutable" as const,
  requiredOutcome: "byte-for-byte-identical" as const,
  allowMutation: false as const,
  successRequiresCryptographicVerification: true as const
});

export function assertVerifiedExact(expectedSha256: string, receivedSha256: string) {
  if (!expectedSha256 || !receivedSha256 || expectedSha256 !== receivedSha256) {
    throw new Error("FILE_INTEGRITY_COMMAND_VIOLATION");
  }
  return { verifiedExact: true as const };
}
