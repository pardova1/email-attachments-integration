import { randomUUID } from "node:crypto";

export interface TransferCryptoContext {
  transferId: string;
  laneId: string;
  keyReference: string;
  encryptionScope: "single-transfer";
  createdAt: string;
}

export interface TransferKeyVault {
  createKey(scope: { transferId: string; laneId: string }): Promise<string>;
  destroyKey(keyReference: string): Promise<void>;
}

export class TransferCryptoContextService {
  constructor(private readonly vault: TransferKeyVault) {}

  async create(transferId: string, laneId: string): Promise<TransferCryptoContext> {
    if (!transferId || !laneId) throw new Error("TRANSFER_CRYPTO_IDENTITY_REQUIRED");
    const keyReference = await this.vault.createKey({transferId,laneId});
    return {
      transferId,
      laneId,
      keyReference,
      encryptionScope:"single-transfer",
      createdAt:new Date().toISOString()
    };
  }

  rehydrate(transferId: string, laneId: string, keyReference: string): TransferCryptoContext {\n    if (!transferId || !laneId || !keyReference) throw new Error("TRANSFER_CRYPTO_REFERENCE_REQUIRED");\n    return {\n      transferId,\n      laneId,\n      keyReference,\n      encryptionScope: "single-transfer",\n      createdAt: new Date().toISOString()\n    };\n  }\n\n  async destroy(context: TransferCryptoContext) {
    await this.vault.destroyKey(context.keyReference);
  }
}

// Development/test only. Production must use a managed KMS/HSM-backed vault and
// must never persist raw encryption keys in application metadata or logs.
export class MemoryTransferKeyVault implements TransferKeyVault {
  private readonly keys = new Map<string,{transferId:string;laneId:string}>();

  async createKey(scope:{transferId:string;laneId:string}) {
    const reference=`dev-key-${randomUUID()}`;
    this.keys.set(reference,scope);
    return reference;
  }

  async destroyKey(reference:string) {
    this.keys.delete(reference);
  }
}
