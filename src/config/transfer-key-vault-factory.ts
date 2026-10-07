import { MemoryTransferKeyVault, type TransferKeyVault } from "../security/transfer-crypto-context.js";

export function createTransferKeyVault(env: NodeJS.ProcessEnv = process.env): TransferKeyVault {
  if (env.NODE_ENV === "production") throw new Error("TRANSFER_KEY_VAULT_NOT_CONFIGURED");
  return new MemoryTransferKeyVault();
}
