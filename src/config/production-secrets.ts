export type ProductionSecretName = "TOKEN_SIGNING_SECRET" | "STAFF_SIGNING_SECRET" | "SUPABASE_PUBLISHABLE_KEY";
export type ProductionConfigName = ProductionSecretName | "SUPABASE_URL";

export function requireProductionConfig(name: ProductionConfigName, developmentFallback: string) {
  const value = process.env[name]?.trim();
  if (value) return value;
  if (process.env.NODE_ENV === "production") throw new Error(`${name}_NOT_CONFIGURED`);
  return developmentFallback;
}

export function requireProductionSecret(name: ProductionSecretName, developmentFallback: string) {
  return requireProductionConfig(name, developmentFallback);
}
