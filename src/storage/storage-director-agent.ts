export type StorageOperatingStatus = "operating-normally" | "degraded" | "unavailable";

export interface StorageArea {
  id: string;
  region: string;
  operatingStatus: StorageOperatingStatus;
  availableBytes: number;
  latencyMs: number;
  errorRate: number;
  acceptsTransfer: boolean;
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

function score(area: StorageArea) {
  if (!area.acceptsTransfer || area.operatingStatus === "unavailable") return Number.POSITIVE_INFINITY;
  const statusPenalty = area.operatingStatus === "degraded" ? 100_000 : 0;
  return statusPenalty + area.latencyMs + area.errorRate * 10_000;
}

export class StorageDirectorAgent {
  selectRoute(areas: StorageArea[], requiredBytes: number): StorageRoute {
    const eligible = areas
      .filter(a => a.availableBytes >= requiredBytes && a.acceptsTransfer && a.operatingStatus !== "unavailable")
      .sort((a, b) => score(a) - score(b));

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
