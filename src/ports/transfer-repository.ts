import type { TransferSession } from "../domain/transfer.js";

export interface TransferRepository {
  save(session: TransferSession): Promise<void>;
  findById(id: string): Promise<TransferSession | null>;
  delete(id: string): Promise<void>;
}
