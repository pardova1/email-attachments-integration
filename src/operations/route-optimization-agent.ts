import type { StorageArea } from "../storage/storage-director-agent.js";

export interface RouteObservation {
  transferId: string;
  laneId: string;
  remainingBytes: number;
  activeStorageId: string;
  areas: StorageArea[];
}

export interface RouteOptimizationDecision {
  action: "continue-current" | "switch-route";
  selectedStorageId: string;
  reason: string;
}

function completionMs(area: StorageArea, bytes: number) {
  if (!area.acceptsTransfer || area.operatingStatus === "unavailable") return Number.POSITIVE_INFINITY;
  const throughput = Math.max(area.estimatedThroughputBytesPerSecond ?? 1, 1);
  const degradedPenalty = area.operatingStatus === "degraded" ? 100_000 : 0;
  return area.latencyMs + (bytes / throughput) * 1000 + area.errorRate * 10_000 + degradedPenalty;
}

export class RouteOptimizationAgent {
  evaluate(input: RouteObservation): RouteOptimizationDecision {
    const eligible = input.areas
      .filter(a => a.availableBytes >= input.remainingBytes && a.acceptsTransfer && a.operatingStatus !== "unavailable")
      .sort((a, b) => completionMs(a, input.remainingBytes) - completionMs(b, input.remainingBytes));

    if (!eligible.length) throw new Error("NO_ELIGIBLE_TRANSFER_ROUTE");

    const best = eligible[0];
    const current = input.areas.find(a => a.id === input.activeStorageId);
    if (!current || current.operatingStatus === "unavailable") {
      return { action: "switch-route", selectedStorageId: best.id, reason: "active-route-unavailable" };
    }

    const currentMs = completionMs(current, input.remainingBytes);
    const bestMs = completionMs(best, input.remainingBytes);
    // Avoid unnecessary route movement for tiny improvements. A switch must be
    // expected to improve remaining completion time by at least 20%.
    if (best.id !== current.id && bestMs <= currentMs * 0.8) {
      return { action: "switch-route", selectedStorageId: best.id, reason: "materially-faster-eligible-route" };
    }

    return { action: "continue-current", selectedStorageId: current.id, reason: "current-route-remains-efficient" };
  }
}
