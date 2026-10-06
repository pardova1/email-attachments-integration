export function requireProductionSecret(name: "TOKEN_SIGNING_SECRET" | "STAFF_SIGNING_SECRET", developmentFallback: string) {
  const value = process.env[name];
  if (value) return value;
  if (process.env.NODE_ENV === "production") throw new Error(`${name}_NOT_CONFIGURED`);
  return developmentFallback;
}
