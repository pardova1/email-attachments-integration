import { randomUUID } from "node:crypto";
import type { AffectedRole } from "./public-incident-notification.js";

export interface AffectedParty {
  userId: string;
  role: AffectedRole;
}

export interface PublicIncident {
  incidentId: string;
  transferId: string;
  status: "active" | "resolved";
  affected: AffectedParty[];
  createdAt: Date;
  resolvedAt: Date | null;
}

export class AffectedPartyRegistry {
  private readonly incidents = new Map<string, PublicIncident>();

  open(transferId: string, affected: AffectedParty[]) {
    const unique = [...new Map(affected.map(p => [`${p.userId}:${p.role}`, p])).values()];
    const incident: PublicIncident = {
      incidentId: `INC-${randomUUID()}`,
      transferId,
      status: "active",
      affected: unique,
      createdAt: new Date(),
      resolvedAt: null
    };
    this.incidents.set(incident.incidentId, incident);
    return incident;
  }

  resolve(incidentId: string, now = new Date()) {
    const incident = this.require(incidentId);
    incident.status = "resolved";
    incident.resolvedAt = now;
    return incident;
  }

  get(incidentId: string) {
    return this.incidents.get(incidentId) ?? null;
  }

  private require(incidentId: string) {
    const incident = this.incidents.get(incidentId);
    if (!incident) throw new Error("INCIDENT_NOT_FOUND");
    return incident;
  }
}
