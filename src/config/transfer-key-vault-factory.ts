import {VaultTransitTransferKeyVault} from "../adapters/vault-transit-transfer-key-vault.js";
import { MemoryTransferKeyVault, type TransferKeyVault } from "../security/transfer-crypto-context.js";

export function createTransferKeyVault(env: NodeJS.ProcessEnv = process.env, request:typeof fetch=globalThis.fetch): TransferKeyVault {
  if(env.TRANSFER_KEY_VAULT_PROVIDER!==undefined){
    if(env.TRANSFER_KEY_VAULT_PROVIDER!=="vault-transit")throw new Error("INVALID_TRANSFER_KEY_VAULT_CONFIGURATION");
    const timeout=env.TRANSFER_KEY_VAULT_TIMEOUT_MS;
    if(timeout!==undefined&&!/^[0-9]+$/.test(timeout))throw new Error("INVALID_TRANSFER_KEY_VAULT_CONFIGURATION");
    return new VaultTransitTransferKeyVault({address:env.VAULT_ADDR??"",token:env.VAULT_TOKEN??"",mount:env.VAULT_TRANSIT_MOUNT,namespace:env.VAULT_NAMESPACE,timeoutMs:timeout===undefined?undefined:Number(timeout)},request);
  }
  if (env.NODE_ENV === "production") throw new Error("TRANSFER_KEY_VAULT_NOT_CONFIGURED");
  return new MemoryTransferKeyVault();
}
