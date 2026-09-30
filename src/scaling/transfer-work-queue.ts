export interface TransferJob {
  jobId: string;
  transferId: string;
  idempotencyKey: string;
  createdAt: Date;
}

export interface TransferWorkQueue {
  enqueue(job: TransferJob): Promise<"queued" | "duplicate">;
  claim(workerId: string): Promise<TransferJob | null>;
  complete(jobId: string, workerId: string): Promise<void>;
  fail(jobId: string, workerId: string, retryable: boolean): Promise<void>;
  depth(): Promise<number>;
}

export interface CapacitySnapshot {
  queueDepth: number;
  activeWorkers: number;
  availableWorkers: number;
  storageHealthy: boolean;
  databaseHealthy: boolean;
}

export type CapacityDecision = "accept" | "scale-out" | "throttle";

export function capacityDecision(snapshot: CapacitySnapshot): CapacityDecision {
  if (!snapshot.storageHealthy || !snapshot.databaseHealthy) return "throttle";
  if (snapshot.queueDepth > snapshot.availableWorkers * 10) return "scale-out";
  return "accept";
}
