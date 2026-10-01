export type StorageOperatingStatus = "operating-normally" | "degraded" | "unavailable";

export interface StorageArea {
  id: string;
  region: string;
  operatingStatus: StorageOperatingStatus;
  availableBytes: number;
  latencyMs: number;
  errorRate: number;
  acceptsTransfer: boolean;
  estimatedThroughputBytesPerSecond?: number;
}

export interface StorageRoute {
  primary: StorageArea;
  backup: StorageArea;
}

export type FailoverStage =
  | "automatically-activated"
  | "analyzing"
  | "correcting-any-issues"
  | "affected-transfer-continues"
  | "other-lanes-remain-unaffected"
  | "verified-exact";

function estimatedCompletionMs(area: StorageArea, requiredBytes: number) {
  const throughput = area.estimatedThroughputBytesPerSecond ?? 1;
  return area.latencyMs + (requiredBytes / Math.max(throughput, 1)) * 1000;
}

function score(area: StorageArea, requiredBytes = 0) {
  if (!area.acceptsTransfer || area.operatingStatus === "unavailable") return Number.POSITIVE_INFINITY;
  const statusPenalty = area.operatingStatus === "degraded" ? 100_000 : 0;
  return statusPenalty + estimatedCompletionMs(area, requiredBytes) + area.errorRate * 10_000;
}

export interface StorageAssignment {
  transferId: string;
  laneId: string;
  route: StorageRoute;
  activeStorageId: string;
  mode: "primary" | "backup-recovery";
}

export class StorageDirectorAgent {
  private readonly assignments = new Map<string, StorageAssignment>();

  organizeTransfer(input: { transferId: string; laneId: string; requiredBytes: number; areas: StorageArea[] }) {
    if (this.assignments.has(input.transferId)) return this.assignments.get(input.transferId)!;
    const route = this.selectRoute(input.areas, input.requiredBytes);
    const assignment: StorageAssignment = {
      transferId: input.transferId,
      laneId: input.laneId,
      route,
      activeStorageId: route.primary.id,
      mode: "primary"
    };
    this.assignments.set(input.transferId, assignment);
    return assignment;
  }

  assignment(transferId: string) {
    return this.assignments.get(transferId) ?? null;
  }

  analyzeAndCorrect(transferId: string) {
    const assignment = this.assignments.get(transferId);
    if (!assignment) throw new Error("STORAGE_ASSIGNMENT_NOT_FOUND");
    if (assignment.route.primary.operatingStatus === "operating-normally") {
      return { action: "continue-primary" as const, assignment };
    }
    const recovery = this.activateBackup(assignment.route);
    assignment.activeStorageId = recovery.activeStorage.id;
    assignment.mode = "backup-recovery";
    return { action: "backup-automatically-activated" as const, assignment, stages: recovery.stages };
  }

  selectRoute(areas: StorageArea[], requiredBytes: number): StorageRoute {
    const eligible = areas
      .filter(a => a.availableBytes >= requiredBytes && a.acceptsTransfer && a.operatingStatus !== "unavailable")
      .sort((a, b) => score(a, requiredBytes) - score(b, requiredBytes));

    if (eligible.length < 2) throw new Error("INSUFFICIENT_STORAGE_REDUNDANCY");
    return { primary: eligible[0], backup: eligible[1] };
  }

  activateBackup(route: StorageRoute): {
    activeStorage: StorageArea;
    stages: FailoverStage[];
  } {
    if (route.backup.operatingStatus === "unavailable" || !route.backup.acceptsTransfer) {
      throw new Error("BACKUP_STORAGE_UNAVAILABLE");
    }
    return {
      activeStorage: route.backup,
      stages: [
        "automatically-activated",
        "analyzing",
        "correcting-any-issues",
        "affected-transfer-continues",
        "other-lanes-remain-unaffected",
        "verified-exact"
      ]
    };
  }
}
